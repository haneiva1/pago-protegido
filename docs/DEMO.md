# Demo en vivo: 3 minutos

**Objetivo:** que el jurado vea, con transacciones reales en Stellar testnet, cuatro cosas:

1. el vendedor crea un link;
2. el comprador paga y su plata queda protegida;
3. al confirmar, el vendedor cobra al instante;
4. en una disputa, el árbitro reparte, y el contrato **rechaza** mandar la plata a otra cuenta.

Las capturas son de `app/e2e/capturas/`, generadas por el e2e contra testnet, y de `bot/docs/simulador.png`. Los nombres de archivo de este guion se refieren a esa carpeta.

## Montaje

| Pantalla | Qué tiene abierto |
|---|---|
| **Laptop** (proyectada) | Pestañas: ① `/panel` (vendedor), ② `/arbitro` (con `ARBITRO_PANEL_KEY` ya ingresada), ③ stellar.expert del contrato `pp_arbiter`, ④ simulador del bot (opcional). |
| **Celular** (con espejo de pantalla o cámara) | El link del comprador `/p/<slug>`, abierto con la URL del túnel. |

### Preparación, 30 minutos antes

1. Levanta la app:

   ```bash
   cd pago-protegido/app && PORT=3020 npm run dev
   ```

   El 3000 de la Mac está ocupado. Pollar ya tiene registrado `localhost:3020`.
2. Abre el túnel para el celular:

   ```bash
   bash ../deploy/tunel.sh 3020
   ```

   Agrega la URL `https://….trycloudflare.com` en Pollar como **origen permitido** y **URL de retorno**. Si no lo haces, el login con Google o email falla desde el celular.
3. **Prepara el pedido de la disputa,** porque no entra en 3 minutos hacerlo en vivo:
   1. crea el link "Polera Adidas talla M", Bs 300;
   2. págalo desde otra ventana privada;
   3. márcalo como enviado (`OLVA-55821`);
   4. toca "Tengo un problema" (motivo: "Llegó dañado") y deja la versión del vendedor.
   Debe aparecer en `/arbitro` → "Disputas abiertas (1)".
4. Deja creada la tienda del vendedor ("Tienda Sofi", WhatsApp 591 7123 4567) y vacío el formulario de "Crear link".
5. Haz un ensayo completo. Si es posible, **grábalo** (ver Plan B).
6. Revisa el RPC: `curl -s https://soroban-testnet.stellar.org -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' -H 'Content-Type: application/json'` debe devolver `"healthy"`.

## Guion

| Tiempo | Pantalla (captura) | Qué haces | Qué dices |
|---|---|---|---|
| **0:00–0:15** | Landing (`01-landing-*`) | Muestras la portada | "Vender por Instagram o TikTok en Bolivia es desconfianza: el comprador teme no recibir y el vendedor recibe comprobantes falsos. Pago Protegido es un link de pago donde la plata queda guardada hasta que el comprador recibe." |
| **0:15–0:40** | Panel → crear link (`04-panel-primer-link-*`, `05-panel-link-creado-*`) | Creas "Zapatillas Nike talla 40", Bs 450, 3 días, y tocas "Compartir por WhatsApp" | "El vendedor crea el link en 20 segundos. También puede hacerlo desde WhatsApp con nuestro bot." *(Opcional: muestras `bot/docs/simulador.png` o el simulador con "vendo zapatillas nike 40 a 450 bs entrega 3 días".)* |
| **0:40–1:15** | Celular: antes de pagar (`06-comprador-antes-de-pagar-celular`) → QR (`07-comprador-qr-rampa-simulada-celular`) → pagado (`08-comprador-pagado-celular`) | Abres el link y tocas "Pagar protegido", luego "Simular pago del banco (testnet)" | "El comprador ve cómo lo protegemos. Paga con QR; acá la rampa del banco está simulada. Antes de pedir la firma, la app verifica on-chain que el contrato es el de Trustless Work con nuestros roles: **Contrato verificado**." Señalas "Tu plata está protegida: 38,46 USD de prueba" y tocas **Ver en Stellar**. |
| **1:15–1:30** | Laptop: vendedor enviado (`09-vendedor-enviado-*`) → celular (`10-comprador-enviado-celular`) | Tocas "Marcar como enviado" con la guía `OLVA-55821` | "El vendedor despacha y marca enviado. Si el comprador no responde, al vencer el plazo la plata se libera sola." |
| **1:30–1:50** | Celular: liberado (`11-comprador-liberado-celular`) → laptop (`12-vendedor-liberado-*`) | Tocas **"Recibí conforme"** | "Una sola transacción: nuestro contrato `pp_guardian` aprueba y libera a la vez, así que no queda ventana para trampas. El vendedor recibe 37,58, la plataforma 0,77 (2%) y Trustless Work 0,12 (0,3%)." |
| **1:50–2:35** | `/arbitro` (`23-arbitro-70-30-desvio-rechazado-escritorio`) → resuelto (`24-arbitro-resuelto-*`, `25-comprador-resuelto-*`) | Abres la disputa preparada y mueves el slider al **70%** (vista previa: comprador 17,54, vendedor 7,52). Tocas **"Probar: mandar la plata a otra cuenta"** y aparece el recuadro rojo con `Error(Contract, #12)`. Tocas **"Resolver"**. | "Si hay un problema, un árbitro decide. Pero mira el aviso: *el árbitro solo puede repartir entre comprador y vendedor*. Si intento mandar la plata a otra cuenta, aunque sea con la llave del árbitro, el contrato lo rechaza. Resuelvo 70/30, y cada uno recibe su parte al instante." |
| **2:35–2:50** | "Cómo funciona" (`30-como-funciona-*`) + stellar.expert | Muestras los links de los contratos | "Todo es público y verificable: los contratos están en Stellar y las métricas salen de la red. Llevamos 14 compras protegidas en testnet, con 27 tests de seguridad." |
| **2:50–3:00** | Landing | — | "Pago Protegido: el comprador paga tranquilo, el vendedor cobra seguro, y nadie, ni siquiera nosotros, puede llevarse la plata." |

