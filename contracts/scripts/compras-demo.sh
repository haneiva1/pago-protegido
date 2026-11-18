#!/usr/bin/env bash
# Datos de ejemplo para las métricas: 6 compras en TESTNET (modo guardián) con
# montos de Bs 120 a 900 (a 11,70 Bs/USD) y distintos desenlaces:
#   p1 Bs 120  confirm  (+ reproducción on-chain del bug H-1 de TW)
#   p2 Bs 250  confirm
#   p3 Bs 380  auto_release (ventana 60 s)
#   p4 Bs 450  disputa del comprador → resolve 30% comprador
#   p5 Bs 650  disputa del vendedor  → resolve 0% comprador (100% vendedor)
#   p6 Bs 900  sin envío, disputa del comprador → refund_unshipped (ventana 60 s)
# Despliega e inicializa con la identidad `ppdemo` (no con `plataforma`, para no
# chocar con la secuencia de la app). `plataforma` sigue siendo el rol platform.
# Uso: bash scripts/compras-demo.sh
OUT_SUBDIR=demo source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
source "$DEPLOY_ENV"
DEPLOYER=ppdemo
TC=11.70
RUN_ID=$(date -u +%Y%m%d-%H%M%S)
: >"$TXLOG"; : >"$FAILLOG"; : >"$BALLOG"
COMPRAS="$OUT/compras.tsv"; : >"$COMPRAS"   # id, Bs, monto (unidades), producto, desenlace, escrow

lab_units() { awk -v bs="$1" -v tc="$TC" 'BEGIN{printf "%.0f", bs/tc*1e7}'; }

escrow_json() { # escrow_json <engagement_id> <título> <monto>
  jq -nc --arg eid "$1" --arg title "$2" --arg amount "$3" --arg g "$GUARDIAN_ID" --arg arb "$ARBITER_ID" \
    --arg s "$(addr vendedor)" --arg pl "$PLATFORM" --arg tl "$LABUSD_SAC" '{
      engagement_id: $eid, title: $title,
      roles: {approver: $g, service_provider: $s, platform: $pl, release_signer: $g,
              dispute_resolver: $arb, receiver: $s},
      description: "Pago Protegido en testnet (datos de ejemplo)",
      amount: $amount, platform_fee: 200,
      milestones: [{description: "Entrega del producto", status: "pendiente", evidence: "", approved: false}],
      flags: {disputed: false, released: false, resolved: false},
      trustline: {address: $tl}, receiver_memo: 0 }'
}

# compra <id> <Bs> <producto> <ventana_s> <enviar:si|no>: deploy + init + fund (+ enviado)
# Deja ESC_<id> y J_<id> como variables.
compra() {
  local id="$1" bs="$2" prod="$3" win="$4" ship="$5" amt esc j
  SCENARIO="$id"; amt=$(lab_units "$bs")
  echo "== $id: $prod, Bs $bs = $amt unidades LABUSD, ventana $win s" >&2
  esc=$(tx "${id}.1" "deploy instancia del escrow (ppdemo)" \
    stellar contract deploy --wasm-hash "$ESCROW_WASM_HASH" --source "$DEPLOYER") || return 1
  j=$(escrow_json "pp-demo-$RUN_ID-$id" "$prod" "$amt")
  tx "${id}.2" "initialize_escrow (ppdemo), roles modo guardián" \
    inv "$esc" "$DEPLOYER" initialize_escrow --escrow_properties "$j" >/dev/null || return 1
  view "$esc" get_escrow | jq -e --arg g "$GUARDIAN_ID" --arg a "$ARBITER_ID" \
    '.roles.approver==$g and .roles.release_signer==$g and .roles.dispute_resolver==$a' >/dev/null \
    || { echo "!! roles inesperados en $esc" >&2; return 1; }
  tx "${id}.3" "pp_guardian.fund Bs $bs ($amt u.)" inv "$GUARDIAN_ID" comprador fund --escrow "$esc" \
    --buyer "$(addr comprador)" --expected_escrow "$j" --amount "$amt" --window_secs "$win" >/dev/null || return 1
  if [ "$ship" = si ]; then
    tx "${id}.4" "vendedor marca \"enviado\"" inv "$esc" vendedor change_milestone_status --milestone_index 0 \
      --new_status '"enviado"' --new_evidence "\"Encomienda SRV-$RUN_ID-$id\"" \
      --service_provider "$(addr vendedor)" >/dev/null || return 1
  fi
  eval "ESC_$id=$esc"
  printf '%s\t%s\t%s\t%s\t%s\n' "$id" "$bs" "$amt" "$prod" "$esc" >>"$COMPRAS"
}

