# Pago Protegido: bot de WhatsApp

Con este bot, el vendedor crea links de pago desde el chat y recibe un aviso en cada paso del pedido. Habla con la app web ([`../app`](../app)) por su API y **nunca tiene llaves de billeteras**.

```
Vendedor: vendo zapatillas nike 40 a 450 bs entrega 3 días
Bot:      ¡Listo! ✅ Tu link de pago protegido:
          *Zapatillas nike 40* · Bs 450,00 (≈ 38,46 USD de prueba) · entrega en 3 días
          👉 https://…/p/zapatillas-nike-40-a1b2c3
…
Bot:      💸 a1b2c3: tu cliente pagó Bs 450,00 por *Zapatillas nike 40* y el pago está GUARDADO, todavía no en tu cuenta.
          Despacha y marca enviado: escríbeme *enviado a1b2c3 <código de encomienda>*
Comprador: https://pago-protegido.co/p/zapatillas-nike-40-a1b2c3
Bot:      ⚠️ Este link NO es de Pago Protegido. No pagues.
```

![Simulador del bot](docs/simulador.png)

- **Qué entiende:** hola/ayuda, vender en texto libre (con preguntas si falta el producto, el precio o los días), mis ventas, `estado <código>`, `enviado <código> <guía>`, saldo y cancelar.
- **Números sin tienda:** les manda el link de registro a la web. Igual pueden verificar y reportar links.
- **Avisos:** al vendedor, cuando le pagan (el pago queda GUARDADO, todavía no en su cuenta), cuando se libera la plata y cuando abren un reclamo. Al comprador (si tenemos su número), el aviso anti-presión al pagar, "¿te llegó?" al enviar, el reclamo y recordatorios 48 h, 24 h y 2 h antes de la liberación automática.

### Anti-fraude

![Verificador de links](docs/verificador.png)

- **Verificador de links:** cualquiera le reenvía un link (o escribe `verificar <link>`).
  - Si el dominio es **exactamente** el de la app (`PP_APP_URL` o `PP_PUBLIC_URL`), la ruta es `/p/<slug>` y el pedido existe: `✅ Auténtico: <tienda>, <producto>, Bs <precio>, pedido <código>. Estado: <estado>`.
  - En cualquier otro caso: `⚠️ Este link NO es de Pago Protegido. No pagues.`, más el motivo: dominio parecido (`pago-protegido.co`, `pagoprotegid0`, letras cirílicas, `pagoprotegido.bo.otro.com`…), acortador (`bit.ly`, `tinyurl`, `cutt.ly`, `acortar.link`…), `usuario@` escondido, slug inválido o pedido que no existe.
- **`reportar <link>`:** guarda el reporte en `data/reportes.jsonl` (una línea JSON por reporte) y agradece.
- **Anti-presión al comprador** (si dejó su WhatsApp), al pagar y otra vez al enviar: "Tu plata está bloqueada en un contrato público. Nadie necesita que confirmes para enviar: ni el vendedor, ni la flota, ni el courier. Si te lo piden, es la señal número 1 de estafa. Puedes verificar cualquier link reenviándolo a este número."
- **Recordatorios del plazo** a las 48 h, 24 h y 2 h de la liberación automática, desde que el pedido se marca enviado. Ofrecen "Tengo un problema" y "Necesito más tiempo" (más "Sí, todo bien"), con el link a la página del pedido. Con `DEMO_MINUTES=1` las horas se cuentan en minutos.
- **Al vendedor:** al registrarse, "Para cobrar no tienes que abrir ningún link: el pago te llega solo. Un mensaje que diga 'entra aquí para cobrar' es falso."; con cada link de pago, "Ojo: el QR de pago nunca está a nombre de una persona."
- **Palabras prohibidas:** un test revisa que ningún mensaje diga cripto, token, stablecoin, wallet, llave, blockchain, garantía, seguro ni custodia, ni "¡Te pagaron!".
- **Marcar enviado** es una firma on-chain del vendedor. Por eso el bot solo le manda el link de la página donde la confirma con su billetera.
- **Decisiones** tomadas fuera del SPEC: [`DECISIONES.md`](DECISIONES.md). **Endpoints** que faltan en la app (con planes B que ya funcionan): [`APP-ENDPOINTS.md`](APP-ENDPOINTS.md).

