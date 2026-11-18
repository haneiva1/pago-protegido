#!/usr/bin/env bash
# Flujo real de Pago Protegido en TESTNET, modo guardián (SPEC §2).
# Despliega UNA instancia nueva del escrow de Trustless Work por escenario, con
# approver = release_signer = pp_guardian y dispute_resolver = pp_arbiter.
#
#   a) caso feliz: fund → enviado → confirm
#   b) disputa → resolve con 70% para el comprador
#   c) auto_release con ventana de 60 s (lo dispara un tercero sin rol)
#   d) intento de resolve con una tercera dirección: no existe la vía
#
# Requisitos: deployments/testnet.env (scripts/deploy-testnet.sh), identidades
# del Stellar CLI comprador, vendedor, plataforma, arbitro, twfee y lab. El
# script crea `tercero` (friendbot + trustline LABUSD) si no existe.
#
# Uso: bash scripts/flujo-testnet.sh [all|a|b|c|d]      (por defecto: all)
# Evidencia en scripts/out/flujo/: txlog.tsv, fallos.tsv, saldos.tsv,
# escrow-*.json, purchase-*.json, fallo-*.txt y resumen.md (con links).
OUT_SUBDIR=flujo source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

[ -f "$DEPLOY_ENV" ] || { echo "Falta $DEPLOY_ENV: corre antes scripts/deploy-testnet.sh" >&2; exit 1; }
source "$DEPLOY_ENV"

MONTO=$((150 * U))           # 150 LABUSD por compra
VENTANA_LARGA=259200         # 3 días
VENTANA_CORTA=60             # mínimo configurado en el guardián
CUENTAS="comprador vendedor plataforma twfee arbitro tercero"
RUN_ID=$(date -u +%Y%m%d-%H%M%S)
WHAT="${1:-all}"
AUTH_FAIL='Error\(Auth|[Ss]ign|InvalidAction|[Aa]uthoriz'

upper() { echo "$1" | tr '[:lower:]' '[:upper:]'; }

escrow_json() { # escrow_json <engagement_id>
  jq -nc --arg eid "$1" --arg amount "$MONTO" --arg g "$GUARDIAN_ID" --arg arb "$ARBITER_ID" \
    --arg s "$(addr vendedor)" --arg pl "$(addr plataforma)" --arg tl "$LABUSD_SAC" '{
      engagement_id: $eid, title: "Zapatillas Nike talla 40",
      roles: {approver: $g, service_provider: $s, platform: $pl, release_signer: $g,
              dispute_resolver: $arb, receiver: $s},
      description: "Pago Protegido en testnet (modo guardián)",
      amount: $amount, platform_fee: 200,
      milestones: [{description: "Entrega del producto", status: "pendiente", evidence: "", approved: false}],
      flags: {disputed: false, released: false, resolved: false},
      trustline: {address: $tl}, receiver_memo: 0 }'
}

# new_escrow: despliega + inicializa una instancia y verifica sus roles.
# Deja el ID en $ESC y el JSON en $J.
new_escrow() {
  local s="$SCENARIO"
  ESC=$(tx "${s}1" "deploy instancia del escrow de TW (wasm ${ESCROW_WASM_HASH:0:8}…)" \
    stellar contract deploy --wasm-hash "$ESCROW_WASM_HASH" --source plataforma) || return 1
  J=$(escrow_json "pp-$RUN_ID-$s")
  tx "${s}2" "initialize_escrow con roles del modo guardián (plataforma)" \
    inv "$ESC" plataforma initialize_escrow --escrow_properties "$J" >/dev/null || return 1
  # Nadie se adelantó a inicializar con otros roles (hallazgo 1 del spike).
  view "$ESC" get_escrow | jq -e --arg g "$GUARDIAN_ID" --arg a "$ARBITER_ID" \
    '.roles.approver==$g and .roles.release_signer==$g and .roles.dispute_resolver==$a' >/dev/null \
    || { echo "!! roles inesperados en $ESC" >&2; return 1; }
  printf '%s\t%s\n' "$s" "$ESC" >>"$OUT/escrows.tsv"
}

