# CHANGELOG: Pago Protegido

Todo corre en **Stellar testnet**. Las fechas son de noviembre de 2026.

## v1-19nov (entrega 1 en Atlas)

Estado al momento de la entrega: los contratos v2 están desplegados y probados, la app funciona de punta a punta sobre los contratos v1, y el bot funciona con el simulador.

**Pendientes medibles** (los revisamos en la próxima entrega):

| # | Pendiente | Cómo se mide | Estado |
|---|---|---|---|
| 1 | **20 pilotos** con vendedores del segmento inicial (celulares y electrónica, Bs 1.000–7.000, envío por encomienda) | Filas con "¿Piloto? = sí" en [docs/USUARIOS.md](docs/USUARIOS.md) y compras en las métricas on-chain | 0 / 20 |
| 2 | **Despliegue público** de la app y el bot | Una URL HTTPS estable, con [deploy/DEPLOY.md](deploy/DEPLOY.md) | pendiente: el build de Docker no se pudo probar porque la imagen base no terminó de descargarse en la Mac |
| 3 | **WhatsApp real** | El bot responde desde un número real conectado a WhatsApp Cloud API | pendiente: hoy funciona con el simulador y el número de prueba de Meta |
| 4 | **Integración de v2 en la app** | La app usa `pp_guardian` y `pp_arbiter` v2 (`mark_shipped`, `extend`, los dos plazos) y su e2e pasa contra v2 | hecho en la rama `worktree-pp-v2-integracion` (ver la entrada "18-nov, tarde") |
| 5 | **Carta de intención con una ETF** para la rampa en bolivianos | Una carta firmada | pendiente |

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
  - reproducción del bug H-1 de Trustless Work, con su fix y su test.

## 17-nov: spike

- El escrow single-release de Trustless Work (commit `f0b706e`) quedó compilado y subido a testnet, con flujos de caso feliz, reclamo y abuso.
- **Hallazgos que dieron forma al diseño:**
  - `initialize_escrow` no exige firma;
  - la dirección de la comisión de Trustless Work la elige quien llama;
  - un reembolso también paga comisiones;
  - aprobar no es definitivo hasta liberar;
  - no hay plazos.