## Correr el simulador

Necesitas Node 22 o superior.

```bash
cd pago-protegido/bot
npm install
npm run sim:demo        # simulador + app de mentira → http://localhost:3030
```

- Abre http://localhost:3030. Chateas como la "Tienda Demo" (+591 71234567). Prueba con `hola`, `vender zapatillas 450` o `vendo zapatillas nike 40 a 450 bs entrega 3 días`.
- Los botones de la izquierda simulan lo que pasa en la web: "El cliente pagó", "El vendedor firmó el envío", "Adelantar al próximo recordatorio" (48 → 24 → 2 h), "El cliente confirmó", "Abrió un reclamo" y "El árbitro resolvió 70/30". El bot detecta cada cambio y avisa.
- Cambia a **Comprador** para ver el aviso anti-presión, "¿te llegó?" y los recordatorios. El globito verde cuenta los mensajes sin leer.
- **Verificador de links:** reenvía desde el chat activo el último link auténtico, uno con dominio parecido o uno acortado. También puedes escribir `verificar <link>` o `reportar <link>`.
- **Demo en minutos:** `DEMO_MINUTES=1 npm run sim:demo`. Los recordatorios llegan 48, 24 y 2 minutos antes del plazo, y el plazo de la app de mentira es de (días + 3) × 24 minutos.

### Contra la app real (testnet)

```bash
# en otra terminal: cd ../app && npm run dev       (http://localhost:3000)
PP_APP_URL=http://localhost:3000 SIM_SELLER_PHONE=59171234567 npm run sim
```

1. Crea tu tienda en http://localhost:3000/vender con el mismo WhatsApp que `SIM_SELLER_PHONE`.
2. Mientras la app no tenga `GET /api/bot/sellers` (APP-ENDPOINTS.md §1), vincula el número en el simulador con `vincular G…tu clave pública…`. La clave completa está en `/panel`: toca el link "Billetera" y cópiala de la dirección de stellar.expert.
3. Crea un link desde el chat, págalo en la web y el aviso llega al chat (cada 10 s, `POLL_INTERVAL_MS`).

## Tests

```bash
npx playwright install chromium   # solo la primera vez (la app usa la misma versión)
npm test                          # unitarios (Vitest) + e2e del simulador (Playwright)
```

- **Unitarios (156: los 69 de la primera ronda + 87 anti-fraude):**
  - Precios y frases bolivianas: "450bs", "Bs. 450", "Bs 1.200", "450 pesos", "Bs 250.-", "5 mil", tallas que no son precios, dólares.
  - Intenciones y flujos guiados.
  - Mensajes: nunca dicen "cripto" y respetan los límites de WhatsApp.
  - El bot contra la app de mentira por HTTP, con sus planes B.
  - El poller, con los avisos y el recordatorio.
  - El webhook de WhatsApp: verificación, firma, botones y reintentos.
  - Verificador (`test/links.test.ts`): dominios parecidos (guion, cero por o, l por i, tildes, cirílico, punycode, subdominios engañosos, punto final), acortadores, `usuario@`, slugs y rutas inválidos, links dentro de un mensaje reenviado.
  - Anti-fraude contra la app de mentira (`test/antifraude.test.ts`): auténtico/falso, pedido inexistente, app caída, reportes en archivo, botones del recordatorio, avisos al vendedor, anti-presión (también si el comprador deja su WhatsApp tarde), recordatorios 48/24/2 h, hitos antes del envío y modo demo en minutos.
  - Palabras prohibidas en todos los mensajes.
- **e2e (4):**
  - Levanta la app de mentira (3131) y el simulador (3130) como procesos aparte.
  - Escribe "vender zapatillas 450", toca "3 días", recibe el link y verifica que el pedido existe en la API.
  - Simula el pago y espera "¡Te pagaron!".
  - Guarda la captura en `docs/simulador.png`.
  - Verificador: el comprador reenvía el link auténtico y uno con dominio parecido, luego uno acortado y un reporte. Guarda la captura en `docs/verificador.png`.
  - El comprador recibe el aviso anti-presión al pagar.
