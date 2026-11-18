#!/usr/bin/env bash
# Flujo real en TESTNET de Pago Protegido v2 (modo guardián). Un escrow nuevo por
# escenario, desplegado e inicializado por `ppdemo` (no `plataforma`).
#
#   a) feliz: fund → mark_shipped → confirm (y confirm antes del envío: rechazado)
#   b) disputa → resolve 70% comprador
#   c) auto_release 60 s después del envío (lo dispara un tercero, sin firmas)
#   e) extend: después del plazo original NO libera; después del nuevo, sí
#   f) refund_unshipped: sin envío y vencido el plazo de despacho (60 s)
#   d) desvíos: resolve/withdraw_remaining_funds/update_escrow/mark_shipped/extend
#      por terceros, todos rechazados; interfaz on-chain sin funciones de upgrade
#
# Uso: bash scripts/flujo-v2-testnet.sh        Evidencia: scripts/out/flujo-v2/
OUT_SUBDIR=flujo-v2 source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
source "$DEPLOY_ENV"
[ "${VERSION:-}" = v2 ] || { echo "deployments/testnet.env no es v2: corre scripts/deploy-testnet.sh" >&2; exit 1; }

DEPLOYER=ppdemo
MONTO=$((50 * U))
LARGO=3600
CORTO=60
CUENTAS="comprador vendedor plataforma twfee tercero"
RUN_ID=$(date -u +%Y%m%d-%H%M%S)
AUTH_FAIL='Error\(Auth|[Ss]ign|InvalidAction|[Aa]uthoriz'
: >"$TXLOG"; : >"$FAILLOG"; : >"$BALLOG"; : >"$OUT/escrows.tsv"; : >"$OUT/tiempos.tsv"

ledger_time() { # hora de cierre del último ledger (Horizon), en epoch
  curl -s -m 15 "https://horizon-testnet.stellar.org/ledgers?order=desc&limit=1" \
    | jq -r '._embedded.records[0].closed_at | fromdateiso8601'
}
# wait_ledger <epoch> <nota>: espera hasta que el LEDGER pase ese momento.
wait_ledger() {
  local target="$1" lt
  while :; do
    lt=$(ledger_time); [ -n "$lt" ] && [ "$lt" -ge "$target" ] && break
    sleep 4
  done
  printf '%s\t%s\t%s\t%s\n' "$SCENARIO" "$2" "$target" "$lt" >>"$OUT/tiempos.tsv"
  echo "   ledger en $lt (≥ $target): $2" >&2
}

escrow_json() { # escrow_json <engagement_id> <título>
  jq -nc --arg eid "$1" --arg title "$2" --arg amount "$MONTO" --arg g "$GUARDIAN_ID" --arg arb "$ARBITER_ID" \
    --arg s "$(addr vendedor)" --arg pl "$PLATFORM" --arg tl "$LABUSD_SAC" '{
      engagement_id: $eid, title: $title,
      roles: {approver: $g, service_provider: $s, platform: $pl, release_signer: $g,
              dispute_resolver: $arb, receiver: $s},
      description: "Pago Protegido v2 en testnet", amount: $amount, platform_fee: 200,
      milestones: [{description: "Entrega del producto", status: "pendiente", evidence: "", approved: false}],
      flags: {disputed: false, released: false, resolved: false},
      trustline: {address: $tl}, receiver_memo: 0 }'
}

