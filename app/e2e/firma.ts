import type { APIRequestContext } from "@playwright/test";
import type { Keypair } from "@stellar/stellar-sdk";
import Database from "better-sqlite3";
import { randomBytes, randomInt } from "node:crypto";
import { linkAmounts } from "../src/lib/format";
import { firmarSep53 } from "../src/lib/sep53";

/** Valor del header `x-trato-firma` para una llamada (lo mismo que lib/api-firmada.ts en el navegador). */
export async function headerFirma(base: string, kp: Keypair, metodo: string, ruta: string): Promise<string> {
  const r = await fetch(`${base}/api/firma/desafio`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cuenta: kp.publicKey(), metodo, ruta: ruta.split("?")[0] }),
  });
  const d = (await r.json()) as { nonce: string; mensaje: string; error?: string };
  if (!r.ok) throw new Error(`${ruta}: ${d.error ?? r.status}`);
  return `${kp.publicKey()}.${d.nonce}.${firmarSep53(kp, d.mensaje)}`;
}

/** Llamada a la API firmada por `kp` desde el `request` de Playwright. */
export async function firmado(request: APIRequestContext, kp: Keypair, method: "GET" | "POST" | "PATCH", path: string, data?: unknown) {
  const d = (await (await request.post("/api/firma/desafio", { data: { cuenta: kp.publicKey(), metodo: method, ruta: path.split("?")[0] } })).json()) as {
    nonce: string;
    mensaje: string;
  };
  return request.fetch(path, { method, data, headers: { "x-trato-firma": `${kp.publicKey()}.${d.nonce}.${firmarSep53(kp, d.mensaje)}` } });
}

/**
 * Tienda de una cuenta de la que el test no tiene la clave (una cuenta de testnet con ventas reales), sembrada en la
 * base local del e2e: por la API ya no se puede, porque crear una tienda o un link pide la firma de esa cuenta.
 * Devuelve el link (pedido esperando pago) creado para esa tienda.
 */
export function sembrarTiendaAjena(t: { pubkey: string; storeName: string; whatsapp: string; city: string }, l: { product: string; priceBs: number; deliveryDays: number }) {
  const db = new Database(process.env.E2E_DB!);
  db.pragma("busy_timeout = 5000");
  const now = Date.now();
  db.prepare(`INSERT INTO sellers (pubkey, store_name, whatsapp, city, pilot, created_at) VALUES (?, ?, ?, ?, 0, ?)`).run(t.pubkey, t.storeName, t.whatsapp, t.city, now);
  const fx = 11.7;
  const priceBsCents = Math.round(l.priceBs * 100);
  const a = linkAmounts(priceBsCents, fx, "comprador");
  const slug = `${l.product.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32)}-${randomBytes(3).toString("hex")}`;
  const code = `PP-${Array.from({ length: 8 }, (_, i) => (i === 0 ? "7" : "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[randomInt(31)])).join("")}`;
  db.prepare(
    `INSERT INTO orders (slug, seller_pubkey, product, price_bs_cents, amount_units, fx, delivery_days, code, category, fee_payer, price_units, platform_bps,
       ship_secs, inspect_secs, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Otro', 'comprador', ?, ?, ?, ?, 'esperando_pago', ?, ?)`,
  ).run(slug, t.pubkey, l.product, priceBsCents, a.amount.toString(), fx, l.deliveryDays, code, a.price.toString(), a.platformBps, l.deliveryDays * 86400, (l.deliveryDays + 3) * 86400, now, now);
  db.close();
  return { slug, code };
}
