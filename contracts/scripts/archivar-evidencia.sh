#!/usr/bin/env bash
# Archiva la evidencia de testnet en el repo. SOLO TESTNET, solo lecturas (no firma ni envía nada).
#
# La SDF reinicia testnet cada tanto (el último reinicio fue el 17-dic-2025) y con eso se borran las transacciones
# que citan la tabla de evidencia del README y contracts/DEPLOYED.md. Este script baja el JSON de cada una y lo guarda
# en contracts/evidencia/<hash>.json, más un índice en contracts/evidencia/INDICE.md.
#
# Cada <hash>.json trae:
#   - horizon.transaccion: GET /transactions/<hash> de Horizon (sobre firmado, resultado, ledger, fecha, comisión);
#   - horizon.operaciones: GET /transactions/<hash>/operations (función invocada, parámetros, movimientos de saldo);
#   - rpc: getTransaction del RPC de Soroban (resultMetaXdr con los eventos del contrato), o null si el RPC ya no
#     la tiene (guarda unos 7 días).
#
# Uso:   bash contracts/scripts/archivar-evidencia.sh          (solo baja las que faltan)
#        FORCE=1 bash contracts/scripts/archivar-evidencia.sh  (vuelve a bajar todas)
# Necesita curl, jq y perl. Si una transacción ya no está en la red (p. ej. después de un reinicio), avisa y conserva
# el archivo que ya existía.
set -euo pipefail

SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS="$(cd "$SCRIPTS/.." && pwd)"
REPO="$(cd "$CONTRACTS/.." && pwd)"
DEST="$CONTRACTS/evidencia"
HORIZON="https://horizon-testnet.stellar.org"
RPC="https://soroban-testnet.stellar.org"
FUENTES=(README.md contracts/DEPLOYED.md)
mkdir -p "$DEST"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 1. Citas: hash, archivo:línea y qué es, de cada link a una transacción (stellar.expert/explorer/testnet/tx/<hash>).
#    "Qué es": el texto antes del link en la misma celda (README: "fund", "envío"…) y la primera celda de la fila; si
#    la celda solo tiene el link (DEPLOYED.md), las celdas anteriores ("D1 · upload WASM pp_guardian v2").
for f in "${FUENTES[@]}"; do
  perl -ne '
    BEGIN { $f = shift @ARGV }
    next unless m{/tx/[0-9a-f]{64}};
    chomp; my @c = split /\|/; shift @c if @c && $c[0] =~ /^\s*$/;
    sub limpio { my $t = shift; $t =~ s/\[([^\]]*)\]\([^)]*\)/$1/g; $t =~ s/[`*]//g; $t =~ s/\s+/ /g; $t =~ s/^\s+|\s+$//g; return $t }
    for my $i (0 .. $#c) {
      while ($c[$i] =~ m{\[`[^`]*`\]\(https://stellar\.expert/explorer/testnet/tx/([0-9a-f]{64})\)}g) {
        my $h = $1; my $antes = substr($c[$i], 0, $-[0]); $antes =~ s/.*·//s; $antes = limpio($antes);
        my $que = $antes ne "" ? limpio($c[0]) . " · $antes" : join(" · ", grep { $_ ne "" } map { limpio($_) } @c[0 .. $i - 1]);
        $que = substr($que, 0, 117) . "…" if length($que) > 118;
        print "$h\t$f:$.\t$que\n";
      }
    }
  ' "$f" <"$REPO/$f"
done >"$TMP/citas.tsv"
cut -f1 "$TMP/citas.tsv" | sort -u >"$TMP/hashes.txt"
echo "$(wc -l <"$TMP/hashes.txt" | tr -d ' ') transacciones citadas en ${FUENTES[*]}" >&2

