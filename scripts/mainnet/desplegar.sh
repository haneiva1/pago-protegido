#!/usr/bin/env bash
# Despliega pp_guardian y pp_arbiter en Stellar MAINNET: secciones 3 y 4 de docs/MAINNET.md, en orden.
#
#   1. trustline a USDC de trato-mn-plataforma    4. instanciar pp_guardian
#   2. subir pp_guardian.wasm                     5. instanciar pp_arbiter
#   3. subir pp_arbiter.wasm                      6. set_arbiter (lo firma trato-mn-arbitro)
#
# Uso:
#   bash scripts/mainnet/desplegar.sh --dry-run    # comprueba y simula todo lo posible; no firma ni envía nada
#   bash scripts/mainnet/desplegar.sh              # de verdad: pide confirmación antes de CADA transacción
#   bash scripts/mainnet/desplegar.sh --ensayo     # lo mismo en testnet, con identidades trato-ensayo-*
#   opciones: --par N   despliega otro par de contratos (por defecto 1), por si el primero salió mal
#
# Se puede cortar y volver a correr: mira qué hay en la red y sigue por lo que falta. Los IDs de los contratos salen de
# una sal fija, así que repetirlo no puede crear dos pares. No lee ni muestra llaves: las usa el CLI para firmar.
# Salida: 0 bien, 1 algo no calza, 2 falta una herramienta o un dato, 3 cancelado por la persona.
#
# Otro RPC u Horizon (docs/MAINNET.md, sección 1): MAINNET_RPC_URL=… MAINNET_HORIZON_URL=… bash scripts/mainnet/desplegar.sh
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTRATOS="$RAIZ/contracts"
CLI_ESPERADO="30.0.1"

falla() { echo "ERROR: $1" >&2; exit "${2:-1}"; }
aviso() { echo "  AVISO: $*"; }
seccion() { printf '\n== %s\n' "$*"; }

MODO=real RED=mainnet PAR=1
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) MODO=dry-run ;;
    --ensayo) RED=testnet ;;
    --par) PAR="${2:-}"; shift ;;
    -h | --help) sed -n '2,21s/^# \{0,1\}//p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) falla "opción desconocida: $1 (mira --help)" 2 ;;
  esac
  shift
done
case "$PAR" in '' | *[!0-9]* | 0*) falla "--par necesita un número desde 1" 2 ;; esac

# El CLI lee STELLAR_* del entorno (red, cuenta, comisiones, firma): aquí todo va explícito.
for v in $(compgen -e | grep '^STELLAR_' || true); do unset "$v"; done

TW_FEE=GBWWSOATPLIC72ZBOIM7WJCT7VCAHNWW4QUBZ2H4FORMCCIUM5ZVKSZN   # fija en el WASM de Trustless Work de mainnet
MIN_SHIP=60 MAX_SHIP=2592000 MIN_INSPECT=60 MAX_INSPECT=2592000
if [ "$RED" = mainnet ]; then
  RPC="${MAINNET_RPC_URL:-https://rpc.lightsail.network}"
  HORIZON="${MAINNET_HORIZON_URL:-https://horizon.stellar.org}"
  PASS="Public Global Stellar Network ; September 2015"
  PREFIJO=trato-mn EXPLORADOR=public PALABRA=MAINNET
  USDC_EMISOR=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN
  # Cuenta pública con fondos, solo como origen de una SIMULACIÓN cuando la nuestra todavía no existe. Nunca firma.
  TESTIGO="$TW_FEE"
  REGISTRO="$CONTRATOS/deployments/mainnet"
else
  RPC="https://soroban-testnet.stellar.org" HORIZON="https://horizon-testnet.stellar.org"
  PASS="Test SDF Network ; September 2015"
  PREFIJO=trato-ensayo EXPLORADOR=testnet PALABRA=ENSAYO
  USDC_EMISOR=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
  TESTIGO="$USDC_EMISOR"
  REGISTRO="$CONTRATOS/target/ensayo"
