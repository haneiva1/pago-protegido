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
7. **Código del pedido = sufijo hex del slug** (6 caracteres). También se acepta el slug completo. La búsqueda es solo dentro de los pedidos del vendedor que escribe.
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
    | `pagado` | "¡Te pagaron! Despacha y marca enviado" | — |
    | `enviado` | confirmación del envío | "¿Te llegó?" con el link para "Recibí conforme" |
    | `liberado` | "¡Liberado!" con el neto en USD de prueba | — |
    | `en_disputa` | "Reclamo abierto" con el motivo | — |
    | `resuelto` | el reparto del árbitro | el reparto del árbitro |
    | `enviado`, a menos de `REMINDER_HOURS` (24 h) del plazo | — | recordatorio de la liberación automática (una sola vez) |

18. **Un aviso por cambio de estado.** El último estado visto de cada pedido queda en `data/bot-state.json`, así un reinicio no repite avisos. Un pedido nuevo para el bot cuenta como si viniera de "Esperando pago".
19. **El WhatsApp del comprador nunca sale de la vista pública del pedido.** El bot lo recibe solo por `/api/bot/changes`, que exige la clave del bot (APP-ENDPOINTS.md §4).
20. **Ventana de 24 horas de WhatsApp:** fuera de las 24 h desde el último mensaje de la persona, Meta solo deja mandar plantillas aprobadas. En la prueba, el vendedor siempre habló hace poco con el bot. Para producción hay que aprobar plantillas para los avisos (pendiente, no hace falta en testnet).

## Técnicas

21. **Stack:**
    - Node 22+ con TypeScript, ejecutado por `tsx`, sin compilar.
    - Servidores con `node:http`, sin frameworks.
    - Tests con Vitest y Playwright 1.65.1, la misma versión de la app, para reutilizar el Chromium ya instalado.
22. **Motor puro:** `engine/step(sesión, texto, ahora)` devuelve `{ sesión, respuestas, comando }`. `bot.ts` ejecuta el comando contra la app y arma la respuesta con `engine/messages.ts`, que también es puro.
23. **Graph API `v23.0` por defecto** (`WA_GRAPH_VERSION`). Si está `WA_APP_SECRET`, se exige `X-Hub-Signature-256`. El webhook responde 200 al instante y descarta los `wamid` repetidos, porque Meta reintenta.
24. **Puertos:** simulador 3030, app de mentira 3031, webhook 3040. El e2e usa 3130 y 3131 para no chocar con `npm run sim`.
25. **El simulador manda todo por Server-Sent Events,** tanto las respuestas como los avisos del poller. Muestra dos chats, vendedor y comprador, para ver los dos lados de los avisos.
26. **App de mentira (`src/mock/app-mock.ts`):** imita las rutas reales (mismas formas, mismos errores en español y mismo cálculo de comisiones) y las propuestas. Sirve para los tests, para el e2e y para `npm run sim:demo`, que suma botones para simular al comprador, al vendedor firmando y al árbitro.

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
    - Al marcar enviado, va dentro de "¿Te llegó?". Es un mensaje menos y la acción ("Recibí conforme") queda última en el chat.
    - Si el comprador deja su WhatsApp después de que el bot vio el cambio de estado, le llega igual, una vez por etapa.
34. **Recordatorios 48 h, 24 h y 2 h antes del `deadline` que reporta la app.**
    - El pedido dice "el plazo arranca cuando se marca enviado", pero la app cuenta el plazo desde el fondeo (DECISIONES 4 de la app), y ese es el que ejecuta el contrato. El bot no calcula otro plazo: le diría al comprador una hora distinta de la real, y la plata se liberaría antes de lo que él cree.
    - Lo que arranca al marcar enviado son los recordatorios: un hito que cae antes del envío no se manda.
    - Si se juntan varios hitos (el bot estuvo apagado), va solo el más urgente.
    - Si la app cambia el plazo para que cuente desde el envío, el bot no cambia.
