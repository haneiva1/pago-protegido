#!/usr/bin/env bash
# Contratos: tests de Rust del workspace (incluye contracts/integration-tests).
# No hace falta compilar el WASM antes: los tests usan los contratos nativos y
# el escrow.wasm versionado en contracts/wasm.
# shellcheck source=scripts/ci/lib.sh
source "$(dirname "$0")/lib.sh"
cd "${RAIZ}/contracts" || exit 1

paso "Versiones" bash -c 'rustc --version && cargo --version'
paso "cargo test" cargo test --locked --workspace
