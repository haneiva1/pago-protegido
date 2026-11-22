# App web de Pago Protegido (Next.js, salida standalone). SOLO TESTNET.
# Contexto de build: pago-protegido/   →   docker build -f deploy/app.Dockerfile .
# Las variables NEXT_PUBLIC_* se fijan en el build (ARG); los secretos se pasan
# solo en runtime (app.env), nunca en la imagen.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
# Herramientas por si better-sqlite3 no encuentra un binario precompilado.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY app/package.json app/package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY app/ ./
# La app no fija `output: "standalone"` en next.config.ts: se activa solo aquí,
# dentro de la imagen, sin tocar el repo.
RUN grep -q 'output:' next.config.ts \
  || sed -i 's/const nextConfig: NextConfig = {/const nextConfig: NextConfig = {\n  output: "standalone",/' next.config.ts
ARG NEXT_PUBLIC_WALLET=local
ARG NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY=
ENV NEXT_PUBLIC_WALLET=$NEXT_PUBLIC_WALLET \
    NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY=$NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    PP_DB_PATH=/data/pp.db
RUN mkdir -p /data && chown node:node /data
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/info').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
