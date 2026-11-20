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

## Registro

| Fecha | Tienda o persona | Ciudad | Qué vende | ¿Vende a otras ciudades? | Ventas perdidas al mes | ¿Quién debería pagar? | Cita | ¿Piloto? |
|---|---|---|---|---|---|---|---|---|
| AAAA-MM-DD | *(alias si no autorizó nombre)* | | | sí / no | *(número aproximado y por qué)* | comprador / vendedor / mitad / nadie | "…" | sí / no / después |

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
