#!/usr/bin/env bash
# Compila pp_guardian y pp_arbiter para MAINNET (feature `tw-mainnet`: el escrow que Trustless Work tiene en mainnet) y
# compara su sha256 con wasm/mainnet.sha256. Deja los WASM en target/mainnet/, listos para `stellar contract upload`.
# No usa la red ni ninguna llave: solo compila y compara. Los pasos para desplegar están en docs/MAINNET.md.
#
# Uso (desde cualquier carpeta): bash contracts/scripts/wasm-mainnet.sh
# Sale con 0 si todo coincide, con 1 si algún hash difiere y con 2 si falta una herramienta o no se pudo compilar.
#
# Igual que verify-wasm.sh, necesita stellar-cli 30.0.1 y el rustc de rust-toolchain.toml: las dos versiones quedan
# escritas en el WASM.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # .../contracts
SALIDA="$ROOT/target/mainnet"
CLI_ESPERADO="30.0.1"
falla() { echo "ERROR: $*" >&2; exit 2; }
sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else shasum -a 256 "$1"; fi | awk '{print $1}'; }

command -v stellar >/dev/null 2>&1 || falla "falta stellar-cli $CLI_ESPERADO"
command -v cargo >/dev/null 2>&1 || falla "falta Rust (rustup)"
CLI_VER="$(stellar --version | head -1 | awk '{print $2}')"
[ "$CLI_VER" = "$CLI_ESPERADO" ] || echo "ADVERTENCIA: stellar-cli es $CLI_VER y no $CLI_ESPERADO; el hash va a cambiar." >&2

mkdir -p "$SALIDA"
for c in pp_guardian pp_arbiter; do
  (cd "$ROOT" && env -u RUSTFLAGS -u CARGO_ENCODED_RUSTFLAGS \
    stellar contract build --locked --features tw-mainnet --package "$c" --out-dir "$SALIDA") >"$SALIDA/$c.log" 2>&1 \
    || { cat "$SALIDA/$c.log" >&2; falla "no se pudo compilar $c"; }
done

DIFERENTES=0
while read -r esperado archivo; do
  case "$archivo" in
    escrow-mainnet.wasm) f="$ROOT/wasm/$archivo" ;;
    *) f="$SALIDA/$archivo" ;;
  esac
  obtenido="$(sha256 "$f")"
  if [ "$obtenido" = "$esperado" ]; then
    printf '%-10s %-20s %s\n' OK "$archivo" "$obtenido"
  else
    printf '%-10s %-20s obtenido %s\n%-31s esperado %s\n' DIFERENTE "$archivo" "$obtenido" "" "$esperado"
    DIFERENTES=$((DIFERENTES + 1))
  fi
done <"$ROOT/wasm/mainnet.sha256"

[ "$DIFERENTES" -eq 0 ] || { echo "Hay $DIFERENTES hash(es) diferente(s): no despliegues." >&2; exit 1; }
echo "Todo coincide. WASM en $SALIDA"
