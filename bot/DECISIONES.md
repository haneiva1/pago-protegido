# Decisiones del bot (fuera de SPEC.md)

Criterio: cuando el SPEC no decide algo, se elige **la opción más simple que respete el SPEC**, igual que en la app.

## Producto y conversación

1. **Tuteo y español boliviano:** "plata", "despacha", "encomienda", "nomás", "¡Ya!". La app también tutea. La moneda siempre es "USD de prueba"; un test revisa todos los textos contra "cripto", "token", "blockchain", "stellar" y "xlm".
2. **Si el mensaje trae producto, precio y días, el link se crea sin pedir confirmación.** Así se cumple la demo de 30 segundos. Un link equivocado no cuesta nada: es de un solo uso y basta con no compartirlo.
3. **Si falta algo, se pregunta en orden:** producto → precio → días. Para los días hay botones "1 día", "3 días" y "7 días". Lo nuevo reemplaza lo viejo, y cualquier comando global (mis ventas, saldo, cancelar…) corta la pregunta.
4. **La conversación guiada se olvida a los 30 minutos sin respuesta.** Las sesiones viven en memoria: si el bot se reinicia a mitad de una pregunta, el vendedor vuelve a escribir.
5. **Cómo se lee el precio:**
   - Acepta "450bs", "Bs. 450", "Bs450", "Bs 1.200", "1.200,50", "450.-", "450 pesos", "450 bolivianos" y "5 mil". En Bolivia "pesos" es coloquial para bolivianos.
   - Si hay varios montos con moneda, gana el mayor ("zapatillas 40 Bs 450" → 450).
   - Sin moneda, gana el que sigue a "a/por/precio/cuesta". Si tampoco hay, el último número que no sea talla, número, modelo ni medida (GB, ml, cm…).
   - Si el precio viene en dólares ("$us 30", "40 dólares"), pregunta el monto en Bs: los links son en Bs (SPEC §6).
   - En la respuesta a "¿Qué vas a vender?" los números quedan en el nombre ("iPhone 13").
6. **Cómo se leen los días:** "3 días", "en 3 d", "tres días", "mañana" / "hoy" / "al toque" (1), "pasado mañana" (2), "una semana" (7) y "dos semanas" (14). Fuera de 1 a 15 se vuelve a preguntar, el mismo rango de la app.
7. **Código del pedido = el "PP-4821" que genera la app** (ver 41). Para pedidos viejos sin `code`, el sufijo hex del slug (6 caracteres). También se acepta el slug completo. La búsqueda es solo dentro de los pedidos del vendedor que escribe.
8. **Al crear el link, el bot manda tres mensajes:** el link con el código, "Reenvíale esto a tu cliente 👇" y el texto listo para el comprador, el mismo de `waText("link")` de la app. En WhatsApp se reenvía con dos toques.
9. **"saldo"** = saldo de la billetera (`balance` de la app) + lo que está protegido en pedidos pagados o enviados (suma en Bs).
10. **"enviado" sin guía:** el bot la pide en el mensaje siguiente. La guía mínima es de 3 caracteres, como en la app.

## No custodia

11. **El bot nunca tiene llaves de billeteras ni firma nada.** Para marcar enviado, manda el link `/panel?enviar=…&evidencia=…` y el vendedor firma en su billetera (APP-ENDPOINTS.md §3). El mensaje lo dice: "Yo no puedo firmar por ti".
12. **El bot no cambia el estado de nada.** Solo crea links (`POST /api/links`, que no va on-chain) y lee estados.

## Identidad

13. **El vendedor se identifica por su número de WhatsApp**, que la app guardó al registrarse, y el número se traduce a su clave pública (APP-ENDPOINTS.md §1). Igual que en la app (DECISIONES 15 de la app), las acciones que no van on-chain no firman un desafío. Es aceptable en testnet.
14. **Plan B mientras falte `/api/bot/sellers`:** `vincular <clave pública>`, que solo funciona si esa tienda registró ese mismo WhatsApp. El vínculo se guarda en `data/bot-state.json`.
15. **Números:** se guardan solo con dígitos. Si quedan 8 (celular boliviano), se antepone 591.

## Avisos

