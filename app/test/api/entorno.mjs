// Entorno común de los tests de la API: base SQLite temporal, variables de prueba y ayudas para llamar las rutas.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const ctx = { db: join(mkdtempSync(join(tmpdir(), "trato-api-")), "api.db") };
process.env.PP_DB_PATH = ctx.db;
process.env.PP_MODE = "guardian";
process.env.PP_BOT_KEY = "clave-del-bot-de-prueba";
process.env.LABUSD_SAC = "CC65P6TQQ646YDXVS3PM6YVZASXW6WM5B67YKI46JH4EG65LJPOGBD4S";
delete process.env.PP_LIMITE_FACTOR;
delete process.env.PP_IP_HEADER;

const { Keypair } = await import("@stellar/stellar-sdk");

export const src = (p) => new URL(`../../src/${p}`, import.meta.url).href;
const { firmarSep53 } = await import(src("lib/sep53.ts"));
const { saveSeller, createLink } = await import(src("lib/server/orders.ts"));
const { reiniciarLimites } = await import(src("lib/server/limite.ts"));
const desafio = await import(src("app/api/firma/desafio/route.ts"));

export const tienda = Keypair.random();
export const otra = Keypair.random();
export const comprador = Keypair.random();
saveSeller({ pubkey: tienda.publicKey(), storeName: "Tienda Sofi", whatsapp: "59171234567", city: "Santa Cruz" });

export const nuevoLink = (extra = {}) => createLink({ sellerPubkey: tienda.publicKey(), product: "Zapatillas talla 40", priceBs: 450, deliveryDays: 3, ...extra });

/** Header `x-trato-firma` para `metodo ruta`, firmado por `kp` (lo mismo que lib/api-firmada.ts). */
export async function firma(kp, metodo, ruta) {
  reiniciarLimites();
  const r = await desafio.POST(new Request("http://localhost/api/firma/desafio", { method: "POST", body: JSON.stringify({ cuenta: kp.publicKey(), metodo, ruta }) }));
  const d = await r.json();
  assert.equal(r.status, 200, d.error);
  return `${kp.publicKey()}.${d.nonce}.${firmarSep53(kp, d.mensaje)}`;
}

const rutas = new Map();
/** Llama al handler de `src/app/api/<archivo>/route.ts` como lo haría Next.js. */
export async function llamar(archivo, { method = "POST", path, body, params = {}, firma: f, headers = {} }) {
  if (!rutas.has(archivo)) rutas.set(archivo, await import(src(`app/api/${archivo}/route.ts`)));
  const h = { "content-type": "application/json", ...headers };
  if (f) h["x-trato-firma"] = f;
  const req = new Request(`http://localhost${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const res = await rutas.get(archivo)[method](req, { params: Promise.resolve(params) });
  return { status: res.status, body: await res.json() };
}