fund() { # fund <paso> <ventana>
  tx "$1" "pp_guardian.fund: comprador deposita 150 LABUSD (ventana $2 s)" \
    inv "$GUARDIAN_ID" comprador fund --escrow "$ESC" --buyer "$(addr comprador)" \
    --expected_escrow "$J" --amount "$MONTO" --window_secs "$2" >/dev/null
}

ship() { # ship <paso>
  tx "$1" "change_milestone_status: vendedor marca \"enviado\" + guía" \
    inv "$ESC" vendedor change_milestone_status --milestone_index 0 --new_status '"enviado"' \
    --new_evidence "\"Encomienda SRV-$RUN_ID-$SCENARIO\"" --service_provider "$(addr vendedor)" >/dev/null
}

dump() {
  view "$ESC" get_escrow | jq . >"$OUT/escrow-$SCENARIO.json"
  view "$GUARDIAN_ID" purchase --escrow "$ESC" | jq . >"$OUT/purchase-$SCENARIO.json"
}

prep() {
  SCENARIO=prep
  if ! stellar keys address tercero >/dev/null 2>&1; then
    stellar keys generate tercero --fund >&2 || exit 1
  fi
  if ! view "$LABUSD_SAC" balance --id "$(addr tercero)" >/dev/null; then
    tx P1 "trustline tercero -> LABUSD" stellar tx new change-trust --source tercero \
      --line "LABUSD:$(addr lab)" >/dev/null || exit 1
  fi
  local need=$((4 * MONTO)) have
  have=$(bal "$(addr comprador)")
  if [ "${have:-0}" -lt "$need" ]; then
    tx P2 "lab (emisor) envía 600 LABUSD al comprador" stellar tx new payment --source lab \
      --destination "$(addr comprador)" --asset "LABUSD:$(addr lab)" --amount "$need" >/dev/null || exit 1
  fi
}

scenario_a() {
  SCENARIO=a; echo "== (a) caso feliz: fund → enviado → confirm" >&2
  new_escrow || return 1
  saldos antes "$ESC" $CUENTAS
  fund a3 $VENTANA_LARGA || return 1
  ship a4 || return 1
  tx a5 "pp_guardian.confirm: comprador aprueba y libera en la misma invocación" \
    inv "$GUARDIAN_ID" comprador confirm --escrow "$ESC" --buyer "$(addr comprador)" >/dev/null || return 1
  expect_fail a6 "comprador intenta disputar después de confirm" '#21' \
    inv "$GUARDIAN_ID" comprador dispute --escrow "$ESC" --caller "$(addr comprador)" || return 1
  saldos despues "$ESC" $CUENTAS; dump
  jq -e '.flags.released and .milestones[0].approved' "$OUT/escrow-a.json" >/dev/null || return 1
}

scenario_b() {
  SCENARIO=b; echo "== (b) disputa → resolve 70% comprador" >&2
  new_escrow || return 1
  saldos antes "$ESC" $CUENTAS
  fund b3 $VENTANA_LARGA || return 1
  ship b4 || return 1
  tx b5 "pp_guardian.dispute: comprador abre reclamo" \
    inv "$GUARDIAN_ID" comprador dispute --escrow "$ESC" --caller "$(addr comprador)" >/dev/null || return 1
  view "$ARBITER_ID" quote --escrow "$ESC" --buyer_bps 7000 | jq . >"$OUT/quote-b.json"
  tx b6 "pp_arbiter.resolve(buyer_bps=7000) firmado por arbitro" \
    inv "$ARBITER_ID" arbitro resolve --escrow "$ESC" --buyer_bps 7000 >/dev/null || return 1
  saldos despues "$ESC" $CUENTAS; dump
  jq -e '.flags.resolved and (.flags.disputed|not)' "$OUT/escrow-b.json" >/dev/null || return 1
}