16. **Consulta periódica, no websockets**, como la app (DECISIONES 11 de la app). Por defecto cada 10 s (`POLL_INTERVAL_MS`).
17. **Qué se avisa:**

    | Estado nuevo | Al vendedor | Al comprador (si hay número) |
    |---|---|---|
    | `pagado` | "tu cliente pagó… el pago está GUARDADO", despacha antes del `ship_deadline` y marca enviado | anti-presión + "si no lo envían hasta el <fecha>, te lo devolvemos automáticamente" |
    | `enviado` | confirmación del envío, con la hora de liberación | "¿Te llegó?" con "Pagar al vendedor", "Tengo un problema" y "Necesito más tiempo" |
    | `enviado` + `extended` | "tu cliente pidió más tiempo", con la hora nueva | — (lo pidió él en la web) |
    | `liberado` | "¡Liberado!" con el neto en USD de prueba | — |
    | `en_disputa` | "Reclamo abierto" con el motivo | "hay un reclamo", sube tus pruebas |
    | `resuelto` | el reparto del revisor | el reparto del revisor |
    | `devuelto` | "no se marcó el envío a tiempo. Devolvimos Bs … al comprador" | "te devolvimos Bs …" |
    | `enviado`, a 48 h, 24 h y 2 h del `deadline` | — | recordatorio de la liberación automática (cada hito una vez) |

18. **Un aviso por cambio de estado.** El último estado visto de cada pedido queda en `data/bot-state.json`, así un reinicio no repite avisos. Un pedido nuevo para el bot cuenta como si viniera de "Esperando pago".
19. **El WhatsApp del comprador nunca sale de la vista pública del pedido.** El bot lo recibe solo por `/api/bot/changes`, que exige la clave del bot (APP-ENDPOINTS.md §4).
20. **Ventana de 24 horas de WhatsApp:** fuera de las 24 h desde el último mensaje de la persona, Meta solo deja mandar plantillas aprobadas. En la prueba, el vendedor siempre habló hace poco con el bot. Cómo se resuelve: ver 48.

## Técnicas

21. **Stack:**
    - Node 22+ con TypeScript, ejecutado por `tsx`, sin compilar.
    - Servidores con `node:http`, sin frameworks.
    - Tests con Vitest y Playwright 1.65.1, la misma versión de la app, para reutilizar el Chromium ya instalado.
22. **Motor puro:** `engine/step(sesión, texto, ahora)` devuelve `{ sesión, respuestas, comando }`. `bot.ts` ejecuta el comando contra la app y arma la respuesta con `engine/messages.ts`, que también es puro.
23. **Graph API `v23.0` por defecto** (`WA_GRAPH_VERSION`). `WA_APP_SECRET` es obligatoria y se exige `X-Hub-Signature-256` (ver 50). El webhook responde 200 al instante y descarta los `wamid` repetidos, porque Meta reintenta.
24. **Puertos:** simulador 3030, app de mentira 3031, webhook 3040. El e2e usa 3130 y 3131 para no chocar con `npm run sim`.
25. **El simulador manda todo por Server-Sent Events,** tanto las respuestas como los avisos del poller. Muestra dos chats, vendedor y comprador, para ver los dos lados de los avisos.
26. **App de mentira (`src/mock/app-mock.ts`):** imita las rutas reales de la app v2 (mismas formas, mismos errores en español y mismo cálculo de comisiones y de protección). Sirve para los tests, para el e2e y para `npm run sim:demo`, que suma botones para simular al comprador, al vendedor firmando, al revisor, "Necesito más tiempo" y la devolución por no despachar.

## Anti-fraude (ronda 2)

27. **Auténtico = dominio canónico exacto + `/p/<slug>` + el pedido existe.**
    - Canónicos: el host (con puerto) de `PP_APP_URL` y el de `PP_PUBLIC_URL`. Si no, los links que el bot da por un túnel saldrían como falsos.
    - Se ignoran el esquema (http/https), la query y el `#`. El slug tiene que tener la forma de `slugify` de la app (hasta 4 palabras, 32 caracteres, más 6 hex). Si no, el bot ni consulta la app.
    - Todo lo demás es `⚠️ Este link NO es de Pago Protegido. No pagues.`, incluso un link real de la app que no es de pago (`/panel`, `/vender`): el pedido dice "en cualquier otro caso".
28. **El motivo va en una segunda línea:** acortador, dominio que imita a la marca, `usuario@` escondido, otro dominio, ruta que no es de pago, slug inválido o pedido inexistente. Solo cambia la explicación, nunca el veredicto.
    - Imitación: se compara un "esqueleto" del dominio (sin tildes, guiones ni puntos; 0→o, 1/i→l, rn→m, letras cirílicas y griegas → latinas) con "pagoprotegido" y con el nombre del dominio canónico. Contenerlo o estar a 1–2 letras cuenta como imitación.
