#!/usr/bin/env bash
# Despliega pp_guardian y pp_arbiter (v2) en TESTNET y conecta el árbitro al guardián.
#   - deployer (paga): ppdemo (DEPLOYER=…; no `plataforma`, que usa la app)
#   - admin de ambos contratos: arbitro
#   - tw_fee: twfee
#   - ventanas del guardián: despacho 60 s..30 d, revisión 60 s..30 d
# Escribe deployments/testnet.env y deployments/testnet.json (conserva los IDs
# de v1 como *_V1_ID). Uso: bash scripts/deploy-testnet.sh   (FORCE=1 para redesplegar)
VERSION=v2
OUT_SUBDIR=deploy-$VERSION source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
SCENARIO=deploy-$VERSION
DEPLOYER="${DEPLOYER:-ppdemo}"
MIN_SHIP=60; MAX_SHIP=2592000; MIN_INSPECT=60; MAX_INSPECT=2592000

if [ -f "$DEPLOY_ENV" ] && grep -q "^VERSION=$VERSION$" "$DEPLOY_ENV" && [ "${FORCE:-0}" != 1 ]; then
  echo "Ya existe un despliegue $VERSION en $DEPLOY_ENV; usa FORCE=1 para desplegar otra vez." >&2; cat "$DEPLOY_ENV"; exit 0
fi
mkdir -p "$ROOT/deployments"
# IDs de v1 (si el env actual es v1 o ya los guardaba).
V1_G=""; V1_A=""; V1_LEDGER=""
if [ -f "$DEPLOY_ENV" ]; then
  V1_G=$(grep -E '^GUARDIAN_V1_ID=' "$DEPLOY_ENV" | cut -d= -f2)
  V1_A=$(grep -E '^ARBITER_V1_ID=' "$DEPLOY_ENV" | cut -d= -f2)
  V1_LEDGER=$(grep -E '^DEPLOY_LEDGER_V1=' "$DEPLOY_ENV" | cut -d= -f2)
  if ! grep -q '^VERSION=' "$DEPLOY_ENV"; then
    V1_G=$(grep -E '^GUARDIAN_ID=' "$DEPLOY_ENV" | cut -d= -f2)
    V1_A=$(grep -E '^ARBITER_ID=' "$DEPLOY_ENV" | cut -d= -f2)
    V1_LEDGER=$(grep -E '^DEPLOY_LEDGER=' "$DEPLOY_ENV" | cut -d= -f2)
  fi
fi

if ! stellar keys address "$DEPLOYER" >/dev/null 2>&1; then stellar keys generate "$DEPLOYER" --fund >&2 || exit 1; fi
(cd "$ROOT" && stellar contract build >/dev/null 2>&1) || { echo "falló stellar contract build" >&2; exit 1; }
G_WASM="$ROOT/target/wasm32v1-none/release/pp_guardian.wasm"
A_WASM="$ROOT/target/wasm32v1-none/release/pp_arbiter.wasm"
shasum -a 256 "$G_WASM" "$A_WASM" "$ROOT/wasm/escrow.wasm" | tee "$OUT/wasm.sha256" >&2

ADMIN=$(addr arbitro); TWFEE=$(addr twfee)
: >"$TXLOG"
G_HASH=$(tx D1 "upload WASM pp_guardian v2" stellar contract upload --wasm "$G_WASM" --source "$DEPLOYER") || exit 1
A_HASH=$(tx D2 "upload WASM pp_arbiter v2" stellar contract upload --wasm "$A_WASM" --source "$DEPLOYER") || exit 1
GUARDIAN=$(tx D3 "deploy pp_guardian v2 (admin=arbitro, tw_fee=twfee, despacho y revisión 60 s..30 d)" \
  stellar contract deploy --wasm-hash "$G_HASH" --source "$DEPLOYER" -- \
  --admin "$ADMIN" --tw_fee "$TWFEE" --min_ship_secs $MIN_SHIP --max_ship_secs $MAX_SHIP \
  --min_inspect_secs $MIN_INSPECT --max_inspect_secs $MAX_INSPECT) || exit 1