fi
if [ "$PAR" = 1 ]; then REGISTRO="$REGISTRO.env"; else REGISTRO="$REGISTRO-par-$PAR.env"; fi
HORIZON="${HORIZON%/}"
DEPLOYER="$PREFIJO-deployer" ARBITRO="$PREFIJO-arbitro" PLATAFORMA="$PREFIJO-plataforma"
NET=(--rpc-url "$RPC" --network-passphrase "$PASS")
INCLUSION=10000          # tope de la comisión de inclusión: 0,001 XLM (la red cobra el precio del momento)
MARGEN=102               # la simulación + 2 %, por si sube la renta entre simular y enviar; lo que sobra se devuelve
# Estimación de docs/MAINNET.md, en stroops (1 XLM = 10.000.000).
REF_TRUST=100 REF_UP_G=231004041 REF_UP_A=178803247 REF_DEPLOY=3000000 REF_SET=1000000

for h in stellar curl jq awk perl cargo; do command -v "$h" >/dev/null 2>&1 || falla "falta $h" 2; done
CLI_VER="$(stellar --version | awk 'NR==1{print $2}')"
[ "$CLI_VER" = "$CLI_ESPERADO" ] || falla "stellar-cli es $CLI_VER y tiene que ser $CLI_ESPERADO (cambian los hashes)" 2
if [ "$MODO" = real ] && { [ ! -t 0 ] || [ ! -t 1 ]; }; then
  falla "hace falta una terminal: cada transacción se confirma a mano (para probar sin enviar: --dry-run)" 2
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Todo pasa por acá. Corre en una carpeta vacía (el CLI carga el .env de donde esté) y en dry-run no puede firmar ni enviar.
st() {
  if [ "$MODO" = dry-run ]; then
    case "${1:-} ${2:-}" in "tx sign" | "tx send") falla "dry-run no firma ni envía" ;; esac
  fi
  (cd "$TMP" && stellar "$@")
}
rpc() { curl -sf -m 30 -X POST "$RPC" -H 'Content-Type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$1\"${2:+,\"params\":$2}}"; }
xlm() { LC_ALL=C awk -v s="$1" 'BEGIN{printf "%.5f", s/10000000}'; }
corta() { printf '%s…%s' "${1:0:4}" "${1: -4}"; }
sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else shasum -a 256 "$1"; fi | awk '{print $1}'; }
anota() { # clave valor: registro público del despliegue (sin secretos)
  mkdir -p "$(dirname "$REGISTRO")"
  { grep -v "^$1=" "$REGISTRO" 2>/dev/null || true; echo "$1=$2"; } >"$TMP/registro"
  cp "$TMP/registro" "$REGISTRO"
}
anotado() { sed -n "s/^$1=//p" "$REGISTRO" 2>/dev/null | tail -1; }

