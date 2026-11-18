#!/usr/bin/env bash
# Regenera DEPLOYED.md a partir de deployments/testnet.env, scripts/out/deploy y
# scripts/out/flujo/resumen.md. Uso: bash scripts/gen-deployed.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
source deployments/testnet.env
X=https://stellar.expert/explorer/testnet

{
cat <<EOF
# DEPLOYED: Pago Protegido en testnet

**Solo testnet** (\`Test SDF Network ; September 2015\`, RPC \`https://soroban-testnet.stellar.org\`). Desplegado el 2026-11-18 con \`scripts/deploy-testnet.sh\`. Los datos para máquinas están en \`deployments/testnet.json\` y \`deployments/testnet.env\`.

## Contratos

| Qué | ID / hash |
|---|---|
| **pp_guardian** | [\`$GUARDIAN_ID\`]($X/contract/$GUARDIAN_ID) |
| **pp_arbiter** | [\`$ARBITER_ID\`]($X/contract/$ARBITER_ID) |
| WASM pp_guardian (sha256) | \`$GUARDIAN_WASM_HASH\` |
| WASM pp_arbiter (sha256) | \`$ARBITER_WASM_HASH\` |
| WASM escrow Trustless Work (ya estaba subido; commit f0b706e) | \`$ESCROW_WASM_HASH\` |
| SAC LABUSD (7 decimales) | [\`$LABUSD_SAC\`]($X/contract/$LABUSD_SAC) |

Los hashes de los WASM coinciden con un \`stellar contract build\` del código commiteado en esta rama.

## Configuración on-chain

| Parámetro | Valor |
|---|---|
| admin de pp_guardian y de pp_arbiter (identidad \`arbitro\`) | \`$ADMIN\` |
| \`tw_fee\` (identidad \`twfee\`, recibe el 0,3% de TW) | \`$TW_FEE\` |
| \`platform\` de cada escrow (identidad \`plataforma\`, 2%) | \`$PLATFORM\` |
| ventana del guardián | min **60 s**, max **2 592 000 s** (30 días) |
| \`pp_guardian.config().arbiter\` | \`$ARBITER_ID\` (fijado con \`set_arbiter\`, una sola vez) |
| \`pp_arbiter.config().guardian\` | \`$GUARDIAN_ID\` |

## Transacciones del despliegue

| Paso | Qué | Tx | s | Fee (stroops) |
|---|---|---|---:|---:|
EOF
awk -F'\t' -v x="$X" '{printf "| %s | %s | [`%s…`](%s/tx/%s) | %s | %s |\n", $2, $3, substr($4,1,8), x, $4, $5, $6}' scripts/out/deploy/txlog.tsv
cat <<'EOF'

## Comisiones reales (LABUSD, compra de 150)

Todos los montos salen de los saldos on-chain leídos antes y después de cada escenario, en unidades base exactas. Plataforma 2% y Trustless Work 0,3%. TW descuenta las comisiones del reparto también en una disputa.

| Escenario | Comprador (neto) | Vendedor | Plataforma | Trustless Work | Suma |
|---|---:|---:|---:|---:|---:|
| (a) caso feliz, `confirm` | −150,000 | **+146,550** | +3,000 | +0,450 | 0 |
| (b) disputa 70/30, `resolve(7000)` | −150 + **102,585** = −47,415 | **+43,965** | +3,000 | +0,450 | 0 |
| (c) `auto_release` a los 60 s | −150,000 | **+146,550** | +3,000 | +0,450 | 0 |
| (d) disputa 50/50, `resolve(5000)` | −150 + **73,275** = −76,725 | **+73,275** | +3,000\* | +0,450\* | 0 |

- **(b) en detalle:**
  - el comprador recibe 105 − 0,315 (TW) − 2,10 (plataforma) = 102,585;
  - el vendedor recibe 45 − 0,135 − 0,90 = 43,965;
  - es igual a lo que predice el test `resolve_70_30_montos_exactos`.
- **\* Fondos ajenos al escrow en (d).** Mientras corría (d), las cuentas `plataforma` y `twfee` recibieron además +1,2820511 y +0,1923075 LABUSD. Son exactamente el 2% y el 0,3% de 64,1025641 LABUSD (Bs 750 a 11,70), es decir, otra liberación que ocurrió al mismo tiempo con las mismas cuentas, probablemente la app en paralelo. No viene de este escrow: el escrow de (d) bajó de 150 a 0, y comprador + vendedor recibieron 146,55, lo que deja 3,45 para las comisiones. La tabla de saldos de más abajo muestra los Δ crudos.
- **`tercero` y `arbitro` no recibieron nada en ningún escenario.**

## Costo de red (XLM, fee cobrado)

| Operación | Stroops | XLM |
|---|---:|---:|
| deploy de una instancia del escrow | ~16 250 | 0,0016 |
| `initialize_escrow` | ~137 000 | 0,0137 |
| `pp_guardian.fund` (incluye la renta del `Purchase`, TTL 120 días) | ~725 600 | 0,0726 |
| `change_milestone_status` | ~10 190 | 0,0010 |
| `pp_guardian.confirm` (aprobar + liberar) | 19 210 | 0,0019 |
| `pp_guardian.auto_release` | 18 663 | 0,0019 |
| `pp_guardian.dispute` | ~8 100 | 0,0008 |
| `pp_arbiter.resolve` (2 destinatarios) | ~22 600 | 0,0023 |

Una compra completa por el caso feliz (deploy + init + fund + enviado + confirm) cuesta unas 0,091 XLM.

## Flujo real: `scripts/flujo-testnet.sh` (terminó con código 0)

Evidencia cruda en `scripts/out/flujo/` (`txlog.tsv`, `fallos.tsv`, `saldos.tsv`, `escrow-*.json`, `purchase-*.json`, `quote-b.json`, `arbiter-funciones.json`, `fallo-*.txt`). Log completo en `scripts/out/flujo-run.log`.

EOF
sed -n '/^## Escrows/,$p' scripts/out/flujo/resumen.md | sed 's/^## /### /'
cat <<'EOF'

### Por qué (d) demuestra que no existe la vía

- **Interfaz (d0):** las funciones públicas de pp_arbiter son `resolve(escrow, buyer_bps)`, `quote(escrow, buyer_bps)`, `refund_unshipped(escrow)`, `set_admin(new_admin)`, `config()` y `__constructor(admin, guardian, tw_fee)`. Ninguna recibe un destino ni un mapa de distribuciones. El script lo verifica con `jq` sobre la interfaz on-chain.
- **El escrow solo obedece a su `dispute_resolver`** (d6, `#12`), y ese rol es el contrato pp_arbiter. Un contrato no tiene llave, así que nadie puede firmar en su nombre: ni un tercero (d7) ni el propio admin del árbitro (d8). Solo vale la auth del árbitro cuando es él quien hace la llamada.
- **Por el árbitro hace falta la firma del admin** (d5). Aun con esa firma, el destino sale del `Purchase` registrado y de `roles.receiver`.
- **La plataforma no puede cambiar el receiver** durante la disputa (d9, `#16`) ni con fondos adentro (test `no_existe_via_directa_al_escrow`, `#33`).
- **Cierre legítimo (d10):** 50/50, que solo mueve fondos al comprador y al vendedor (más las comisiones fijas). El saldo de `tercero` quedó igual.
EOF
} > DEPLOYED.md
echo "DEPLOYED.md: $(wc -l < DEPLOYED.md) líneas, $(grep -c 'stellar.expert' DEPLOYED.md) links" >&2