# nueva <escenario> <título>: deploy + init (ppdemo); deja ESC_<x> y J_<x>.
nueva() {
  local s="$1" esc j; SCENARIO="$s"
  echo "== ($s) $2" >&2
  esc=$(tx "${s}1" "deploy instancia del escrow (ppdemo)" \
    stellar contract deploy --wasm-hash "$ESCROW_WASM_HASH" --source "$DEPLOYER") || return 1
  j=$(escrow_json "pp-v2-$RUN_ID-$s" "$2")
  tx "${s}2" "initialize_escrow (ppdemo), roles modo guardián v2" \
    inv "$esc" "$DEPLOYER" initialize_escrow --escrow_properties "$j" >/dev/null || return 1
  view "$esc" get_escrow | jq -e --arg g "$GUARDIAN_ID" --arg a "$ARBITER_ID" \
    '.roles.approver==$g and .roles.release_signer==$g and .roles.dispute_resolver==$a' >/dev/null \
    || { echo "!! roles inesperados en $esc" >&2; return 1; }
  printf '%s\t%s\n' "$s" "$esc" >>"$OUT/escrows.tsv"
  eval "ESC_$s=$esc; J_$s='$j'"
}
esc_of() { eval "echo \$ESC_$1"; }
j_of() { eval "echo \"\$J_$1\""; }

fund() { # fund <esc> <paso> <ship> <inspect>
  tx "$2" "pp_guardian.fund 50 LABUSD (despacho $3 s, revisión $4 s)" inv "$GUARDIAN_ID" comprador fund \
    --escrow "$(esc_of "$1")" --buyer "$(addr comprador)" --expected_escrow "$(j_of "$1")" \
    --amount "$MONTO" --ship_secs "$3" --inspect_secs "$4" >/dev/null
}
ship() { # ship <esc> <paso>
  tx "$2" "pp_guardian.mark_shipped (vendedor, evidencia)" inv "$GUARDIAN_ID" vendedor mark_shipped \
    --escrow "$(esc_of "$1")" --seller "$(addr vendedor)" --evidence "\"Encomienda OLVA-$RUN_ID-$1\"" >/dev/null
}
purchase() { view "$GUARDIAN_ID" purchase --escrow "$(esc_of "$1")"; }
dump() {
  view "$(esc_of "$1")" get_escrow | jq . >"$OUT/escrow-$1.json"
  purchase "$1" | jq . >"$OUT/purchase-$1.json"
}
# terminal <esc> <paso> <etiqueta> <comando...>: saldos justo antes y después.
terminal() {
  local s="$1" step="$2" label="$3"; shift 3
  SCENARIO="$s"; saldos antes "$(esc_of "$s")" $CUENTAS
  tx "$step" "$label" "$@" >/dev/null || return 1
  saldos despues "$(esc_of "$s")" $CUENTAS; dump "$s"
}

# ── preparación ──
SCENARIO=prep
for k in "$DEPLOYER" tercero; do stellar keys address "$k" >/dev/null 2>&1 || stellar keys generate "$k" --fund >&2; done
need=$((6 * MONTO)); have=$(bal "$(addr comprador)")
if [ "${have:-0}" -lt "$need" ]; then
  tx P1 "lab (emisor) envía 400 LABUSD al comprador" stellar tx new payment --source lab \
    --destination "$(addr comprador)" --asset "LABUSD:$(addr lab)" --amount $((400 * U)) >/dev/null || exit 1
fi

# d0: interfaz on-chain de v2: exactamente las funciones documentadas (sin upgrade).
SCENARIO=d
for c in "$GUARDIAN_ID" "$ARBITER_ID"; do
  stellar contract info interface --id "$c" --output json 2>/dev/null \
    | jq -c '[.[] | select(.function_v0) | .function_v0.name] | sort'
done >"$OUT/interfaces.txt"
G_FNS='["__constructor","auto_release","config","confirm","dispute","extend","fund","mark_shipped","purchase","set_arbiter"]'
A_FNS='["__constructor","config","quote","refund_unshipped","resolve","set_admin"]'
[ "$(sed -n 1p "$OUT/interfaces.txt")" = "$G_FNS" ] && [ "$(sed -n 2p "$OUT/interfaces.txt")" = "$A_FNS" ] \
  || { echo "!! interfaz inesperada:" >&2; cat "$OUT/interfaces.txt" >&2; exit 1; }