29. **Si la app no responde,** el bot no dice ni auténtico ni falso: "No pagues hasta que te confirme". Decir "falso" de un link real también rompe la confianza.
30. **Un link reenviado se verifica solo,** para cualquier número y antes de buscar la tienda. Excepción: la guía de un envío (`enviado <código> <link de la foto>` o la respuesta a "¿con qué guía?"). Máximo 3 links por mensaje, una respuesta por link.
31. **El verificador muestra lo mismo que la página pública** `/p/<slug>` (tienda, producto, precio, estado). Los estados se dicen para el comprador ("Pagado", no "Pagado (despacha)"). Si el pedido ya está pagado, agrega: "si te piden pagarlo otra vez, es estafa".
32. **Reportes en un archivo JSONL** (`REPORTS_FILE`, por defecto `data/reportes.jsonl`, ignorado por git), no en SQLite: es lo más simple y no suma dependencias. Cada línea guarda fecha, número de quien reporta, link, host, veredicto del verificador y el mensaje (500 caracteres como máximo).
33. **Anti-presión al comprador, con el texto exacto del pedido.**
    - Al pagar, va en un mensaje propio, con el código y el monto.
    - Al marcar enviado, va dentro de "¿Te llegó?". Es un mensaje menos y la acción ("Pagar al vendedor") queda última en el chat.
    - Si el comprador deja su WhatsApp después de que el bot vio el cambio de estado, le llega igual, una vez por etapa.
34. **Recordatorios 48 h, 24 h y 2 h antes del `deadline` que reporta la app, que ahora cuenta desde el envío.**
    - Con los contratos v2, la app pasa en `deadline` el `release_at` de `pp_guardian`: el fin de la revisión, contado desde `mark_shipped` (y no desde el pago, como en v1). Es la hora que ejecuta el contrato, así que el bot no calcula otra.
    - Antes del envío `deadline` es null: no hay hora de liberación ni recordatorios. Lo que corre al pagar es el plazo de despacho (`ship_deadline`), que el bot le dice al vendedor y al comprador.
    - Un hito que cae antes del envío no se manda (solo pasa con revisiones más cortas que 48 h, como en el modo demo).
    - Si la hora cambia (por "Necesito más tiempo", ver 44), los recordatorios se vuelven a programar con la hora nueva: los hitos ya mandados que quedan en el futuro se mandan otra vez.
    - Si se juntan varios hitos (el bot estuvo apagado), va solo el más urgente.
35. **Modo demo `DEMO_MINUTES=1`:** cada "hora" de los recordatorios dura un minuto. En `sim:demo` también se escalan los plazos de la app de mentira: despacho = días × 24 minutos y revisión desde el envío = (días + 3) × 24 minutos. El texto dice el tiempo que de verdad falta ("unas 20 h" o "unos 48 min"). El botón "Adelantar al próximo recordatorio" mueve el plazo al siguiente hito.
36. **"Tengo un problema" y "Necesito más tiempo" llevan a la página del pedido.**
    - Van como link en el texto y como botones de respuesta: WhatsApp no deja poner URLs en los botones de respuesta, y el botón con URL (CTA) admite uno solo. Al tocar un botón, el bot contesta con el link.
    - "Necesito más tiempo" ahora existe en la app (ver 44). El bot no lo ejecuta: explica que se toca en la página del pedido, una sola vez, y sigue advirtiendo que nadie alarga el plazo por chat. Un estafador podría ofrecer "más tiempo" a cambio de que confirmes.
37. **Aviso de registro al vendedor.** El registro pasa en la web, así que el bot lo dice:
    - al invitar a registrarse;
    - al vincular el número;
    - la primera vez que una tienda le escribe, una sola vez (`greeted` en `BOT_STATE_FILE`).
38. **"Ojo: el QR de pago nunca está a nombre de una persona"** va en el primer mensaje del link, el del vendedor, no en el texto que se reenvía al cliente.

## Ajustes del capataz (consejo de mercado)

