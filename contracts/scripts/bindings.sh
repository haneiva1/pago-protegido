#!/usr/bin/env bash
# Genera los bindings TypeScript en bindings/ con `stellar contract bindings typescript`.
#   bindings/pp_guardian  (contrato desplegado, incluye networks.testnet.contractId)
#   bindings/pp_arbiter   (contrato desplegado, incluye networks.testnet.contractId)
#   bindings/tw_escrow    (WASM de Trustless Work; cada compra es una instancia nueva)
# Uso: bash scripts/bindings.sh [--build]   (--build: npm install + npm run build para verificar)
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
source "$DEPLOY_ENV"
B="$ROOT/bindings"
stellar contract bindings typescript --contract-id "$GUARDIAN_ID" --output-dir "$B/pp_guardian" --overwrite || exit 1
stellar contract bindings typescript --contract-id "$ARBITER_ID" --output-dir "$B/pp_arbiter" --overwrite || exit 1
stellar contract bindings typescript --wasm "$ROOT/wasm/escrow.wasm" --output-dir "$B/tw_escrow" --overwrite || exit 1
if [ "${1:-}" = "--build" ]; then
  for p in pp_guardian pp_arbiter tw_escrow; do
    (cd "$B/$p" && npm install --silent --no-audit --no-fund && npm run build --silent) || exit 1
  done
fi
echo "bindings en $B" >&2
