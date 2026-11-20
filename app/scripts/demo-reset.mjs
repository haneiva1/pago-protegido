#!/usr/bin/env node
// npm run demo:reset: deja la base LOCAL de la demo (data/pp.db) limpia y con 3 pedidos históricos coherentes,
// hechos de verdad en TESTNET con los contratos v2: uno liberado por confirmación, uno resuelto 70/30 por el
// revisor y uno devuelto porque el vendedor no despachó a tiempo (refund_unshipped).
// - Borra pedidos, tiendas, transacciones, evidencias y pendientes locales (las disputas repetidas de pruebas).
// - Borra el estado del bot de la demo (../bot/data/bot-state.json): sin avisos viejos ni números vinculados.
// - Conserva la lista de espera del piloto (pilot_waitlist): son datos de personas, no de la demo.
// - Conserva la fábrica del escrow (kv) y los eventos on-chain ya ingeridos (pp_events): lo on-chain no se borra.
// - Levanta la app un momento en otro puerto, siembra los pedidos con billeteras locales de un solo uso y la apaga.
import { Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
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
  for (const t of ["pending", "txs", "evidence", "orders", "sellers"]) {
    if (tables.has(t)) console.log(`  ${t}: ${d.prepare(`DELETE FROM ${t}`).run().changes} filas borradas`);
  }
  d.close();
} else {
  console.log("  (no había base local; se crea de cero)");
}

// Estado del bot de la demo (npm run demo levanta el simulador con data/bot-state.json).
const BOT_STATE = resolve(APP, "..", "bot", process.env.BOT_STATE_FILE || join("data", "bot-state.json"));
if (existsSync(BOT_STATE)) {
  rmSync(BOT_STATE);
  console.log(`  estado del bot: ${BOT_STATE} borrado`);
}

