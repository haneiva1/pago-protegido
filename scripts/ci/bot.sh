#!/usr/bin/env bash
# Bot: tipos y tests unitarios (vitest). Los e2e con Playwright quedan fuera.
# shellcheck source=scripts/ci/lib.sh
source "$(dirname "$0")/lib.sh"
cd "${RAIZ}/bot" || exit 1

paso "Versiones" bash -c 'node --version && npm --version'
paso "npm ci" npm ci --no-audit --no-fund
paso "typecheck" npm run typecheck
paso "test:unit" npm run test:unit
