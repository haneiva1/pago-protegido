#!/usr/bin/env bash
# Despliega pp_guardian y pp_arbiter en TESTNET y conecta el árbitro al guardián.
#   - deployer (paga): plataforma
#   - admin de ambos contratos: arbitro
#   - tw_fee: twfee
#   - ventanas del guardián: min 60 s, max 30 días (2 592 000 s)
# Escribe deployments/testnet.env y deployments/testnet.json.
# Uso: bash scripts/deploy-testnet.sh   (FORCE=1 para volver a desplegar)
OUT_SUBDIR=deploy source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
SCENARIO=deploy
MIN_WINDOW=60
MAX_WINDOW=2592000

if [ -f "$DEPLOY_ENV" ] && [ "${FORCE:-0}" != 1 ]; then
  echo "Ya existe $DEPLOY_ENV; usa FORCE=1 para desplegar otra vez." >&2; cat "$DEPLOY_ENV"; exit 0
fi
mkdir -p "$ROOT/deployments"

(cd "$ROOT" && stellar contract build >/dev/null 2>&1) || { echo "falló stellar contract build" >&2; exit 1; }
G_WASM="$ROOT/target/wasm32v1-none/release/pp_guardian.wasm"
A_WASM="$ROOT/target/wasm32v1-none/release/pp_arbiter.wasm"
shasum -a 256 "$G_WASM" "$A_WASM" "$ROOT/wasm/escrow.wasm" | tee "$OUT/wasm.sha256" >&2

ADMIN=$(addr arbitro); TWFEE=$(addr twfee)

G_HASH=$(tx D1 "upload WASM pp_guardian" stellar contract upload --wasm "$G_WASM" --source plataforma) || exit 1
A_HASH=$(tx D2 "upload WASM pp_arbiter" stellar contract upload --wasm "$A_WASM" --source plataforma) || exit 1
GUARDIAN=$(tx D3 "deploy pp_guardian (admin=arbitro, tw_fee=twfee, 60 s..30 d)" \
  stellar contract deploy --wasm-hash "$G_HASH" --source plataforma -- \
  --admin "$ADMIN" --tw_fee "$TWFEE" --min_window_secs $MIN_WINDOW --max_window_secs $MAX_WINDOW) || exit 1
ARBITER=$(tx D4 "deploy pp_arbiter (admin=arbitro, guardian, tw_fee=twfee)" \
  stellar contract deploy --wasm-hash "$A_HASH" --source plataforma -- \
  --admin "$ADMIN" --guardian "$GUARDIAN" --tw_fee "$TWFEE") || exit 1
tx D5 "pp_guardian.set_arbiter(pp_arbiter) firmado por arbitro" \
  inv "$GUARDIAN" arbitro set_arbiter --arbiter "$ARBITER" >/dev/null || exit 1

D3_HASH=$(awk -F'\t' '$2=="D3"{print $4}' "$TXLOG" | tail -1)
DEPLOY_LEDGER=$(curl -s -m 20 -X POST https://soroban-testnet.stellar.org -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getTransaction\",\"params\":{\"hash\":\"$D3_HASH\"}}" | jq -r '.result.ledger // 0')

cat >"$DEPLOY_ENV" <<EOF
# Generado por scripts/deploy-testnet.sh el $(date -u +%Y-%m-%dT%H:%M:%SZ). SOLO TESTNET.
NETWORK=testnet
GUARDIAN_ID=$GUARDIAN
ARBITER_ID=$ARBITER
GUARDIAN_WASM_HASH=$G_HASH
ARBITER_WASM_HASH=$A_HASH
ESCROW_WASM_HASH=$ESCROW_WASM_HASH
LABUSD_SAC=$LABUSD_SAC
ADMIN=$ADMIN
TW_FEE=$TWFEE
PLATFORM=$(addr plataforma)
MIN_WINDOW_SECS=$MIN_WINDOW
MAX_WINDOW_SECS=$MAX_WINDOW
PLATFORM_FEE_BPS=200
DEPLOY_LEDGER=$DEPLOY_LEDGER
EOF
jq -n --arg g "$GUARDIAN" --arg a "$ARBITER" --arg gh "$G_HASH" --arg ah "$A_HASH" \
  --arg eh "$ESCROW_WASM_HASH" --arg sac "$LABUSD_SAC" --arg admin "$ADMIN" --arg tw "$TWFEE" \
  --arg pl "$(addr plataforma)" --arg dl "$DEPLOY_LEDGER" --argjson min $MIN_WINDOW --argjson max $MAX_WINDOW '{
    network: "testnet",
    networkPassphrase: "Test SDF Network ; September 2015",
    rpcUrl: "https://soroban-testnet.stellar.org",
    contracts: {pp_guardian: $g, pp_arbiter: $a},
    wasmHashes: {pp_guardian: $gh, pp_arbiter: $ah, tw_escrow: $eh},
    labusdSac: $sac, admin: $admin, twFee: $tw, platform: $pl,
    platformFeeBps: 200, minWindowSecs: $min, maxWindowSecs: $max,
    shippedStatus: "enviado", initialStatus: "pendiente", deployLedger: ($dl|tonumber)}' >"$ROOT/deployments/testnet.json"
cat "$DEPLOY_ENV" >&2
view "$GUARDIAN" config | jq . >&2
view "$ARBITER" config | jq . >&2
