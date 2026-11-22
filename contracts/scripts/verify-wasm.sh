#!/usr/bin/env bash
# Comprueba que los WASM desplegados salen de este código.
#
# Compila pp_guardian y pp_arbiter con `stellar contract build --locked` y
# compara su sha256 con las filas de DEPLOYED.md. También revisa que
# wasm/escrow.wasm tenga el hash del escrow de Trustless Work.
#
# Por defecto compila el código DESPLEGADO hoy: el commit `DESPLEGADO` (el
# último que cambió los contratos antes de H-13), extraído con `git archive`.
# El código de `main` ya incluye H-13 y entra con el próximo despliegue; hasta
# entonces su hash no es el de DEPLOYED.md.
#
# Uso (desde cualquier carpeta):
#   bash contracts/scripts/verify-wasm.sh          # el commit desplegado
#   bash contracts/scripts/verify-wasm.sh <commit> # otro commit
#   bash contracts/scripts/verify-wasm.sh .        # el árbol de trabajo
#
# Sale con 0 si todo coincide, con 1 si algún hash difiere y con 2 si falta
# una herramienta o no se pudo compilar. No usa la red de Stellar.
#
# Por qué hace falta stellar-cli (y no basta `cargo build`):
#   - soroban-sdk 28 se niega a compilar a WASM fuera de `stellar contract build`;
#   - el CLI escribe su versión en el WASM (meta `cliver`), filtra la spec y
#     optimiza con wasm-opt. Por eso el CLI tiene que ser 30.0.1.
# La versión de rustc también queda en el WASM (meta `rsver`); la fija
# rust-toolchain.toml (rustup la instala sola).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # .../contracts
DEPLOYED="$ROOT/DEPLOYED.md"
# Código de los WASM v2 de DEPLOYED.md.
DESPLEGADO="f0a2701bab2b53850a81cdc4e7b70f31137f2518"
REF="${1:-$DESPLEGADO}"
CLI_ESPERADO="30.0.1"
RUST_ESPERADO="$(sed -n 's/^channel *= *"\([^"]*\)".*/\1/p' "$ROOT/rust-toolchain.toml")"

falla() { echo "ERROR: $*" >&2; exit 2; }

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  else shasum -a 256 "$1" | awk '{print $1}'; fi
}

# esperado "<comienzo de la primera columna>": hash de esa fila de DEPLOYED.md.
esperado() {
  local h
  h="$(awk -F'|' -v k="$1" '{
      c = $2; sub(/^[ \t]+/, "", c); sub(/[ \t]+$/, "", c)
      if (index(c, k) == 1) { v = $3; gsub(/[ \t`]/, "", v); print v; exit }
    }' "$DEPLOYED")"
  [[ "$h" =~ ^[0-9a-f]{64}$ ]] || falla "no encontré la fila \"$1\" con un sha256 en $DEPLOYED"
  echo "$h"
}

command -v stellar >/dev/null 2>&1 || falla "falta stellar-cli $CLI_ESPERADO (cargo install --locked stellar-cli@$CLI_ESPERADO)"
command -v cargo >/dev/null 2>&1 || falla "falta Rust (instala rustup; rust-toolchain.toml elige $RUST_ESPERADO)"
[ -f "$DEPLOYED" ] || falla "no existe $DEPLOYED"

ESP_GUARDIAN="$(esperado 'WASM pp_guardian v2 (sha256)')"
ESP_ARBITER="$(esperado 'WASM pp_arbiter v2 (sha256)')"
ESP_ESCROW="$(esperado 'WASM escrow Trustless Work')"

CLI_VER="$(stellar --version | head -1 | awk '{print $2}')"
RUST_VER="$(cd "$ROOT" && rustc --version | awk '{print $2}')"
echo "rustc $RUST_VER (fijado: $RUST_ESPERADO) · stellar-cli $CLI_VER (fijado: $CLI_ESPERADO)"
AVISO=0
if [ "$RUST_VER" != "$RUST_ESPERADO" ]; then
  echo "ADVERTENCIA: rustc no es $RUST_ESPERADO; el hash va a cambiar. ¿Usas rustup?" >&2; AVISO=1
fi
if [ "$CLI_VER" != "$CLI_ESPERADO" ]; then
  echo "ADVERTENCIA: stellar-cli no es $CLI_ESPERADO; el hash va a cambiar." >&2; AVISO=1
fi

SALIDA="$(mktemp -d "${TMPDIR:-/tmp}/verify-wasm.XXXXXX")"
trap 'rm -rf "$SALIDA"' EXIT

if [ "$REF" = "." ]; then
  CODIGO="$ROOT"
  echo "Código: el árbol de trabajo ($ROOT)"
else
  git -C "$ROOT" rev-parse --verify --quiet "$REF^{commit}" >/dev/null \
    || falla "no encuentro el commit $REF (¿clon superficial? git fetch --unshallow)"
  mkdir -p "$SALIDA/codigo"
  git -C "$ROOT/.." archive "$REF" contracts | tar -x -C "$SALIDA/codigo" \
    || falla "no pude extraer contracts/ del commit $REF"
  CODIGO="$SALIDA/codigo/contracts"
  echo "Código: commit $(git -C "$ROOT" rev-parse --short "$REF^{commit}") (extraído con git archive)"
fi

echo "Compilando pp_guardian y pp_arbiter (stellar contract build --locked)…"
for c in pp_guardian pp_arbiter; do
  # RUSTFLAGS del entorno pisaría los flags del CLI y cambiaría el WASM.
  if ! (cd "$CODIGO" && env -u RUSTFLAGS -u CARGO_ENCODED_RUSTFLAGS \
        stellar contract build --locked --package "$c" --out-dir "$SALIDA") \
        >"$SALIDA/build-$c.log" 2>&1; then
    cat "$SALIDA/build-$c.log" >&2
    falla "no se pudo compilar $c"
  fi
  [ -f "$SALIDA/$c.wasm" ] || falla "el build no dejó $c.wasm"
done

DIFERENTES=0
# comparar <nombre> <archivo> <hash esperado>
comparar() {
  local obtenido
  obtenido="$(sha256 "$2")"
  if [ "$obtenido" = "$3" ]; then
    printf '%-10s %-13s %s\n' "OK" "$1" "$obtenido"
  else
    printf '%-10s %-13s obtenido %s\n' "DIFERENTE" "$1" "$obtenido"
    printf '%-10s %-13s esperado %s\n' "" "" "$3"
    DIFERENTES=$((DIFERENTES + 1))
    case "$1" in pp_*)
      stellar contract info meta --wasm "$2" 2>/dev/null | grep -E 'rsver|cliver' \
        | sed 's/^[^a-z]*/           compilado con /' || true ;;
    esac
  fi
}

echo
comparar pp_guardian "$SALIDA/pp_guardian.wasm" "$ESP_GUARDIAN"
comparar pp_arbiter  "$SALIDA/pp_arbiter.wasm"  "$ESP_ARBITER"
comparar escrow-tw   "$ROOT/wasm/escrow.wasm"   "$ESP_ESCROW"
echo

if [ "$DIFERENTES" -eq 0 ]; then
  echo "Todo coincide: los WASM desplegados (DEPLOYED.md) salen de ese código."
  exit 0
fi
echo "Hay $DIFERENTES hash(es) diferente(s)." >&2
[ "$AVISO" -eq 1 ] && echo "Primero usa rustc $RUST_ESPERADO y stellar-cli $CLI_ESPERADO." >&2
exit 1