# cuenta G…: deja su JSON en $TMP/<G>.json. 0 si existe, 1 si no existe. Cualquier otra respuesta corta el script.
cuenta() {
  local codigo
  codigo="$(curl -s -m 30 -o "$TMP/$1.json" -w '%{http_code}' "$HORIZON/accounts/$1" || true)"
  case "$codigo" in
    200) return 0 ;;
    404) return 1 ;;
    *) falla "Horizon respondió $codigo por la cuenta $1: no sigo a ciegas" ;;
  esac
}
saldo() { local b; b="$(jq -r '.balances[]|select(.asset_type=="native").balance' "$TMP/$1.json")"; echo $((10#${b/./})); }
disponible() { # saldo menos reserva (0,5 XLM por entrada)
  local e; e="$(jq -r '2 + .subentry_count + .num_sponsoring - .num_sponsored' "$TMP/$1.json")"
  local d=$(($(saldo "$1") - e * 5000000)); [ "$d" -ge 0 ] && echo "$d" || echo 0
}
tiene_trustline() { jq -e --arg e "$USDC_EMISOR" '.balances[]|select(.asset_code=="USDC" and .asset_issuer==$e)' "$TMP/$1.json" >/dev/null; }

# ¿Está en la red? Distingue «no está» de «la red no contestó»: lo segundo corta el script.
entradas() {
  local r; r="$(st ledger entry fetch "$@" "${NET[@]}" --output json 2>"$TMP/err")" || falla "no pude leer la red: $(tail -1 "$TMP/err")"
  jq -e '(.entries|length) > 0' <<<"$r" >/dev/null || return 1
  jq -e '(.entries[0].liveUntilLedgerSeq // 0) > .latestLedger' <<<"$r" >/dev/null || falla "la entrada ($*) está vencida: hay que restaurarla antes de seguir"
}
hay_wasm() { entradas contract-code --wasm-hash "$1"; }
hay_contrato() { entradas contract-data --contract "$1" --instance; }
wasm_de() { rm -f "$TMP/c.wasm"; st contract fetch "${NET[@]}" --id "$1" --out-file "$TMP/c.wasm" >/dev/null 2>"$TMP/err" || falla "no pude bajar el WASM de $1: $(tail -1 "$TMP/err")"; sha256 "$TMP/c.wasm"; }
config_de() { st contract invoke "${NET[@]}" --id "$1" --source "$ORIGEN_LECTURA" --send=no -- config 2>"$TMP/err" || falla "no pude leer config de $1: $(tail -1 "$TMP/err")"; }
tx_estado() { rpc getTransaction "{\"hash\":\"$1\"}" 2>/dev/null | jq -r '.result.status // "?"' 2>/dev/null || echo '?'; }

# construir <origen> <comando…> [-- argumentos del contrato]: XDR sin firmar a stdout.
construir() {
  local origen="$1" a hecho=no; shift
  local cmd=() op=("${NET[@]}" --source "$origen" --inclusion-fee "$INCLUSION" --build-only)
  for a in "$@"; do
    if [ "$a" = -- ] && [ $hecho = no ]; then cmd=("${cmd[@]}" "${op[@]}"); hecho=si; fi
    cmd[${#cmd[@]}]="$a"
  done
  [ $hecho = si ] || cmd=("${cmd[@]}" "${op[@]}")
  st "${cmd[@]}"
}

N=0 TOTAL_TX=6 GASTO_SIM=0 SIN_SIMULAR=""
# transaccion <clave> <título> <identidad> <operación esperada> <estimado> <soroban|clasica> <comando…>
transaccion() {
  local clave="$1" titulo="$2" quien="$3" operacion="$4" ref="$5" tipo="$6"; shift 6
  local g origen comision t0 hash vence resp estado ledger
  g="$(st keys address "$quien")" origen="$g"
  printf '\n-- %s/%s · %s\n' "$N" "$TOTAL_TX" "$titulo"
  if ! cuenta "$g"; then
    [ "$MODO" = dry-run ] || falla "$quien ($g) no existe todavía en $RED: hay que mandarle XLM"
    origen="$TESTIGO"
  fi
  while :; do
    t0=$(date +%s)
    construir "$origen" "$@" >"$TMP/tx.xdr" 2>"$TMP/err" || falla "no pude armar la transacción: $(tail -1 "$TMP/err")"
    if [ "$tipo" = soroban ]; then
      if ! st tx simulate "${NET[@]}" --source "$origen" <"$TMP/tx.xdr" >"$TMP/sim.xdr" 2>"$TMP/err"; then
        [ "$MODO" = dry-run ] || falla "la simulación falló: $(tail -1 "$TMP/err")"
        aviso "no se pudo simular: $(tail -1 "$TMP/err")"; SIN_SIMULAR="$SIN_SIMULAR $N"; return 0
      fi
    else
      cp "$TMP/tx.xdr" "$TMP/sim.xdr"
    fi
    st tx decode <"$TMP/sim.xdr" >"$TMP/sim.json" || falla "no pude leer el XDR"
    # Lo que se va a firmar, leído del XDR: un solo origen, una sola operación y del tipo esperado.
    jq -e --arg g "$origen" --arg op "$operacion" '.tx.tx | .source_account == $g and (.operations|length) == 1
      and (.operations[0] | .source_account == null and (.body | (has("change_trust") and $op == "change_trust")
        or ((.invoke_host_function.host_function // {}) | has($op))))' "$TMP/sim.json" >/dev/null \
      || falla "el XDR no es la operación esperada ($operacion): no se firma"
    comision=$(jq -r '.tx.tx.fee' "$TMP/sim.json")
    echo "   Firma:      $quien ($g)"
    echo "   Operación:  $operacion (una sola, leída del XDR)"
    if [ "$MODO" = dry-run ]; then
      echo "   Comisión:   $(xlm "$comision") XLM $([ "$tipo" = soroban ] && echo simulados || echo 'como máximo') (la guía estima $(xlm "$ref"))"
      [ "$origen" = "$g" ] || echo "   Origen:     simulado con la cuenta pública $(corta "$TESTIGO"); $quien aún no existe"
      echo "   DRY-RUN:    no se firma ni se envía"
      GASTO_SIM=$((GASTO_SIM + comision)); return 0
    fi
    jq -c --argjson m "$MARGEN" --argjson inc "$INCLUSION" '
      if (.tx.tx.ext|type) == "object" and (.tx.tx.ext|has("v1")) then
        .tx.tx.ext.v1.resource_fee |= ((tonumber * $m / 100 | floor) | tostring)
        | .tx.tx.fee = ((.tx.tx.ext.v1.resource_fee|tonumber) + $inc)
      else . end' "$TMP/sim.json" >"$TMP/lista.json"
    comision=$(jq -r '.tx.tx.fee' "$TMP/lista.json")
    local libre; libre=$(disponible "$g")
    echo "   Comisión:   hasta $(xlm "$comision") XLM (la guía estima $(xlm "$ref"); lo que no se usa vuelve)"
    echo "   Disponible: $(xlm "$libre") XLM en $quien"
    [ "$comision" -le "$libre" ] || falla "no alcanza: faltan $(xlm $((comision - libre))) XLM en $quien ($g)"
    if [ "$comision" -gt $((ref * 115 / 100 + INCLUSION)) ]; then aviso "cuesta más de un 15 % sobre lo estimado: revisa antes de aceptar"; fi
    local resp_humana=""
    printf '   ¿Firmar y enviar a %s? Escribe "si" y Enter (cualquier otra cosa cancela): ' "$RED"
    read -r resp_humana </dev/tty || true
    case "$resp_humana" in
      si | SI | Si | sí | Sí) ;;
      *) echo "Cancelado: no se envió esta transacción. Vuelve a correr el script para seguir desde aquí."; exit 3 ;;
    esac
    if [ $(($(date +%s) - t0)) -gt 180 ]; then echo "   Pasaron más de 3 minutos: simulo de nuevo con datos frescos."; cuenta "$g" || true; continue; fi
    break
  done
  # Con vencimiento: si algo falla al enviar, pasado ese momento es seguro que no va a entrar.
  vence=$(($(date +%s) + 180))
  jq -c --arg v "$vence" '.tx.tx.cond = {time:{min_time:"0",max_time:$v}}' "$TMP/lista.json" | st tx encode >"$TMP/lista.xdr"
  hash="$(st tx hash "${NET[@]}" <"$TMP/lista.xdr")"
  st tx sign "${NET[@]}" --sign-with-key "$quien" <"$TMP/lista.xdr" >"$TMP/firmada.xdr" 2>"$TMP/err" || falla "no se pudo firmar (no se envió nada): $(tail -1 "$TMP/err")"
  anota "${clave}_TX" "$hash"
  echo "   Enviando $hash"
  st tx send "${NET[@]}" <"$TMP/firmada.xdr" >"$TMP/enviada" 2>"$TMP/err" || aviso "el envío no confirmó: $(tail -1 "$TMP/err" | cut -c1-200)"
  while :; do
    estado="$(tx_estado "$hash")"
    case "$estado" in
      SUCCESS) break ;;
      FAILED) falla "la red la rechazó: https://stellar.expert/explorer/$EXPLORADOR/tx/$hash" ;;
    esac
    [ "$(date +%s)" -le $((vence + 30)) ] || falla "venció sin entrar ($hash, estado $estado). No queda nada pendiente: vuelve a correr el script"
    sleep 3
  done
  resp="$(rpc getTransaction "{\"hash\":\"$hash\"}")"
  ledger="$(jq -r '.result.ledger' <<<"$resp")"
  anota "${clave}_LEDGER" "$ledger"
  echo "   LISTA en el ledger $ledger, cobrado $(xlm "$(st tx fetch result "${NET[@]}" --hash "$hash" --output json 2>/dev/null | jq -r '.fee_charged // 0')") XLM"
  echo "   https://stellar.expert/explorer/$EXPLORADOR/tx/$hash"
  cuenta "$g" || true
}
ya() { printf '\n-- %s/%s · %s\n   Ya está en la red: no se paga de nuevo.\n' "$N" "$TOTAL_TX" "$1"; }

echo "Despliegue de Trato · red: $RED · modo: $MODO · par $PAR"
[ "$MODO" = dry-run ] && echo "DRY-RUN: solo lectura y simulación. Firmar y enviar están bloqueados."

seccion "Identidades (solo direcciones públicas)"
for k in "$DEPLOYER" "$ARBITRO" "$PLATAFORMA"; do st keys address "$k" >"$TMP/$k" 2>/dev/null || falla "no existe la identidad $k en el stellar CLI" 2; done
D="$(cat "$TMP/$DEPLOYER")" A="$(cat "$TMP/$ARBITRO")" P="$(cat "$TMP/$PLATAFORMA")"
printf '  %-22s %s\n' "$DEPLOYER" "$D" "$ARBITRO" "$A" "$PLATAFORMA" "$P"
if [ "$D" = "$A" ] || [ "$A" = "$P" ] || [ "$D" = "$P" ]; then falla "las tres cuentas tienen que ser distintas"; fi
for g in "$D" "$A" "$P"; do if grep -q "=$g\$" "$CONTRATOS/deployments/testnet.env"; then falla "$g es una cuenta de testnet de Trato: en mainnet van nuevas"; fi; done

seccion "Red"
rpc getNetwork >"$TMP/net.json" || falla "el RPC $RPC no responde: prueba otro con MAINNET_RPC_URL"
[ "$(jq -r '.result.passphrase' "$TMP/net.json")" = "$PASS" ] || falla "$RPC no es $RED"
[ "$(curl -sf -m 30 "$HORIZON/" | jq -r .network_passphrase)" = "$PASS" ] || falla "$HORIZON no es $RED o no responde"
[ "$(rpc getHealth | jq -r .result.status)" = healthy ] || falla "el RPC $RPC no está sano"
echo "  $RPC (protocolo $(jq -r .result.protocolVersion "$TMP/net.json")) y $HORIZON: $PASS"

seccion "WASM de tw-mainnet"
bash "$CONTRATOS/scripts/wasm-mainnet.sh" | sed 's/^/  /' || falla "los WASM no coinciden con contracts/wasm/mainnet.sha256: no se despliega"
W_G="$CONTRATOS/target/mainnet/pp_guardian.wasm" W_A="$CONTRATOS/target/mainnet/pp_arbiter.wasm"
H_G="$(sha256 "$W_G")" H_A="$(sha256 "$W_A")"
for par in "$H_G pp_guardian.wasm" "$H_A pp_arbiter.wasm"; do grep -qx "${par% *}  ${par#* }" "$CONTRATOS/wasm/mainnet.sha256" || falla "hash inesperado: $par"; done

seccion "Contratos (los IDs salen de $DEPLOYER y una sal fija: se saben antes de pagar)"
sal() { printf 'trato:%s:par-%s' "$1" "$PAR" >"$TMP/sal"; sha256 "$TMP/sal"; }
SAL_G="$(sal pp_guardian)" SAL_A="$(sal pp_arbiter)"
G_ID="$(st contract id wasm "${NET[@]}" --source "$D" --salt "$SAL_G")"
A_ID="$(st contract id wasm "${NET[@]}" --source "$D" --salt "$SAL_A")"
printf '  %-12s %s\n' pp_guardian "$G_ID" pp_arbiter "$A_ID"

WASM_G=no WASM_A=no CT_G=no CT_A=no TRUST=no ORIGEN_LECTURA="$TESTIGO"
if hay_wasm "$H_G"; then WASM_G=si; fi
if hay_wasm "$H_A"; then WASM_A=si; fi
if hay_contrato "$G_ID"; then CT_G=si; fi
if hay_contrato "$A_ID"; then CT_A=si; fi

seccion "Saldos"
FALTA=0
revisa() { # identidad G mínimo-disponible-en-stroops
  if cuenta "$2"; then
    local d; d=$(disponible "$2")
    printf '  %-22s %s XLM (%s disponibles, hacen falta %s)\n' "$1" "$(xlm "$(saldo "$2")")" "$(xlm "$d")" "$(xlm "$3")"
    if [ "$d" -lt "$3" ]; then aviso "a $1 le faltan $(xlm $(($3 - d))) XLM: $2"; FALTA=1; fi
  else
    printf '  %-22s no existe todavía\n' "$1"; aviso "hay que fondear $2"; FALTA=1
  fi
}
NEC_D=0
[ $WASM_G = si ] || NEC_D=$((NEC_D + REF_UP_G * MARGEN / 100 + INCLUSION))
[ $WASM_A = si ] || NEC_D=$((NEC_D + REF_UP_A * MARGEN / 100 + INCLUSION))
[ $CT_G = si ] || NEC_D=$((NEC_D + REF_DEPLOY))
[ $CT_A = si ] || NEC_D=$((NEC_D + REF_DEPLOY))
revisa "$DEPLOYER" "$D" "$NEC_D"
revisa "$ARBITRO" "$A" "$REF_SET"
NEC_P=$((5000000 + INCLUSION))
if cuenta "$P" && tiene_trustline "$P"; then TRUST=si NEC_P=0; fi
revisa "$PLATAFORMA" "$P" "$NEC_P"
if [ $FALTA = 1 ]; then
  [ "$MODO" = dry-run ] || falla "faltan fondos: no se envió nada"
  aviso "con fondos faltantes el dry-run sigue, pero no todo se puede simular"
fi

if [ "$MODO" = real ]; then
  printf '\nSe van a enviar transacciones reales en %s, una por una y con tu confirmación.\nEscribe %s para empezar: ' "$RED" "$PALABRA"
  read -r respuesta </dev/tty || true
  [ "${respuesta:-}" = "$PALABRA" ] || { echo "Cancelado: no se envió nada."; exit 3; }
fi

seccion "Transacciones"
N=1
if [ $TRUST = si ]; then ya "Trustline a USDC de $PLATAFORMA"; else
  transaccion TRUSTLINE "Trustline a USDC ($(corta "$USDC_EMISOR")) de $PLATAFORMA" "$PLATAFORMA" change_trust $REF_TRUST clasica \
    tx new change-trust --line "USDC:$USDC_EMISOR"
fi
N=2
if [ $WASM_G = si ]; then ya "Subir pp_guardian.wasm"; else
  transaccion SUBIR_GUARDIAN "Subir pp_guardian.wasm ($(corta "$H_G"))" "$DEPLOYER" upload_contract_wasm $REF_UP_G soroban contract upload --wasm "$W_G"
  [ "$MODO" = dry-run ] || { hay_wasm "$H_G" || falla "se envió pero $H_G no aparece en la red"; WASM_G=si; }
fi
N=3
if [ $WASM_A = si ]; then ya "Subir pp_arbiter.wasm"; else
  transaccion SUBIR_ARBITER "Subir pp_arbiter.wasm ($(corta "$H_A"))" "$DEPLOYER" upload_contract_wasm $REF_UP_A soroban contract upload --wasm "$W_A"
  [ "$MODO" = dry-run ] || { hay_wasm "$H_A" || falla "se envió pero $H_A no aparece en la red"; WASM_A=si; }
fi

# Con --wasm y --build-only el CLI NO sube nada: usa el archivo local para el hash y los tipos de los argumentos.
N=4
if [ $CT_G = si ]; then ya "Instanciar pp_guardian ($G_ID)"; else
  if [ $WASM_G = no ]; then aviso "pp_guardian.wasm no está en la red: el paso 4 se arma pero no se puede simular"; fi
  transaccion DEPLOY "Instanciar pp_guardian → $G_ID" "$DEPLOYER" create_contract_v2 $REF_DEPLOY soroban \
    contract deploy --wasm "$W_G" --salt "$SAL_G" -- --admin "$A" --tw_fee "$TW_FEE" \
    --min_ship_secs $MIN_SHIP --max_ship_secs $MAX_SHIP --min_inspect_secs $MIN_INSPECT --max_inspect_secs $MAX_INSPECT
  [ "$MODO" = dry-run ] || { hay_contrato "$G_ID" || falla "se envió pero $G_ID no aparece en la red"; CT_G=si; }
fi
N=5
if [ $CT_A = si ]; then ya "Instanciar pp_arbiter ($A_ID)"; else
  if [ $WASM_A = no ]; then aviso "pp_arbiter.wasm no está en la red: el paso 5 se arma pero no se puede simular"; fi
  transaccion DEPLOY_ARBITER "Instanciar pp_arbiter → $A_ID" "$DEPLOYER" create_contract_v2 $REF_DEPLOY soroban \
    contract deploy --wasm "$W_A" --salt "$SAL_A" -- --admin "$A" --guardian "$G_ID" --tw_fee "$TW_FEE"
  [ "$MODO" = dry-run ] || { hay_contrato "$A_ID" || falla "se envió pero $A_ID no aparece en la red"; CT_A=si; }
fi

# comprueba <campo> <obtenido> <esperado>
comprueba() {
  [ "$2" = "$3" ] || falla "$1 es $2 y tenía que ser $3. No uses estos contratos (despliega otro par con --par $((PAR + 1)))"
  printf '  OK  %-28s %s\n' "$1" "$2"
}
comprueba_guardian() {
  local c; c="$(config_de "$G_ID")"
  comprueba "pp_guardian WASM" "$(wasm_de "$G_ID")" "$H_G"
  comprueba "pp_guardian admin" "$(jq -r .admin <<<"$c")" "$A"
  comprueba "pp_guardian tw_fee" "$(jq -r .tw_fee <<<"$c")" "$TW_FEE"
  comprueba "pp_guardian plazos" "$(jq -r '[.min_ship_secs,.max_ship_secs,.min_inspect_secs,.max_inspect_secs]|map(tostring)|join("/")' <<<"$c")" "$MIN_SHIP/$MAX_SHIP/$MIN_INSPECT/$MAX_INSPECT"
}
comprueba_arbiter() {
  local c; c="$(config_de "$A_ID")"
  comprueba "pp_arbiter WASM" "$(wasm_de "$A_ID")" "$H_A"
  comprueba "pp_arbiter admin" "$(jq -r .admin <<<"$c")" "$A"
  comprueba "pp_arbiter guardian" "$(jq -r .guardian <<<"$c")" "$G_ID"
  comprueba "pp_arbiter tw_fee" "$(jq -r .tw_fee <<<"$c")" "$TW_FEE"
}

N=6 CONECTADO=no
if [ $CT_G = si ] && [ $CT_A = si ]; then
  # Antes de conectarlos (se puede una sola vez) se comprueba que los dos sean los nuestros.
  seccion "Comprobación antes de conectar"
  comprueba_guardian; comprueba_arbiter
  ACTUAL="$(config_de "$G_ID" | jq -r '.arbiter // ""')"
  if [ "$ACTUAL" = "$A_ID" ]; then ya "set_arbiter"; CONECTADO=si
  elif [ -n "$ACTUAL" ]; then falla "pp_guardian ya apunta a otro árbitro ($ACTUAL): despliega otro par con --par $((PAR + 1))"
  else
    transaccion CONECTAR "Conectar: pp_guardian.set_arbiter($(corta "$A_ID"))" "$ARBITRO" invoke_contract $REF_SET soroban \
      contract invoke --id "$G_ID" -- set_arbiter --arbiter "$A_ID"
    if [ "$MODO" = real ]; then CONECTADO=si; fi
  fi
else
  printf '\n-- 6/%s · Conectar: pp_guardian.set_arbiter\n' "$TOTAL_TX"
  aviso "los contratos no están en la red: el paso 6 no se puede armar ni simular"; SIN_SIMULAR="$SIN_SIMULAR 6"
fi

if [ "$MODO" = dry-run ]; then
  seccion "Resumen del dry-run"
  echo "  Comisiones de los pasos simulados: $(xlm "$GASTO_SIM") XLM (sin reservas de cuenta ni de trustline)"
  if [ -n "$SIN_SIMULAR" ]; then echo "  Sin simular:${SIN_SIMULAR} (dependen de un paso anterior que todavía no está en la red)"; fi
  echo "  No se firmó ni se envió nada."
  [ $CONECTADO = si ] || exit 0
fi

seccion "Comprobación final en la red"
comprueba_guardian; comprueba_arbiter
comprueba "pp_guardian arbiter" "$(config_de "$G_ID" | jq -r '.arbiter // "ninguno"')" "$A_ID"
if cuenta "$P" && tiene_trustline "$P"; then echo "  OK  $PLATAFORMA tiene trustline a USDC"; else falla "$PLATAFORMA no tiene trustline a USDC: la liberación fallaría"; fi
LEDGER="$(anotado DEPLOY_LEDGER)"
if [ -z "$LEDGER" ] && [ -n "$(anotado DEPLOY_TX)" ]; then # se cortó entre enviar y anotar
  LEDGER="$(curl -sf -m 30 "$HORIZON/transactions/$(anotado DEPLOY_TX)" | jq -r 'select(.successful).ledger' || true)"
  if [ -n "$LEDGER" ] && [ "$MODO" = real ]; then anota DEPLOY_LEDGER "$LEDGER"; fi
fi
if [ "$MODO" = real ]; then
  for par in "NETWORK $RED" "PAR $PAR" "GUARDIAN_ID $G_ID" "ARBITER_ID $A_ID" "GUARDIAN_WASM_HASH $H_G" "ARBITER_WASM_HASH $H_A" \
    "ADMIN $A" "PLATFORM $P" "TW_FEE $TW_FEE"; do anota "${par% *}" "${par#* }"; done
fi

cat <<EOF

== LISTO ($RED)
  pp_guardian  $G_ID
               https://stellar.expert/explorer/$EXPLORADOR/contract/$G_ID
  pp_arbiter   $A_ID
               https://stellar.expert/explorer/$EXPLORADOR/contract/$A_ID
  Registro público: $REGISTRO

Variables del servicio nuevo de Railway (docs/MAINNET.md, sección 5). Valores públicos:
  STELLAR_NETWORK=$RED          (en build Y en runtime)
  PP_GUARDIAN_ID=$G_ID
  PP_ARBITER_ID=$A_ID
  PP_DEPLOY_LEDGER=${LEDGER:-<el ledger de la creación de pp_guardian: míralo en stellar.expert>}
  PLATFORM_FEE_BPS=200
  FX_BS_PER_USD                    como en la demo (por defecto 11.7)
  PP_DB_PATH                       base nueva, dentro del volumen de ESTE servicio
  MAINNET_MAX_USD=10               opcional (tope por compra)
  MAINNET_MAX_CUENTAS=20           opcional (cuentas que activa la plataforma)
Secretos: solo los nombres; los cargas tú y este script no los lee:
  PLATAFORMA_SECRET                la llave S… de $PLATAFORMA ($P)
  ARBITRO_SECRET                   la llave S… de $ARBITRO ($A)
  ARBITRO_PANEL_KEY                clave nueva del panel del revisor
EOF