scenario_c() {
  SCENARIO=c; echo "== (c) auto_release con ventana de 60 s" >&2
  new_escrow || return 1
  saldos antes "$ESC" $CUENTAS
  fund c3 $VENTANA_CORTA || return 1
  ship c4 || return 1
  expect_fail c5 "tercero llama auto_release antes del plazo" '#19' \
    inv "$GUARDIAN_ID" tercero auto_release --escrow "$ESC" || return 1
  local deadline nowts i
  deadline=$(view "$GUARDIAN_ID" purchase --escrow "$ESC" | jq -r .deadline)
  nowts=$(date +%s)
  if [ "$nowts" -lt "$((deadline + 5))" ]; then
    echo "   esperando $((deadline + 5 - nowts)) s hasta el deadline ($deadline)..." >&2
    sleep $((deadline + 5 - nowts))
  fi
  for i in 1 2 3 4 5 6 7 8 9 10 11 12; do   # el ledger puede ir unos segundos atrás
    view "$GUARDIAN_ID" auto_release --escrow "$ESC" >/dev/null && break
    sleep 5
  done
  tx c6 "pp_guardian.auto_release: lo dispara tercero (sin rol, sin auth de nadie)" \
    inv "$GUARDIAN_ID" tercero auto_release --escrow "$ESC" >/dev/null || return 1
  saldos despues "$ESC" $CUENTAS; dump
  jq -e '.flags.released and .milestones[0].approved' "$OUT/escrow-c.json" >/dev/null || return 1
}

scenario_d() {
  SCENARIO=d; echo "== (d) resolve hacia una tercera dirección: no existe la vía" >&2
  local T; T=$(addr tercero)
  # d0: la interfaz pública de pp_arbiter no acepta destinos.
  stellar contract info interface --id "$ARBITER_ID" --output json 2>/dev/null >"$OUT/arbiter-interface.json"
  jq '[.[] | select(.function_v0) | .function_v0 | {name, inputs: [.inputs[] | "\(.name): \(.type|tostring)"]}]' \
    "$OUT/arbiter-interface.json" >"$OUT/arbiter-funciones.json"
  jq -e '[.[] | select(.function_v0) | .function_v0
          | select(.name != "__constructor" and .name != "set_admin")
          | .inputs[] | select(.type != "u32" and (.name != "escrow" or .type != "address"))]
         | length == 0' "$OUT/arbiter-interface.json" >/dev/null \
    || { echo "!! pp_arbiter expone una función con destino elegible" >&2; return 1; }
  printf '%s\t%s\t%s\t%s\t%s\n' d d0 "interfaz de pp_arbiter: ninguna función acepta destino ni distribuciones" "-" \
    "$(jq -r '[.[].name + "(" + (.inputs|join(", ")) + ")"] | join("; ")' "$OUT/arbiter-funciones.json")" >>"$FAILLOG"

  new_escrow || return 1
  saldos antes "$ESC" $CUENTAS
  fund d3 $VENTANA_LARGA || return 1
  tx d4 "pp_guardian.dispute: el vendedor abre la disputa" \
    inv "$GUARDIAN_ID" vendedor dispute --escrow "$ESC" --caller "$(addr vendedor)" >/dev/null || return 1
  local steal; steal=$(jq -nc --arg t "$T" --arg m "$MONTO" '{($t): $m}')

  expect_fail d5 "tercero llama pp_arbiter.resolve (falta la firma del admin)" "$AUTH_FAIL" \
    inv "$ARBITER_ID" tercero resolve --escrow "$ESC" --buyer_bps 0 || return 1
  expect_fail d6 "tercero llama escrow.resolve_dispute como dispute_resolver, todo para él" '#12' \
    inv "$ESC" tercero resolve_dispute --dispute_resolver "$T" --trustless_work_address "$T" \
    --distributions "$steal" || return 1
  expect_fail d7 "tercero llama escrow.resolve_dispute en nombre de pp_arbiter" "$AUTH_FAIL" \
    inv "$ESC" tercero resolve_dispute --dispute_resolver "$ARBITER_ID" --trustless_work_address "$T" \
    --distributions "$steal" || return 1
  expect_fail d8 "el admin (arbitro) llama escrow.resolve_dispute en nombre de pp_arbiter hacia tercero" "$AUTH_FAIL" \
    inv "$ESC" arbitro resolve_dispute --dispute_resolver "$ARBITER_ID" --trustless_work_address "$(addr twfee)" \
    --distributions "$steal" || return 1
  local hijack; hijack=$(echo "$J" | jq -c --arg t "$T" '.roles.receiver=$t | .roles.service_provider=$t')
  expect_fail d9 "la plataforma intenta cambiar el receiver a tercero" '#16' \
    inv "$ESC" plataforma update_escrow --plataform_address "$(addr plataforma)" --escrow_properties "$hijack" || return 1

  [ "$(bal "$ESC")" = "$MONTO" ] || { echo "!! el saldo del escrow cambió" >&2; return 1; }
  tx d10 "cierre legítimo: pp_arbiter.resolve(buyer_bps=5000) firmado por arbitro" \
    inv "$ARBITER_ID" arbitro resolve --escrow "$ESC" --buyer_bps 5000 >/dev/null || return 1
  saldos despues "$ESC" $CUENTAS; dump
  local t0 t1
  t0=$(awk -F'\t' '$1=="d" && $2=="antes" && $3=="tercero" {print $4}' "$BALLOG" | tail -1)
  t1=$(awk -F'\t' '$1=="d" && $2=="despues" && $3=="tercero" {print $4}' "$BALLOG" | tail -1)
  [ "$t0" = "$t1" ] || { echo "!! tercero recibió fondos ($t0 -> $t1)" >&2; return 1; }
}

