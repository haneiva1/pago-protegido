# Trato: app web (testnet, modo práctica)

Links de pago protegidos para ventas por redes:

1. El vendedor crea un link.
2. El comprador paga y la plata queda en un escrow de Trustless Work en Stellar.
3. El vendedor marca "enviado".
4. El comprador toca "Pagar al vendedor" y se libera la plata, o abre un reclamo y el revisor reparte.

**Solo testnet.** La red está fija en el código. La moneda es LABUSD, que en pantalla se llama "USD de prueba". La rampa de bolivianos está simulada y la pantalla lo dice.

Especificación: [`docs/SPEC.md`](../docs/SPEC.md). Decisiones tomadas fuera del SPEC: [`DECISIONES.md`](DECISIONES.md).

## Producto v2 (segmento: celulares y electrónica entre ciudades por encomienda, Bs 1.000 a 7.000)

- **Pago contra confirmación de entrega.**
  - El comprador deja los datos de entrega y paga.
  - El vendedor registra el envío con evidencia estructurada: empresa, guía, peso, foto, destino y, si es un celular, IMEI.
  - "Pagar al vendedor (irreversible)" se habilita 2 h (misma ciudad) o 24 h (otra ciudad) después del envío, y pregunta antes si el producto está en sus manos. Con `PP_DEMO=1`, 1 minuto.
  - "El vendedor me pide que confirme" abre un reclamo por presión.