35. **Modo demo `DEMO_MINUTES=1`:** cada "hora" de los recordatorios dura un minuto. En `sim:demo` también se escala el plazo de la app de mentira: (días + 3) × 24 minutos. El texto dice el tiempo que de verdad falta ("unas 20 h" o "unos 48 min"). El botón "Adelantar al próximo recordatorio" mueve el plazo al siguiente hito.
36. **"Tengo un problema" y "Necesito más tiempo" llevan a la página del pedido.**
    - Van como link en el texto y como botones de respuesta: WhatsApp no deja poner URLs en los botones de respuesta, y el botón con URL (CTA) admite uno solo. Al tocar un botón, el bot contesta con el link.
    - La app no tiene prórroga. "Necesito más tiempo" explica que la única forma de frenar la liberación es abrir un reclamo antes de la hora y que nadie alarga el plazo por chat. Un estafador podría ofrecer "más tiempo" a cambio de que confirmes.
37. **Aviso de registro al vendedor.** El registro pasa en la web, así que el bot lo dice:
    - al invitar a registrarse;
    - al vincular el número;
    - la primera vez que una tienda le escribe, una sola vez (`greeted` en `BOT_STATE_FILE`).
38. **"Ojo: el QR de pago nunca está a nombre de una persona"** va en el primer mensaje del link, el del vendedor, no en el texto que se reenvía al cliente.

## Ajustes del capataz (consejo de mercado)

39. **Aplicados:**
    - Nunca "¡Te pagaron!": "tu cliente pagó Bs X y el pago está GUARDADO, todavía no en tu cuenta… Cobras cuando tu cliente confirme o el <fecha>. Vale tu panel, no una captura."
    - El código del pedido va en todos los avisos.
    - El reclamo también le llega al comprador ("sube tus pruebas").
    - El recordatorio suma "Sí, todo bien".
    - Test de palabras prohibidas: cripto, token, stablecoin, wallet, llave, blockchain, garantía, seguro y custodia. "La llave de tu billetera" pasó a ser "solo tú confirmas, desde tu billetera".
40. **No aplicados todavía, y por qué:**
    - **Código "PP-4821":** la app identifica el pedido por los 6 hex del slug. Un número propio lo tiene que generar y guardar la app (APP-ENDPOINTS.md §7). Mientras tanto, el bot usa el código hex en todos los mensajes.
    - **Botones del recordatorio [Sí, todo bien] [Todavía no llegó] [Tengo un problema]:** el pedido de esta ronda pide "Tengo un problema" y "Necesito más tiempo", y WhatsApp admite 3 botones. Quedó [Sí, todo bien] [Tengo un problema] [Necesito más tiempo]. "Todavía no llegó", escrito, equivale a "Necesito más tiempo".
    - **"Si no lo envían hasta el <fecha>, te lo devolvemos automáticamente" y el aviso "No enviado (ambos)":** hoy no es cierto. `pp_arbiter.refund_unshipped` exige un reclamo abierto y el plazo vencido, y la app no tiene un estado de devolución. El bot no promete lo que el contrato no hace (APP-ENDPOINTS.md §8).
    - **"Ya puedes retirar Bs 450 a tu banco o dejarlos en dólares digitales":** en testnet no hay retiro a banco y la moneda es "USD de prueba" (DECISIONES 1). Sigue "Te llegaron X USD de prueba".
    - **"Despacha antes del <fecha>" y "suban sus pruebas hasta el <fecha>":** la app no tiene fecha límite de despacho ni de pruebas. Se omite la fecha.
    - **Texto para el cliente ("Te vendo con Pago Protegido: pagas con QR…"):** se mantiene el de `waText("link")` de la app (DECISIONES 8), para que la web y el bot digan lo mismo. Hay que cambiarlo en los dos lados a la vez.
    - **Quién paga la protección:** necesita el campo en `POST /api/links` (APP-ENDPOINTS.md §6). Preguntarlo antes de crear el link rompe DECISIONES 2 (link sin confirmación, demo de 30 segundos), y el bot no podría aplicarlo. Queda especificado para cuando la app lo acepte.