39. **Aplicados (ronda 2):**
    - Nunca "¡Te pagaron!": "tu cliente pagó Bs X y el pago está GUARDADO, todavía no en tu cuenta… Vale tu panel, no una captura."
    - El código del pedido va en todos los avisos.
    - El reclamo también le llega al comprador ("sube tus pruebas").
    - El recordatorio suma "Sí, todo bien".
    - Test de palabras prohibidas: cripto, token, stablecoin, wallet, llave, blockchain, garantía, seguro y custodia. "La llave de tu billetera" pasó a ser "solo tú confirmas, desde tu billetera".
40. **Pendientes de la ronda 2: qué se aplicó con la app v2 y qué sigue pendiente.**
    - **Código "PP-4821": aplicado** (41).
    - **Botones del recordatorio:** quedan [Sí, todo bien] [Tengo un problema] [Necesito más tiempo]; WhatsApp admite 3. "Todavía no llegó", escrito, equivale a "Necesito más tiempo". Si el comprador ya lo usó, el botón no aparece.
    - **"Si no lo envían hasta el <fecha>, te lo devolvemos automáticamente" y el aviso de devolución a los dos lados: aplicado** (43). Ahora es cierto: la app abre la disputa como plataforma y `pp_arbiter.refund_unshipped` devuelve la plata sin que el comprador reclame.
    - **"Despacha antes del <fecha>": aplicado** con `ship_deadline` (43). **"Suban sus pruebas hasta el <fecha>": sigue pendiente**, la app no tiene fecha límite de pruebas.
    - **Quién paga la protección: aplicado** (42).
    - **"Ya puedes retirar Bs 450 a tu banco o dejarlos en dólares digitales": pendiente.** En testnet no hay retiro a banco y la moneda es "USD de prueba" (DECISIONES 1). Sigue "Te llegaron X USD de prueba".
    - **Texto para el cliente ("Te vendo con Pago Protegido: pagas con QR…"): pendiente.** Se mantiene igual al de `waText("link")` de la app (DECISIONES 8), que en v2 cambió a "…de <tienda>… un tercero revisa el reclamo". Para cambiarlo hay que tocar los dos lados a la vez.

## Ronda 3: alineado con la app v2 (contratos v2)

41. **Código PP-#### de la app en todos los mensajes.**
    - El bot muestra `order.code`, y si un pedido viejo no lo tiene, el sufijo hex del slug.
    - En `estado` y `enviado` acepta "PP-4821", "pp 4821", "pp4821" o solo "4821", además del hex y el slug. La búsqueda sigue siendo solo dentro de los pedidos del vendedor que escribe (7).
42. **Quién paga la protección: el link se crea con `proteccion: "comprador"` y se puede regalar con un botón.**
    - Así se mantiene la demo de 30 segundos (DECISIONES 2): el link sale de una, sin preguntas.
    - El primer mensaje muestra cuánto paga el cliente y cuánto recibe el vendedor, y trae [La paga mi cliente] [Yo la regalo] [Vender otro].
    - "Yo la regalo" (botón o texto, con o sin código) llama `PATCH /api/links/:slug { sellerPubkey, proteccion }`. Sin código, cambia el último link de esa tienda que sigue esperando pago. Si el cliente ya empezó a pagar, la app responde 409 y el bot muestra ese error.
    - El texto que se reenvía al cliente dice el precio del producto, igual que el de la app (40).
43. **Plazo de despacho y devolución automática (`devuelto`).**
    - Al pagar, el vendedor recibe "Despacha antes del <ship_deadline>… Si no se marca enviado a tiempo, la plata vuelve sola a tu cliente", y el comprador, "Si no lo envían hasta el <fecha>, te lo devolvemos automáticamente".
    - Pasado `ship_deadline`, `enviado <código>` ya no manda el link para firmar: el contrato rechazaría el envío (`#26 ShipDeadlinePassed`). Responde que el plazo venció y que la plata vuelve al comprador.
    - Con el estado `devuelto` se avisa a los dos lados. El monto es el reparto que informa la app o, si no viene, el total menos 0,3% de Trustless Work y el `platform_fee` del pedido, en Bs con el tipo de cambio del pedido.
44. **"Necesito más tiempo" (`extend`).**
    - Lo toca el comprador en la página del pedido, una sola vez, antes de la hora de liberación, y suma otra ventana de revisión. El bot nunca lo ejecuta.
    - Cuando `extended` pasa de 0 a 1, el vendedor recibe "tu cliente pidió más tiempo" con la hora nueva, y los recordatorios se reprograman (34).
    - El recordatorio ya no ofrece el botón si el comprador lo usó.
