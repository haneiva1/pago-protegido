# Desplegar Pago Protegido (app + bot). SOLO TESTNET

La app web (Next.js + SQLite) y el bot de WhatsApp se despliegan con Docker. Los contratos ya están en testnet ([`../contracts/DEPLOYED.md`](../contracts/DEPLOYED.md)) y no se despliegan aquí.

| Archivo | Para qué |
|---|---|
| `app.Dockerfile` | App Next.js en modo `standalone`, en node:22-bookworm-slim. La base SQLite va en `/data`. |
| `bot.Dockerfile` | Bot (webhook de WhatsApp Cloud API, puerto 3040), con su estado en `/data`. |
| `docker-compose.yml` | Levanta `app`, `caddy` y `bot` (este último con el perfil `bot`), con un volumen por servicio. |
| `Caddyfile` | HTTPS automático (Let's Encrypt) para `APP_DOMAIN` y `BOT_DOMAIN`. |
| `.env.example` | Dominios y variables públicas del build (`NEXT_PUBLIC_*`). |
| `app.env.example` | Secretos y configuración de la app en runtime. |
| `bot.env.example` | Secretos del bot en runtime. |
| `tunel.sh` | URL pública temporal desde una Mac para la demo (cloudflared, sin cuenta). |

- **Contexto de build:** siempre `pago-protegido/`, y cada Dockerfile tiene su propio `.dockerignore` al lado. Las imágenes nunca incluyen `node_modules` locales, `.next`, `data/` ni ningún `.env`.
- **Variables del navegador:** las `NEXT_PUBLIC_*` se fijan **al compilar**. Si cambias `NEXT_PUBLIC_WALLET` o la publishable key de Pollar, recompila.
- **`output: "standalone"`:** la app no lo fija en `next.config.ts`, así que `app.Dockerfile` lo agrega solo dentro de la imagen. Si la app lo agrega en su config, el Dockerfile lo detecta y no hace nada.

## (a) VPS con Docker, unos 10 minutos

Requisitos:
- un VPS con Docker y el plugin compose (Ubuntu 24.04 con 1 vCPU y 1–2 GB de RAM alcanza; el build de Next usa ~1 GB);
- los puertos 80 y 443 abiertos;
- un registro DNS `A` para el dominio de la app (y otro para el del bot, si lo usas) apuntando a la IP del VPS.

```bash
git clone <repo> && cd <repo>/pago-protegido/deploy
cp .env.example .env            # APP_DOMAIN, BOT_DOMAIN, ACME_EMAIL, NEXT_PUBLIC_*
cp app.env.example app.env      # llaves de TESTNET: stellar keys show plataforma|arbitro|lab
cp bot.env.example bot.env      # solo si vas a usar el bot
docker compose up -d --build    # app + Caddy → https://APP_DOMAIN
```

- **Con el bot:** `docker compose --profile bot up -d --build`. Después, en Meta (WhatsApp → Configuración → Webhook), configura:
  - URL de devolución de llamada: `https://BOT_DOMAIN/webhook` (el bot responde `ok` en `/health`);
  - token de verificación: el `WA_VERIFY_TOKEN` de `bot.env`.
- **Pollar:** agrega `https://APP_DOMAIN` como origen permitido y URL de retorno.
- **Verificar:**
  - `docker compose ps`: la app debe quedar `healthy`, por el healthcheck de `GET /api/info`;
  - `curl -I https://APP_DOMAIN`;
  - `docker compose logs -f app`.
- **Actualizar:** `git pull && docker compose up -d --build`. Los volúmenes `app-data` (SQLite), `bot-data` y `caddy-data` (certificados) se conservan.
- **Respaldo de la base:**

  ```bash
  docker compose exec app node -e "require('better-sqlite3')('/data/pp.db').backup('/data/backup.db')"
  docker compose cp app:/data/backup.db .
  ```
- **Probar en local sin dominio:** con `APP_DOMAIN=localhost`, Caddy usa un certificado local y la app queda en https://localhost. Los puertos 80 y 443 tienen que estar libres. La app no publica el 3000 en el host.

## (b) Railway

Se crean dos servicios desde el mismo repo, cada uno con su Dockerfile.

1. **New Project → Deploy from GitHub repo → servicio `app`.**
   - Settings → **Root Directory**: `pago-protegido`.
   - Variables:
     - `RAILWAY_DOCKERFILE_PATH=deploy/app.Dockerfile`;
     - todas las de `app.env.example` con sus valores;
     - `NEXT_PUBLIC_WALLET` y `NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY` (Railway las pasa como build args);
     - `PORT=3000` y `PP_DB_PATH=/data/pp.db`.
   - **Volume**: monta un volumen en `/data`, para SQLite.
   - Settings → **Healthcheck Path**: `/api/info`.
   - Settings → Networking → **Generate Domain**. Agrega ese dominio en Pollar como origen y URL de retorno.
2. **Servicio `bot`** (opcional), con el mismo repo.
   - Root Directory: `pago-protegido`.
   - Variables:
     - `RAILWAY_DOCKERFILE_PATH=deploy/bot.Dockerfile`;
     - las de `bot.env.example`;
     - `PP_APP_URL=http://${{app.RAILWAY_PRIVATE_DOMAIN}}:3000`, por la red privada;
     - `PP_PUBLIC_URL=https://${{app.RAILWAY_PUBLIC_DOMAIN}}`;
     - `BOT_STATE_FILE=/data/bot-state.json` y `PORT=3040`.
   - Volume en `/data`.
   - Healthcheck Path: `/health`.
   - Generate Domain. La URL del webhook en Meta es ese dominio con `/webhook` al final.
3. Deploy. Railway compila los Dockerfiles. El primer build de la app tarda entre 3 y 5 minutos.

> Fly.io funciona igual: `fly launch --dockerfile deploy/app.Dockerfile`, con un volumen en `/data` y las variables con `fly secrets set`.

## Demo desde la Mac, sin servidor

```bash
cd pago-protegido/app && PORT=3020 npm run dev   # el 3000 de la Mac lo ocupa otro contenedor
bash ../deploy/tunel.sh 3020                     # → https://<algo>.trycloudflare.com
```

**Importante:** agrega esa URL en Pollar como **origen permitido** y **URL de retorno**. Cambia en cada corrida del túnel. Detalles en `tunel.sh` y en [`../docs/DEMO.md`](../docs/DEMO.md).

## Seguridad del despliegue

- **Llaves:** solo testnet. El servidor tiene 3 llaves (`plataforma`, `arbitro` y `lab`), y nunca las del comprador ni las del vendedor.
- **Archivos con secretos:** `app.env` y `bot.env` están en `deploy/.gitignore`. En Railway, los secretos van como variables del servicio.
- **Puertos:** la app y el bot solo son accesibles a través de Caddy. Ninguno publica puertos en el host.
- **Antes de mainnet:** ver [`../docs/SEGURIDAD.md`](../docs/SEGURIDAD.md) §5. Incluye un multisig para el admin del árbitro, una auditoría y la gestión de TTL.
