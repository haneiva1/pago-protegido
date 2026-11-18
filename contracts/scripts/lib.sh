#!/usr/bin/env bash
# Funciones comunes de los scripts de testnet de Pago Protegido. SOLO TESTNET.
# Se usa con `source`, no se ejecuta directo.
set -uo pipefail
export STELLAR_NETWORK=testnet

SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPTS/.." && pwd)"              # pago-protegido/contracts
DEPLOY_ENV="$ROOT/deployments/testnet.env"
OUT="$SCRIPTS/out/${OUT_SUBDIR:-misc}"
mkdir -p "$OUT"
TXLOG="$OUT/txlog.tsv"      # escenario, paso, etiqueta, hash, segundos, fee (stroops)
FAILLOG="$OUT/fallos.tsv"   # escenario, paso, etiqueta, segundos, error
BALLOG="$OUT/saldos.tsv"    # escenario, momento, cuenta, saldo (unidades base)
EXPLORER="https://stellar.expert/explorer/testnet"

LABUSD_SAC=CC65P6TQQ646YDXVS3PM6YVZASXW6WM5B67YKI46JH4EG65LJPOGBD4S
ESCROW_WASM_HASH=1b367bc8476cf80b89f6396e2aa07b602b78361dd829b5ce9b64ada365196660
U=10000000   # 1 LABUSD = 10^7 unidades base

# Guarda de seguridad: nunca mainnet.
case "${STELLAR_NETWORK}" in testnet) ;; *) echo "solo testnet" >&2; exit 2 ;; esac

SCENARIO="${SCENARIO:--}"

addr() { stellar keys address "$1"; }
now() { perl -MTime::HiRes=time -e 'printf "%.3f", time'; }
elapsed() { perl -e "printf '%.2f', $2 - $1"; }

# tx <paso> <etiqueta> <comando...>: ejecuta una transacción que DEBE salir bien.
# Registra hash, tiempo y fee cobrado en $TXLOG. stdout = stdout del comando.
tx() {
  local step="$1" label="$2"; shift 2
  local t0 t1 rc hash fee secs attempt
  t0=$(now)
  # Reintenta solo errores de transporte del RPC (timeouts, conexión, 5xx/429)
  # que no alcanzaron a firmar ni enviar nada. Un error de contrato o de auth
  # no se reintenta. Si un intento anterior sí llegó a la red, el reintento
  # falla en simulación con un error de contrato y el script se detiene.
  for attempt in 1 2 3 4; do
    "$@" >"$OUT/.tmp.stdout" 2>"$OUT/.tmp.stderr"; rc=$?
    [ $rc -eq 0 ] && break
    grep -qE 'tx/[0-9a-f]{64}|Error\(' "$OUT/.tmp.stderr" && break
    grep -qiE 'timeout|timed out|client error|connect|503|502|504|429|too many' "$OUT/.tmp.stderr" || break
    [ $attempt -lt 4 ] && { echo "   [$SCENARIO/$step] error de RPC ($(head -c 80 "$OUT/.tmp.stderr" | tr '\n' ' ')), reintento $attempt/3 en 10 s" >&2; sleep 10; }
  done
  t1=$(now); secs=$(elapsed "$t0" "$t1")
  hash=$(grep -oE 'tx/[0-9a-f]{64}' "$OUT/.tmp.stderr" | tail -1 | cut -c4-)
  [ -z "$hash" ] && hash=$(grep -oE 'Signing transaction: [0-9a-f]{64}' "$OUT/.tmp.stderr" | tail -1 | awk '{print $3}')
  if [ $rc -ne 0 ]; then
    echo "!! [$SCENARIO/$step] $label FALLÓ (rc=$rc, ${secs}s)" >&2; cat "$OUT/.tmp.stderr" >&2; return $rc
  fi
  fee=""
  if [ -n "$hash" ]; then
    for _ in 1 2 3; do
      fee=$(stellar tx fetch result --hash "$hash" --output json 2>/dev/null | jq -r '.fee_charged // empty')
      [ -n "$fee" ] && break; sleep 2
    done
  fi
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$SCENARIO" "$step" "$label" "$hash" "$secs" "$fee" >>"$TXLOG"
  echo "ok [$SCENARIO/$step] $label  ${hash:+$EXPLORER/tx/$hash}  ${secs}s  fee=${fee}" >&2
  cat "$OUT/.tmp.stdout"
}

# expect_fail <paso> <etiqueta> <regex esperado> <comando...>: el comando DEBE
# fallar y su stderr debe contener el regex. Si no, el script termina con error.
expect_fail() {
  local step="$1" label="$2" want="$3"; shift 3
  local t0 t1 rc secs err
  t0=$(now)
  "$@" >"$OUT/.tmp.stdout" 2>"$OUT/.tmp.stderr"; rc=$?
  t1=$(now); secs=$(elapsed "$t0" "$t1")
  cp "$OUT/.tmp.stderr" "$OUT/fallo-$SCENARIO-$step.txt"
  if [ $rc -eq 0 ]; then
    printf '%s\t%s\t%s\t%s\t%s\n' "$SCENARIO" "$step" "$label" "$secs" "NO FALLÓ (inesperado)" >>"$FAILLOG"
    echo "!! [$SCENARIO/$step] $label NO falló y debía fallar" >&2; cat "$OUT/.tmp.stdout" >&2; return 1
  fi
  err=$(grep -oE 'Error\((Contract|Auth|WasmVm|Value|Storage|Budget|Context|Object|Crypto|Events)[^)]*\)' "$OUT/.tmp.stderr" | head -1)
  [ -z "$err" ] && err=$(grep -m1 -E 'error' "$OUT/.tmp.stderr" | tr '\t' ' ' | sed 's/^[^a-zA-Z]*//' | cut -c1-160)
  if ! grep -qE "$want" "$OUT/.tmp.stderr"; then
    printf '%s\t%s\t%s\t%s\t%s\n' "$SCENARIO" "$step" "$label" "$secs" "FALLÓ CON OTRO ERROR: $err" >>"$FAILLOG"
    echo "!! [$SCENARIO/$step] $label falló, pero no con /$want/:" >&2; cat "$OUT/.tmp.stderr" >&2; return 1
  fi
  printf '%s\t%s\t%s\t%s\t%s\n' "$SCENARIO" "$step" "$label" "$secs" "$err" >>"$FAILLOG"
  echo "ok (rechazado como se esperaba) [$SCENARIO/$step] $label -> $err" >&2
}

inv() { # inv <contrato> <firmante> <función> [args...]
  local id="$1" src="$2"; shift 2
  stellar contract invoke --id "$id" --source "$src" -- "$@"
}
view() { # view <contrato> <función> [args...]: lectura simulada, sin enviar
  local id="$1"; shift
  stellar contract invoke --id "$id" --source plataforma --send=no -- "$@" 2>/dev/null
}

bal() { view "$LABUSD_SAC" balance --id "$1" | tr -d '"'; }

# saldos <momento> <escrow> <cuentas...>
saldos() {
  local moment="$1" esc="$2"; shift 2
  local who b
  for who in "$@"; do
    b=$(bal "$(addr "$who")")
    printf '%s\t%s\t%s\t%s\n' "$SCENARIO" "$moment" "$who" "$b" >>"$BALLOG"
    printf '  %-11s %s\n' "$who" "$b" >&2
  done
  if [ -n "$esc" ]; then
    b=$(bal "$esc"); printf '%s\t%s\t%s\t%s\n' "$SCENARIO" "$moment" "escrow" "$b" >>"$BALLOG"
    printf '  %-11s %s\n' escrow "$b" >&2
  fi
}
