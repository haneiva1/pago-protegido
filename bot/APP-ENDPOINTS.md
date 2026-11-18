# Lo que el bot necesita de la app web

Para la sesión que mantiene `pago-protegido/app/`. El bot ya funciona con lo que existe hoy: usa los planes B descritos abajo. Con estos cambios queda completo.

Todo se probó contra una app de mentira con estas formas exactas: [`src/mock/app-mock.ts`](src/mock/app-mock.ts). Los tests del bot (`npm test`) sirven como prueba de contrato.

## Lo que ya existe y el bot usa tal cual

| Para qué | Ruta | Request → response |
|---|---|---|
| Crear el link (= el pedido) | `POST /api/links` | `{ sellerPubkey, product, priceBs, deliveryDays }` → `OrderRow` |
| Mis ventas, estado, saldo | `GET /api/sellers/:pubkey` | → `{ seller: SellerRow & { completedSales }, orders: (PublicOrder & MoneyView & { txs })[], balance }` |
| Estado de un pedido y montos | `GET /api/orders/:slug` | → `OrderView` (`order`, `seller`, `breakdown` si está liberado, `split` si está resuelto) |

- El bot muestra el link como `${PP_PUBLIC_URL}/p/${slug}` y el código corto como el sufijo hex del slug (`zapatillas-nike-40-a1b2c3` → `a1b2c3`).
- `estado <código>` y `enviado <código>` solo buscan dentro de `GET /api/sellers/:pubkey` del vendedor que escribe, así que nadie puede consultar pedidos ajenos por el bot.

## §0. Autenticación del bot

Todo lo que cuelga de `/api/bot/` es solo para el bot.

- Header: `x-bot-key: <PP_BOT_KEY>`.
- La app lee `PP_BOT_KEY` de `.env.local` (puede generarla `npm run setup`, igual que `ARBITRO_PANEL_KEY`) y la compara con `crypto.timingSafeEqual`.
- Si falta o no coincide: `401 { "error": "Clave del bot incorrecta" }`. Si la app no tiene `PP_BOT_KEY`, siempre 401.
- Va bajo `/api/bot/` y no bajo `/api/orders/`, porque `GET /api/orders/changes` caería en la ruta dinámica `/api/orders/[slug]` que ya existe.

```ts
// src/lib/server/http.ts
export function checkBot(req: Request) {
  const want = Buffer.from(process.env.PP_BOT_KEY ?? "");
  const got = Buffer.from(req.headers.get("x-bot-key") ?? "");
  if (!want.length || want.length !== got.length || !crypto.timingSafeEqual(want, got)) throw new AppError("Clave del bot incorrecta", 401);
}
```

## §1. Buscar vendedor por WhatsApp

`GET /api/bot/sellers?phone=59171234567`

- `phone`: solo dígitos, como llega de WhatsApp (`wa_id`). El bot ya lo normaliza.
- Normalización de los dos lados (el vendedor escribe su número como quiere en `/vender`): quitar todo lo que no sea dígito y, si quedan 8 dígitos (celular boliviano), anteponer `591`.
- Si hay varias tiendas con el mismo número, devolver la más reciente (`created_at` mayor).

| Caso | Status | Body |
|---|---|---|
| Encontrado | 200 | `{ "seller": { "pubkey": "G…", "store_name": "Tienda Rosa", "whatsapp": "591 71234567", "created_at": 1763400000000, "completedSales": 3 } }` |
| No hay tienda con ese número | 404 | `{ "error": "Tienda no encontrada" }` |
| `phone` con menos de 7 dígitos | 400 | `{ "error": "Número inválido" }` |
| Sin clave | 401 | `{ "error": "Clave del bot incorrecta" }` |

```ts
// src/app/api/bot/sellers/route.ts
export const GET = (req: Request) => handle(() => {
  checkBot(req);
  const phone = normPhone(new URL(req.url).searchParams.get("phone") ?? "");
  if (phone.length < 7) throw new AppError("Número inválido");
  const all = db().prepare(`SELECT * FROM sellers ORDER BY created_at DESC`).all() as SellerRow[];
  const s = all.find((x) => normPhone(x.whatsapp) === phone);
  if (!s) throw new AppError("Tienda no encontrada", 404);
  return { seller: { ...s, completedSales: sellers.completedSales(s.pubkey) } };
});
const normPhone = (p: string) => { const d = p.replace(/\D/g, ""); return d.length === 8 ? `591${d}` : d; };
```

**Plan B mientras no exista** (Next responde 404 en HTML y el bot lo detecta): el bot manda el link de registro y acepta `vincular <clave pública>`. Solo vincula si el `whatsapp` de esa tienda, normalizado, es el mismo número que escribe. Ese dato sale de `GET /api/sellers/:pubkey`, que ya existe.

## §2. Cambios de pedidos desde una fecha

`GET /api/bot/changes?since=1763400000000`

- Pedidos con `updated_at >= since`, en orden ascendente por `updated_at`, máximo 500.
- `now` se toma con `Date.now()` **antes** de la consulta. El bot lo usa como el próximo `since`, así no se pierde nada entre una consulta y la siguiente.
- Que un pedido se repita no es problema: el bot compara `status` y `updated_at` con lo que ya vio y avisa una sola vez por cambio de estado.
- El bot arranca con `since = ahora`: no repasa la historia.

