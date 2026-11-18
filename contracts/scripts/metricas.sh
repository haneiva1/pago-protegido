#!/usr/bin/env bash
# Métricas on-chain de Pago Protegido (TESTNET), a partir de los eventos pp_*
# de pp_guardian y pp_arbiter leídos con getEvents del RPC (xdrFormat=json).
# No usa llaves ni firma nada: solo lectura.
#
# Uso:
#   bash scripts/metricas.sh                      # JSON por stdout
#   bash scripts/metricas.sh > metricas.json
#   START_LEDGER=5790662 RPC_URL=... TIPO_CAMBIO=11.70 bash scripts/metricas.sh
#   EVENTS_OUT=eventos.jsonl bash scripts/metricas.sh   # guarda también los eventos crudos
#
# Límite: el RPC público guarda ~7 días de eventos (ventana de retención). Para
# historia completa, la app debe ingerir los eventos de forma incremental (ver
# pago-protegido/docs/METRICAS.md).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT/deployments/testnet.env"
RPC="${RPC_URL:-https://soroban-testnet.stellar.org}"
TC="${TIPO_CAMBIO:-11.70}"
START="${START_LEDGER:-${DEPLOY_LEDGER:-0}}"
LIMIT=200

rpc() { curl -sS -m 30 -X POST "$RPC" -H 'Content-Type: application/json' -d "$1"; }

