#!/usr/bin/env bash
# Túnel temporal para la demo: expone la app que corre en esta Mac con una URL
# pública https://<algo>.trycloudflare.com (cloudflared "quick tunnel", sin
# cuenta ni configuración). La URL cambia en cada corrida y muere al cortar.
#
# Uso:
#   bash deploy/tunel.sh            # app en http://localhost:3020 (el 3000 de esta Mac está ocupado)
#   bash deploy/tunel.sh 3020
#   bash deploy/tunel.sh 3040       # webhook del bot, en otra terminal
#
# Después de obtener la URL:
#   1. Agrégala en el panel de Pollar como ORIGEN PERMITIDO y como URL DE RETORNO
#      (si no, el login con Google/email falla desde esa URL).
#   2. Si usas el bot, ponla en PP_PUBLIC_URL para que los links que manda apunten ahí.
#   3. Comparte los links /p/<slug> con esa URL (por ejemplo, para abrirlos en el celular).
set -euo pipefail
PORT="${1:-${PORT:-3020}}"

command -v cloudflared >/dev/null || { echo "Falta cloudflared: brew install cloudflared" >&2; exit 1; }
if ! curl -fsS -m 5 -o /dev/null "http://localhost:$PORT"; then
  echo "Aviso: no hay nada respondiendo en http://localhost:$PORT." >&2
  echo "       Levanta la app antes: cd pago-protegido/app && PORT=$PORT npm run dev" >&2
fi

LOG="$(mktemp -t pp-tunel)"
cloudflared tunnel --no-autoupdate --url "http://localhost:$PORT" >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; rm -f "$LOG"; echo; echo "Túnel cerrado." >&2' EXIT INT TERM

URL=""
for _ in $(seq 1 60); do
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1 || true)"
  [ -n "$URL" ] && break
  kill -0 $PID 2>/dev/null || { cat "$LOG" >&2; exit 1; }
  sleep 1
done
[ -n "$URL" ] || { echo "No se obtuvo la URL del túnel:" >&2; cat "$LOG" >&2; exit 1; }

cat >&2 <<EOF

  URL pública:  $URL   →   http://localhost:$PORT

  Antes de la demo:
   • Pollar: agrega $URL como origen permitido y URL de retorno.
   • Bot:    PP_PUBLIC_URL=$URL (y, para el webhook, corre otro túnel al 3040).
   • Celular: abre $URL/p/<slug> del link que creaste.

  Ctrl+C para cerrar el túnel.
EOF
wait $PID
