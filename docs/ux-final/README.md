# Pasada de UX para la final (25-nov-2026)

Capturas a 390 px, antes (main `cee3120`) y después, del mismo recorrido con pagos reales en testnet: crear link, compartir y pagar hasta «Tu pago está guardado». Las medidas salen del recorrido automático (Playwright, 390×844).

| Comprador, del link al pago confirmado | Antes | Después |
|---|---|---|
| Pantallas | 5 (link, hoja de entrega, QR, espera, confirmado) | 3 (link con los datos, QR con la espera adentro, confirmado) |
| Toques | 6 | 5 (2 si ya compró en ese celular) |
| Campos a la vista | 6 | 2 |
| Palabras en pantalla (suma) | 736 | 358 |
| Alto de la pantalla del link / confirmado | 1674 / 2729 px | 1424 / 1857 px |

| Vendedor | Antes | Después |
|---|---|---|
| Controles a la vista al crear el link | 10 | 2 y el botón |
| Alto del formulario | 745 px | 486 px |
| Acciones para mandar el link | 6 | 2 («Enviar por WhatsApp» y «Copiar») |
