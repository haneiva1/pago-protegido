#!/usr/bin/env node
// npm run demo:reset: deja la base LOCAL de la demo (data/pp.db) limpia y con 2 pedidos históricos coherentes,
// hechos de verdad en TESTNET: uno liberado por confirmación y uno resuelto 70/30 por el árbitro.
// - Borra pedidos, tiendas, transacciones y pendientes locales (las disputas repetidas de pruebas).
// - Conserva la fábrica del escrow (kv) y los eventos on-chain ya ingeridos (pp_events): lo on-chain no se borra.
// - Levanta la app un momento en otro puerto, siembra los pedidos con billeteras locales de un solo uso y la apaga.
import { Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DB = resolve(APP, process.env.PP_DB_PATH || join("data", "pp.db"));
const PORT = process.env.RESET_PORT || "3098";
const BASE = `http://localhost:${PORT}`;
const DEMO_PORT = process.env.DEMO_APP_PORT || "3020";
const SELLER_WA = process.env.DEMO_SELLER_PHONE || "59171234567";
const BUYER_WA = process.env.DEMO_BUYER_PHONE || "59176543210";

const envFile = join(APP, ".env.local");
if (!existsSync(envFile)) {
  console.error("Falta .env.local: corre `npm run setup` primero.");
  process.exit(1);
}
const env = Object.fromEntries(
  readFileSync(envFile, "utf8")
    .split("\n")
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const isUp = async (url) => {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
};
if (await isUp(`http://localhost:${DEMO_PORT}/api/info`)) {
  console.error(`La demo está corriendo en el ${DEMO_PORT}. Apágala (Ctrl+C en npm run demo) y vuelve a correr demo:reset.`);
  process.exit(1);
}

// 1) Limpieza local.
if (existsSync(DB)) {
  const Database = createRequire(import.meta.url)("better-sqlite3");
  const d = new Database(DB);
  const tables = new Set(d.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map((r) => r.name));
  for (const t of ["pending", "txs", "orders", "sellers"]) {
    if (tables.has(t)) console.log(`  ${t}: ${d.prepare(`DELETE FROM ${t}`).run().changes} filas borradas`);
  }
  d.close();
} else {
  console.log("  (no había base local; se crea de cero)");
}

// 2) App temporal para sembrar.
console.log(`Levantando la app en ${BASE} para sembrar pedidos reales de testnet…`);
const app = spawn("npx", ["next", "dev", "-p", PORT], {
  cwd: APP,
  env: { ...process.env, PP_DB_PATH: DB, PORT },
  stdio: ["ignore", "ignore", "pipe"],
  detached: true,
});
const stop = () => {
  try {
    process.kill(-app.pid, "SIGTERM");
  } catch {
    /* ya terminó */
  }
};
process.on("exit", stop);
process.on("SIGINT", () => process.exit(130));
for (let i = 0; i < 90 && !(await isUp(`${BASE}/api/info`)); i++) await new Promise((r) => setTimeout(r, 1000));
if (!(await isUp(`${BASE}/api/info`))) {
  console.error("La app temporal no arrancó. ¿Hay otro `next dev` corriendo en esta carpeta? (Next permite uno por proyecto.)");
  stop();
  process.exit(1);
}

async function api(path, body, headers = {}) {
  const r = await fetch(BASE + path, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${path}: ${j.error}`);
  return j;
}
async function sign(kp, prepared) {
  let cur = prepared;
  while (cur) {
    const tx = TransactionBuilder.fromXDR(cur.xdr, Networks.TESTNET);
    tx.sign(kp);
    const res = await api("/api/tx/submit", { signedXdr: tx.toXDR() });
    console.log(`    ✓ ${cur.label}  https://stellar.expert/explorer/testnet/tx/${res.hash}`);
    cur = res.next;
  }
}
async function activate(kp) {
  const r = await api("/api/wallet/activate", { pubkey: kp.publicKey() });
  if (r.prepared) await sign(kp, r.prepared);
}
async function sale(seller, p) {
  const buyer = Keypair.random();
  const link = await api("/api/links", { sellerPubkey: seller.publicKey(), ...p });
  console.log(`  · ${p.product} (Bs ${p.priceBs}) → /p/${link.slug}`);
  await activate(buyer);
  // El pago encadena varias transacciones: si la red falla, se reintenta (el flujo es idempotente).
  for (let i = 1; ; i++) {
    try {
      await sign(buyer, await api(`/api/orders/${link.slug}/pay`, { buyer: buyer.publicKey(), whatsapp: BUYER_WA }));
      break;
    } catch (e) {
      if (i >= 3) throw e;
      console.log(`    reintento del pago (${e.message})`);
    }
  }
  await sign(seller, await api(`/api/orders/${link.slug}/action`, { action: "ship", signer: seller.publicKey(), evidence: p.evidence }));
  return { slug: link.slug, buyer };
}

try {
  console.log("Sembrando:");
  const seller = Keypair.random();
  await activate(seller);
  await api("/api/sellers", { pubkey: seller.publicKey(), storeName: "Tienda Sofi", whatsapp: SELLER_WA });

  const a = await sale(seller, { product: "Polera Adidas talla M", description: "Negra, original.", priceBs: 300, deliveryDays: 3, evidence: "OLVA-80412" });
  await sign(a.buyer, await api(`/api/orders/${a.slug}/action`, { action: "confirm", signer: a.buyer.publicKey() }));

  const b = await sale(seller, { product: "Audífonos Sony WH-1000", description: "Con estuche.", priceBs: 520, deliveryDays: 5, evidence: "SRV-2026-120033" });
  await sign(b.buyer, await api(`/api/orders/${b.slug}/action`, { action: "dispute", signer: b.buyer.publicKey(), reason: "No es lo que pedí", text: "Llegó otro modelo, sin cancelación de ruido." }));
  await api(`/api/orders/${b.slug}/reply`, { pubkey: seller.publicKey(), text: "Envié el modelo publicado; acepto devolver una parte." });
  const r = await api("/api/arbitro/resolve", { slug: b.slug, buyerBps: 7000 }, { "x-arbitro-key": env.ARBITRO_PANEL_KEY });
  console.log(`    ✓ El árbitro repartió 70/30  https://stellar.expert/explorer/testnet/tx/${r.hash}`);

  const [va, vb] = await Promise.all([api(`/api/orders/${a.slug}`), api(`/api/orders/${b.slug}`)]);
  console.log(`\nListo. Base local ${DB}:`);
  console.log(`  Tienda Sofi (+${SELLER_WA}): "${va.order.product}" ${va.order.status} · "${vb.order.product}" ${vb.order.status}`);
  console.log(`  El panel del árbitro muestra 1 disputa resuelta y ninguna abierta. /transparencia conserva todo lo on-chain.`);
  console.log(`  Para la demo: npm run demo y crea tu tienda en http://localhost:${DEMO_PORT}/vender?wa=${SELLER_WA}`);
} catch (e) {
  console.error(`\ndemo:reset falló: ${e.message}`);
  process.exitCode = 1;
} finally {
  stop();
}
