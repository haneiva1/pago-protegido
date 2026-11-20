#!/usr/bin/env bash
# App: tipos, tests con node --test y build de Next.js.
#
# Los scripts de tests (`test`, `test:unit`, `test:api`) se corren solo si
# están definidos en app/package.json: así el CI sirve antes y después de que
# entren las ramas que los agregan. Los e2e necesitan llaves de testnet y
# quedan fuera.
# shellcheck source=scripts/ci/lib.sh
source "$(dirname "$0")/lib.sh"
cd "${RAIZ}/app" || exit 1

export NEXT_TELEMETRY_DISABLED=1

paso "Versiones" bash -c 'node --version && npm --version'
paso "npm ci" npm ci --no-audit --no-fund
paso "tsc --noEmit" npx tsc --noEmit

corridos=0
for s in test test:unit test:api; do
  if tiene_script "$s"; then
    paso "npm run $s" npm run "$s"
    corridos=$((corridos + 1))
  else
    echo "(sin script \"$s\" en app/package.json: se salta)"
  fi
done
[ "${corridos}" -gt 0 ] || echo "(la app todavía no tiene tests unitarios)"

paso "next build" npm run build
