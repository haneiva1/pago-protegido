#!/usr/bin/env bash
# Rehace en TESTNET, con un solo comando, todo lo que cita la evidencia si la SDF reinicia testnet (el último reinicio
# fue el 17-dic-2025): cuentas, LABUSD, el WASM de Trustless Work, pp_guardian y pp_arbiter v2 y el flujo v2 completo.
# Encadena los scripts que ya existen; no cambia nada de los contratos. SOLO TESTNET.
#
# Identidades del Stellar CLI que necesita (`stellar keys ls`):
#   lab         emisor de LABUSD, la moneda de prueba. Su dirección define el contrato de LABUSD (LABUSD_SAC en lib.sh)
#               y lo que tiene la app: tiene que ser LA MISMA del equipo.
#   arbitro     admin de pp_guardian y pp_arbiter; firma los repartos del revisor. La misma que usa la app.
#   plataforma  rol `platform` de cada escrow (cobra el 2 %); la app la usa para desplegar escrows y pagar el fee bump.
#               La misma del equipo (su dirección está en DEPLOYED.md).
#   twfee       recibe la comisión de Trustless Work (0,3 %). La misma del equipo (TWFEE_ADDRESS en deploy/app.env).
#   comprador, vendedor
#               cuentas de prueba del flujo v2 (scripts/flujo-v2-testnet.sh).
#   ppdemo, tercero
#               deployer y cuenta ajena del escenario (d): si no existen, se crean solas.
# Si alguna del equipo se genera de nuevo, cambian LABUSD_SAC, TWFEE_ADDRESS y el .env de la app: no lo hagas sin
# actualizar todo eso.
#
# Pasos (con --si):
#   1. friendbot para las cuentas que no existan (después de un reinicio no existe ninguna);
#   2. el contrato de LABUSD (SAC) y las trustlines a LABUSD;
#   3. el WASM del escrow de Trustless Work (contracts/wasm/escrow.wasm, el mismo ESCROW_WASM_HASH);
#   4. pp_guardian y pp_arbiter v2 (scripts/deploy-testnet.sh con FORCE=1: los IDs cambian);
#   5. el flujo v2 completo (scripts/flujo-v2-testnet.sh), que deja la evidencia en scripts/out/flujo-v2/;
#   6. DEPLOYED.md y los bindings (scripts/gen-deployed.sh y scripts/bindings.sh).
# Al final muestra lo que queda a mano: los IDs nuevos en la app, la tabla del README y archivar la evidencia nueva.
#
# Uso: bash contracts/scripts/redesplegar-testnet.sh        revisa las identidades y muestra el plan (no envía nada)
#      bash contracts/scripts/redesplegar-testnet.sh --si   lo hace (≈ 15 min: el flujo v2 espera plazos reales)
OUT_SUBDIR=redespliegue source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
HORIZON="https://horizon-testnet.stellar.org"
REPO="$(cd "$ROOT/.." && pwd)"
EQUIPO="lab arbitro plataforma twfee comprador vendedor"
SOLAS="ppdemo tercero"
CON_TRUSTLINE="comprador vendedor plataforma twfee tercero"

