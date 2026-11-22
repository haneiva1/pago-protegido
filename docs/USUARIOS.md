# Usuarios: entrevistas y pilotos

Esta plantilla sirve para registrar cada conversación con vendedores (y compradores) y cada piloto. Esta semana sirve para medir la validación con entrevistas y con el formulario `/piloto` (ver el [CHANGELOG](../CHANGELOG.md)). La sección "Pilotos" se usa desde el plan de 30 días, cuando arrancan los 20 pilotos ([README](../README.md#plan-de-30-días)).

**Segmento inicial:** vendedores de celulares y electrónica de Bs 1.000 a 7.000 que envían por encomienda a otras ciudades.

## Nota de consentimiento (leer antes de cada entrevista)

> "Estamos armando Trato (antes Pago Protegido), un pago contra confirmación de entrega para ventas por redes. ¿Podemos tomar notas de esta conversación?
> - Usamos lo que nos cuentes solo para mejorar el producto.
> - No publicamos tu nombre ni tu número.
> - Si citamos una frase tuya, lo hacemos sin identificarte, salvo que nos autorices.
> - Puedes pedirnos en cualquier momento que borremos tus datos."

Reglas para quien registra:

- **Sin consentimiento, no se anota nada.** Ni nombre ni cita.
- **Lo mínimo:** nombre de la tienda o un alias, y la ciudad.
- **Datos personales:** **nunca** se escriben aquí números de WhatsApp, CI, direcciones, cuentas bancarias ni capturas con datos personales.
- **Citas:** textuales y cortas. Si la persona no autorizó identificarla, se usa un alias ("Tienda A").
- **Piloto:** quien participa usa **USD de prueba en testnet** y lo sabe. No hay dinero real hasta que haya mainnet con opinión legal.
- **Borrado:** si alguien pide que borremos sus datos, se elimina su fila y se anota la fecha del borrado en la sección "Bajas".

## Regla de lectura (escrita antes de la primera entrevista)

- Con menos de 10 vendedores no concluimos nada: reportamos los conteos tal cual («2 de 4»).
- **Señal a favor del problema:** 3 o más de cada 10 vendedores cuentan al menos una venta a otra ciudad que se cayó en el último mes porque nadie quiso arriesgarse primero.
- **Señal en contra:** menos de 3 de cada 10. En ese caso probamos el lado del comprador u otro segmento antes de construir más.
- Preguntamos por hechos pasados antes de mostrar Trato.
- Anotamos cómo llegamos a cada persona y todas las negativas.

## Observación de fuentes públicas (21-nov-2026)

No son entrevistas. Revisamos páginas públicas de tiendas de celulares y electrónica y notas de prensa. Escribimos la regla antes de mirar: «señal a favor si 3 o más de cada 10 tiendas revisadas piden el pago antes de enviar a otra ciudad».

- **Tiendas revisadas:** 36 (Santa Cruz, La Paz, El Alto y Cochabamba). 8 piden el pago antes del envío a otra ciudad. Ninguna confirma en su página contra entrega a otra ciudad. 20 no publican cómo cobran. Con la regla, 8 de 36 no llega al umbral: **resultado no concluyente**. De las 11 que publican una política clara, 8 cobran antes.
- **Estafas al comprador:** la prensa documenta en 2024–2026 ventas falsas de celulares con adelanto por QR y «envíos a todo el país» en Santa Cruz, La Paz, Cochabamba, Sucre y Oruro (Red Uno, El País, Bolivia Verifica).
- **Comprobantes falsos al vendedor:** hay casos en Cochabamba, Santa Cruz y La Paz, en ventas dentro de la misma ciudad.
- **Lo que ya existe:** Correos de Bolivia ofrece «puerta a puerta por cobrar» por Bs 2,50 adicionales (sep-2026), y hay couriers con cobro contra entrega.
- **Lo que no sabemos:** si los vendedores honestos pierden ventas por desconfianza. No encontramos ninguna fuente pública. Es lo que preguntan las entrevistas.

Las URL y la tabla completa están en el registro del equipo.

## Registro

| Fecha | Tienda o persona | Ciudad | Cómo lo contactamos | Qué vende | ¿Vende a otras ciudades? | Ventas perdidas al mes | ¿Quién debería pagar? | Cita | ¿Piloto? |
|---|---|---|---|---|---|---|---|---|---|
| AAAA-MM-DD | *(alias si no autorizó nombre)* | | conocido / grupo de compraventa / Marketplace / tienda | | sí / no | *(número aproximado y por qué)* | comprador / vendedor / mitad / nadie | "…" | sí / no / después |

### Guía rápida de preguntas

1. ¿Qué vendes, a qué precio y por qué redes?
2. ¿Vendes a otras ciudades? ¿Cómo envías? (encomienda, flota, en persona)
3. ¿Cómo te pagan hoy (QR, transferencia, efectivo)? ¿Quién paga primero?
4. En el último mes, ¿cuántas ventas se cayeron porque el cliente no quiso pagar antes o porque tú no quisiste enviar sin cobrar?
5. ¿Te pasó alguna estafa o algún comprobante falso?
6. Si el pago queda retenido hasta que el cliente confirma, ¿quién debería pagar la comisión y cuánto es razonable?
7. ¿Probarías con tus próximos pedidos, con USD de prueba?

## Encuesta previa (feb-2026)

**Qué es y qué no es.** Del 11 al 13 de febrero de 2026 el equipo hizo una encuesta para un proyecto anterior sobre ventas por WhatsApp. Respondieron 27 negocios: 18 venden productos y 9, servicios. **No se hizo para Trato**: no pregunta por ventas a otra ciudad, por encomiendas ni por pagos retenidos, y no es del segmento inicial. Por eso no cuenta como entrevista ni entra en la regla de lectura de arriba. La dejamos acá como antecedente, sin nombres, contactos ni citas.

| Pregunta | Respuestas (de 27) |
|---|---|
| Parte de sus ventas que entra por WhatsApp | menos del 30%: 8 · 30–60%: 11 · 60–90%: 7 · más del 90%: 1 |
| Perdieron ventas por desorden o demora en WhatsApp | sí: 19 (17 algunas al mes, 2 algunas por semana) · no: 8 |
| En una semana normal les pasa… (podían marcar varias) | "Me preguntan lo mismo todo el tiempo": 14 · "Tardo en responder y el cliente se va": 8 · "Me dicen 'ya pagué' y es difícil verificar": 6 · "Se me pasan pedidos": 5 · "Entregas mal coordinadas": 2 · precios: 2 · stock: 2 · "No tengo mayores problemas": 8 |
| El problema que más les afecta | preguntas repetidas: 7 · demora: 6 · ninguno: 5 · pedidos perdidos: 3 · "ya pagué": 3 · precios: 2 · stock: 1 |
| Horas al día atendiendo WhatsApp | menos de 30 min: 6 · 30–60 min: 8 · 1–2 h: 7 · 2–4 h: 6 |
| Aceptan una entrevista de 15 minutos (para ese proyecto) | sí: 15 · no: 9 · sin respuesta: 3 |

**Lo único que tomamos para Trato:** 6 de 27 marcaron que en una semana normal les dicen "ya pagué" y les cuesta verificarlo, y para 3 es el problema que más les afecta. Es el lado del vendedor que describe [PROBLEMA.md](PROBLEMA.md#2-el-lado-del-vendedor-comprobantes-de-pago-falsos). No dice nada sobre ventas entre ciudades ni sobre si usarían Trato: eso lo tienen que decir las entrevistas del Registro.

## Pilotos

| Fecha de inicio | Tienda (alias) | Ciudad | Pedidos con Trato | Confirmados | Con reclamo | Comentarios |
|---|---|---|---:|---:|---:|---|
| | | | | | | |

Los pedidos del piloto se pueden cruzar con las métricas on-chain (`contracts/scripts/metricas.sh`) por el escrow de cada compra.

## Bajas

| Fecha | Alias | Qué se borró |
|---|---|---|
| | | |
