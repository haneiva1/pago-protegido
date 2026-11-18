# CHANGELOG: Pago Protegido

Todo corre en **Stellar testnet**. Las fechas son de noviembre de 2026.

## v1-19nov (entrega 1 en Atlas)

Estado al momento de la entrega: los contratos v2 están desplegados y probados (38 tests), la app funciona de punta a punta sobre los contratos v2 en testnet, con métricas en vivo y perfil verificable de la tienda, y el bot funciona con el simulador. Desde esta entrega, Pago Protegido vive en su propio repo, con todo su historial.

**Validación de esta semana: entrevistas y formulario.** Esta semana validamos con entrevistas a vendedores y con el formulario de lista de espera (`/piloto`), no con pilotos. Los **20 pilotos** pasan al [plan de 30 días](README.md#plan-de-30-días).

**Pendientes medibles** (los revisamos en la próxima entrega):

| # | Pendiente | Cómo se mide | Estado |
|---|---|---|---|
| 1 | **Entrevistas** con vendedores del segmento inicial (celulares y electrónica, Bs 1.000–7.000, envío por encomienda) | Filas en "Registro" de [docs/USUARIOS.md](docs/USUARIOS.md), con la nota de consentimiento | en curso esta semana |
| 2 | **Formulario de lista de espera** (`/piloto`) | Inscripciones exportadas con `npm run piloto:csv` (el CSV no se versiona) | en curso esta semana |
| 3 | **20 pilotos** con vendedores del segmento inicial | Sección "Pilotos" de [docs/USUARIOS.md](docs/USUARIOS.md) y compras en las métricas on-chain | pasa al plan de 30 días (semana 1) |
| 4 | **Despliegue público** de la app y el bot | Una URL HTTPS estable, con [deploy/DEPLOY.md](deploy/DEPLOY.md) | pendiente: el build de Docker no se pudo probar porque la imagen base no terminó de descargarse en la Mac |
| 5 | **WhatsApp real** | El bot responde desde un número real conectado a WhatsApp Cloud API | pendiente: hoy funciona con el simulador y el número de prueba de Meta |
| 6 | **Carta de intención con una ETF** para la rampa en bolivianos | Una carta firmada | pendiente |
| 7 | **Integración de v2 en la app** | La app usa `pp_guardian` y `pp_arbiter` v2 (`mark_shipped`, `extend`, los dos plazos) y su e2e pasa contra v2 | hecho (ver "18-nov, tarde") |

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
  - reproducción del bug H-1 de Trustless Work, con su fix y su test.

## 17-nov: spike

- El escrow single-release de Trustless Work (commit `f0b706e`) quedó compilado y subido a testnet, con flujos de caso feliz, reclamo y abuso.
- **Hallazgos que dieron forma al diseño:**
  - `initialize_escrow` no exige firma;
  - la dirección de la comisión de Trustless Work la elige quien llama;
  - un reembolso también paga comisiones;
  - aprobar no es definitivo hasta liberar;
  - no hay plazos.