- `npm run typecheck` revisa los tipos.

## Conectar un número de prueba de WhatsApp Cloud API (15 minutos, para Hans)

La prueba es gratis y no usa ningún número tuyo: Meta te presta un número de prueba que puede escribir hasta a 5 números verificados.

**Antes:** cuenta de Facebook, tu WhatsApp personal a mano y una forma de exponer el puerto 3040 a internet (`cloudflared` o `ngrok`).

1. **Crea la app de Meta (3 min).**
   - Entra a https://developers.facebook.com/apps y toca **Crear app**.
   - Caso de uso: **"Conectar con clientes por WhatsApp"**.
   - Elige o crea un portafolio comercial (business portfolio). Puede ser uno de prueba.
2. **Copia las credenciales de prueba (2 min).** En el menú de la app: **WhatsApp → Configuración de la API** (API Setup).
   - **Token de acceso temporal** → `WA_TOKEN`. Dura 24 h; para más tiempo, mira el paso 9.
   - **Identificador del número de teléfono** (Phone number ID) → `WA_PHONE_NUMBER_ID`. No es el número, es un ID largo.
   - En **"Para"** (To), agrega tu WhatsApp personal y confírmalo con el código que te llega por WhatsApp.
3. **Configura el bot (1 min).**

   ```bash
   cp .env.example .env
   # WA_TOKEN=…               (paso 2)
   # WA_PHONE_NUMBER_ID=…     (paso 2)
   # WA_VERIFY_TOKEN=…        inventa una palabra larga, p. ej. pp-bot-2026-hans
   # PP_APP_URL=http://localhost:3000
   ```

4. **Levanta la app y el bot (2 min).**

   ```bash
   (cd ../app && npm run dev)     # otra terminal
   npm start                      # webhook en http://localhost:3040/webhook
   ```

5. **Expón el webhook (1 min):** `cloudflared tunnel --url http://localhost:3040` (o `ngrok http 3040`). Copia la URL `https://…`.
6. **Registra el webhook en Meta (2 min).** En **WhatsApp → Configuración** (Configuration) → Webhook → **Editar**:
   - URL de devolución de llamada: `https://…tu túnel…/webhook`
   - Token de verificación: el mismo `WA_VERIFY_TOKEN`
   - **Verificar y guardar.** Meta llama `GET /webhook?hub.challenge=…` y el bot responde.
   - En **Campos del webhook**, toca **Administrar** y suscríbete a **`messages`**.
7. **Regístrate como vendedor (2 min).**
   - Abre http://localhost:3000/vender y crea tu tienda con **tu WhatsApp personal** (el del paso 2).
   - Mientras la app no tenga `GET /api/bot/sellers`, mándale al bot `vincular G…tu clave pública…` desde tu WhatsApp. Ver "Contra la app real".
8. **Pruébalo (2 min).** Desde tu WhatsApp, escríbele `hola` al número de prueba y luego `vendo zapatillas nike 40 a 450 bs entrega 3 días`.
   - Para abrir los links desde el celular, la app también tiene que ser accesible: otro túnel al 3000 y `PP_PUBLIC_URL=https://…` en `.env`.
9. **Opcional:**
   - **Firma de Meta:** copia **Configuración de la app → Básica → Clave secreta de la app** en `WA_APP_SECRET` y el bot exigirá `X-Hub-Signature-256`.
   - **Token sin vencimiento:** Configuración del negocio → Usuarios del sistema → Generar token, con permisos `whatsapp_business_messaging` y `whatsapp_business_management`.

Si algo no anda:

| Síntoma | Causa y solución |
|---|---|
| "Verificar y guardar" falla | El túnel no apunta al 3040 o `WA_VERIFY_TOKEN` no coincide. Prueba `curl "https://…/webhook?hub.mode=subscribe&hub.verify_token=TU_TOKEN&hub.challenge=ok"`: tiene que responder `ok`. |
| El bot recibe pero no contesta | Revisa la consola: `Graph API 401` es el token vencido; `131030` es que tu número no está en la lista "Para". |
| No llegan mensajes al bot | Falta suscribirse a `messages` en "Campos del webhook". |
| Los avisos no llegan después de un día | Ventana de 24 h de WhatsApp: escríbele algo al bot. En producción los avisos irán como plantillas aprobadas (DECISIONES 20). |