printf '%s\t%s\t%s\t%s\t%s\n' d d0 "interfaces on-chain v2: sin upgrade, sin destinos elegibles, sin withdraw" - \
  "guardian=$G_FNS arbiter=$A_FNS" >>"$FAILLOG"

# ── f) refund_unshipped: se fondea primero para que venza el plazo de despacho ──
nueva f "Celular reacondicionado (nunca se envía)" || exit 1
fund f f3 $CORTO $LARGO || exit 1
tx f4 "comprador abre disputa (no llega el envío)" inv "$GUARDIAN_ID" comprador dispute \
  --escrow "$ESC_f" --caller "$(addr comprador)" >/dev/null || exit 1
expect_fail f5 "refund_unshipped antes del plazo de despacho" '#7' \
  inv "$ARBITER_ID" tercero refund_unshipped --escrow "$ESC_f" || exit 1

# ── c) auto_release 60 s después del envío ──
nueva c "Audífonos (liberación automática)" || exit 1
fund c c3 $LARGO $CORTO || exit 1
ship c c4 || exit 1
expect_fail c5 "tercero llama auto_release antes de release_at" '#19' \
  inv "$GUARDIAN_ID" tercero auto_release --escrow "$ESC_c" || exit 1

# ── e) extend ──
nueva e "Mochila (el comprador extiende la revisión)" || exit 1
fund e e3 $LARGO $CORTO || exit 1
ship e e4 || exit 1
R0=$(purchase e | jq -r .release_at)
tx e5 "pp_guardian.extend (comprador): release_at + 60 s" inv "$GUARDIAN_ID" comprador extend \
  --escrow "$ESC_e" --buyer "$(addr comprador)" >/dev/null || exit 1
R1=$(purchase e | jq -r .release_at)
[ "$R1" -eq $((R0 + CORTO)) ] || { echo "!! extend: release_at $R0 -> $R1" >&2; exit 1; }
wait_ledger $((R0 + 3)) "pasó el release_at original ($R0)"
expect_fail e6 "auto_release después del plazo ORIGINAL y antes del extendido" '#19' \
  inv "$GUARDIAN_ID" tercero auto_release --escrow "$ESC_e" || exit 1
expect_fail e7 "segundo extend (solo una vez)" '#27' \
  inv "$GUARDIAN_ID" comprador extend --escrow "$ESC_e" --buyer "$(addr comprador)" || exit 1
wait_ledger "$R1" "pasó el release_at extendido ($R1)"
for _ in 1 2 3 4 5 6; do sim "$GUARDIAN_ID" auto_release --escrow "$ESC_e" && break; sleep 4; done
terminal e e8 "pp_guardian.auto_release tras el plazo extendido (tercero)" \
  inv "$GUARDIAN_ID" tercero auto_release --escrow "$ESC_e" || exit 1

# ── c) cierre ──
RC=$(purchase c | jq -r .release_at)
wait_ledger "$RC" "pasó release_at de c ($RC)"
for _ in 1 2 3 4 5 6; do sim "$GUARDIAN_ID" auto_release --escrow "$ESC_c" && break; sleep 4; done
terminal c c6 "pp_guardian.auto_release (tercero, sin firmas)" \
  inv "$GUARDIAN_ID" tercero auto_release --escrow "$ESC_c" || exit 1

# ── f) cierre ──
SD=$(purchase f | jq -r .ship_deadline)
wait_ledger "$SD" "venció el plazo de despacho de f ($SD)"
SCENARIO=f
expect_fail f6 "el vendedor intenta marcar enviado tarde" '#26' \
  inv "$GUARDIAN_ID" vendedor mark_shipped --escrow "$ESC_f" --seller "$(addr vendedor)" --evidence '"tarde"' || exit 1
for _ in 1 2 3 4 5 6; do sim "$ARBITER_ID" refund_unshipped --escrow "$ESC_f" && break; sleep 4; done
terminal f f7 "pp_arbiter.refund_unshipped (tercero, sin firmas): 100% al comprador" \
  inv "$ARBITER_ID" tercero refund_unshipped --escrow "$ESC_f" || exit 1

