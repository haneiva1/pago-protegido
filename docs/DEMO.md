# Demo en vivo: 3 minutos

**Objetivo:** que el jurado vea Trato (antes Pago Protegido), con transacciones reales en Stellar testnet (contratos v2), cuatro cosas:

1. el vendedor crea un link;
2. el comprador paga y su plata queda protegida;
3. cuando el comprador toca **"Pagar al vendedor"**, el vendedor cobra al instante;
4. en un reclamo, el revisor reparte, y el contrato **rechaza** mandar la plata a otra cuenta.

> **Video y capturas de la demo v3:** [`../demo/v3/trato-demo-v3.mp4`](../demo/v3/trato-demo-v3.mp4) (2:47, sin narrar, con subtítulos; descarga de 4,7 MB) y capturas clave en [`../demo/v3/`](../demo/v3/). Demo publicada desde el 21-nov, en testnet y con un despliegue paralelo de los contratos: [`/probar`](https://app-production-d0fc8f63.up.railway.app/probar).

Las cifras de este guion son las que verifica el e2e de la app (`app/e2e/pago-protegido.spec.ts`), con el tipo de cambio de la demo (11,70 Bs por USD; ver [TECNICO, Tipo de cambio](TECNICO.md#tipo-de-cambio)). El e2e completo (`npm run test:e2e` en `app/`) pasó 10/10 contra testnet el 20-nov-2026, ya con el nombre Trato. Las capturas están en [`../app/e2e/capturas/`](../app/e2e/capturas/), generadas por ese e2e contra testnet, y en [`../bot/docs/simulador.png`](../bot/docs/simulador.png).

## Montaje

| Pantalla | Qué tiene abierto |
|---|---|
| **Laptop** (proyectada) | Pestañas: ① `/panel` (vendedor), ② `/revisor` (con la clave del panel, `ARBITRO_PANEL_KEY`, ya ingresada), ③ stellar.expert del contrato `pp_arbiter` v2, ④ simulador del bot en http://localhost:3030 (opcional). |
| **Celular** (con espejo de pantalla o cámara) | El link del comprador `/p/<slug>`, abierto con la URL del túnel. |

### Preparación, 30 minutos antes

1. Deja la base de la demo limpia y levanta todo (en `app/`):

   ```bash
   npm run demo:reset   # 3 pedidos reales en v2: liberado, 70/30 y devuelto (un celular de Bs 2.500)
   npm run demo         # app en http://localhost:3020 (con PP_DEMO=1) + simulador del bot en http://localhost:3030
   ```

   - Next permite **un solo `next dev` por carpeta**: si hay otro `npm run dev` corriendo en `app/`, apágalo antes.
   - `npm run demo` arranca la app con `PP_DEMO=1`: "Pagar al vendedor" se habilita **1 minuto** después del envío (en producción, 2 h en la misma ciudad y 24 h a otra ciudad).
   - Pollar ya tiene registrado `localhost:3020`.
2. Abre el túnel para el celular:

   ```bash
   bash ../deploy/tunel.sh 3020
   ```

   Agrega la URL `https://….trycloudflare.com` en Pollar como **origen permitido** y **URL de retorno**. Si no lo haces, el login del vendedor con Google o correo falla desde el celular. El comprador no necesita login: firma con una llave creada en su navegador.
3. **Prepara el pedido del reclamo,** porque no entra en 3 minutos hacerlo en vivo:
   1. crea el link "Polera Adidas talla M", Bs 300, y elige **"Yo la regalo"** (el comprador paga Bs 300,00);
   2. págalo desde otra ventana privada;
   3. márcalo como enviado: empresa de envío, guía `OLVA-55821`, peso declarado y link de la foto del paquete;
   4. toca "Tengo un problema" (motivo: "Llegó dañado") y deja la versión del vendedor.
   Debe aparecer en `/revisor` → "Reclamos abiertos (1)".
4. Deja creada la tienda del vendedor ("Tienda Sofi", WhatsApp 591 7123 4567) y vacío el formulario de "Crear link".
5. Haz un ensayo completo.
6. Revisa el RPC: `curl -s https://soroban-testnet.stellar.org -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' -H 'Content-Type: application/json'` debe devolver `"healthy"`.

## Guion

| Tiempo | Pantalla (captura) | Qué haces | Qué dices |
|---|---|---|---|
| **0:00–0:15** | Landing (`01-landing-*`) | Muestras la portada | "Vender por Instagram o TikTok en Bolivia es desconfianza: el comprador teme no recibir y el vendedor recibe comprobantes falsos. Trato es un link de pago donde la plata queda guardada hasta que el comprador recibe." |
| **0:15–0:40** | Panel → crear link (`04-panel-primer-link-*`, `05-panel-link-creado-*`) | Creas "Zapatillas Nike talla 40", Bs 450, 3 días, con la protección a cargo del comprador. La vista previa dice **Bs 456,75**. Tocas "Compartir por WhatsApp". | "El vendedor crea el link en 20 segundos. La protección la paga el comprador: 1,5%, con mínimo de Bs 5 y tope de Bs 50; el vendedor también puede regalarla. También se puede crear desde WhatsApp con nuestro bot." *(Opcional: el simulador con "vendo zapatillas nike 40 a 450 bs entrega 3 días".)* |
| **0:40–1:15** | Celular: antes de pagar (`06-comprador-antes-de-pagar-celular`) → QR (`07-comprador-qr-rampa-simulada-celular`) → pagado (`08-comprador-pagado-celular`) | Abres el link y tocas **"🔒 Pagar Bs 456,75 con QR"**, luego "Simular pago del banco (modo práctica)" | "El comprador ve cómo lo protegemos. Paga con QR; acá la rampa del banco está simulada y la pantalla lo dice. Antes de pedir la firma, la app verifica que el contrato es el de Trustless Work con nuestros roles: **Contrato verificado**." Tocas **Ver en Stellar**. |
| **1:15–1:30** | Laptop: vendedor enviado (`09-vendedor-enviado-*`) → celular (`10-comprador-espera-para-pagar-celular`) | Eliges la empresa (Trans Copacabana), escribes la guía `SRV-2026-118734`, el peso declarado (1,2 kg) y el link de la foto, y tocas "Marcar como enviado" | "El vendedor registra el envío una sola vez: empresa, guía, peso y foto, y quedan fijos. Desde ahí corre el plazo de revisión: si el comprador no responde, el pago se libera al vencer. 'Pagar al vendedor' se habilita un rato después del envío (en la demo, 1 minuto), para que el comprador revise el producto. Mientras tanto, veamos un reclamo." |
| **1:30–2:15** | `/revisor` (`22-revisor-70-30-desvio-rechazado-escritorio`) → resuelto (`23-revisor-resuelto-*`, `24-comprador-resuelto-*`) | Mientras corre el minuto de espera del comprador, abres el reclamo preparado, eliges el motivo y mueves el slider al **70%** para el comprador (vista previa: comprador **Bs 205,17**, vendedor **Bs 87,93**). Tocas **"Probar: mandar la plata a otra cuenta"** y aparece el recuadro rojo de rechazo. Tocas **"Resolver"**. | "Si hay un problema, un revisor decide. Pero el revisor solo elige el porcentaje: la plata solo puede ir al vendedor o volver al comprador. Si intento mandarla a otra cuenta, aunque sea con la llave del revisor, el contrato lo rechaza. Resuelvo 70/30 y cada uno recibe su parte al instante, menos la comisión fija del pedido." |
| **2:15–2:35** | Celular: pregunta (`11-comprador-pregunta-antes-de-pagar-celular`) → pagado (`12-comprador-pagado-al-vendedor-celular`) → laptop (`13-vendedor-cobrado-*`) | Ya pasó el minuto: tocas **"Pagar al vendedor (irreversible)"** y respondes la pregunta obligatoria | "Una sola transacción: nuestro contrato `pp_guardian` aprueba y libera a la vez, sin ventana para trampas. El vendedor recibe **Bs 450,04**, el precio completo; la protección cubre la comisión de la plataforma y el 0,3% de Trustless Work." |
| **2:35–2:50** | `/metricas` (`70-metricas-*`) + stellar.expert | Muestras los números en vivo y el link de un contrato | "Todo es público y verificable: los contratos están en Stellar y cada número de las métricas enlaza a sus compras en la red. Hay 53 tests de seguridad, y en testnet se rechazaron 9 intentos de desvío." |
| **2:50–3:00** | Landing | — | "Trato: pago contra confirmación de entrega. El vendedor cobra apenas el comprador confirma, y la plata solo va al vendedor o vuelve al comprador; aparte, la comisión fija del pedido. Nadie más, ni siquiera nosotros, puede llevársela." |

**Si sobra tiempo o preguntan por la liberación por plazo:**
1. Entra a `/panel?demo=1`, crea un link con "Plazo corto de demo" (2 minutos), págalo y márcalo como enviado (`40`–`42`).
2. Cuando aparezca "Liberar ahora (plazo vencido)" (`43`), tócalo: llama a `pp_guardian.auto_release`, que no pide la autorización de nadie. El resultado se ve en `44` y `45`.
3. Hoy esa liberación y la devolución por falta de envío las dispara la app cuando alguien abre el pedido; el proceso automático está en el plan de 30 días (semana 2).

### Frases de apoyo, por si preguntan

- **¿Quién tiene las llaves?** "Nosotros no tenemos las llaves del comprador ni del vendedor. El vendedor entra con Pollar, con Google o su correo. El comprador firma con una llave que se crea en su navegador; antes de mainnet le daremos una billetera recuperable. El servidor tiene tres llaves de testnet: la de la plataforma, que despliega y paga la comisión de red; la del revisor, que solo elige porcentajes; y la del emisor del dólar de prueba." → [TECNICO, Llaves](TECNICO.md#llaves).
- **¿Cuánto cuesta?** "1,5% para el comprador, con mínimo de Bs 5 y tope de Bs 50. Si el vendedor la regala, se le descuenta 2,3%: 2% de la plataforma y 0,3% de Trustless Work. En devoluciones y reclamos, Trustless Work descuenta las comisiones igual." → [TECNICO, Tarifa](TECNICO.md#tarifa).
- **Trustless Work:** "Usamos la v1 de su escrow sin modificarla. Es un escrow genérico; para compras entre desconocidos le sumamos una regla extra: dos contratos nuestros en los roles que mueven la plata. Por ejemplo, la app verifica el código del contrato antes de pedir la firma." → [TECNICO, Trustless Work: hallazgos](TECNICO.md#trustless-work-hallazgos).
- **Seguridad:** "Hay 9 invariantes y el red team con 53 tests contra el WASM real, y 9 desvíos rechazados en testnet con sus pruebas." → [docs/SEGURIDAD.md](SEGURIDAD.md) y [TECNICO, Evidencia](TECNICO.md#evidencia).

## Plan B, si falla la red

Ordenado de menos a más grave:

1. **El RPC de testnet está lento** (más de 15 s por paso).
   - Sigue hablando. Cada paso muestra su progreso, y el pedido del reclamo ya está preparado.
   - Si un paso no termina, pasa a la captura de ese paso (punto 3).
2. **Falla Pollar o el login del vendedor.** Corta `npm run demo` (Ctrl+C) y reinicia con la billetera local:

   ```bash
   NEXT_PUBLIC_WALLET=local PP_DEMO=1 PORT=3020 npm run dev
   ```

   Funciona con la llave generada en el navegador, sin login.
3. **No hay red para la app: usa las capturas.**
   - Ábrelas en orden (desde la raíz del repo):

     ```bash
     open app/e2e/capturas/0{1,6,7,8}-*-celular.png app/e2e/capturas/1{0,1,2}-*-celular.png app/e2e/capturas/22-*-escritorio.png app/e2e/capturas/2{3,4}-*-escritorio.png
     ```

   - Son de una corrida real del e2e contra testnet, y cada "Ver en Stellar" corresponde a una transacción real.
4. **Sin internet en la sala: el video grabado.** [`demo/v3/trato-demo-v3.mp4`](../demo/v3/trato-demo-v3.mp4) (2:47, sin narrar, con subtítulos), copia local en la laptop.
5. **El bot, sin red:** `cd bot && npm run sim:demo` corre el simulador con una app de mentira, todo local, en http://localhost:3030.
6. **Prueba de seguridad sin red:**

   ```bash
   cd contracts && cargo test
   ```

   Corre los 53 tests contra el WASM real de Trustless Work en menos de un minuto. Los resultados on-chain ya ejecutados están en [`contracts/DEPLOYED.md`](../contracts/DEPLOYED.md) y en la [Evidencia de TECNICO](TECNICO.md#evidencia): los 6 escenarios v2 y los 9 desvíos rechazados.

## Después de la demo

- Corta el túnel (Ctrl+C) y quita la URL temporal de Pollar.
- Si quieres mostrar números actualizados: `/metricas` en la app, o `bash contracts/scripts/metricas.sh | jq 'del(.compras)'`.