existe() { [ "$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$HORIZON/accounts/$1")" = 200 ]; }
con_trustline() {
  curl -s -m 20 "$HORIZON/accounts/$1" | jq -e --arg i "$2" '.balances[]? | select(.asset_code == "LABUSD" and .asset_issuer == $i)' >/dev/null
}

# 0. Revisar que las identidades del equipo estén y sean las de siempre.
falta=0
for k in $EQUIPO; do
  stellar keys address "$k" >/dev/null 2>&1 || { echo "Falta la identidad '$k' (stellar keys add $k --secret-key)." >&2; falta=1; }
done
[ "$falta" = 0 ] || exit 1
LAB=$(addr lab)
SAC=$(stellar contract id asset --asset "LABUSD:$LAB") || exit 1
[ "$SAC" = "$LABUSD_SAC" ] || { echo "'lab' no es la del equipo: su LABUSD sería $SAC y no $LABUSD_SAC (lib.sh)." >&2; exit 1; }
TW_ESPERADA=$(grep -E '^TWFEE_ADDRESS=' "$REPO/deploy/app.env.example" | cut -d= -f2)
[ "$(addr twfee)" = "$TW_ESPERADA" ] || { echo "'twfee' no es la del equipo: se esperaba $TW_ESPERADA (deploy/app.env.example)." >&2; exit 1; }
PF_ESPERADA=$(grep -E '^\| `platform` de cada escrow' "$ROOT/DEPLOYED.md" | grep -oE 'G[A-Z2-7]{55}' | head -1)
[ -z "$PF_ESPERADA" ] || [ "$(addr plataforma)" = "$PF_ESPERADA" ] || {
  echo "'plataforma' no es la del equipo: se esperaba $PF_ESPERADA (DEPLOYED.md)." >&2; exit 1
}

echo "Identidades: OK (lab $LAB, LABUSD $LABUSD_SAC)."
echo "Cuentas en testnet ahora:"
for k in $EQUIPO $SOLAS; do
  a=$(stellar keys address "$k" 2>/dev/null || true)
  if [ -z "$a" ]; then echo "  $k: se crea"; elif existe "$a"; then echo "  $k: existe"; else echo "  $k: no existe (friendbot)"; fi
done
if [ "${1:-}" != "--si" ]; then
  echo
  echo "No se envió nada. Para rehacer todo en testnet: bash contracts/scripts/redesplegar-testnet.sh --si"
  exit 0
fi

paso() { echo; echo "== $*"; }

paso "1. Cuentas (friendbot)"
for k in $EQUIPO $SOLAS; do
  stellar keys address "$k" >/dev/null 2>&1 || stellar keys generate "$k" >&2 || exit 1
  a=$(addr "$k")
  existe "$a" || stellar keys fund "$k" >&2 || exit 1
  echo "  $k $a"
done

paso "2. LABUSD (SAC) y trustlines"
if ! stellar contract invoke --id "$LABUSD_SAC" --source ppdemo --send=no -- decimals >/dev/null 2>&1; then
  stellar contract asset deploy --asset "LABUSD:$LAB" --source lab >&2 || exit 1
fi
for k in $CON_TRUSTLINE; do
  a=$(addr "$k")
  con_trustline "$a" "$LAB" || stellar tx new change-trust --source "$k" --line "LABUSD:$LAB" >&2 || exit 1
  echo "  $k: trustline a LABUSD"
done

paso "3. WASM del escrow de Trustless Work"
H=$(stellar contract upload --wasm "$ROOT/wasm/escrow.wasm" --source ppdemo) || exit 1
[ "$H" = "$ESCROW_WASM_HASH" ] || { echo "El WASM subido tiene hash $H y no $ESCROW_WASM_HASH." >&2; exit 1; }
echo "  $H"

paso "4. pp_guardian y pp_arbiter v2"
FORCE=1 bash "$SCRIPTS/deploy-testnet.sh" || exit 1

paso "5. Flujo v2 completo"
bash "$SCRIPTS/flujo-v2-testnet.sh" || exit 1

paso "6. DEPLOYED.md y bindings"
bash "$SCRIPTS/gen-deployed.sh" || exit 1
bash "$SCRIPTS/bindings.sh" || exit 1

source "$DEPLOY_ENV"
cat <<EOF

Listo. Contratos nuevos: GUARDIAN_ID=$GUARDIAN_ID  ARBITER_ID=$ARBITER_ID
Queda a mano:
  1. La app: DEPLOYED en app/src/lib/server/config.ts y PP_GUARDIAN_ID / PP_ARBITER_ID en deploy/app.env (y .example).
  2. La app guarda la fábrica de escrows en su base (kv "factory:$ESCROW_WASM_HASH"): esa fábrica ya no existe, así
     que hay que borrar esa entrada o empezar con una base nueva.
  3. La tabla de evidencia del README, con los hashes nuevos (contracts/scripts/out/flujo-v2/).
  4. bash contracts/scripts/archivar-evidencia.sh, para archivar la evidencia nueva.
EOF
