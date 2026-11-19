# CHANGELOG: Pago Protegido

Todo corre en **Stellar testnet**. Las fechas son de 2026.

## Entrega 1 (19-nov)

Entrega 1 en Atlas. Todo corre en Stellar testnet. Desde esta entrega, Pago Protegido vive en su propio repo, con todo su historial.

**Qué hay:**

- **Contratos v2** (`pp_guardian` y `pp_arbiter`), desplegados en testnet y no actualizables, sobre la v1 del escrow single-release de Trustless Work sin modificar. **38 tests** contra el WASM real (26 de invariantes y 12 del red team).
- **Flujo v2 en testnet** con código 0: caso feliz, disputa 70/30, liberación por plazo, extensión, devolución por falta de envío y **9 desvíos rechazados**. Cada escenario, con su transacción, en la [Evidencia del README](README.md#evidencia).
- **App web** de punta a punta sobre v2: crear link, pagar con la rampa simulada, registrar el envío, "Pagar al vendedor", "Necesito más tiempo", reclamo y panel del revisor (`/revisor`), métricas en vivo (`/metricas`) y perfil verificable de la tienda (`/tienda/<slug>`).
- **Bot de WhatsApp** con el simulador: 174 tests unitarios y 4 e2e.
- **Una sola tarifa:** la protección la paga el comprador, 1,5% (mínimo Bs 5, tope Bs 50); si el vendedor la regala, se le descuenta 2,3% (2% de la plataforma y 0,3% de Trustless Work). En devoluciones y disputas, Trustless Work descuenta las comisiones ([README, Tarifa](README.md#tarifa)).
- **Documentación para el jurado:** links a los contratos, llaves del servidor y riesgos de la llave del comprador, hallazgos sobre Trustless Work (TW-1 a TW-5, y H-1 como hallazgo comunicado al equipo de Trustless Work, que su v2 ya impide), evidencia "afirmación → comando → resultado → link", mapa del código, qué es real y qué es simulado, dos caminos para probarlo y tipo de cambio de las métricas. Decisiones en [DECISIONES.md](DECISIONES.md).
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
