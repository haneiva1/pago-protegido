# WhatsApp real: el bot con el número de prueba de Meta

Guía para poner el bot de Trato (`bot/`) en un WhatsApp de verdad, con la API oficial de Meta (Cloud API) y el **número de prueba gratis**. Ese número habla con hasta 5 teléfonos verificados y no pide verificar el negocio.

**Estado al 24-nov-2026:** el código está listo y probado contra una API de Meta simulada a nivel HTTP. **Todavía no se conectó a Meta:** no se creó ninguna app ni número, y no se tocó Railway. Todo eso lo hace Hans con esta guía (unos 30 minutos). El simulador (`bot-sim`) sigue igual y no se toca.

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