# 2. Bajar cada una (Horizon y RPC). Reintenta errores de red; 404 en Horizon = ya no está en testnet.
get() { curl -sS --retry 4 --retry-all-errors --max-time 60 "$@"; }
nuevas=0; faltan=0
while read -r h; do
  out="$DEST/$h.json"
  if [ -s "$out" ] && [ "${FORCE:-0}" != 1 ]; then continue; fi
  code=$(get -o "$TMP/tx.json" -w '%{http_code}' "$HORIZON/transactions/$h")
  if [ "$code" != 200 ]; then
    echo "  ✗ $h: Horizon respondió $code$([ -s "$out" ] && echo ', se conserva el archivo anterior')" >&2
    faltan=$((faltan + 1)); continue
  fi
  get -o "$TMP/ops.json" "$HORIZON/transactions/$h/operations?limit=200"
  get -o "$TMP/rpc.json" -X POST "$RPC" -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getTransaction\",\"params\":{\"hash\":\"$h\"}}"
  jq -n --arg h "$h" --slurpfile tx "$TMP/tx.json" --slurpfile ops "$TMP/ops.json" --slurpfile rpc "$TMP/rpc.json" '{
      hash: $h,
      red: "testnet",
      horizon: {
        transaccion: ($tx[0] | del(._links)),
        operaciones: [$ops[0]._embedded.records[] | del(._links)]
      },
      rpc: (if $rpc[0].result.status == "SUCCESS" or $rpc[0].result.status == "FAILED"
            then ($rpc[0].result | del(.latestLedger, .latestLedgerCloseTime, .oldestLedger, .oldestLedgerCloseTime))
            else null end)
    }' >"$out.tmp"
  [ "$(jq -r .horizon.transaccion.hash "$out.tmp")" = "$h" ] || { echo "  ✗ $h: la respuesta no es esa transacción" >&2; rm -f "$out.tmp"; exit 1; }
  mv "$out.tmp" "$out"
  nuevas=$((nuevas + 1))
  echo "  ✓ $h" >&2
done <"$TMP/hashes.txt"

# 3. Índice, armado con los archivos que hay (sirve también después de un reinicio de testnet).
{
  echo "# Evidencia de testnet archivada"
  echo
  echo "Copia de cada transacción que citan la [tabla de evidencia del README](../../README.md) y [\`contracts/DEPLOYED.md\`](../DEPLOYED.md). La SDF reinicia testnet cada tanto (el último reinicio fue el 17-dic-2025): si pasa, los links a stellar.expert dejan de funcionar, pero estos archivos quedan."
  echo
  echo "- **Qué trae cada \`<hash>.json\`:** la transacción y sus operaciones según Horizon (\`horizon\`) y, si el RPC de Soroban todavía la tenía al archivarla, su \`getTransaction\` con la meta y los eventos de los contratos (\`rpc\`)."
  echo "- **Cómo comprobar un archivo sin la red:** el hash de una transacción es el SHA-256 de su sobre firmado, así que \`jq -r .horizon.transaccion.envelope_xdr <hash>.json | stellar tx hash --network testnet\` tiene que dar el nombre del archivo."
  echo "- **Cómo regenerarlo:** \`bash contracts/scripts/archivar-evidencia.sh\` baja las que falten y rehace este índice. Para rehacer todo en un testnet nuevo: \`contracts/scripts/redesplegar-testnet.sh\`."
  echo
  echo "| Transacción | Dónde se cita | Qué es | Ledger | Fecha (UTC) | Resultado |"
  echo "|---|---|---|---:|---|---|"
  while read -r h; do
    f="$DEST/$h.json"
    donde=$(awk -F'\t' -v h="$h" '$1 == h { print "`" $2 "`" }' "$TMP/citas.tsv" | paste -sd ',' - | sed 's/,/, /g')
    que=$(awk -F'\t' -v h="$h" '$1 == h { print $3; exit }' "$TMP/citas.tsv")
    if [ -s "$f" ]; then
      jq -r --arg donde "$donde" --arg que "$que" '
        .horizon.transaccion as $t
        | "| [`\(.hash[0:8])…`](\(.hash).json) | \($donde) | \($que) | \($t.ledger) | \($t.created_at | sub("Z$"; "") | sub("T"; " ")) | \(if $t.successful then "éxito" else "falló" end) |"' "$f"
    else
      echo "| \`${h:0:8}…\` | $donde | $que | — | — | **no archivada** |"
    fi
  done <"$TMP/hashes.txt"
} >"$DEST/INDICE.md"

echo "Listo: $nuevas nuevas, $faltan sin bajar; índice en contracts/evidencia/INDICE.md" >&2
[ "$faltan" = 0 ]