**Si sobra tiempo o preguntan por la liberación automática:**
1. Entra a `/panel?demo=1`, crea un link con "Plazo corto de demo" (2 minutos), págalo y márcalo como enviado (`40`–`42`).
2. Cuando aparezca "Liberar ahora (plazo vencido)" (`43`), tócalo: llama a `pp_guardian.auto_release`, sin firmas. El resultado se ve en `44` y `45`.

### Frases de apoyo, por si preguntan

- **Custodia:** "No custodiamos. La llave del comprador vive en su celular, con Pollar (login con Google) o una llave local. El servidor solo paga la comisión de red con *fee bump*."
- **Trustless Work:** "Usamos su escrow sin modificarlo y le pusimos dos contratos propios en los roles críticos. Además encontramos un bug en su contrato y preparamos el fix con su test."
- **Seguridad:** "Hay 9 invariantes con tests contra el WASM real y 5 ataques reales en testnet rechazados" → `docs/SEGURIDAD.md`.

## Plan B, si falla la red

Ordenado de menos a más grave:

1. **El RPC de testnet está lento** (más de 15 s por paso).
   - Sigue hablando. Cada paso muestra su progreso, y el pedido de la disputa ya está preparado.
   - Si un paso no termina, pasa a la captura de ese paso (punto 3).
2. **Falla Pollar o el login.** Reinicia con la billetera local:

   ```bash
   NEXT_PUBLIC_WALLET=local PORT=3020 npm run dev
   ```

   Funciona con la llave generada en el navegador, sin login.
3. **No hay red para la app: usa las capturas.**
   - Ábrelas en orden:

     ```bash
     open app/e2e/capturas/0{1,4,5,6,7,8}-*-celular.png app/e2e/capturas/1{0,1,2}-*-celular.png app/e2e/capturas/2{3,4,5}-*-escritorio.png
     ```

   - Son de una corrida real del e2e contra testnet, y cada "Ver en Stellar" corresponde a una transacción real.
4. **Sin internet en la sala: el video grabado.**
   - **Todavía no hay video.** Hay que grabarlo durante el ensayo con QuickTime (Archivo → Nueva grabación de pantalla), siguiendo este guion.
   - Súbelo como video no listado y deja el link aquí: <!-- LINK-VIDEO -->. Lleva también una copia local en la laptop.
5. **El bot, sin red:** `cd bot && npm run sim:demo` corre el simulador con una app de mentira, todo local, en http://localhost:3030.
6. **Prueba de seguridad sin red:**

   ```bash
   cd contracts && cargo test
   ```

   Corre los 27 tests contra el WASM real de Trustless Work en unos 3 s. Los resultados on-chain ya ejecutados están en `contracts/DEPLOYED.md`: hashes de los 4 escenarios y los 5 ataques rechazados.

## Después de la demo

- Corta el túnel (Ctrl+C) y quita la URL temporal de Pollar.
- Si quieres mostrar números actualizados: `bash contracts/scripts/metricas.sh | jq 'del(.compras)'`.