// 2) App temporal para sembrar.
console.log(`Levantando la app en ${BASE} para sembrar pedidos reales de testnet…`);
const app = spawn("npx", ["next", "dev", "-p", PORT], {
  cwd: APP,
  env: { ...process.env, PP_DB_PATH: DB, PORT, PP_DEMO: "1" }, // modo demo: se puede pagar al vendedor 1 minuto después del envío
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
  const { recipient: _r, city: _c, ship: _s, ...linkFields } = p;
  const link = await api("/api/links", { sellerPubkey: seller.publicKey(), ...linkFields });
  console.log(`  · ${p.product} (Bs ${p.priceBs}) → /p/${link.slug}`);
  await activate(buyer);
  // El pago encadena varias transacciones: si la red falla, se reintenta (el flujo es idempotente).
  for (let i = 1; ; i++) {
    try {
      await sign(buyer, await api(`/api/orders/${link.slug}/pay`, { buyer: buyer.publicKey(), whatsapp: BUYER_WA, recipient: p.recipient, city: p.city }));
      break;
    } catch (e) {
      if (i >= 3) throw e;
      console.log(`    reintento del pago (${e.message})`);
    }
  }
  if (!p.ship) return { slug: link.slug, buyer };
  await sign(seller, await api(`/api/orders/${link.slug}/action`, { action: "ship", signer: seller.publicKey(), ...p.ship }));
  return { slug: link.slug, buyer };
}

try {
  // La demo tiene que correr sobre los contratos v2 (fund con dos plazos, mark_shipped, extend, refund_unshipped).
  const info = await api("/api/info");
  if (info.mode !== "guardian" || !info.capabilities?.extend || !info.capabilities?.refundUnshipped) {
    throw new Error(`la app no está en modo guardián v2 (mode=${info.mode})`);
  }
  console.log(`Contratos: ${info.contracts.filter((c) => c.kind === "contract").map((c) => `${c.label.split(" ")[0]} ${c.id}`).join(" · ")}`);
  console.log("Sembrando:");
  const seller = Keypair.random();
  await activate(seller);
  await api("/api/sellers", { pubkey: seller.publicKey(), storeName: "Tienda Sofi", whatsapp: SELLER_WA, city: "Santa Cruz" });

  // (c) Devolución por no despacho: link con plazos de demo (2 min) que nadie despacha. Se paga primero y
  // corre en paralelo con (a) y (b); al vencer el despacho, la app la devuelve sola (disputa de plataforma +
  // pp_arbiter.refund_unshipped).
  const c = await sale(seller, {
    product: "Celular Samsung Galaxy A35",
    description: "Nuevo, en caja.",
    priceBs: 2500,
    deliveryDays: 2,
    category: "Celular",
    demoWindow: true,
    recipient: "Carla Mamani",
    city: "Tarija",
  });

  const a = await sale(seller, {
    product: "Polera Adidas talla M",
    description: "Negra, original.",
    priceBs: 300,
    deliveryDays: 3,
    category: "Ropa y calzado",
    recipient: "Ana Pérez",
    city: "Cochabamba",
    ship: { company: "Trans Copacabana (encomiendas)", tracking: "OLVA-80412", weight: "0.4" },
  });
  // "Pagar al vendedor" se habilita 1 minuto después del envío (modo demo): se reintenta hasta que se pueda.
  for (let i = 0; ; i++) {
    try {
      await sign(a.buyer, await api(`/api/orders/${a.slug}/action`, { action: "confirm", signer: a.buyer.publicKey() }));
      break;
    } catch (e) {
      if (i > 20 || !/Podrás pagar/.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  const b = await sale(seller, {
    product: "Audífonos Sony WH-1000",
    description: "Con estuche.",
    priceBs: 520,
    deliveryDays: 5,
    category: "Electrónica",
    feePayer: "vendedor",
    recipient: "Luis Rojas",
    city: "La Paz",
    ship: { company: "Bolívar (encomiendas)", tracking: "SRV-2026-120033", weight: "0.6" },
  });
  await sign(
    b.buyer,
    await api(`/api/orders/${b.slug}/action`, {
      action: "dispute",
      signer: b.buyer.publicKey(),
      reason: "Dañado o distinto a lo descrito",
      text: "Llegó otro modelo, sin cancelación de ruido.",
      video: "https://example.com/desempaque.mp4",
    }),
  );
  await api(`/api/orders/${b.slug}/reply`, { pubkey: seller.publicKey(), text: "Envié el modelo publicado; acepto devolver una parte." });
  const r = await api("/api/arbitro/resolve", { slug: b.slug, buyerBps: 7000, reason: "Dañado o distinto a lo descrito" }, { "x-arbitro-key": env.ARBITRO_PANEL_KEY });
  console.log(`    ✓ El revisor repartió 70/30  https://stellar.expert/explorer/testnet/tx/${r.hash}`);

  // Consultar el pedido dispara el barrido de devoluciones (como haría la página o el bot).
  let vc = await api(`/api/orders/${c.slug}`);
  console.log(`  · esperando la devolución de "${vc.order.product}" (despacho hasta ${new Date(vc.order.ship_deadline).toLocaleTimeString("es-BO")})…`);
  for (let i = 0; vc.order.status !== "devuelto"; i++) {
    if (i > 80) throw new Error(`"${vc.order.product}" no se devolvió (estado ${vc.order.status})`);
    await new Promise((r) => setTimeout(r, 5000));
    vc = await api(`/api/orders/${c.slug}`);
  }
  for (const t of vc.txs.filter((t) => t.actor === "plataforma" && t.kind !== "escrow")) {
    console.log(`    ✓ ${t.label}  https://stellar.expert/explorer/testnet/tx/${t.hash}`);
  }

  const [va, vb] = await Promise.all([api(`/api/orders/${a.slug}`), api(`/api/orders/${b.slug}`)]);
  console.log(`\nListo. Base local ${DB}:`);
  console.log(`  Tienda Sofi (+${SELLER_WA}): "${va.order.product}" ${va.order.status} · "${vb.order.product}" ${vb.order.status} · "${vc.order.product}" ${vc.order.status}`);
  console.log(`  El panel del revisor muestra 1 reclamo resuelto y ninguno abierto. /transparencia conserva todo lo on-chain.`);
  console.log(`  Para grabar en vivo: npm run demo y crea tu tienda en http://localhost:${DEMO_PORT}/vender?wa=${SELLER_WA}`);
  console.log(`  Para regenerar el video y las capturas de la demo v2: npm run demo:video (arma el mp4 al final)`);
} catch (e) {
  console.error(`\ndemo:reset falló: ${e.message}`);
  process.exitCode = 1;
} finally {
  stop();
}
