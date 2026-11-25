# WhatsApp real: el bot con el número de prueba de Meta

Guía para poner el bot de Trato (`bot/`) en un WhatsApp de verdad, con la API oficial de Meta (Cloud API) y el **número de prueba gratis**. Ese número habla con hasta 5 teléfonos verificados y no pide verificar el negocio.

**Estado al 24-nov-2026:** el código está listo y probado contra una API de Meta simulada a nivel HTTP. **Todavía no se conectó a Meta:** no se creó ninguna app ni número, y no se tocó Railway. Todo eso lo hace Hans con esta guía (unos 30 minutos). El simulador (`bot-sim`) sigue igual y no se toca.

**Hay dos caminos, y alcanza con uno.** Los pasos 1 a 8 son con Meta directo y su número de prueba (5 teléfonos). El camino corto, sin chip y sin límite de 5 teléfonos, es [Con Kapso](#13-con-kapso): un número de EE.UU. ya verificado. Las secciones 9, 10 y 12 valen para los dos.

- [1. Qué vas a necesitar](#1-qué-vas-a-necesitar)
- [2. Crear la app en Meta](#2-crear-la-app-en-meta)
- [3. El número de prueba y su Phone number ID](#3-el-número-de-prueba-y-su-phone-number-id)
- [4. Agregar y verificar hasta 5 teléfonos](#4-agregar-y-verificar-hasta-5-teléfonos)
- [5. Las credenciales](#5-las-credenciales)
- [6. El servicio en Railway](#6-el-servicio-en-railway)
- [7. Configurar el webhook](#7-configurar-el-webhook)
- [8. Prueba de humo (2 minutos)](#8-prueba-de-humo-2-minutos)
- [9. La ventana de 24 horas: cómo se avisa](#9-la-ventana-de-24-horas-cómo-se-avisa)
- [10. Testnet o mainnet](#10-testnet-o-mainnet)
- [11. Si algo falla](#11-si-algo-falla)
- [12. Límites conocidos](#12-límites-conocidos)
- [13. Con Kapso](#13-con-kapso)

---

## 1. Qué vas a necesitar

- Una cuenta de Facebook tuya (con verificación en dos pasos) y, si ya tienes, tu portafolio comercial de Meta (Meta Business).
- Los celulares que van a probar, a mano: cada uno recibe un código por WhatsApp.
- Acceso al proyecto de Railway donde corre la app.
- Una tienda creada en la app con **tu** WhatsApp (`/vender`). El bot reconoce a la tienda por su número.

El orden importa: Meta comprueba el webhook en el momento, así que el bot tiene que estar corriendo (paso 6) antes de configurarlo (paso 7).

**Cuida las credenciales.** No las pegues en un chat, en el repo ni en una captura. Van solo en las variables del servicio de Railway.

## 2. Crear la app en Meta

1. Entra a <https://developers.facebook.com/apps> y toca **Crear app** (Create App).
2. Nombre: por ejemplo `Trato bot`. Correo de contacto: el tuyo.
3. Caso de uso: **Conectarte con los clientes por WhatsApp** (Connect with customers through WhatsApp). Si te muestra la pantalla vieja de tipos, elige **Empresa** (Business).
4. Elige tu portafolio comercial o crea uno. No hace falta verificarlo para usar el número de prueba.
5. Termina de crear la app. Si en el menú de la izquierda no aparece WhatsApp: **Agregar producto → WhatsApp → Configurar** (Add product → WhatsApp → Set up).

## 3. El número de prueba y su Phone number ID

1. En la app: **WhatsApp → Configuración de la API** (API Setup). En apps con casos de uso: **Casos de uso → Personalizar → Configuración de la API**.
2. Meta te da un número de prueba, normalmente de Estados Unidos (`+1 555 …`). En **De** (From) tiene que estar seleccionado ese.
3. Anota dos identificadores de esa pantalla:
   - **Identificador del número de teléfono** (Phone number ID): solo dígitos, largo. Va en `WA_PHONE_NUMBER_ID`. No es el número de teléfono: si pones el número, el bot no arranca y te lo dice.
   - **Identificador de la cuenta de WhatsApp Business** (WABA ID): lo usas en el paso 7 si no llegan mensajes.
4. Anota también el número de prueba completo: es al que le van a escribir.

## 4. Agregar y verificar hasta 5 teléfonos

El número de prueba solo le responde a los teléfonos de esta lista. Al resto, Meta le rechaza la respuesta (error 131030).

1. En la misma pantalla, campo **Para** (To) → **Administrar lista de números de teléfono** (Manage phone number list) → **Agregar número de teléfono**.
2. País **Bolivia (+591)** y el celular de 8 dígitos.
3. A ese celular le llega un código por WhatsApp. Escríbelo en la pantalla.
4. Repite hasta 5. Sugerencia para la final: tienda, comprador, tú, un jurado y uno de reserva.
5. Toca **Enviar mensaje** (Send message): manda la plantilla de ejemplo `hello_world`. Si llega, el número funciona, y cada persona ya tiene el chat abierto para responder.

Deja el quinto lugar libre hasta el final: no cuentes con poder quitar un número para poner otro el mismo día.

## 5. Las credenciales

| Variable | Dónde se saca |
|---|---|
| `WA_PHONE_NUMBER_ID` | paso 3 |
| `WA_TOKEN` | token temporal o de usuario del sistema (abajo) |
| `WA_VERIFY_TOKEN` | lo inventas tú: una frase larga, al azar. La misma va en Railway y en el webhook |
| `WA_APP_SECRET` | **Configuración de la app → Básica → Clave secreta de la app** (App settings → Basic → App secret) → **Mostrar** |

`WA_APP_SECRET` es obligatoria: con ella el bot comprueba que cada webhook lo firmó Meta. Sin esa comprobación, cualquiera que conozca la URL podría escribirle al bot haciéndose pasar por una tienda.

### Token temporal (para probar hoy)

En **Configuración de la API** → **Generar token de acceso** (Generate access token). Vence a las 24 horas o antes. Cuando vence, el bot deja de responder y en el registro aparece `Graph API 401 (190)`. **No sirve para la final.**

### Token de usuario del sistema (para la final)

1. <https://business.facebook.com/settings> → tu portafolio → **Usuarios → Usuarios del sistema** (System users) → **Agregar**. Nombre: `trato-bot`, rol **Administrador**.
2. En ese usuario: **Asignar activos** (Assign assets):
   - **Apps** → tu app → control total (Manage app).
   - **Cuentas de WhatsApp** → la cuenta de prueba (Test WhatsApp Business Account) → control total.
3. **Generar token** (Generate token) → elige la app → vencimiento **Nunca** (o el más largo que ofrezca) → permisos `whatsapp_business_messaging` y `whatsapp_business_management`. La guía de Meta también marca `business_management`; el bot no lo usa.
4. Cópialo en el momento, no se vuelve a mostrar. Va en `WA_TOKEN`, en lugar del temporal.

Si la cuenta de prueba no aparece en "Cuentas de WhatsApp", es que quedó en otro portafolio: revisa con cuál creaste la app.

## 6. El servicio en Railway

Un servicio **aparte**, por ejemplo `bot-wa`. No cambies `bot-sim`: es el simulador de la demo y sigue como está.

1. En el proyecto: **New → GitHub Repo →** este repo. Elige la rama que corresponda (esta, o `main` después del merge).
2. **Settings:**
   - Root Directory: la raíz del repo.
   - Start Command: **vacío**. La imagen ya arranca en modo WhatsApp (`--whatsapp`).
   - Healthcheck Path: `/health`.
   - **Réplicas: 1.** Con dos, cada aviso saldría dos veces.
3. **Volume** montado en `/data`: guarda las ventanas de 24 horas y los avisos que esperan. Sin volumen, cada deploy los olvida.
4. **Variables:**

| Variable | Obligatoria | Qué es |
|---|---|---|
| `RAILWAY_DOCKERFILE_PATH` | sí | la ruta de `deploy/bot.Dockerfile` |
| `RAILWAY_RUN_UID` | sí | usuario con permiso para escribir en el volumen (ver [`deploy/DEPLOY.md`](../deploy/DEPLOY.md)) |
| `PORT` | sí | el puerto del webhook (el mismo que en el dominio público del servicio) |
| `WA_TOKEN` | sí | paso 5 |
| `WA_PHONE_NUMBER_ID` | sí | paso 3 |
| `WA_VERIFY_TOKEN` | sí | paso 5 |
| `WA_APP_SECRET` | sí | paso 5 |
| `PP_APP_URL` | sí | la app a la que apunta el bot: elige la instancia ([paso 10](#10-testnet-o-mainnet)) |
| `PP_PUBLIC_URL` | si `PP_APP_URL` es la red privada de Railway | la URL `https` que ven las personas en los links |
| `PP_BOT_KEY` | sí | **la misma** que tiene el servicio de la app. Si la app no la tiene, agrégala en los dos |
| `STELLAR_NETWORK` | solo en mainnet | la red de la app (`testnet` si no está) |
| `WA_TEMPLATE_AVISO`, `WA_TEMPLATE_LANG` | no | la plantilla del [paso 9](#9-la-ventana-de-24-horas-cómo-se-avisa) |
| `WA_GRAPH_VERSION` | no | otra versión de la Graph API (por defecto, v23.0, vigente hasta oct-2027) |
| `POLL_INTERVAL_MS`, `REMINDER_HOURS` | no | como en el simulador |

5. En el **servicio de la app** (opcional, recomendado): `NEXT_PUBLIC_BOT_WHATSAPP`, con el número de prueba completo. Se fija al construir, así que hay que volver a desplegar. Con ella, la página del comprador muestra **«Recibir los avisos por WhatsApp»** después de pagar. Sin ella no cambia nada.
6. **Networking → Generate Domain.** La URL del webhook es `https://<ese dominio>/webhook`.
7. Deploy. En el registro tienen que aparecer estas líneas:

```
WhatsApp real: webhook en el puerto …, ruta /webhook (testnet, app: https://…)
Fuera de las 24 horas: los avisos esperan a que la persona escriba
Avisos: revisando la app cada 10 s
Número de WhatsApp: +1 555 … (Test Number)
```

Si falta o sobra algo, **no arranca** y dice qué:

- `Falta WA_APP_SECRET`, `Falta PP_BOT_KEY`…: esa variable está vacía.
- `la app de PP_APP_URL corre en mainnet y el bot tiene STELLAR_NETWORK=testnet`: la red no coincide.
- `la app no acepta PP_BOT_KEY`: no es la misma en los dos servicios.

Comprueba desde tu computadora que el webhook contesta (`$VERIFY` es tu `WA_VERIFY_TOKEN`; usa la URL de tu servicio):

```bash
curl "https://<dominio>/health"                                                                          # ok
curl "https://<dominio>/webhook?hub.mode=subscribe&hub.verify_token=$VERIFY&hub.challenge=funciona"      # funciona
```

## 7. Configurar el webhook

1. En la app de Meta: **WhatsApp → Configuración** (Configuration) → **Webhook → Editar**. En apps con casos de uso: **Casos de uso → Personalizar → Configuración**.
2. **URL de devolución de llamada** (Callback URL): `https://<dominio del servicio>/webhook`.
3. **Token de verificación** (Verify token): el mismo `WA_VERIFY_TOKEN`.
4. **Verificar y guardar.** Meta llama al bot en ese momento.
5. En **Campos del webhook** (Webhook fields) → **Administrar** → suscríbete a **`messages`**. Trae los mensajes y también los estados de envío, que el bot necesita.
6. Escríbele `hola` al número de prueba desde un celular de la lista. Si en un minuto no contesta y en el registro de Railway no aparece nada, suscribe la app a la cuenta de WhatsApp (una sola vez). Carga tu token en la variable de entorno `WA_TOKEN` de tu terminal antes, sin escribirlo en el comando:

```bash
curl -X POST -H "Authorization: Bearer $WA_TOKEN" "https://graph.facebook.com/v23.0/<WABA_ID>/subscribed_apps"
curl         -H "Authorization: Bearer $WA_TOKEN" "https://graph.facebook.com/v23.0/<WABA_ID>/subscribed_apps"   # tiene que listar tu app
```

7. Si sigue sin llegar: la documentación de Meta dice que *algunos* webhooks no se mandan con la app en modo **Desarrollo**. Pásala a **Activo / Publicada** (Live): pide una URL de política de privacidad y un ícono.

## 8. Prueba de humo (2 minutos)

Antes: la tienda existe en `<app>/vender` con el WhatsApp del celular A, y A y B están en la lista del paso 4.

| Minuto | Desde | Escribe | Tiene que llegar |
|---|---|---|---|
| 0:00 | A | `hola` | la bienvenida (con la regla de las 24 horas) y el menú con botones |
| 0:20 | A | `vendo zapatillas nike 40 a 90 bs entrega 3 días` | **el link de pago**, los botones de la protección y el texto para reenviar |
| 0:50 | A | (abre el link) | la página de pago real de la instancia elegida, con el producto y Bs 90 |
| 1:10 | B | (A le reenvía el link y B se lo reenvía al bot) | `✅ Auténtico: <tienda>, Zapatillas nike 40…` |
| 1:40 | A | `mis ventas` | el pedido recién creado, con su código `PP-…` |

Pasa si llegan las cinco respuestas. Bs 90 entra en el tope de mainnet (USD 10 con la protección incluida).

**Los avisos** (2 minutos más): B abre el link, paga dejando su WhatsApp y toca «Recibir los avisos por WhatsApp» (o le escribe `avisos` al bot). En unos 10 segundos A recibe «tu cliente pagó… el pago está GUARDADO» y B, «tu pago está guardado». El aviso dice `USD de prueba` en testnet y `USDC` en mainnet.

## 9. La ventana de 24 horas: cómo se avisa

**La regla de Meta.** Cuando una persona le escribe al bot se abre una ventana de 24 horas, y cada mensaje suyo la reinicia. Dentro de la ventana el bot manda lo que quiera. Fuera, solo plantillas aprobadas: un texto libre se rechaza con el error 131047, a veces al mandarlo y a veces después, por el webhook.

**Lo que se decidió: que la persona escriba primero, y que ningún aviso se pierda.**

| A quién | Cómo se abre su ventana | Fuera de la ventana |
|---|---|---|
| **Tienda** | Siempre escribe primero: crea sus links en el chat. La bienvenida le explica la regla | El aviso queda guardado y sale apenas escribe cualquier cosa (`novedades`) |
| **Comprador** | Después de pagar toca «Recibir los avisos por WhatsApp» (o le escribe al bot), desde el número que dejó al pagar | Igual. Si nunca escribió, no se le manda nada hasta que escriba |

Por qué así: no depende de que Meta apruebe nada antes del viernes, no cuesta y nadie recibe mensajes que no pidió. La app sigue siendo la fuente de verdad: el panel y la página del pedido muestran lo mismo, llegue o no el aviso. Y los plazos los ejecuta el contrato, no el bot.

Cómo funciona (`bot/src/notify/outbox.ts`):

- La ventana cuenta desde la hora del mensaje de la persona, con un minuto de margen.
- Por pedido queda guardado solo el aviso más nuevo. Vence a los 7 días, y un recordatorio, a la hora de liberación.
- Si Meta rechaza un aviso por la ventana, se guarda. Si falla por algo pasajero (token vencido, Meta caída), se reintenta cada vez más espaciado, hasta 10 minutos. Si el teléfono no está en la lista de 5, se descarta y queda en el registro.
- `novedades`, `avisos`, `avisos PP-…` y el botón «Ver el aviso» piden los avisos guardados.
- Los avisos del comprador van solo al WhatsApp que dejó al pagar: escribir el código desde otro número no los muestra.

### Opcional: una plantilla para avisar fuera de la ventana

Con plantilla, además de guardar el aviso, el bot le manda una línea para que toque un botón y lo lea. Se activa con `WA_TEMPLATE_AVISO`; sin esa variable, nada de esto corre.

1. **Administrador de WhatsApp** (WhatsApp Manager) → **Plantillas de mensajes** → **Crear**, en la cuenta de prueba.
2. Categoría **Utilidad** (Utility), nombre `trato_aviso`, idioma **Español** (`es`).
3. Cuerpo, tal cual (dos variables, ninguna al principio ni al final):

```
Hola, soy el asistente de Trato. Hay una novedad en el pedido {{1}}: {{2}}. Toca el botón y te cuento el detalle por aquí.
```

   Ejemplos que pide Meta: `PP-7KM4Q9TX` y `tu cliente ya pagó`.
4. Botón de **respuesta rápida** (Quick reply) con el texto `Ver el aviso`.
5. Cuando diga **Activa**, pon el nombre en `WA_TEMPLATE_AVISO` (y el idioma en `WA_TEMPLATE_LANG`, si no es `es`) y reinicia el servicio.

Sale una plantilla por aviso, como mucho. No pudimos confirmar en la documentación si la cuenta de prueba aprueba plantillas propias ni cuánto tarda: por eso el camino principal no la necesita. Con un número de verdad, además, las plantillas de utilidad se pagan.

## 10. Testnet o mainnet

El bot atiende **una** instancia de la app, la de `PP_APP_URL`:

| | Demo de testnet | Prueba en mainnet (rama `mainnet-prueba`, [`docs/MAINNET.md`](https://github.com/haneiva1/pago-protegido/blob/mainnet-prueba/docs/MAINNET.md)) |
|---|---|---|
| `PP_APP_URL` | la app de la demo | la app de mainnet |
| `STELLAR_NETWORK` | sin poner | `mainnet` |
| `PP_BOT_KEY` | la de la app de la demo | la de la app de mainnet (esa guía no la lista: agrégala a ese servicio) |
| Moneda en los mensajes | USD de prueba | USDC |
| Advertencia | ninguna | «Prueba real en mainnet: plata real, montos chicos», en el registro y en cada link |
| Monto máximo | — | el de la app (`MAINNET_MAX_USD`): si te pasas, el bot contesta con el error de la app |

- Al arrancar, el bot le pregunta a la app en qué red corre (`GET /api/info`). **Si no coincide con `STELLAR_NETWORK`, no arranca:** nunca dirá «USD de prueba» de plata real ni al revés.
- Para cambiar de instancia, cambia esas variables y reinicia. Los pedidos, las tiendas y los avisos guardados de la otra instancia se descartan; quedan solo las ventanas de 24 horas, que son del número.
- El verificador de links da por auténticos solo los links de la instancia elegida.
- El bot no firma ni tiene llaves de ninguna red: crea links y lee pedidos.
- Un número de WhatsApp tiene un solo webhook. Para tener las dos instancias a la vez hacen falta dos apps de Meta, cada una con su número de prueba y su servicio.

## 11. Si algo falla

El registro del servicio en Railway dice qué pasó y qué hacer. Los teléfonos salen recortados (`…4567`).

| Síntoma | Causa y solución |
|---|---|
| El servicio no arranca | El registro lista lo que falta (paso 6) |
| «Verificar y guardar» falla | El servicio no está arriba, la URL no termina en `/webhook` o `WA_VERIFY_TOKEN` no es el mismo. Prueba los dos `curl` del paso 6 |
| Escribo y no pasa nada, ni en el registro | Falta el campo `messages`, falta `subscribed_apps` o la app está en Desarrollo (paso 7) |
| El webhook da 401 | `WA_APP_SECRET` no es el de **esta** app de Meta |
| `Graph API 401 (190)` | El token venció o no sirve: genera el de usuario del sistema (paso 5). Los avisos no se pierden: con el token nuevo salen solos (hasta 10 minutos después) o cuando la persona escriba |
| `Graph API 400 (131030)` | Ese teléfono no está en la lista de 5 (paso 4) |
| `(131047)` | Pasaron más de 24 horas desde su último mensaje: el aviso sale cuando escriba |
| `(131026)` | Ese número no tiene WhatsApp, la versión es vieja o no aceptó los términos |
| `(132000)` o `(132001)` | La plantilla no existe, no está aprobada en ese idioma o tiene otras variables |
| «Este número todavía no tiene tienda» | La tienda se registró con otro WhatsApp, o en otra instancia de la app |
| «No veo ninguna compra con este número» | El comprador dejó otro número al pagar, o pagó hace menos de 10 segundos |
| «WhatsApp no me mostró tu número» | Esa persona usa nombre de usuario de WhatsApp y Meta no comparte su teléfono. Que escriba desde otro celular |
| Cada aviso llega dos veces | Hay dos réplicas, o dos servicios con el mismo número |
| `[estado] no pude guardar` | Falta el volumen en `/data` o `RAILWAY_RUN_UID` |

**Plan B para la final:** `bot-sim` sigue corriendo y `/probar` no depende de este servicio.

## 12. Límites conocidos

- Solo 5 teléfonos hasta verificar el negocio y usar un número propio. El número de prueba aparece como «Test Number», no como Trato.
- El bot lee texto, botones y el texto que acompaña a una foto. A un audio o una foto sola le contesta que solo lee texto.
- Las respuestas a un mensaje no se guardan: si Meta no las acepta después de 3 intentos, la persona tiene que volver a escribir. Los avisos sí se guardan.
- La lista de mensajes ya atendidos vive en memoria: si Meta reenvía uno justo después de un reinicio, se atiende otra vez.
- No está probado contra Meta: los errores y las formas de los mensajes salen de su documentación (leída el 24-nov-2026). La prueba de humo es la primera comprobación real.
- Costos con un número propio: desde el 1-oct-2026 Meta da 1.000 mensajes de servicio gratis por mes y por número, y cobra los siguientes y las plantillas. Con el número de prueba, escribirle a los 5 teléfonos es gratis y no pide tarjeta.

### Cómo se probó

`cd bot && npm test`. El flujo real está en `bot/test/whatsapp-real.test.ts`: levanta el bot en su propio proceso, como en producción, con Meta y la app como servidores HTTP de mentira. Manda webhooks firmados y comprueba la verificación, la firma, el link que recibe la tienda, los botones, el aviso de pago, el comprador que escribe primero, el rechazo tardío por la ventana (131047), el teléfono fuera de la lista (131030) y que el registro no muestre secretos. Corre en testnet y en mainnet, con y sin plantilla. La ventana de 24 horas, los reintentos y el estado guardado están en `bot/test/outbox.test.ts`.

### Fuentes

Documentación de Meta, leída el 24-nov-2026: [Get Started](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started), [webhooks](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint), [tokens](https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens), [envío y ventana de 24 horas](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages), [errores](https://developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes), [precios](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing), [nombres de usuario y BSUID](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids), [`subscribed_apps`](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/manage-webhooks) y [versiones de la Graph API](https://developers.facebook.com/docs/graph-api/changelog/versions). El recorrido exacto por las pantallas puede variar: Meta las cambia seguido.

## 13. Con Kapso

[Kapso](https://kapso.ai) es un servicio que va entre el bot y la API oficial de WhatsApp (Meta). Da un número de EE.UU. **ya verificado** (sin chip ni código por SMS) y reemplaza los pasos 2 a 5 y el 7: no hace falta crear una app de Meta ni un token, y el número habla con cualquiera, no solo con 5 teléfonos.

**Estado al 24-nov-2026:** el código está listo y probado contra un Kapso simulado, con los ejemplos de su documentación. **Todavía no se conectó:** no se creó ninguna cuenta ni se tocó Railway. Unos 20 minutos, si Meta no pide nada más.

### 13.1. Crear la cuenta

1. Entra a <https://app.kapso.ai> y regístrate. Quédate en el plan **Free** y en el proyecto que te crea.
2. Usa Chrome, sin bloqueador de anuncios y con las ventanas emergentes permitidas: el paso siguiente abre una de Meta.
3. Ten a mano la cuenta de Facebook que administra tu portafolio comercial de Meta, y una web pública `https` del negocio por si Meta la pide (sirve la de la demo).

### 13.2. Conectar el número (Instant setup)

1. **Connected numbers → Connect new number → Instant setup**.
2. Se abre Meta: entra con Facebook y toca **Continue**.
3. En **Add your WhatsApp phone number**, abre la lista **Phone number** y elige uno con la marca **Verified** (tiene un maletín).
   - No elijas **Enter a new phone number**: pide SMS.
   - No elijas **Use a display name with a virtual number instead**: es un número limitado, que deja de funcionar a los 5 mensajes.
   - Si no aparece ninguno con **Verified**, cancela y empieza de nuevo desde Kapso.
4. Elige tu portafolio comercial. En **WhatsApp Business account**, crea una cuenta nueva (o usa la que tengas) → **Next → Confirm → Finish**.
5. Si en algún paso Meta pide el nombre visible, pon **Trato**. Si no lo pide, o quedó otro: **Connected numbers →** tu número **→ Profile → Display name →** `Trato` **→** enviar. Meta lo revisa, casi siempre en 24 a 48 horas, y puede rechazarlo si no coincide con tu web. Mientras tanto, la documentación no dice qué nombre se ve.
6. Kapso tiene que mostrar el número como conectado. Si queda **pendiente**, Meta está revisando la cuenta nueva: Kapso reintenta solo, pero no hay plazo publicado. **Es el riesgo principal para el viernes:** haz este paso cuanto antes.
7. No le conectes workflows ni agentes de Kapso, ni el agente de IA de Meta: contestarían además del bot.

### 13.3. La clave y el Phone number ID

En el panel de Kapso, crea una **API key** del proyecto. La vas a pegar en Railway y en tu Terminal, nunca en un chat. Corre esta línea sola, pega la clave (no se ve) y toca Enter:

```bash
read -rs KAPSO_API_KEY
```

Después, la lista de tus números:

```bash
curl -sS -H "X-API-Key: $KAPSO_API_KEY" https://api.kapso.ai/platform/v1/whatsapp/phone_numbers
```

En la respuesta, `display_phone_number` es el número al que le van a escribir, y `phone_number_id`, el que va en `WA_PHONE_NUMBER_ID`.

### 13.4. Crear el webhook

Kapso tiene dos tipos de webhook por número. El bot entiende los dos; crea **uno solo**.

**Opción A, la recomendada: el webhook crudo de Meta** (`kind: meta`). Llega lo mismo que manda Meta, sin traducir, y con los estados de envío incluidos. El secreto lo inventas tú, y Kapso firma cada aviso con él (`X-Webhook-Signature`). En la misma Terminal del paso anterior, corre esta línea sola, pega tu `phone_number_id` y toca Enter:

```bash
read -r WA_PHONE_NUMBER_ID
```

Después, este bloque:

```bash
KAPSO_WEBHOOK_SECRET=$(openssl rand -hex 32)
printf '{"whatsapp_webhook":{"kind":"meta","url":"https://bot-wa-production-d5cbe08f.up.railway.app/webhook","secret_key":"%s","active":true}}' "$KAPSO_WEBHOOK_SECRET" | curl -sS -o /dev/null -w "%{http_code}\n" -X POST "https://api.kapso.ai/platform/v1/whatsapp/phone_numbers/$WA_PHONE_NUMBER_ID/webhooks" -H "X-API-Key: $KAPSO_API_KEY" -H "Content-Type: application/json" -d @-
printf %s "$KAPSO_WEBHOOK_SECRET" | pbcopy
```

Tiene que responder `201`. La última línea deja el secreto en el portapapeles, para el paso 13.5. Hay un solo webhook de Meta por número: si ya creaste uno, bórralo o edítalo en el panel.

También se puede desde el panel (tu número **→ Edit → Webhook destination URL**), pero la documentación no dice si esa pantalla te deja poner el secreto. Sin secreto conocido el bot rechaza todo con 401, así que conviene el comando.

**Opción B, el webhook de Kapso** (`kind: kapso`), desde los webhooks de **tu número** (no en **Platform webhooks**, que no trae mensajes):

- URL: `https://bot-wa-production-d5cbe08f.up.railway.app/webhook`
- Eventos: `whatsapp.message.received`, `whatsapp.message.delivered`, `whatsapp.message.read` y `whatsapp.message.failed`.
- Secreto: cópialo, va en `KAPSO_WEBHOOK_SECRET`.
- **Buffering apagado:** con él, cada respuesta tarda unos segundos más (el bot igual entiende los lotes).

### 13.5. Variables en Railway (servicio `bot-wa`)

| Variable | Valor |
|---|---|
| `WA_PROVIDER` | `kapso` |
| `KAPSO_API_KEY` | la clave del paso 13.3 |
| `KAPSO_WEBHOOK_SECRET` | el secreto del paso 13.4 |
| `WA_PHONE_NUMBER_ID` | el `phone_number_id` del paso 13.3. No es el número de teléfono |

Las que no son de WhatsApp quedan como en el [paso 6](#6-el-servicio-en-railway): `RAILWAY_DOCKERFILE_PATH`, `RAILWAY_RUN_UID`, `PORT`, `PP_APP_URL` y `PP_BOT_KEY`, con su volumen en `/data`, `/health` y 1 réplica. `WA_TOKEN`, `WA_VERIFY_TOKEN` y `WA_APP_SECRET` **no hacen falta**; si están, no se usan. No pongas `WA_GRAPH_VERSION`: con Kapso es `v24.0`, la de su documentación.

Para volver a Meta directo: borra `WA_PROVIDER` (o ponla en `meta`), con las cuatro variables del [paso 5](#5-las-credenciales), y despliega de nuevo.

Despliega (el código tiene que estar en `main`). En el registro:

```
WhatsApp real: webhook en el puerto 3040, ruta /webhook (testnet, app: https://…)
Proveedor: Kapso (WA_PROVIDER=kapso)
Fuera de las 24 horas: los avisos esperan a que la persona escriba
Avisos: revisando la app cada 10 s
Número de WhatsApp: +1 … (Trato)
```

Después: `curl https://bot-wa-production-d5cbe08f.up.railway.app/health` responde `ok`, y se hace la [prueba de humo](#8-prueba-de-humo-2-minutos) escribiéndole al número nuevo desde cualquier celular. Opcional: `NEXT_PUBLIC_BOT_WHATSAPP` en el servicio de la app, con el número nuevo.

### 13.6. Qué cambia y qué no

- **No cambia:** la ventana de 24 horas, los avisos guardados, la plantilla opcional y testnet o mainnet (secciones 9 y 10). La plantilla hay que aprobarla en la cuenta nueva.
- **Firma:** se exige `X-Webhook-Signature` (HMAC-SHA256 en hex del cuerpo crudo, con `KAPSO_WEBHOOK_SECRET`). La firma de Meta y la verificación GET quedan cerradas: la documentación de Kapso no las usa.
- **Un solo número:** se atiende solo lo que llega a `WA_PHONE_NUMBER_ID`. Lo de otro número, o lo que no dice a cuál llegó, se ignora. También el historial importado y los chats que atiende otra app.
- **Costos:** Kapso Free incluye 2.000 mensajes por mes, contando los que entran y los que salen. Aparte, Meta da 1.000 mensajes de servicio gratis por mes y por número, y cobra los siguientes. El límite es de 100 pedidos por minuto.
- **El número gratis** es uno por persona, para siempre. Si en 30 días no tiene mensajes, Kapso lo libera.

### 13.7. Si algo falla

| Síntoma | Causa y solución |
|---|---|
| No arranca: `Falta KAPSO_…` o `WA_PROVIDER tiene que ser…` | Esa variable falta o tiene otro valor (13.5) |
| El webhook da 401 | `KAPSO_WEBHOOK_SECRET` no es el de **ese** webhook |
| El webhook da 200 pero el bot no contesta | `WA_PHONE_NUMBER_ID` no es el del número que recibió el mensaje, o el webhook es de **Platform webhooks** |
| Dejaron de llegar mensajes | Con muchos fallos en 15 minutos (40 o más entregas, 85 % falladas) Kapso pausa el webhook y avisa por correo: **Integrations → Webhooks → activar** |
| `Kapso 401` | `KAPSO_API_KEY` no sirve: crea otra |
| `Kapso 401 (190)` | Kapso perdió el permiso de Meta: vuelve a conectar el número |
| `Kapso 402 (…)` | No puede cobrar el mensaje. Mira **Phone numbers →** tu número **→ Meta message fees** y el saldo del proyecto |
| `Kapso 404` | El Phone number ID no es de ese proyecto |
| `Kapso 409` sin más | Otro mensaje para esa persona estaba saliendo. El bot repite hasta 3 veces |
| `Kapso 409 (thread_not_owner)` | Otra app atiende ese chat: desconéctala del número en Meta |
| `Kapso 422 (131047)` | Pasaron más de 24 horas: el aviso sale cuando escriba (sección 9) |
| `Kapso 423 (project_under_review)` | Kapso está revisando la cuenta. Escríbele a su soporte |
| El número sigue pendiente | [Instant setup troubleshooting](https://docs.kapso.ai/docs/how-to/whatsapp/instant-setup-troubleshooting.md) |

### 13.8. Lo que la documentación de Kapso no aclara

- **Si el número es gratis del todo.** *Instant setup* dice que el primero, en el plan Free, no lleva depósito; *Connect WhatsApp* y *Pricing* hablan de «un depósito chico» que queda como crédito. Si te lo pide, es decisión tuya.
- **Si hace falta saldo para responder.** Los primeros 1.000 mensajes por mes son gratis, pero también dice que los envíos se permiten «con saldo positivo» y no dice qué pasa con saldo cero. Si ves `Kapso 402`, es eso.
- **En qué pantalla se pone el nombre** durante Instant setup, y qué nombre se ve mientras Meta lo aprueba.
- **En qué pantalla están** la API key, el Phone number ID y el secreto del webhook de Meta. Por eso los comandos.
- **Qué forma exacta tienen los errores 401 y 5xx.** El bot acepta las dos formas que usa Kapso (la de Meta y `{"error": "texto"}`).

### Fuentes de Kapso

Leídas el 24-nov-2026: [Connect WhatsApp](https://docs.kapso.ai/docs/how-to/whatsapp/connect-whatsapp.md), [Instant setup](https://docs.kapso.ai/docs/platform/phone-numbers/instant-setup.md), [webhooks](https://docs.kapso.ai/docs/platform/webhooks/overview.md), [eventos](https://docs.kapso.ai/docs/platform/webhooks/message-events.md), [firma](https://docs.kapso.ai/docs/platform/webhooks/security.md), [entrega y lotes](https://docs.kapso.ai/docs/platform/webhooks/advanced.md), [crear webhook](https://docs.kapso.ai/api/platform/v1/webhooks/create-webhook.md), [enviar](https://docs.kapso.ai/api/meta/whatsapp/messages/send-a-message.md), [nombre visible](https://docs.kapso.ai/docs/whatsapp/display-names.md), [precios](https://docs.kapso.ai/docs/whatsapp/pricing-faq.md), [cobro de Meta](https://docs.kapso.ai/docs/whatsapp/meta-message-billing.md) y [límites](https://docs.kapso.ai/api/rate-limits.md). Los tests del modo Kapso están en `bot/test/kapso.test.ts`.