ARBITER=$(tx D4 "deploy pp_arbiter v2 (admin=arbitro, guardian v2, tw_fee=twfee)" \
  stellar contract deploy --wasm-hash "$A_HASH" --source "$DEPLOYER" -- \
  --admin "$ADMIN" --guardian "$GUARDIAN" --tw_fee "$TWFEE") || exit 1
tx D5 "pp_guardian.set_arbiter(pp_arbiter v2) firmado por arbitro" \
  inv "$GUARDIAN" arbitro set_arbiter --arbiter "$ARBITER" >/dev/null || exit 1

D3_HASH=$(awk -F'\t' '$2=="D3"{print $4}' "$TXLOG" | tail -1)
DEPLOY_LEDGER=$(curl -s -m 20 -X POST https://soroban-testnet.stellar.org -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getTransaction\",\"params\":{\"hash\":\"$D3_HASH\"}}" | jq -r '.result.ledger // 0')

cat >"$DEPLOY_ENV" <<EOF
# Generado por scripts/deploy-testnet.sh el $(date -u +%Y-%m-%dT%H:%M:%SZ). SOLO TESTNET.
NETWORK=testnet
VERSION=$VERSION
GUARDIAN_ID=$GUARDIAN
ARBITER_ID=$ARBITER
GUARDIAN_WASM_HASH=$G_HASH
ARBITER_WASM_HASH=$A_HASH
ESCROW_WASM_HASH=$ESCROW_WASM_HASH
LABUSD_SAC=$LABUSD_SAC
ADMIN=$ADMIN
TW_FEE=$TWFEE
PLATFORM=$(addr plataforma)
MIN_SHIP_SECS=$MIN_SHIP
MAX_SHIP_SECS=$MAX_SHIP
MIN_INSPECT_SECS=$MIN_INSPECT
MAX_INSPECT_SECS=$MAX_INSPECT
PLATFORM_FEE_BPS=200
DEPLOY_LEDGER=$DEPLOY_LEDGER
# v1 (ya no se usa para compras nuevas; se conserva para métricas e historial)
GUARDIAN_V1_ID=$V1_G
ARBITER_V1_ID=$V1_A
DEPLOY_LEDGER_V1=$V1_LEDGER
EOF
jq -n --arg g "$GUARDIAN" --arg a "$ARBITER" --arg gh "$G_HASH" --arg ah "$A_HASH" \
  --arg eh "$ESCROW_WASM_HASH" --arg sac "$LABUSD_SAC" --arg admin "$ADMIN" --arg tw "$TWFEE" \
  --arg pl "$(addr plataforma)" --arg dl "$DEPLOY_LEDGER" --arg g1 "$V1_G" --arg a1 "$V1_A" --arg dl1 "$V1_LEDGER" \
  --argjson mins $MIN_SHIP --argjson maxs $MAX_SHIP --argjson mini $MIN_INSPECT --argjson maxi $MAX_INSPECT '{
    network: "testnet", version: "v2",
    networkPassphrase: "Test SDF Network ; September 2015",
    rpcUrl: "https://soroban-testnet.stellar.org",
    contracts: {pp_guardian: $g, pp_arbiter: $a},
    wasmHashes: {pp_guardian: $gh, pp_arbiter: $ah, tw_escrow: $eh},
    labusdSac: $sac, admin: $admin, twFee: $tw, platform: $pl, platformFeeBps: 200,
    windows: {minShipSecs: $mins, maxShipSecs: $maxs, minInspectSecs: $mini, maxInspectSecs: $maxi},
    shippedStatus: "enviado", initialStatus: "pendiente", deployLedger: ($dl|tonumber),
    v1: {contracts: {pp_guardian: $g1, pp_arbiter: $a1}, deployLedger: (($dl1 // "0")|tonumber? // 0),
         nota: "v1 retirado para compras nuevas: fund(…, window_secs) sin mark_shipped/extend"}}' >"$ROOT/deployments/testnet.json"
cat "$DEPLOY_ENV" >&2
view "$GUARDIAN" config | jq -c . >&2
view "$ARBITER" config | jq -c . >&2