# ── a) feliz ──
nueva a "Zapatillas Nike talla 40" || exit 1
fund a a3 $LARGO $LARGO || exit 1
expect_fail a4 "confirm antes de mark_shipped" '#23' \
  inv "$GUARDIAN_ID" comprador confirm --escrow "$ESC_a" --buyer "$(addr comprador)" || exit 1
ship a a5 || exit 1
terminal a a6 "pp_guardian.confirm: aprueba todos los hitos y libera" \
  inv "$GUARDIAN_ID" comprador confirm --escrow "$ESC_a" --buyer "$(addr comprador)" || exit 1

# ── b) disputa 70/30 ──
nueva b "Polera Adidas talla M" || exit 1
fund b b3 $LARGO $LARGO || exit 1
ship b b4 || exit 1
tx b5 "pp_guardian.dispute (comprador)" inv "$GUARDIAN_ID" comprador dispute \
  --escrow "$ESC_b" --caller "$(addr comprador)" >/dev/null || exit 1
view "$ARBITER_ID" quote --escrow "$ESC_b" --buyer_bps 7000 | jq . >"$OUT/quote-b.json"
terminal b b6 "pp_arbiter.resolve(7000) firmado por arbitro" \
  inv "$ARBITER_ID" arbitro resolve --escrow "$ESC_b" --buyer_bps 7000 || exit 1

# ── d) desvíos ──
nueva d "Chamarra (intentos de desvío)" || exit 1
fund d d3 $LARGO $LARGO || exit 1
ship d d4 || exit 1
tx d5 "pp_guardian.dispute (vendedor)" inv "$GUARDIAN_ID" vendedor dispute \
  --escrow "$ESC_d" --caller "$(addr vendedor)" >/dev/null || exit 1
T=$(addr tercero); steal=$(jq -nc --arg t "$T" --arg m "$MONTO" '{($t): $m}')
expect_fail d6 "tercero llama pp_arbiter.resolve (falta la firma del admin)" "$AUTH_FAIL" \
  inv "$ARBITER_ID" tercero resolve --escrow "$ESC_d" --buyer_bps 0 || exit 1
expect_fail d7 "tercero: escrow.resolve_dispute como dispute_resolver" '#12' \
  inv "$ESC_d" tercero resolve_dispute --dispute_resolver "$T" --trustless_work_address "$T" --distributions "$steal" || exit 1
expect_fail d8 "tercero: escrow.resolve_dispute en nombre de pp_arbiter" "$AUTH_FAIL" \
  inv "$ESC_d" tercero resolve_dispute --dispute_resolver "$ARBITER_ID" --trustless_work_address "$T" --distributions "$steal" || exit 1
expect_fail d9 "admin (arbitro): escrow.resolve_dispute en nombre de pp_arbiter hacia tercero" "$AUTH_FAIL" \
  inv "$ESC_d" arbitro resolve_dispute --dispute_resolver "$ARBITER_ID" --trustless_work_address "$TW_FEE" --distributions "$steal" || exit 1
expect_fail d10 "TW-5: tercero: withdraw_remaining_funds como dispute_resolver" '#12' \
  inv "$ESC_d" tercero withdraw_remaining_funds --dispute_resolver "$T" --trustless_work_address "$T" --distributions "$steal" || exit 1
expect_fail d11 "TW-5: admin: withdraw_remaining_funds en nombre de pp_arbiter" "$AUTH_FAIL" \
  inv "$ESC_d" arbitro withdraw_remaining_funds --dispute_resolver "$ARBITER_ID" --trustless_work_address "$T" --distributions "$steal" || exit 1
hijack=$(echo "$J_d" | jq -c --arg t "$T" '.roles.receiver=$t | .roles.service_provider=$t')
expect_fail d12 "platform: update_escrow con receiver = tercero (solo simulación)" '#16' \
  inv "$ESC_d" plataforma update_escrow --plataform_address "$PLATFORM" --escrow_properties "$hijack" || exit 1