45. **Categoría "Celular" inferida del producto.** Si el producto menciona celular, teléfono, Samsung, Galaxy, iPhone, Xiaomi, Redmi, Poco, Motorola, Huawei, Honor, Realme, Oppo, Tecno o Infinix, el link se crea con `category: "Celular"` y la app pide el IMEI al despachar. Si no, "Otro". La frase del guion del video, "vendo celular Samsung A54 a 1800 bs entrega 3 días", crea el link de una (test en `engine.test.ts` y `bot.test.ts`).
46. **"Revisor" en lugar de "árbitro" y "Pagar al vendedor" en lugar de "Recibí conforme"**, como la app (DECISIONES 61 de la app). El test de textos suma las palabras prohibidas legales que faltaban: árbitro, arbitraje, garantizado, 100%, plataforma de pagos y pasarela.

## Perfil público de la tienda

47. **"mi perfil" (también "perfil", "perfil de mi tienda", "link de mi tienda")** responde con el link del perfil público (`<app>/tienda/<slug>`) y un texto listo para la bio de Instagram o TikTok.
   - El `slug` viene en `GET /api/bot/sellers` (la app lo asigna al crear la tienda).
   - Si la app no lo manda (una versión vieja), el bot pide abrir el panel.
   - El mensaje no repite los números (cambian con cada venta: el perfil los muestra en vivo) ni el teléfono.

## WhatsApp real (24-nov-2026)

48. **Ventana de 24 horas: la persona escribe primero y ningún aviso se pierde.** Fuera de la ventana el aviso queda guardado y sale apenas la persona escribe; con `WA_TEMPLATE_AVISO`, además se le manda una plantilla de utilidad. La plantilla es opcional porque depende de que Meta la apruebe. Detalle en [`docs/WHATSAPP.md`](../docs/WHATSAPP.md) §9.
   - Por pedido y por parte se guarda solo el aviso más nuevo: quien vuelve a los dos días lee el estado actual, no la historia.
   - El comprador abre su ventana con «Recibir los avisos por WhatsApp» (`NEXT_PUBLIC_BOT_WHATSAPP` en la app) o escribiéndole al bot. Sus avisos van solo al número que dejó al pagar: el código del pedido, escrito desde otro número, no los muestra.
   - El texto que la tienda reenvía al cliente no cambia (8).
49. **La instancia se elige con `PP_APP_URL` y `STELLAR_NETWORK`, y se comprueba al arrancar** contra `GET /api/info` (sin `red`, es testnet). Si no coinciden, no arranca. El estado guardado es de una instancia: al cambiar, se descarta todo menos las ventanas de 24 horas. El simulador no hace esta comprobación.
50. **En modo WhatsApp, lo que falta es un error, no un valor por defecto:** las cuatro `WA_…`, `PP_APP_URL`, `PP_BOT_KEY` y una URL pública con `https`. `WA_APP_SECRET` pasó a ser obligatoria: sin la firma, cualquiera podría escribir en nombre de una tienda. `--mock` no se puede combinar con `--whatsapp`.
51. **Un mensaje sin teléfono** (nombres de usuario de WhatsApp, 2026) llega con el ID de la persona para este negocio. El bot le contesta por `recipient` y le pide que escriba desde su número: sin teléfono no hay tienda ni compra que buscar. El verificador de links sí funciona.
52. **Un corte por tiempo no se reintenta.** Meta puede haber recibido el mensaje y la persona lo vería dos veces. Se reintentan (2 veces) los errores pasajeros y los cortes de conexión.
53. **Kapso es un modo, no un reemplazo** (`WA_PROVIDER=kapso`; por defecto, Meta directo sin cambios). Su proxy habla el idioma de la Cloud API, así que solo cambian la URL, la credencial (`X-API-Key`) y la firma del webhook.
   - Se recomienda su webhook crudo de Meta (`kind: meta`), y se acepta también el formato propio de Kapso: los dos se leen con el mismo lector.
   - El filtro por número es más estricto que con Meta: lo que no dice a qué número llegó, se ignora. Kapso reenvía todos los campos de Meta y solo se atiende `messages`.
   - No se siguen redirecciones: `fetch` reenviaría `X-API-Key` a otro dominio.
   - Se reintenta también el 409 sin motivo (otro mensaje a esa persona todavía está saliendo).