if ! stellar keys address "$DEPLOYER" >/dev/null 2>&1; then
  stellar keys generate "$DEPLOYER" --fund >&2 || exit 1
fi
SCENARIO=prep; saldos antes "" comprador vendedor plataforma twfee arbitro tercero

# Primero las dos de 60 s, para que el plazo venza mientras corren las demás.
compra p3 380 "Audífonos inalámbricos" 60 si || exit 1
compra p6 900 "Celular reacondicionado" 60 no || exit 1
SCENARIO=p6
tx p6.5 "comprador abre disputa (nunca se envió)" inv "$GUARDIAN_ID" comprador dispute \
  --escrow "$ESC_p6" --caller "$(addr comprador)" >/dev/null || exit 1

compra p1 120 "Polera estampada talla M" 86400 si || exit 1
tx p1.5 "pp_guardian.confirm" inv "$GUARDIAN_ID" comprador confirm --escrow "$ESC_p1" --buyer "$(addr comprador)" >/dev/null || exit 1
# Bug H-1 de Trustless Work: dispute_escrow no revisa flags.released.
# El vendedor (service_provider/receiver) marca disputa DIRECTO en el escrow ya liberado.
tx p1.6 "H-1: vendedor llama escrow.dispute_escrow sobre un escrow YA liberado (TW lo acepta)" \
  inv "$ESC_p1" vendedor dispute_escrow --signer "$(addr vendedor)" >/dev/null || exit 1
view "$ESC_p1" get_escrow | jq . >"$OUT/escrow-p1-h1.json"
jq -e '.flags.released and .flags.disputed' "$OUT/escrow-p1-h1.json" >/dev/null || { echo "!! H-1 no se reprodujo" >&2; exit 1; }
expect_fail p1.7 "por el guardián la misma disputa se rechaza (EscrowAlreadyReleased)" '#21' \
  inv "$GUARDIAN_ID" vendedor dispute --escrow "$ESC_p1" --caller "$(addr vendedor)" || exit 1
expect_fail p1.8 "el árbitro no tiene nada que repartir (EmptyEscrow)" '#5' \
  inv "$ARBITER_ID" arbitro resolve --escrow "$ESC_p1" --buyer_bps 5000 || exit 1

compra p2 250 "Mochila urbana" 172800 si || exit 1
tx p2.5 "pp_guardian.confirm" inv "$GUARDIAN_ID" comprador confirm --escrow "$ESC_p2" --buyer "$(addr comprador)" >/dev/null || exit 1

compra p4 450 "Zapatillas Nike talla 40" 259200 si || exit 1
tx p4.5 "comprador abre disputa" inv "$GUARDIAN_ID" comprador dispute --escrow "$ESC_p4" --caller "$(addr comprador)" >/dev/null || exit 1
tx p4.6 "pp_arbiter.resolve 30% comprador" inv "$ARBITER_ID" arbitro resolve --escrow "$ESC_p4" --buyer_bps 3000 >/dev/null || exit 1

compra p5 650 "Chamarra de cuero" 259200 si || exit 1
tx p5.5 "vendedor abre disputa (comprador no responde)" inv "$GUARDIAN_ID" vendedor dispute --escrow "$ESC_p5" --caller "$(addr vendedor)" >/dev/null || exit 1
tx p5.6 "pp_arbiter.resolve 0% comprador (100% vendedor)" inv "$ARBITER_ID" arbitro resolve --escrow "$ESC_p5" --buyer_bps 0 >/dev/null || exit 1

SCENARIO=p3
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do sim "$GUARDIAN_ID" auto_release --escrow "$ESC_p3" && break; sleep 5; done
tx p3.5 "pp_guardian.auto_release (lo dispara tercero)" inv "$GUARDIAN_ID" tercero auto_release --escrow "$ESC_p3" >/dev/null || exit 1
SCENARIO=p6
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do sim "$ARBITER_ID" refund_unshipped --escrow "$ESC_p6" && break; sleep 5; done
tx p6.6 "pp_arbiter.refund_unshipped (lo dispara tercero)" inv "$ARBITER_ID" tercero refund_unshipped --escrow "$ESC_p6" >/dev/null || exit 1

SCENARIO=fin; saldos despues "" comprador vendedor plataforma twfee arbitro tercero
for id in p1 p2 p3 p4 p5 p6; do eval "e=\$ESC_$id"; view "$e" get_escrow | jq -c '{flags, status: .milestones[0].status}' | sed "s/^/$id /" >&2; done
echo "OK: 6 compras de ejemplo en testnet" >&2