resumen() {
  local R="$OUT/resumen.md"
  {
    echo "# Flujo testnet de Pago Protegido (run $RUN_ID)"
    echo
    echo "pp_guardian [\`$GUARDIAN_ID\`]($EXPLORER/contract/$GUARDIAN_ID) · pp_arbiter [\`$ARBITER_ID\`]($EXPLORER/contract/$ARBITER_ID)"
    echo
    echo "## Escrows (una instancia por escenario)"
    echo
    echo "| Escenario | Escrow |"; echo "|---|---|"
    awk -F'\t' -v x="$EXPLORER" '{printf "| %s | [`%s`](%s/contract/%s) |\n", $1, $2, x, $2}' "$OUT/escrows.tsv"
    echo
    echo "## Transacciones"
    echo
    echo "| Esc. | Paso | Qué | Tx | s | Fee (stroops) |"; echo "|---|---|---|---|---:|---:|"
    awk -F'\t' -v x="$EXPLORER" '{h=$4; l=(h==""?"-":"[`" substr(h,1,8) "…`](" x "/tx/" h ")"); printf "| %s | %s | %s | %s | %s | %s |\n", $1, $2, $3, l, $5, $6}' "$TXLOG"
    echo
    echo "## Intentos rechazados (simulación, no llegan a la red)"
    echo
    echo "| Esc. | Paso | Intento | Error |"; echo "|---|---|---|---|"
    awk -F'\t' '{printf "| %s | %s | %s | `%s` |\n", $1, $2, $3, $5}' "$FAILLOG"
    echo
    echo "## Saldos LABUSD (antes → después, en LABUSD)"
    echo
    echo "| Esc. | Cuenta | Antes | Después | Δ |"; echo "|---|---|---:|---:|---:|"
    awk -F'\t' '{k=$1 SUBSEP $3; if(!(k in seen)){seen[k]=1; ord[++n]=k} v[$1,$2,$3]=$4}
      END{for(i=1;i<=n;i++){split(ord[i],p,SUBSEP); a=v[p[1],"antes",p[2]]; d=v[p[1],"despues",p[2]];
        printf "| %s | %s | %.7f | %.7f | %+.7f |\n", p[1], p[2], a/1e7, d/1e7, (d-a)/1e7}}' "$BALLOG"
  } >"$R"
  echo "Resumen: $R" >&2
}

case "$WHAT" in
  all) : >"$TXLOG"; : >"$FAILLOG"; : >"$BALLOG"; : >"$OUT/escrows.tsv"
       prep; scenario_a || exit 1; scenario_b || exit 1; scenario_c || exit 1; scenario_d || exit 1 ;;
  a|b|c|d) touch "$OUT/escrows.tsv"; prep; "scenario_$WHAT" || exit 1 ;;
  *) echo "uso: $0 [all|a|b|c|d]" >&2; exit 2 ;;
esac
resumen
echo "OK: escenarios '$WHAT' completos en testnet" >&2