- **Quién paga la protección** se elige en cada link: el comprador (1,5%, mín. Bs 5, tope Bs 50; el vendedor recibe el precio completo) o el vendedor ("Yo la regalo": se le descuenta 2,3%, 2% de la plataforma y 0,3% de Trustless Work). Es la misma tarifa de [docs/TECNICO.md](../docs/TECNICO.md#tarifa).
- **Revisor de reclamos** (`/revisor`, antes "árbitro"): motivo obligatorio, reparto sin valor por defecto e historial de evidencia. La política de reclamos está en `/como-funciona#reclamos`.
- **Páginas nuevas:**
  - `/verificar` (con el código PP-#### del pedido);
  - `/piloto` (lista de espera; `npm run piloto:csv` la exporta);
  - `/pedir` (el comprador le pide a la tienda que venda protegido).
- **Textos:** siempre Bs primero y nada de jerga técnica en las pantallas del comprador y del vendedor. El e2e falla si aparece una palabra prohibida (`revisarPalabras` en `e2e/pago-protegido.spec.ts`).
- Todas las decisiones están en [`DECISIONES.md`](DECISIONES.md), puntos 61 a 76.

## Correrla en 3 comandos

Requisitos:

- Node 20 o superior (probado con Node 25).
- Stellar CLI con las identidades de testnet `plataforma`, `arbitro`, `lab` y `twfee` (las mismas que usan los scripts de `../contracts/scripts/`).

```bash
npm install
npm run setup   # crea .env.local con las llaves de TESTNET (stellar keys show plataforma|arbitro|lab)
npm run dev     # http://localhost:3000
```

- `npm run setup` no pisa un `.env.local` que ya exista. Para regenerarlo: `npm run setup -- --force`.
- Si encuentra `.env.pollar` en la raíz del repo (o la ruta en `POLLAR_ENV_FILE`; no se versiona), copia también las variables de Pollar.
- Si el puerto 3000 está ocupado: `PORT=3020 npm run dev`. Pollar tiene registrados `http://localhost:3000` y `http://localhost:3020` como origen y URL de retorno.
- **Modo guardián por defecto** (`PP_MODE=guardian`), con los contratos v2: `pp_guardian` `CDKYF7OA…UOATOT` y `pp_arbiter` `CDTEA424…TEVU5UA` (de `../contracts/deployments/testnet.json`). El modo directo sigue disponible con `PP_MODE=direct`.
- Para producción local: `npm run build && npm start`.

### Demo de 3 minutos (SPEC §7)

1. `/vender`: nombre de la tienda, WhatsApp y "Crear mi billetera". Te lleva a "Tu primer link". Crea "Zapatillas Nike talla 40", Bs 450, 3 días.
2. Abre el link en el celular (o en otra ventana privada): "Pagar protegido" → QR de ejemplo → "Simular pago del banco (testnet)". Cada paso muestra su "Ver en Stellar".
   - Antes de pedir la firma del pago, la app verifica por RPC que el contrato del pedido ejecuta el WASM de Trustless Work (`1b367bc8…`) y tiene los roles `pp_guardian`/`pp_arbiter`. Si todo está bien, muestra el sello **"Contrato verificado"** con link a stellar.expert; si algo no coincide, bloquea el pago.
3. En `/panel`, marca "enviado" con empresa, guía, peso (e IMEI si es un celular): `pp_guardian.mark_shipped` registra el envío una sola vez, antes del plazo de despacho, y desde ahí corre la ventana de revisión.
4. En el link, toca "Pagar al vendedor (irreversible)" y responde la pregunta obligatoria: `pp_guardian.confirm` aprueba y libera en una sola operación. Se ven los montos del vendedor, de la plataforma y de Trustless Work (0,3 %).
5. Con un segundo link, toca "Tengo un problema" y luego entra a `/revisor`. La clave es `ARBITRO_PANEL_KEY`, que está en `.env.local`.
   - El slider muestra la vista previa de `pp_arbiter.quote`. Ponlo en 70 %.
   - "Probar: mandar la plata a otra cuenta" simula `escrow.resolve_dispute` con la cuenta del revisor hacia una tercera cuenta. **El contrato lo rechaza**: `Error(Contract, #12)`.
   - "Resolver" llama `pp_arbiter.resolve`.
6. **Plazos v2:** entra a `/panel?demo=1` y marca "Plazo corto de demo" (despacho y revisión de 2 minutos).
   - Paga y marca enviado: corre la revisión. El comprador puede tocar **"Necesito más tiempo"** una sola vez (`pp_guardian.extend`, `POST /api/orders/:slug/extend`). Al vencer aparece **"Liberar ahora (plazo vencido)"**, que llama a `pp_guardian.auto_release` sin firmas; si hay un reclamo, no se intenta.
   - Paga y **no** marques enviado: al vencer el despacho, la app abre la disputa como plataforma y `pp_arbiter.refund_unshipped` devuelve el pago al comprador (estado "Devuelto (no se despachó)").
   - Sin navegador: `BASE_URL=http://localhost:3000 npm run smoke -- extend` y `npm run smoke -- devolucion`.

## Demo para la presentación: `npm run demo`

```bash
npm run demo
```

Levanta todo listo para presentar (Ctrl+C apaga todo):

- **App web en http://localhost:3020** con la billetera de `.env.local` (Pollar, si `npm run setup` encontró sus llaves). Pollar acepta ese origen.
- **Simulador del bot de WhatsApp en http://localhost:3030**, conectado a esa app con la clave compartida `PP_BOT_KEY`. Avisa cada 3 s.
- Al arrancar imprime los links (vendedor, revisor con su clave, `/panel?demo=1`) y los números del simulador.

Recorrido sugerido:

1. Crea la tienda en `http://localhost:3020/vender?wa=59171234567` (el número del vendedor del simulador; llega precargado).
2. En el simulador escribe *vendo celular Samsung A54 a 1800 bs entrega 3 días*. El bot crea el link en la app real (con código PP-#### y categoría Celular).
3. Abre el link, deja el WhatsApp del comprador (opcional) y paga. En el chat llega el aviso de pago con la fecha límite de despacho.
4. Escribe *enviado <código> <guía>*. El bot responde con el link `/panel?enviar=…&evidencia=…`, que abre el pedido con la guía precargada; el vendedor firma.
5. En la pestaña **Comprador** del simulador llega "¿Te llegó?". Toca "Pagar al vendedor" en la app y en el chat del vendedor llega **"¡Liberado!"** con el monto.

Variables opcionales: `DEMO_APP_PORT`, `DEMO_SIM_PORT`, `DEMO_SELLER_PHONE` y `DEMO_BUYER_PHONE`.

### Antes de presentar: `npm run demo:reset`

```bash
npm run demo:reset   # con la demo apagada
```

Deja la base local de la demo (`data/pp.db`) limpia y con tres pedidos históricos reales de testnet, sobre los contratos v2:

- **"Tienda Sofi"** (+591 71234567): "Polera Adidas talla M" liberado por confirmación, "Audífonos Sony WH-1000" resuelto 70/30 por `pp_arbiter` y "Celular Samsung Galaxy A35" (Bs 2.500) devuelto porque no se despachó a tiempo (`refund_unshipped`).
- Borra pedidos, tiendas, transacciones y evidencias locales (por ejemplo, las disputas repetidas de pruebas) y el estado del bot de la demo (`../bot/data/bot-state.json`).
- Verifica que la app esté en modo guardián v2 antes de sembrar.
- Conserva la fábrica del escrow y los eventos on-chain ya ingeridos. Lo on-chain no se puede borrar y `/transparencia` lo sigue mostrando.
- Levanta la app un momento en el 3098, siembra con cuentas locales de un solo uso (unos 3 minutos en testnet) y la apaga.
- Si `npm run demo` está corriendo, se niega a borrar.

### Video de la demo: `npm run demo:video`

```bash
npm run demo:video        # graba (~4 min en testnet) y arma pago-protegido/demo/v2/pago-protegido-demo-v2.mp4 + 6 capturas clave
npm run demo:video:join   # solo vuelve a armar el mp4 con los clips ya grabados
```

El video final dura **≈ 1:52** (1280x720):

- placa inicial de 3 s: "Pago Protegido · Pagos protegidos para ventas por redes · sobre Stellar" (el video v2 se grabó con el nombre anterior; al regrabarlo hay que cambiar la placa en `scripts/video-join.mjs`);
- el recorrido con subtítulos;
- placa final de 4 s: "Contratos en Stellar testnet · pp_guardian · pp_arbiter · Trustless Work · Pollar".

`scripts/video-join.mjs` acorta las esperas a testnet:

- Detecta con `freezedetect` de ffmpeg los tramos en que la pantalla no cambia.
- Si un tramo dura más de 4,5 s, deja 3,6 s a velocidad normal para leer el subtítulo y acelera el resto ×12 con `setpts`. Por ejemplo, el QR de la rampa pasa de 33 s a unos 6 s.
- Después ajusta la velocidad general para acercarse a 1:52 (`VIDEO_TARGET_S`).
- También deja la lámina de cuadros `pago-protegido/demo/video/lamina.png`, que muestra las placas y cada escena.

- Graba con Playwright el recorrido completo en testnet, con subtítulos en español inyectados en la página:
  1. La vendedora crea el link desde el simulador del bot.
  2. El comprador paga en el celular y aparece "Contrato verificado".
  3. La vendedora marca enviado desde el link del bot.
  4. El comprador confirma y ella cobra al instante.
  5. Segunda compra con reclamo, revisor 70/30 y el contrato que rechaza el desvío (`Error(Contract, #12)`).
  6. `/transparencia`.
- Cada escena es un clip con su viewport: celular para el comprador, escritorio para el resto. La billetera pasa de un clip a otro con `storageState`.
- `scripts/video-join.mjs` une los clips con ffmpeg en un mp4 de 1280x720; los de celular se centran sobre fondo oscuro.
- Sin ffmpeg, quedan los `.webm` en `pago-protegido/demo/video/clips/` y el script imprime los comandos para unirlos.
- Usa su propia app (3200), su propio simulador (3230) y una base nueva (`data/video.db`).

## Vista previa del link en WhatsApp (Open Graph)

Cuando el vendedor pega `/p/<slug>` en un chat, WhatsApp muestra una tarjeta con:

- el producto y el precio en Bs (aprox. en USD de prueba);
- la tienda;
- el escudo "Trato · pago protegido";
- "Tu plata queda guardada hasta que confirmes que te llegó".

Cómo está hecho:

- **Imagen por pedido:** `src/app/p/[slug]/opengraph-image.tsx` (`ImageResponse`, 1200x630).
- **Landing:** la imagen genérica de la marca es `src/app/opengraph-image.tsx`.
- **Meta tags:** `og:title`, `og:description`, `og:image` (URL absoluta armada con el host del request, así sirve detrás de un túnel) y `twitter:card=summary_large_image`.
- **Fuente:** Inter local (`@fontsource/inter`), así las imágenes no dependen de la red.
- **Logo:** `src/app/icon.svg` (escudo con check), que también es el favicon.
- **Test:** `e2e/og.spec.ts`. Pide las páginas como WhatsApp, verifica las meta tags, baja las imágenes (PNG 1200x630) y las guarda en `e2e/capturas/og-pedido.png` y `og-landing.png`.

Para probarlo en un WhatsApp real, la app tiene que ser pública (túnel): WhatsApp no puede leer `localhost`.

## Transparencia: métricas on-chain

`/transparencia` (y `GET /api/transparencia` en JSON) muestra métricas en vivo calculadas **solo con eventos públicos** de `pp_guardian` y `pp_arbiter`:

- compras protegidas y volumen (USD de prueba y ≈ Bs);
- liberadas por confirmación y por plazo, y tiempo promedio hasta que el vendedor cobra;
- reclamos: quién los abrió y cómo se resolvieron;
- comisiones;
- últimas operaciones y compras con links a stellar.expert.

Sigue `../docs/METRICAS.md`:

- La ingesta es incremental: `getEvents` filtrado por los dos contratos, desde el ledger del despliegue, hacia la tabla `pp_events` de SQLite.
- El cursor se guarda en `kv`. Corre al abrir la página, con candado y como mucho cada 15 s.
- Si el cursor quedó fuera de la ventana del RPC (unos 7 días), retoma desde el ledger más antiguo disponible.
- Las reglas son las de `contracts/scripts/metricas.sh`: el primer evento terminal define el estado de cada compra.

## Bot de WhatsApp: endpoints de la app

La app implementa todo lo de [`../bot/APP-ENDPOINTS.md`](../bot/APP-ENDPOINTS.md), con las formas exactas:

| § | Qué | Dónde |
|---|---|---|
| 0 | `x-bot-key: PP_BOT_KEY` (generada por `npm run setup`), comparada con `timingSafeEqual`; sin clave → `401 { error: "Clave del bot incorrecta" }` | `checkBot` en `src/lib/server/http.ts` |
| 1 | `GET /api/bot/sellers?phone=591…`: tienda por WhatsApp (8 dígitos → `591…`; la más reciente si hay varias) | `src/app/api/bot/sellers` |
| 2 | `GET /api/bot/changes?since=<ms>` → `{ now, changes: [{ slug, status, updated_at, buyer_whatsapp }] }` | `src/app/api/bot/changes` |
| 3 | `/panel?enviar=<slug>&evidencia=<texto>`: abre el pedido, lo resalta y precarga la guía; el vendedor firma | `src/app/panel/page.tsx` |
| 4 | `buyer_whatsapp`: campo opcional "Tu WhatsApp para avisarte" antes de pagar, y `POST /api/orders/:slug/buyer-contact` | solo servidor; nunca sale en `GET /api/orders/:slug` ni en `/api/sellers/:pubkey` |
| 5 | `/vender?wa=591…`: número precargado | `src/app/vender/page.tsx` |

## Test e2e (Playwright, contra testnet)

```bash
npx playwright install chromium   # solo la primera vez
npm run test:e2e
```

- Hace su propio build en `.next-e2e/`, con la billetera local, y lo levanta en `http://localhost:3100` con una base aparte (`data/e2e.db`). No toca tu `npm run dev`.
- Corre en **modo guardián** y en **modo demo** (`PP_DEMO=1`), con una base nueva en cada corrida. Recorre siete escenarios en `e2e/pago-protegido.spec.ts`, con transacciones reales en testnet, y tarda entre 12 y 16 minutos. Además corren el e2e público (`e2e/publico.spec.ts`) y el de Open Graph:
  1. **Caso feliz:** onboarding → link de Bs 450 con la protección a cargo del comprador (vista previa Bs 456,75) → pago con rampa simulada (sello "Contrato verificado") y datos de entrega → envío con evidencia → "Pagar al vendedor (irreversible)" con la pregunta obligatoria. Verifica que el vendedor recibe Bs 450,04.
  2. **Reclamo por presión y revisor:** el vendedor regala la protección (Bs 300, el comprador paga Bs 300,00) → pago → envío → "El vendedor me pide que confirme" abre un reclamo → versión del vendedor → vista previa con `pp_arbiter.quote` → intento de desvío rechazado por el contrato (`Error(Contract, #12)`) → `pp_arbiter.resolve` 70/30 (Bs 205,17 / Bs 87,93).
  3. **Celular (v2):** IMEI obligatorio, revisión contada desde el envío, "Necesito más tiempo" una vez y liberación por plazo ("Liberar ahora (plazo vencido)" → `pp_guardian.auto_release`).
  4. **Devolución automática (v2):** el vendedor no despacha a tiempo y el pago vuelve al comprador sin reclamo (`refund_unshipped`).
  5. **Bot de WhatsApp:** Playwright levanta también el simulador del bot (`../bot`, puerto 3130) contra esta app.
     - Registro con `/vender?wa=`.
     - En el chat: "vendo zapatillas nike 40 a 450 bs entrega 3 días" → link.
     - El comprador paga en la app con su WhatsApp y sus datos de entrega.
     - `enviado <código> <guía>` → link a `/panel?enviar=…` → el vendedor firma.
     - El comprador toca "Pagar al vendedor" → "Se pagó al vendedor".
     - Verifica también que el WhatsApp del comprador no aparece en la API pública y que `/api/bot/*` exige la clave.
     - Capturas `e2e/capturas/bot-*.png`.
  6. **Transparencia:** `/transparencia` con datos reales de testnet, con las pruebas del equipo separadas del piloto (captura `60-transparencia`).
  7. **Palabras prohibidas** en todas las pantallas, `/verificar`, `/pedir`, `/piloto` y `piloto:csv`.
  8. **Open Graph** (`e2e/og.spec.ts`, sin transacciones): meta tags e imágenes 1200x630 del pedido y de la landing, y el favicon.
- Modo directo: `PP_MODE=direct npm run test:e2e`.
- Guarda capturas en `e2e/capturas/` en tamaño celular (390 px, @2x) y escritorio (1280 px).
- En cada captura verifica que la pantalla no tenga palabras prohibidas (`revisarPalabras`).
- Puerto distinto: `E2E_PORT=3200 npm run test:e2e`.

Prueba de humo del backend, sin navegador, con la app corriendo: `BASE_URL=http://localhost:3000 npm run smoke`.

## Arquitectura

```
src/
  app/                    pantallas (App Router) y rutas /api
    page.tsx              landing                    /vender     onboarding (3 pasos)
    panel/                panel del vendedor         p/[slug]/   pago y seguimiento del comprador
    revisor/              panel del revisor          como-funciona/  diagrama + contratos
  lib/
    format.ts             montos, comisiones (igual que el contrato), links a stellar.expert
    whatsapp.ts           textos listos para copiar en cada evento
    wallet/               WalletProvider: LocalWallet (llave en el navegador) y PollarWallet
    server/
      config.ts           .env.local (solo testnet)
      db.ts               SQLite (better-sqlite3) en data/pp.db
      stellar.ts          RPC, simulación, fee bump, friendbot, trustline, rampa, saldos
      orders.ts           lógica de pedidos (pago, acciones, envío firmado, revisor)
      escrow/             EscrowService + DirectEscrowService + GuardianEscrowService
```

- **No custodia.** La llave del comprador vive en su navegador (`localStorage`, una por rol); la del vendedor también, salvo que entre con Pollar. El flujo de cada transacción:
  1. El servidor la arma y la simula con el usuario como cuenta de origen.
  2. El navegador la firma. Esa firma cubre también la autorización de Soroban.
  3. El servidor la envuelve en un **fee bump** firmado por `plataforma`, que paga la comisión, y la envía.
  4. La plataforma solo patrocina transacciones que ella misma armó (tabla `pending`, por hash).
- **Un escrow por compra.** Al pagar, la plataforma llama `tw_new_single_release_escrow` sobre una instancia "fábrica", que despliega e inicializa en la misma transacción. Los roles son los de SPEC §2.
- **Modos.** Se elige con `PP_MODE=direct|guardian`:

  | Rol | `direct` (temporal) | `guardian` |
  |---|---|---|
  | approver = release_signer | comprador | `pp_guardian` |
  | dispute_resolver | cuenta `arbitro` | `pp_arbiter` |

- **Transparencia.** Cada transacción queda en SQLite con su hash y se muestra con "Ver en Stellar". Cada pedido enlaza su contrato en stellar.expert.

### Activar el modo guardián

Cuando existan los contratos `pp_guardian` y `pp_arbiter` (SPEC §3), agrega a `.env.local`:

```
PP_MODE=guardian
PP_GUARDIAN_ID=C...
PP_ARBITER_ID=C...
```

- `GuardianEscrowService` lee el Spec de cada contrato desde la red y convierte los argumentos por nombre:
  - `fund(escrow, buyer, expected_escrow, amount, window_secs)`
  - `confirm(escrow, buyer)`
  - `dispute(escrow, caller)`
  - `auto_release(escrow)`
  - `resolve(escrow, buyer_bps)`
- Si los nombres reales cambian, se ajustan en un solo lugar: `ARGS`, en `src/lib/server/escrow/guardian.ts`.

### Billetera Pollar

`NEXT_PUBLIC_WALLET=local|pollar`. Con las llaves de `.env.pollar` (raíz del repo, no se versiona), `npm run setup` deja `pollar` como billetera **del vendedor**. Tiene login con Google o email y billetera embebida, sin frases secretas. **Pollar es solo para el vendedor:** el comprador nunca ve un login y firma con una llave creada en su navegador (`LocalWallet`), aunque `NEXT_PUBLIC_WALLET=pollar` (`src/lib/wallet/index.ts`). Riesgos de esa llave y plan para producción: [docs/TECNICO.md, Llaves](../docs/TECNICO.md#llaves).

- La firma va por `signTx(xdr, { skipSponsorship: true })` y la comisión la patrocina nuestra plataforma con fee bump, igual que con la billetera local.
- Pollar acepta los orígenes `http://localhost:3000` y `http://localhost:3020`; en modo Pollar la app tiene que correr en uno de esos puertos.

**Cómo probar el login real (Hans):**

1. En `.env.local`, deja `NEXT_PUBLIC_WALLET=pollar` (lo pone `npm run setup` si existe `.env.pollar` en la raíz del repo).
2. Corre `PORT=3020 npm run dev` (o `npm run dev` si el 3000 está libre). Si cambiaste `NEXT_PUBLIC_*`, reinicia el servidor.
3. Abre `http://localhost:3020/vender`, completa tienda y WhatsApp y toca **"Ingresar con Google o email y continuar"**.
4. En el modal de Pollar, entra con Google o con tu email (llega un código). La billetera se crea sola y Pollar le agrega la trustline a LABUSD (configurado en el dashboard).
5. La app te lleva a "Tu primer link". Para probar como comprador, abre el link en otro navegador o en una ventana privada: el comprador no ve el login de Pollar y firma con una llave creada en ese navegador. Si comprador y vendedor terminaran siendo la misma cuenta, `pp_guardian` lo rechaza (`BuyerIsSeller`).
6. Cada firma pasa por `signTx(xdr, { skipSponsorship: true })` y la comisión la paga nuestra plataforma con fee bump. Si Pollar pide confirmar la firma, acéptala.
7. Verificado automáticamente con Playwright en `PORT=3020`: el modal de login carga sin errores de origen ni CORS (captura `e2e/capturas/50-pollar-modal-login-3020-celular.png`). El modal de Pollar 0.12.0 aparece en inglés; el idioma se configura en el dashboard de Pollar o con `locale` desde la 0.12.1.
- `LocalWallet` (llave en el navegador) es la del comprador siempre, la del vendedor sin Pollar y la que usa el e2e.
- Código: `src/lib/wallet/pollar.ts` y `src/components/PollarProviders.tsx`. Estado y pendientes: `DECISIONES.md`, sección Pollar.

## Métricas en vivo y perfil de la tienda

- `/metricas`: KPIs con datos públicos de testnet (eventos de los contratos v2). Piloto y pruebas del equipo, siempre por separado. Cada número abre `/metricas/<equipo|piloto>/<kpi>` con las operaciones y sus links a stellar.expert. JSON en `/api/metricas`.
- `/tienda/<slug>`: perfil verificable del vendedor, sin teléfono ni dirección, con la insignia "Vende con Trato" (imagen OG y `/tienda/<slug>/insignia`). La tarjeta del vendedor en la página de pago enlaza ahí, y el bot responde "mi perfil" con el link.
- `npm run test:e2e:publico`: e2e de solo lectura contra testnet, sin claves (puerto 3140). `npm run test:e2e` incluye además los pasos con pagos.
- Detalle y definiciones: DECISIONES 86–99.

## `/probar`: Trato de punta a punta en un pantallazo

- Solo con `PP_PROBAR=1` (apagado por defecto). El vendedor y el comprador corren las páginas reales en dos marcos de celular (en el celular, en pestañas), cada uno con su propia cuenta de prueba creada en el navegador. Ninguna clave del equipo llega al navegador.
- Al lado: el registro en vivo (crear el link, pagar, registrar el envío y pagar al vendedor, con cada transacción en stellar.expert), "Intenta desviar la plata" (simulación real, rechazada con `Error(Contract, #12)`) y "Empezar de nuevo". Plazos de demo y un límite de pruebas por IP.
- `npm run test:e2e:probar`: el flujo completo contra testnet (también corre dentro de `npm run test:e2e`). Detalle: DECISIONES 100–109.