expect_fail d13 "tercero: mark_shipped haciéndose pasar por vendedor" '#24' \
  inv "$GUARDIAN_ID" tercero mark_shipped --escrow "$ESC_d" --seller "$T" --evidence '"falsa"' || exit 1
expect_fail d14 "tercero: extend haciéndose pasar por comprador" '#7' \
  inv "$GUARDIAN_ID" tercero extend --escrow "$ESC_d" --buyer "$T" || exit 1
[ "$(bal "$ESC_d")" = "$MONTO" ] || { echo "!! cambió el saldo del escrow d" >&2; exit 1; }
terminal d d15 "cierre legítimo: pp_arbiter.resolve(5000) firmado por arbitro" \
  inv "$ARBITER_ID" arbitro resolve --escrow "$ESC_d" --buyer_bps 5000 || exit 1
t0=$(awk -F'\t' '$1=="d" && $2=="antes" && $3=="tercero"{print $4}' "$BALLOG")
t1=$(awk -F'\t' '$1=="d" && $2=="despues" && $3=="tercero"{print $4}' "$BALLOG")
[ "$t0" = "$t1" ] || { echo "!! tercero recibió fondos" >&2; exit 1; }

# ── resumen ──
{
  echo "# Flujo v2 en testnet (run $RUN_ID)"; echo
  echo "pp_guardian v2 [\`$GUARDIAN_ID\`]($EXPLORER/contract/$GUARDIAN_ID) · pp_arbiter v2 [\`$ARBITER_ID\`]($EXPLORER/contract/$ARBITER_ID)"; echo
  echo "## Escrows"; echo; echo "| Esc. | Escrow |"; echo "|---|---|"
  awk -F'\t' -v x="$EXPLORER" '{printf "| %s | [`%s`](%s/contract/%s) |\n", $1, $2, x, $2}' "$OUT/escrows.tsv"; echo
  echo "## Transacciones"; echo; echo "| Esc. | Paso | Qué | Tx | s | Fee (stroops) |"; echo "|---|---|---|---|---:|---:|"
  awk -F'\t' -v x="$EXPLORER" '{h=$4; l=(h==""?"-":"[`" substr(h,1,8) "…`](" x "/tx/" h ")"); printf "| %s | %s | %s | %s | %s | %s |\n", $1, $2, $3, l, $5, $6}' "$TXLOG"; echo
  echo "## Intentos rechazados (simulación, no llegan a la red)"; echo; echo "| Esc. | Paso | Intento | Error |"; echo "|---|---|---|---|"
  awk -F'\t' '{printf "| %s | %s | %s | `%s` |\n", $1, $2, $3, $5}' "$FAILLOG"; echo
  echo "## Esperas por hora del ledger"; echo; echo "| Esc. | Qué | Objetivo | Ledger |"; echo "|---|---|---:|---:|"
  awk -F'\t' '{printf "| %s | %s | %s | %s |\n", $1, $2, $3, $4}' "$OUT/tiempos.tsv"; echo
  echo "## Saldos LABUSD justo antes y después de la transacción final de cada escenario"; echo
  echo "| Esc. | Cuenta | Antes | Después | Δ |"; echo "|---|---|---:|---:|---:|"
  awk -F'\t' '{k=$1 SUBSEP $3; if(!(k in seen)){seen[k]=1; ord[++n]=k} v[$1,$2,$3]=$4}
    END{for(i=1;i<=n;i++){split(ord[i],p,SUBSEP); a=v[p[1],"antes",p[2]]; d=v[p[1],"despues",p[2]];
      printf "| %s | %s | %.7f | %.7f | %+.7f |\n", p[1], p[2], a/1e7, d/1e7, (d-a)/1e7}}' "$BALLOG"
} >"$OUT/resumen.md"
echo "OK: flujo v2 completo en testnet (a, b, c, e, f, d)" >&2