```json
{
  "now": 1763400012345,
  "changes": [
    { "slug": "zapatillas-nike-40-a1b2c3", "status": "pagado", "updated_at": 1763400011000, "buyer_whatsapp": "59176543210" },
    { "slug": "polera-ff00aa", "status": "en_disputa", "updated_at": 1763400012000, "buyer_whatsapp": null }
  ]
}
```

| Campo | Tipo | Nota |
|---|---|---|
| `now` | number (ms) | hora del servidor antes de consultar |
| `changes[].slug` | string | el bot pide el detalle a `GET /api/orders/:slug` |
| `changes[].status` | `OrderStatus` | `esperando_pago`, `pagado`, `enviado`, `liberado`, `en_disputa` o `resuelto` |
| `changes[].updated_at` | number (ms) | columna `orders.updated_at` |
| `changes[].buyer_whatsapp` | string \| null | §4. Solo por aquí, nunca en la vista pública |

```ts
// src/app/api/bot/changes/route.ts
export const GET = (req: Request) => handle(() => {
  checkBot(req);
  const since = Number(new URL(req.url).searchParams.get("since") ?? 0) || 0;
  const now = Date.now();
  const changes = db().prepare(
    `SELECT slug, status, updated_at, buyer_whatsapp FROM orders WHERE updated_at >= ? ORDER BY updated_at ASC LIMIT 500`,
  ).all(since);
  return { now, changes };
});
```

- El H-1 de la app (el estado on-chain manda) solo corre en `GET /api/orders/:slug?onchain` y en el panel del árbitro. Si `reconcile` actualiza `status`, también actualiza `updated_at` (`orders.update` ya lo hace), así que el cambio aparece en este feed.

**Plan B mientras no exista:** el bot revisa uno por uno, con `GET /api/orders/:slug`, los pedidos que conoce (los que creó o listó en "mis ventas") y que no están liberados ni resueltos. Funciona, pero solo ve esos pedidos.

## §3. Marcar enviado: una página, no un endpoint

Marcar enviado es una transacción on-chain que firma el vendedor con su billetera. **El bot nunca la ejecuta ni tiene llaves.** Por eso **no** hay que crear un "marcar enviado por API" para el bot.

El bot responde a `enviado <código> <guía>` con este link:

```
/panel?enviar=<slug>&evidencia=<texto en URL encoding>
```

Lo que hace falta en `/panel` (`src/app/panel/page.tsx`):

1. Si viene `enviar`, abrir ese pedido (scroll y resaltado) y precargar `evidencia` en el campo del formulario "Marcar como enviado".
2. El vendedor toca el botón y firma con su billetera, como hoy (`POST /api/orders/:slug/action` con `action: "ship"` → firma → `/api/tx/submit`).
3. Si el pedido no es de esa billetera o no está en `pagado`, se muestra el panel normal.

**Plan B mientras no exista:** el link abre `/panel` (la página ignora los parámetros) y el vendedor busca el pedido. Ya funciona; solo es menos directo.

## §4. WhatsApp del comprador (opcional, para "¿te llegó?" y el recordatorio)

Hoy la app no guarda el número del comprador (DECISIONES 10). Sin él, el bot solo avisa al vendedor.

- **Columna:** `orders.buyer_whatsapp TEXT`, con la misma migración que `window_secs` en `db.ts`.
- **Pantalla `/p/[slug]`**, después de pagar: campo opcional "Avísame por WhatsApp cuando lo despachen".
- **Endpoint:** `POST /api/orders/:slug/buyer-contact`

  ```json
  { "buyer": "G…clave del comprador…", "whatsapp": "591 76543210" }
  ```

  | Caso | Status | Body |
  |---|---|---|
  | OK | 200 | `{ "ok": true }` |
  | `buyer` distinto de `orders.buyer_pubkey` | 403 | `{ "error": "Solo el comprador puede dejar su WhatsApp" }` |
  | Menos de 7 dígitos | 400 | `{ "error": "Escribe un WhatsApp válido" }` |

  Se identifica por la dirección pública, igual que el resto de acciones que no van on-chain (DECISIONES 15).
- **Privacidad:** `buyer_whatsapp` **no** se agrega a `GET /api/orders/:slug` ni a `GET /api/sellers/:pubkey`, que son públicas. El bot lo recibe solo por §2, que pide la clave.

## §5. Registro con el número precargado (opcional)

El bot manda a los números sin tienda a `/vender?wa=59171234567`. Si viene `wa`, `/vender` puede precargar el campo WhatsApp del paso 2. Hoy el parámetro se ignora y el registro funciona igual.

## Resumen

| # | Qué | Tipo | Sin esto |
|---|---|---|---|
| 0 | `PP_BOT_KEY` + `checkBot` | config | — |
| 1 | `GET /api/bot/sellers?phone=` | endpoint nuevo | `vincular <clave>` |
| 2 | `GET /api/bot/changes?since=` | endpoint nuevo | revisa pedido por pedido |
| 3 | `/panel?enviar=&evidencia=` | parámetros de página | abre `/panel` |
| 4 | `buyer_whatsapp` + `POST /api/orders/:slug/buyer-contact` | columna + endpoint | sin avisos al comprador |
| 5 | `/vender?wa=` | parámetro de página | el vendedor escribe su número |