# El startLedger debe estar dentro de la ventana de retención del RPC.
oldest=$(rpc '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | jq -r '.result.oldestLedger')
[ "$START" -lt "$oldest" ] && START=$oldest

EV=$(mktemp); trap 'rm -f "$EV"' EXIT
filters=$(jq -nc --arg g "$GUARDIAN_ID" --arg a "$ARBITER_ID" '[{type:"contract", contractIds:[$g,$a]}]')
cursor=""; latest=0
for page in $(seq 1 200); do
  if [ -z "$cursor" ]; then
    params=$(jq -nc --argjson s "$START" --argjson f "$filters" --argjson l $LIMIT \
      '{startLedger:$s, filters:$f, pagination:{limit:$l}, xdrFormat:"json"}')
  else
    params=$(jq -nc --arg c "$cursor" --argjson f "$filters" --argjson l $LIMIT \
      '{filters:$f, pagination:{cursor:$c, limit:$l}, xdrFormat:"json"}')
  fi
  resp=$(rpc "$(jq -nc --argjson p "$params" '{jsonrpc:"2.0", id:1, method:"getEvents", params:$p}')")
  if echo "$resp" | jq -e '.error' >/dev/null; then echo "error del RPC: $(echo "$resp" | jq -c .error)" >&2; exit 1; fi
  echo "$resp" | jq -c '.result.events[]' >>"$EV"
  n=$(echo "$resp" | jq '.result.events | length')
  latest=$(echo "$resp" | jq '.result.latestLedger')
  cursor=$(echo "$resp" | jq -r '.result.cursor')
  toid=${cursor%%-*}; cl=$(( 10#$toid >> 32 ))   # el cursor es un TOID: ledger = toid >> 32
  [ "$n" -lt $LIMIT ] && [ "$cl" -ge "$latest" ] && break
done
[ -n "${EVENTS_OUT:-}" ] && cp "$EV" "$EVENTS_OUT"

jq -s --arg g "$GUARDIAN_ID" --arg a "$ARBITER_ID" --argjson tc "$TC" --argjson desde "$START" \
  --argjson hasta "$latest" --arg x "https://stellar.expert/explorer/testnet" '
def v: to_entries[0].value;
def data: (.valueJson.map // []) | map({key: .key.symbol, value: (.val | v)}) | from_entries;
def lab: (. * 1e7 | round) / 1e7;
def first_of($k; $e): map(select(.kind == $k and .escrow == $e)) | first;

[ .[] | {kind: .topicJson[0].symbol, escrow: (.topicJson[1].address // null),
         t: (.ledgerClosedAt | fromdateiso8601), at: .ledgerClosedAt, ledger, tx: .txHash, d: data} ] as $ev
| [ $ev[] | select(.kind == "pp_funded") ] as $funded
| [ $funded[] | . as $f | ($f.escrow) as $e | {
      escrow: $e, escrow_url: "\($x)/contract/\($e)",
      monto_unidades: ($f.d.amount | tonumber), monto_labusd: ($f.d.amount | tonumber | ./1e7 | lab),
      comprador: $f.d.buyer, vendedor: $f.d.seller,
      fondeada_en: $f.at, deadline: ($f.d.deadline | tonumber | todate), tx_fondeo: "\($x)/tx/\($f.tx)",
      _t0: $f.t,
      _conf: ($ev | first_of("pp_confirmed"; $e)), _auto: ($ev | first_of("pp_auto_released"; $e)),
      _disp: ($ev | first_of("pp_disputed"; $e)), _res: ($ev | first_of("pp_resolved"; $e)),
      _ref: ($ev | first_of("pp_refunded_unshipped"; $e)) } ] as $raw
| [ $raw[] | . as $p
    | (if ._conf then "confirmada" elif ._auto then "liberada_automaticamente"
       elif ._res then "resuelta_por_arbitro" elif ._ref then "reembolso_sin_envio"
       elif ._disp then "en_disputa" else "en_curso" end) as $estado
    | (._conf // ._auto) as $rel
    | (._res // ._ref) as $fin
    | {escrow, escrow_url, monto_labusd, monto_unidades, comprador, vendedor, fondeada_en, deadline, tx_fondeo,
       estado: $estado,
       liberada_en: ($rel.at // null), tx_liberacion: (if $rel then "\($x)/tx/\($rel.tx)" else null end),
       segundos_hasta_liberacion: (if $rel then ($rel.t - ._t0) else null end),
       disputa: (if ._disp then {abierta_por: (if ._disp.d.caller == $p.comprador then "comprador" else "vendedor" end),
                                 abierta_en: ._disp.at, tx: "\($x)/tx/\(._disp.tx)"} else null end),
       resolucion: (if $fin then {
           tipo: (if ._res then "resolve" else "refund_unshipped" end),
           buyer_bps: (if ._res then (._res.d.buyer_bps | tonumber) else 10000 end),
           comprador_bruto_labusd: ($fin.d.buyer_amount | tonumber | ./1e7 | lab),
           vendedor_bruto_labusd: (($fin.d.seller_amount // "0") | tonumber | ./1e7 | lab),
           resuelta_en: $fin.at, segundos_desde_fondeo: ($fin.t - ._t0), tx: "\($x)/tx/\($fin.tx)"} else null end)
      } ] as $c
| [ $c[] | select(.segundos_hasta_liberacion != null) | .segundos_hasta_liberacion ] as $tl
| [ $c[] | select(.estado != "en_curso" and .estado != "en_disputa") | .monto_unidades ] as $cerradas
| [ $c[] | select(.resolucion != null) | .resolucion ] as $res
| ($c | map(.monto_unidades) | add // 0) as $vol
| {
    red: "testnet",
    generado_en: (now | floor | todate),
    contratos: {pp_guardian: $g, pp_arbiter: $a},
    ledgers: {desde: $desde, hasta: $hasta},
    tipo_cambio_bs_por_usd: $tc,
    compras_protegidas: ($c | length),
    volumen: {labusd: ($vol / 1e7 | lab), unidades: $vol, bs_aprox: ($vol / 1e7 * $tc | . * 100 | round / 100)},
    liberadas_por_confirmacion: ($c | map(select(.estado == "confirmada")) | length),
    liberadas_automaticamente: ($c | map(select(.estado == "liberada_automaticamente")) | length),
    en_curso: ($c | map(select(.estado == "en_curso")) | length),
    disputas: {
      total: ($c | map(select(.disputa != null)) | length),
      abiertas_por_comprador: ($c | map(select(.disputa.abierta_por == "comprador")) | length),
      abiertas_por_vendedor: ($c | map(select(.disputa.abierta_por == "vendedor")) | length),
      pendientes: ($c | map(select(.estado == "en_disputa")) | length),
      resueltas_por_arbitro: ($res | map(select(.tipo == "resolve")) | length),
      reembolsos_sin_envio: ($res | map(select(.tipo == "refund_unshipped")) | length),
      a_favor_del_comprador: ($res | map(select(.buyer_bps == 10000)) | length),
      a_favor_del_vendedor: ($res | map(select(.buyer_bps == 0)) | length),
      repartos_parciales: ($res | map(select(.buyer_bps > 0 and .buyer_bps < 10000)) | length),
      buyer_bps_promedio: (if ($res | length) > 0 then ($res | map(.buyer_bps) | add / length | round) else null end),
      segundos_promedio_hasta_resolucion: (if ($res | length) > 0 then ($res | map(.segundos_desde_fondeo) | add / length | round) else null end)
    },
    tiempo_promedio_hasta_liberacion: (if ($tl | length) > 0 then
      {segundos: ($tl | add / length | round), horas: ($tl | add / length / 3600 | . * 100 | round / 100), muestras: ($tl | length)}
      else null end),
    comisiones_estimadas: {
      nota: "Nominales sobre compras cerradas: plataforma 2% y Trustless Work 0,3% del monto (floor por compra). En repartos, TW redondea por destinatario y lo cobrado puede ser hasta 1 unidad menor.",
      plataforma_labusd: ($cerradas | map(. * 200 / 10000 | floor) | add // 0 | ./1e7 | lab),
      trustless_work_labusd: ($cerradas | map(. * 30 / 10000 | floor) | add // 0 | ./1e7 | lab)
    },
    compras: $c
  }' "$EV"
