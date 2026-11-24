# Bot de WhatsApp de Trato (webhook de WhatsApp Cloud API). La instancia de la app (testnet o mainnet) sale de
# PP_APP_URL y STELLAR_NETWORK. Ver docs/WHATSAPP.md.
# Contexto de build: pago-protegido/   →   docker build -f deploy/bot.Dockerfile .
# El bot no tiene llaves de billeteras: solo habla con la API de la app.

FROM node:22-bookworm-slim
WORKDIR /bot
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY bot/package.json bot/package-lock.json ./
# tsx (que ejecuta el TypeScript) está en devDependencies: se instala todo.
RUN npm ci --no-audit --no-fund && npm cache clean --force
COPY bot/tsconfig.json ./
COPY bot/src ./src
RUN mkdir -p /data && chown node:node /data
ENV NODE_ENV=production \
    PORT=3040 \
    BOT_STATE_FILE=/data/bot-state.json \
    REPORTS_FILE=/data/reportes.jsonl
USER node
EXPOSE 3040
# Sin VOLUME: Railway lo rechaza. El volumen se monta en /data desde la plataforma (o docker-compose).
# Webhook de Meta en /webhook; /health responde "ok".
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3040)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node_modules/.bin/tsx", "src/main.ts", "--whatsapp"]
