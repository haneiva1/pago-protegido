# Usuarios: entrevistas y pilotos

Esta plantilla sirve para registrar cada conversación con vendedores (y compradores) y cada piloto. Antes de Trato, Hans ya hizo entre 12 y 15 entrevistas en persona con comercios de La Paz (mar–jun 2026), resumidas abajo; las entrevistas de Trato (con esta plantilla y el formulario `/piloto`, ver el [CHANGELOG](../CHANGELOG.md)) son el siguiente paso. La sección "Pilotos" se usa desde el plan de 30 días, cuando arrancan los 20 pilotos ([README](../README.md#plan-de-30-días)).

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

Las URL, la tabla completa y la verificación están en [OBSERVACION-PUBLICA.md](OBSERVACION-PUBLICA.md).

## Entrevistas en persona previas (mar–jun 2026)

Hans visitó en persona entre 12 y 15 comercios de La Paz (ropa, tecnología y alimentos, varios en San Miguel). Son anteriores a Trato y no siguieron esta plantilla; no hay filas individuales en el registro.

Lo que más se repitió:

- **La mayoría exige el pago por adelantado**, porque si no, no hay venta.
- **Hay desconfianza en el QR y en adoptar tecnología**, sobre todo en tiendas menos digitalizadas. Algunas usan QR, pero con dudas.
- **Cerca de la mitad (unos 6 a 8) vende a otras ciudades** y cobra por QR antes de enviar.

### Resumen de Hans

La mayoría de los comercios cobra antes de entregar y desconfía del QR; cerca de la mitad vende a otras ciudades y cobra por QR antes de enviar.

## Encuesta propia a negocios que venden por WhatsApp (feb-2026)

Encuestamos a 27 negocios que venden por WhatsApp (18 de productos y 9 de servicios). Es nuestra primera señal sobre el problema que ataca Trato:

- **6 de 27** viven cada semana el «ya pagué» que no se puede verificar; para 3 es su problema principal. Es el riesgo del vendedor que Trato ataca: la plata queda bloqueada y visible antes de enviar.
- **19 de 27** perdieron ventas en WhatsApp por desorden o demora.
- **15 de 27** aceptaron una entrevista de seguimiento; esas entrevistas son el siguiente paso para validar las ventas entre ciudades y la tarifa.

La encuesta fue anterior a Trato y no preguntó por envíos a otras ciudades. Eso lo cubren las entrevistas.

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

## Pilotos

| Fecha de inicio | Tienda (alias) | Ciudad | Pedidos con Trato | Confirmados | Con reclamo | Comentarios |
|---|---|---|---:|---:|---:|---|
| | | | | | | |

Los pedidos del piloto se pueden cruzar con las métricas on-chain (`contracts/scripts/metricas.sh`) por el escrow de cada compra.

## Bajas

| Fecha | Alias | Qué se borró |
|---|---|---|
| | | |