## Variables de entorno

Se leen de `.env` si existe (ver [`.env.example`](.env.example)). **Nunca commitees tokens.**

| Variable | Por defecto | Para qué |
|---|---|---|
| `PP_APP_URL` | `http://localhost:3000` | API de la app web |
| `PP_PUBLIC_URL` | `PP_APP_URL` | URL de los links que ve la gente (túnel o dominio) |
| `PP_BOT_KEY` | vacío | Clave compartida con la app para `/api/bot/*` (APP-ENDPOINTS.md §0) |
| `WA_TOKEN` | — | Token de la Graph API (`npm start`) |
| `WA_PHONE_NUMBER_ID` | — | ID del número que envía (`npm start`) |
| `WA_VERIFY_TOKEN` | — | Palabra para verificar el webhook (`npm start`) |
| `WA_APP_SECRET` | vacío | Si está, se exige la firma `X-Hub-Signature-256` |
| `WA_GRAPH_VERSION` | `v23.0` | Versión de la Graph API |
| `PORT` | `3040` | Puerto del webhook |
| `SIM_PORT` | `3030` | Puerto del simulador |
| `MOCK_PORT` | `3031` | Puerto de la app de mentira (`sim:demo`, `npm run mock`) |
| `POLL_INTERVAL_MS` | `10000` | Cada cuánto se buscan cambios en los pedidos |
| `REMINDER_HOURS` | `48,24,2` | Horas antes de la liberación automática en que se recuerda al comprador |
| `DEMO_MINUTES` | vacío | `1` = modo demo: las horas de los recordatorios (y el plazo de la app de mentira) se cuentan en minutos |
| `REPORTS_FILE` | `data/reportes.jsonl` | Dónde se guardan los `reportar <link>`; `""` = solo en memoria |
| `BOT_STATE_FILE` | `data/bot-state.json` | Avisos y recordatorios ya enviados, números vinculados y tiendas ya avisadas; `""` = solo en memoria |
| `SIM_SELLER_PHONE` / `SIM_BUYER_PHONE` | `59171234567` / `59176543210` | Números de los dos chats del simulador |

## Arquitectura

```
src/
  engine/              motor de conversación, funciones puras
    parse.ts           precios en Bs, días, venta en texto libre, teléfonos y códigos
    engine.ts          intenciones y step(sesión, texto, ahora) → { sesión, respuestas, comando }
    messages.ts        todos los textos (es-BO) y avisos
    links.ts           verificador: dominio canónico exacto, dominios parecidos, acortadores, slugs
  app/                 cliente de la app (rutas reales + propuestas) y sus tipos
  bot.ts               runtime: vendedor por teléfono → step → ejecuta el comando → respuestas
  notify/poller.ts     avisos por cambio de estado, anti-presión y recordatorios 48/24/2 h
  reports.ts           reportes de links (JSONL local)
  transports/
    whatsapp.ts        webhook (GET verificación, POST mensajes, firma) + envío por Graph API
    simulator.ts       servidor del simulador (SSE) + sim.html (chat estilo WhatsApp)
  mock/app-mock.ts     app de mentira con las mismas formas de la API (tests, e2e, demo)
  main.ts              arranque: --sim, --mock, --whatsapp
```

- **Mismo motor en los dos transportes:** el simulador y el webhook llaman a `bot.handle(teléfono, texto)` y mandan lo que devuelve. Los avisos del poller salen por el transporte activo.
- **No custodia:** el bot solo usa `POST /api/links`, que no va on-chain, y lecturas. Para marcar enviado, manda el link y el vendedor firma en su billetera. El verificador solo lee `GET /api/orders/:slug`, la misma vista pública de la página del pedido.
- **Antes de buscar la tienda:** `bot.handle` pasa primero por `routePublic` (verificar, reportar, botones del comprador, links reenviados), así cualquier número puede usarlos.
