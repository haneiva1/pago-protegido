# CHANGELOG: Trato (antes Pago Protegido)

Todo corre en **Stellar testnet**. Las fechas son de 2026.

## 2026-11-20 — Trato: la noche del 20-nov, integrada

Las ramas de la noche entraron juntas en `noche/integracion`. Ningún contrato cambió y no se redesplegó nada.

- **El producto se llama Trato** ([PR #2](https://github.com/haneiva1/pago-protegido/pull/2)). Cambia el nombre visible en la app, el bot y la documentación. El repo, los paquetes, los contratos (`pp_guardian`, `pp_arbiter`), las variables `PP_*`, los códigos `PP-`, las rutas y los dominios conservan el nombre anterior.
- **Textos limpios y una sola versión** ([PR #3](https://github.com/haneiva1/pago-protegido/pull/3)):
  - el envío se muestra como "empresa · guía · peso", los repartos totales dicen "todo para el comprador" o "todo para el vendedor", el bot dice "tu cuenta" y pregunta "¿En cuántos días lo despachas?";
  - un test del bot falla si aparece una palabra prohibida en un texto para clientes;
  - el segmento es celulares y electrónica de Bs 1.000 a 7.000 en la portada y en `/piloto`; la portada rotula su ejemplo (un celular de Bs 2.500) y `demo:reset` siembra un celular de Bs 2.500.
- **Experiencia del comprador** ([PR #4](https://github.com/haneiva1/pago-protegido/pull/4)):
  - primer pantallazo con el producto, el total, la reputación de la tienda en una línea y "Dos salidas": a la tienda cuando confirmes, o de vuelta a ti si no despacha;
  - QR para pagar desde el mismo celular: "Guardar QR", "Compartir QR" y "Esperando tu pago…";
  - acceso a la compra: aviso en el navegador interno de Facebook, Messenger, Instagram y TikTok, "Agregar a inicio", y una explicación para quien vuelve desde otro navegador. La cuenta del comprador no se exporta en links ni en QR;
  - reclamo guiado: los motivos dependen del estado, se pide la evidencia de cada motivo y se confirma antes de "El vendedor me pide que confirme";
  - evidencia con cámara: compresión y huella SHA-256 en el navegador (`EvidenciaInput`, `/api/evidencia`);
  - seguimiento tipo delivery, con "Ya lo recogí", "Todavía no llegó" (usa `extend`), el teléfono de quien recoge y el flete;
  - el registro público ya no dice "Pago bloqueado" después de liberar o devolver.
- **Reputación verificada y contratos comprobables** ([PR #5](https://github.com/haneiva1/pago-protegido/pull/5)):
  - indexador verificado (H-9): una compra cuenta en `/metricas`, `/tienda/<slug>`, la insignia, "Tus números" y `/transparencia` solo si su escrow corre el WASM de Trustless Work, tiene los roles de Trato, usa LABUSD y su pago movió la plata. `/transparencia` muestra cuántas compras descartó y por qué;
  - la PoC del jurado como tests de H-9 y H-10, y 200 secuencias aleatorias contra el WASM real: **47 tests de contratos**;
  - `rust-toolchain.toml` fija rustc 1.99.1, y `contracts/scripts/verify-wasm.sh` reproduce los hashes desplegados;
  - SEGURIDAD.md: H-9 mitigado, H-10 conocido (se arregla en v3) y el plan de multisig 2 de 3 para la llave `arbitro`.
- **API firmada** ([PR #6](https://github.com/haneiva1/pago-protegido/pull/6)):
  - las acciones de comprador y vendedor exigen la firma de un desafío de un solo uso (SEP-53); el bot entra con su clave de servidor;
  - `GET /api/sellers/<cuenta>` solo devuelve los datos públicos de la tienda; el panel tiene su propia ruta firmada;
  - nadie puede bloquear un link: reserva de pago de 10 minutos, códigos de 8 caracteres y límite por IP.
- **Vendedor y revisor** ([PR #7](https://github.com/haneiva1/pago-protegido/pull/7)):
  - link rápido en una pantalla (producto, precio, días para despachar y flete), "Duplicar", compartir con el menú del celular y "Pendientes de hoy";
  - envío con fotos de la guía y del paquete desde la cámara: la huella de cada foto va en la evidencia de `mark_shipped`;
  - "Pasar a mi banco", rotulado "Simulado en testnet";
  - el revisor ve la regla que aplica, los plazos y las fotos de las dos partes con "✓ coincide" si la huella es la registrada;
  - La Paz y El Alto cuentan como la misma ciudad para confirmar;
  - el aviso de pago del bot dice que la plata está en el contrato y trae el link al panel.
- **`/probar`** ([#9](https://github.com/haneiva1/pago-protegido/pull/9)): el vendedor y el comprador lado a lado, con cada transacción en stellar.expert.
- **Devolución completa (apagada) y evidencia archivada** ([#8](https://github.com/haneiva1/pago-protegido/pull/8)).
- **Arreglos de la integración:**
  - `npm test` en `app/` corre los unitarios y los de la API firmada;
  - el test de palabras prohibidas del bot ignora los `import()` dinámicos, que son rutas de módulo y no textos para el cliente;
  - la reputación entra entera en celular: sale el link "Ver tienda" de esa línea, porque la tarjeta del vendedor ya lo tiene;
  - el panel del vendedor muestra el teléfono de quien recoge y el flete.
- **Documentación:** el README queda con los cinco criterios, el avance y el plan de 30 días v2; el detalle técnico pasa a [docs/TECNICO.md](docs/TECNICO.md) y el problema, con 24 casos públicos y sus fuentes, a [docs/PROBLEMA.md](docs/PROBLEMA.md).
- **Pruebas:** contratos, 47 tests; bot, 191 unitarios y 4 e2e; app, 12/12 e2e con pagos en testnet.

## Entrega 1 (19-nov)

Entrega 1 en Atlas. Todo corre en Stellar testnet. Desde esta entrega, Pago Protegido vive en su propio repo, con todo su historial.

**Qué hay:**

- **Contratos v2** (`pp_guardian` y `pp_arbiter`), desplegados en testnet y no actualizables, sobre la v1 del escrow single-release de Trustless Work sin modificar. **38 tests** contra el WASM real (26 de invariantes y 12 del red team).
- **Flujo v2 en testnet** con código 0: caso feliz, disputa 70/30, liberación por plazo, extensión, devolución por falta de envío y **9 desvíos rechazados**. Cada escenario, con su transacción, en la [Evidencia del README](README.md#evidencia).
- **App web** de punta a punta sobre v2: crear link, pagar con la rampa simulada, registrar el envío, "Pagar al vendedor", "Necesito más tiempo", reclamo y panel del revisor (`/revisor`), métricas en vivo (`/metricas`) y perfil verificable de la tienda (`/tienda/<slug>`).
- **Bot de WhatsApp** con el simulador: 174 tests unitarios y 4 e2e.
- **Una sola tarifa:** la protección la paga el comprador, 1,5% (mínimo Bs 5, tope Bs 50); si el vendedor la regala, se le descuenta 2,3% (2% de la plataforma y 0,3% de Trustless Work). En devoluciones y disputas, Trustless Work descuenta las comisiones ([README, Tarifa](README.md#tarifa)).
- **Documentación para el jurado:** links a los contratos, llaves del servidor y riesgos de la llave del comprador, hallazgos sobre Trustless Work (TW-1 a TW-5 y H-1: en la v1 del escrow que usamos, commit `f0b706e`, un escrow ya liberado se puede marcar en disputa sin mover fondos; la v2 de Trustless Work ya lo impide, y `pp_guardian` también lo bloquea, #21), evidencia "afirmación → comando → resultado → link", mapa del código, qué es real y qué es simulado, dos caminos para probarlo y tipo de cambio de las métricas. Decisiones en [DECISIONES.md](DECISIONES.md).
- **Validación de esta semana:** entrevistas a vendedores y formulario de lista de espera (`/piloto`), no pilotos.

**Pendiente, con fecha** (fechas del [plan de 30 días](README.md#plan-de-30-días); las revisamos en la próxima entrega):

| # | Pendiente | Cómo se mide | Fecha |
|---|---|---|---|
| 1 | **Entrevistas** con vendedores del segmento inicial (celulares y electrónica, Bs 1.000–7.000, envío por encomienda) | Filas en "Registro" de [docs/USUARIOS.md](docs/USUARIOS.md), con la nota de consentimiento | en curso esta semana (hasta el 29 nov) |
| 2 | **Formulario de lista de espera** (`/piloto`) | Inscripciones exportadas con `npm run piloto:csv` (el CSV no se versiona) | en curso esta semana (hasta el 29 nov) |
| 3 | **Despliegue público** de la app y el bot | Una URL HTTPS estable, con [deploy/DEPLOY.md](deploy/DEPLOY.md). El build de Docker no se pudo probar porque la imagen base no terminó de descargarse en la Mac. | semana 1 (30 nov – 6 dic) |
| 4 | **Carta de intención con una ETF** para la rampa en bolivianos | Una carta firmada | semana 1 (30 nov – 6 dic) |
| 5 | **20 pilotos** con vendedores del segmento inicial | Sección "Pilotos" de [docs/USUARIOS.md](docs/USUARIOS.md) y compras en las métricas on-chain | arrancan en la semana 1 (30 nov – 6 dic) |
| 6 | **Proceso automático** para la liberación y la devolución por plazo vencido (hoy las dispara la app al abrir el pedido) | Un pedido vencido se libera o se devuelve sin que nadie lo abra | semana 2 (7 – 13 dic) |
| 7 | **WhatsApp real** | El bot responde desde un número real conectado a WhatsApp Cloud API (hoy: simulador y número de prueba de Meta) | semana 3 (14 – 20 dic) |
| 8 | **Prueba A/B de precio** (quién paga la protección y cuánto) | Ventas cerradas con cada variante en los pilotos | semana 3 (14 – 20 dic) |
| 9 | **Antes de mainnet:** revisión externa de los contratos, multisig para el admin del revisor, billetera recuperable para el comprador y evaluar la migración a Trustless Work v2 | Informe de la revisión, cuenta multisig en testnet, login o passkey del comprador y decisión sobre la v2 | semana 4 (21 – 27 dic) |
| 10 | **Rampa en bolivianos con una ETF, en su sandbox** | Un pago con QR que acredita la moneda en el sandbox de la ETF | 27 dic |
| 11 | **Mainnet acotado** con USDC y topes por pedido y por vendedor | Primera compra en mainnet | semana 4 (21 – 27 dic), **solo con una opinión legal favorable** |

Hecho en esta etapa: la **integración de v2 en la app** (ver "18-nov, tarde").

## 19-nov: repo propio

- **Pago Protegido sale de `stellar-lab`** a su propio repo, con el historial de la carpeta `pago-protegido/` (`git subtree split`). Las decisiones de este paso están en [DECISIONES.md](DECISIONES.md).
- **Funciona solo:** el WASM de Trustless Work está en [contracts/wasm/](contracts/wasm/) con su procedencia, la especificación en [docs/SPEC.md](docs/SPEC.md) y `npm run setup` busca las variables de Pollar en `.env.pollar`, en la raíz del repo (no se versiona).
- **Revisión de secretos** de todo el historial: sin claves secretas de Stellar, tokens ni claves de Pollar. Se sacó del historial un CSV de prueba de `app/data/`. `.env*`, `data/*.db` y `data/*.csv` quedan en `.gitignore`.
- **Validación de esta semana:** entrevistas y formulario; los 20 pilotos pasan al plan de 30 días.

## 18-nov: métricas en vivo y perfil de la tienda

- **`/metricas`**: números calculados solo con eventos on-chain de `pp_guardian` y `pp_arbiter` (v1 y v2), con las pruebas del equipo separadas del piloto, cada número enlazado a sus compras y un gráfico por día ([app/DECISIONES.md](app/DECISIONES.md) §86–99).
- **Perfil verificable `/tienda/<slug>`** con insignia para la bio, y "Tus números" en el panel del vendedor.
- **Tarjeta del vendedor** en la página de pago.
- **Bot:** "mi perfil" responde con el link del perfil público.
- **e2e de solo lectura** contra testnet (`npm run test:e2e:publico`), sin claves.

## 18-nov, tarde: v2 de punta a punta (app, bot y demo)

- **App sobre los contratos v2** ([app/DECISIONES.md](app/DECISIONES.md) §77–85):
  - `fund` con plazo de despacho (los días de entrega) y ventana de revisión (días + 3) contada desde el envío;
  - envío por `pp_guardian.mark_shipped` con empresa, guía, peso y foto (el IMEI queda en el servidor);
  - "Necesito más tiempo" → `extend`, una sola vez (`POST /api/orders/:slug/extend`);
  - devolución automática si el vendedor no despacha a tiempo: disputa de la plataforma + `pp_arbiter.refund_unshipped`, con estado `devuelto`;
  - `auto_release` no se intenta si hay disputa (y el contrato también lo rechaza);
  - sigue verificando el hash del WASM de Trustless Work y los roles antes de pedir la firma del pago.
- **Bot alineado:** "revisor" y "Pagar al vendedor", código PP-####, `proteccion` en `POST /api/links` (y `PATCH` para "Yo la regalo"), recordatorios desde el envío y aviso de devolución a los dos lados.
- **`npm run demo:reset`** deja la demo lista para grabar, con 3 pedidos reales en v2: liberado, 70/30 y devuelto.
- **Video y capturas de la demo v2** en [demo/v2/](demo/v2/).

## 18-nov, mañana: v2 a partir de los consejos

- **Contratos v2** ([contracts/DEPLOYED.md](contracts/DEPLOYED.md)), que responden al red team sobre Trustless Work (TW-1, TW-2, TW-3 y TW-5):
  - `fund` con dos plazos firmados por el comprador: despacho y revisión;
  - `mark_shipped`, que registra el envío una sola vez y deja la evidencia fija;
  - `confirm` exige el envío y aprueba todos los hitos;
  - `auto_release` usa el fin de la revisión y respeta cualquier disputa;
  - `extend`, que alarga la revisión una vez;
  - `refund_unshipped` usa el plazo de despacho;
  - contratos **no actualizables** y sin ruta a `withdraw_remaining_funds`.
  - IDs: `pp_guardian` `CDKYF7OA…UOATOT` y `pp_arbiter` `CDTEA424…TEVU5UA`.
- **Tests:** 38 contra el WASM real de Trustless Work (26 de invariantes y 12 del red team).
- **Flujo v2 en testnet** con 6 escenarios y código 0: feliz, 70/30, liberación automática, extensión, devolución por falta de envío y 9 desvíos rechazados.
- **Antifraude y textos legales.**
- **Documentación:**
  - [docs/SEGURIDAD.md](docs/SEGURIDAD.md) §4b (TW-1 a TW-5);
  - interfaz v2 en DECISIONES.md;
  - métricas que leen v1 y v2;
  - bindings TypeScript v2.

## 18-nov, madrugada: MVP v1

- **Contratos v1** `pp_guardian` y `pp_arbiter` sobre el escrow de Trustless Work:
  - 27 tests;
  - flujo en testnet con caso feliz, 70/30, liberación automática y 5 ataques rechazados ([contracts/DEPLOYED-v1.md](contracts/DEPLOYED-v1.md)).
- **App web MVP** (Next.js):
  - vendedor, comprador con rampa simulada, árbitro y "Cómo funciona";
  - Pollar, *fee bump* y verificación on-chain del contrato;
  - e2e con Playwright contra testnet y capturas.
- **Bot de WhatsApp:** links desde el chat, avisos y recordatorios, con simulador; 69 tests unitarios y 2 e2e.
- **Video de la demo.**
- **Documentación y operación:**
  - arquitectura, seguridad, métricas on-chain y guion de la demo;
  - despliegue con Docker, Caddy y Railway;
  - 6 compras de ejemplo en testnet;
  - reproducción en testnet del hallazgo H-1 (en la v1 de Trustless Work un escrow liberado se puede marcar en disputa; la v2 ya lo impide), con su test.

## 17-nov: spike

- El escrow single-release de Trustless Work (commit `f0b706e`) quedó compilado y subido a testnet, con flujos de caso feliz, reclamo y abuso.
- **Hallazgos que dieron forma al diseño:**
  - `initialize_escrow` no exige firma;
  - la dirección de la comisión de Trustless Work la elige quien llama;
  - un reembolso también paga comisiones;
  - aprobar no es definitivo hasta liberar;
  - no hay plazos.
