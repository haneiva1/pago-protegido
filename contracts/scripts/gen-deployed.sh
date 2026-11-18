#!/usr/bin/env bash
# Regenera DEPLOYED.md (v2) a partir de deployments/testnet.env, scripts/out/deploy-v2
# y scripts/out/flujo-v2/resumen.md. El despliegue v1 queda en DEPLOYED-v1.md.
# Uso: bash scripts/gen-deployed.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
source deployments/testnet.env
[ "${VERSION:-}" = v2 ] || { echo "testnet.env no es v2" >&2; exit 1; }
X=https://stellar.expert/explorer/testnet
B=scripts/out/flujo-v2/saldos.tsv
# delta <escenario> <cuenta> → Δ en LABUSD con 7 decimales
delta() { awk -F'\t' -v s="$1" -v c="$2" '$1==s && $3==c {v[$2]=$4} END{printf "%+.7f", (v["despues"]-v["antes"])/1e7}' "$B"; }

{
cat <<EOF
# DEPLOYED: Pago Protegido v2 en testnet

**Solo testnet** (\`Test SDF Network ; September 2015\`). v2 incorpora los hallazgos del red team sobre Trustless Work (TW-1, TW-2, TW-3 y TW-5): ver [DECISIONES.md](DECISIONES.md) §v2 y [docs/SEGURIDAD.md](../docs/SEGURIDAD.md) §4b.

- **Despliegue:** se hizo con \`scripts/deploy-testnet.sh\`. El deployer fue \`ppdemo\`, y el admin es \`arbitro\`.
- **Datos para máquinas:** \`deployments/testnet.json\` y \`deployments/testnet.env\`.
- **v1:** está retirado para compras nuevas. Sus IDs, transacciones y comisiones siguen en [DEPLOYED-v1.md](DEPLOYED-v1.md).

## Contratos v2

| Qué | ID / hash |
|---|---|
| **pp_guardian v2** | [\`$GUARDIAN_ID\`]($X/contract/$GUARDIAN_ID) |
| **pp_arbiter v2** | [\`$ARBITER_ID\`]($X/contract/$ARBITER_ID) |
| WASM pp_guardian v2 (sha256) | \`$GUARDIAN_WASM_HASH\` |
| WASM pp_arbiter v2 (sha256) | \`$ARBITER_WASM_HASH\` |
| WASM escrow Trustless Work (sin cambios, commit f0b706e) | \`$ESCROW_WASM_HASH\` |
| SAC LABUSD (7 decimales) | [\`$LABUSD_SAC\`]($X/contract/$LABUSD_SAC) |
| Ledger del despliegue | $DEPLOY_LEDGER |
| v1 (retirado) | pp_guardian [\`$GUARDIAN_V1_ID\`]($X/contract/$GUARDIAN_V1_ID) · pp_arbiter [\`$ARBITER_V1_ID\`]($X/contract/$ARBITER_V1_ID) |

Los hashes coinciden con un \`stellar contract build\` del código commiteado. **Ninguno de los dos contratos es actualizable**: un cambio de lógica implica IDs nuevos, como de v1 a v2.

## Configuración on-chain

| Parámetro | Valor |
|---|---|
| admin de pp_guardian y de pp_arbiter (\`arbitro\`) | \`$ADMIN\` |
| \`tw_fee\` (\`twfee\`, 0,3% de TW) | \`$TW_FEE\` |
| \`platform\` de cada escrow (\`plataforma\`, 2%) | \`$PLATFORM\` |
| plazo de despacho (\`ship_secs\`) | min **${MIN_SHIP_SECS} s**, max **${MAX_SHIP_SECS} s** (30 días) |
| ventana de revisión (\`inspect_secs\`) | min **${MIN_INSPECT_SECS} s**, max **${MAX_INSPECT_SECS} s** (30 días) |
| \`pp_guardian.config().arbiter\` | \`$ARBITER_ID\` (fijado con \`set_arbiter\`, una sola vez) |

## Transacciones del despliegue v2

| Paso | Qué | Tx | s | Fee (stroops) |
|---|---|---|---:|---:|
EOF
awk -F'\t' -v x="$X" '{printf "| %s | %s | [`%s…`](%s/tx/%s) | %s | %s |\n", $2, $3, substr($4,1,8), x, $4, $5, $6}' scripts/out/deploy-v2/txlog.tsv
cat <<EOF

## Comisiones reales en v2 (compra de 50 LABUSD)

Los Δ salen de los saldos on-chain leídos **justo antes y después de la transacción final** de cada escenario.

| Escenario | Transacción final | Comprador | Vendedor | Plataforma (2%) | Trustless Work (0,3%) |
|---|---|---:|---:|---:|---:|
| (a) feliz | \`confirm\` | $(delta a comprador) | $(delta a vendedor) | $(delta a plataforma) | $(delta a twfee) |
| (b) disputa 70/30 | \`resolve(7000)\` | $(delta b comprador) | $(delta b vendedor) | $(delta b plataforma) | $(delta b twfee) |
| (c) automática a los 60 s del envío | \`auto_release\` | $(delta c comprador) | $(delta c vendedor) | $(delta c plataforma) | $(delta c twfee) |
| (e) automática tras \`extend\` | \`auto_release\` | $(delta e comprador) | $(delta e vendedor) | $(delta e plataforma) | $(delta e twfee) |
| (f) sin envío | \`refund_unshipped\` | $(delta f comprador) | $(delta f vendedor) | $(delta f plataforma) | $(delta f twfee) |
| (d) cierre 50/50 tras los desvíos | \`resolve(5000)\` | $(delta d comprador) | $(delta d vendedor) | $(delta d plataforma) | $(delta d twfee) |

Valores esperados para 50 LABUSD:

| Desenlace | Comprador | Vendedor | Plataforma | TW |
|---|---:|---:|---:|---:|
| Liberación (a, c, e) | — | 48,85 | 1,00 | 0,15 |
| 70/30 (b) | 34,195 | 14,655 | 1,00 | 0,15 |
| Reembolso (f) | 48,85 | — | 1,00 | 0,15 |
| 50/50 (d) | 24,425 | 24,425 | 1,00 | 0,15 |

Si una fila de \`plataforma\` o \`twfee\` no coincide con esto, es porque **la app hizo otra operación en el mismo ledger** con esas cuentas compartidas. El escrow de cada escenario siempre termina en 0 y \`tercero\` nunca recibe nada (ver la tabla cruda más abajo).

## Flujo real v2: \`scripts/flujo-v2-testnet.sh\` (terminó con código 0)

Evidencia cruda en \`scripts/out/flujo-v2/\`: \`txlog.tsv\`, \`fallos.tsv\`, \`saldos.tsv\`, \`tiempos.tsv\`, \`interfaces.txt\`, \`escrow-*.json\`, \`purchase-*.json\` y \`fallo-*.txt\`. Log completo en \`scripts/out/flujo-v2-run.log\`.

EOF
sed -n '/^## Escrows/,$p' scripts/out/flujo-v2/resumen.md | sed 's/^## /### /'
} > DEPLOYED.md
echo "DEPLOYED.md: $(wc -l < DEPLOYED.md) líneas, $(grep -c 'stellar.expert' DEPLOYED.md) links" >&2
