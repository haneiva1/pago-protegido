# shellcheck shell=bash
# Funciones comunes de scripts/ci/*.sh. Se cargan con `source`.
#
# Cada parte (contratos, bot, app) es un script que corre igual en el CI de
# GitHub y dentro de los contenedores de scripts/test.sh: así las dos corren
# exactamente los mismos pasos.

set -euo pipefail

# shellcheck disable=SC2034 # la usan los scripts que cargan este archivo
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# paso "Título" comando args...: corre un paso con título. En GitHub Actions lo
# agrupa en el log; en local imprime un encabezado.
paso() {
  local titulo="$1"
  shift
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    echo "::group::${titulo}"
  else
    printf '\n==> %s\n' "${titulo}"
  fi
  local rc=0
  "$@" || rc=$?
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    echo "::endgroup::"
  fi
  if [ "${rc}" -ne 0 ]; then
    echo "FALLÓ: ${titulo} (código ${rc})" >&2
    return "${rc}"
  fi
}

# tiene_script nombre: 0 si el package.json del directorio actual define ese script.
tiene_script() {
  node -e 'const s = require("./package.json").scripts || {}; process.exit(Object.hasOwn(s, process.argv[1]) ? 0 : 1)' "$1"
}
