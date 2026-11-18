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
