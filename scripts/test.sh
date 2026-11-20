#!/usr/bin/env bash
# Corre en Docker las mismas tres partes que el CI (.github/workflows/ci.yml):
# contratos, bot y app. No hace falta instalar Rust ni Node en la máquina.
#
#   scripts/test.sh                # las tres partes
#   scripts/test.sh bot app        # solo algunas (contratos | bot | app)
#   scripts/test.sh --limpiar      # borra los volúmenes de caché y sale
#
# Versiones: Node sale de .nvmrc y Rust de contracts/rust-toolchain.toml (si
# existe) o de RUST_VERSION; son las mismas que usa el CI.
#
# El árbol del host no se toca: cada parte se copia dentro del contenedor y
# node_modules, target/ y las cachés de cargo, rustup y npm viven en volúmenes
# con nombre. Así no se mezclan binarios nativos de macOS y Linux
# (better-sqlite3) ni quedan .next/ o test_snapshots/ en el repo.
#
# Sale con código distinto de 0 si alguna parte falla.

set -uo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
RUST_VERSION_POR_DEFECTO="1.99.1"

NODE_VERSION="$(tr -d '[:space:]' < "${RAIZ}/.nvmrc")"
TOOLCHAIN="${RAIZ}/contracts/rust-toolchain.toml"
if [ -f "${TOOLCHAIN}" ]; then
  RUST_VERSION="$(sed -n 's/^[[:space:]]*channel[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' "${TOOLCHAIN}")"
else
  RUST_VERSION="${RUST_VERSION:-${RUST_VERSION_POR_DEFECTO}}"
fi
IMG_NODE="node:${NODE_VERSION}-bookworm"
IMG_RUST="rust:${RUST_VERSION}-bookworm"
PREFIJO="trato-test"

if ! command -v docker >/dev/null 2>&1; then
  echo "No encuentro docker en el PATH." >&2
  exit 2
fi

if [ "${1:-}" = "--limpiar" ]; then
  for v in $(docker volume ls -q --filter "name=^${PREFIJO}-"); do
    docker volume rm "$v"
  done
  exit 0
fi

if [ $# -gt 0 ]; then
  PARTES=("$@")
else
  PARTES=(contratos bot app)
fi
for p in "${PARTES[@]}"; do
  case "$p" in
    contratos | bot | app) ;;
    *) echo "Parte desconocida: $p (contratos | bot | app)" >&2; exit 2 ;;
  esac
done

LOGS="$(mktemp -d "${TMPDIR:-/tmp}/trato-test.XXXXXX")"

# Copia la parte y scripts/ci a /work dentro del contenedor (el repo se monta
# de solo lectura en /src) y corre scripts/ci/<parte>.sh.
copiar_y_correr() {
  local dir="$1" parte="$2"
  cat <<EOF
set -e
mkdir -p /work/${dir} /work/scripts
tar -C /src/${dir} --exclude=./node_modules --exclude=./target --exclude='./.next*' \
  --exclude=./test_snapshots --exclude=./test-results --exclude=./playwright-report -cf - . \
  | tar -C /work/${dir} -xf -
if [ "${dir}" = "bot" ]; then
  # El test de palabras prohibidas del bot también lee los textos de app/src.
  mkdir -p /work/app && tar -C /src/app -cf - src | tar -C /work/app -xf -
fi
if [ "${dir}" = "app" ]; then
  # Un test de la app revisa la plantilla de despliegue (deploy/app.env.example).
  mkdir -p /work/deploy && cp /src/deploy/*.example /work/deploy/
fi
tar -C /src/scripts -cf - ci | tar -C /work/scripts -xf -
cp /src/.nvmrc /work/.nvmrc
exec bash /work/scripts/ci/${parte}.sh
EOF
}

correr_parte() {
  local parte="$1"
  case "$parte" in
    contratos)
      docker run --rm --init \
        -v "${RAIZ}:/src:ro" \
        -v "${PREFIJO}-cargo-registry:/usr/local/cargo/registry" \
        -v "${PREFIJO}-cargo-git:/usr/local/cargo/git" \
        -v "${PREFIJO}-rustup-${RUST_VERSION}:/usr/local/rustup" \
        -v "${PREFIJO}-cargo-target-${RUST_VERSION}:/cargo-target" \
        -e CARGO_TARGET_DIR=/cargo-target \
        -e CARGO_TERM_COLOR=always \
        "${IMG_RUST}" bash -c "$(copiar_y_correr contracts contratos)"
      ;;
    bot | app)
      docker run --rm --init \
        -v "${RAIZ}:/src:ro" \
        -v "${PREFIJO}-npm-cache:/root/.npm" \
        -v "${PREFIJO}-${parte}-node_modules-${NODE_VERSION}:/work/${parte}/node_modules" \
        -e CI=1 \
        "${IMG_NODE}" bash -c "$(copiar_y_correr "${parte}" "${parte}")"
      ;;
  esac
}

# Cuenta tests pasados y fallados en el log de una parte. Formatos:
#   cargo:      "test result: ok. 12 passed; 0 failed; ..."
#   vitest:     "Tests  3 failed | 40 passed (43)"
#   node --test "ℹ pass 33" / "ℹ fail 0" (o "# pass" con el reporter TAP)
contar() {
  local log="$1"
  sed 's/\x1b\[[0-9;]*m//g' "$log" | awk '
    /test result: / {
      for (i = 1; i <= NF; i++) {
        if ($(i) ~ /^passed;?$/) pass += $(i - 1)
        if ($(i) ~ /^failed;?$/) fail += $(i - 1)
      }
    }
    /^[[:space:]]*Tests[[:space:]]+[0-9]/ {
      for (i = 1; i <= NF; i++) {
        if ($(i) == "passed") pass += $(i - 1)
        if ($(i) == "failed") fail += $(i - 1)
      }
    }
    /^(ℹ|#) pass [0-9]+$/ { pass += $3 }
    /^(ℹ|#) fail [0-9]+$/ { fail += $3 }
    END { printf "%d %d", pass, fail }
  '
}

echo "Node ${NODE_VERSION} (${IMG_NODE}) · Rust ${RUST_VERSION} (${IMG_RUST})"
echo "Logs en ${LOGS}"

declare -a RESUMEN=()
FALLO=0
for parte in "${PARTES[@]}"; do
  echo
  echo "################ ${parte} ################"
  inicio=$(date +%s)
  correr_parte "${parte}" 2>&1 | tee "${LOGS}/${parte}.log"
  rc=${PIPESTATUS[0]}
  dur=$(($(date +%s) - inicio))
  read -r pasados fallados < <(contar "${LOGS}/${parte}.log")
  if [ "${rc}" -eq 0 ]; then
    estado="OK"
  else
    estado="FALLÓ (código ${rc})"
    FALLO=1
  fi
  RESUMEN+=("$(printf '%-10s %-18s %5s pasaron  %3s fallaron  %4ss' \
    "${parte}" "${estado}" "${pasados}" "${fallados}" "${dur}")")
done

echo
echo "================ Resumen ================"
printf '%s\n' "${RESUMEN[@]}"
echo "Logs completos en ${LOGS}"
if [ "${FALLO}" -ne 0 ]; then
  echo "Resultado: FALLÓ"
  exit 1
fi
echo "Resultado: OK"
