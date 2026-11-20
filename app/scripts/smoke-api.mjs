#!/usr/bin/env node
// Prueba de humo del backend contra TESTNET, sin navegador: este script hace de billetera local
// (firma lo que arma el servidor) y recorre el caso feliz y el de disputa 70/30.
// Uso: con la app corriendo (npm run dev), `node scripts/smoke-api.mjs [feliz|disputa]`.
import { Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

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

async function signRun(kp, prepared) {
  let cur = prepared;
  let last;
  while (cur) {
    const tx = TransactionBuilder.fromXDR(cur.xdr, Networks.TESTNET);
    tx.sign(kp);
    last = await api("/api/tx/submit", { signedXdr: tx.toXDR() });
    console.log(`  ✓ ${cur.label}  https://stellar.expert/explorer/testnet/tx/${last.hash}`);
    cur = last.next;
  }
  return last;
}

async function activate(kp) {
  const r = await api("/api/wallet/activate", { pubkey: kp.publicKey() });
  if (r.prepared) await signRun(kp, r.prepared);
}

async function setupOrder(product, priceBs, days, opts = {}) {
  const seller = Keypair.random();
  const buyer = Keypair.random();
  await activate(seller);
  await api("/api/sellers", { pubkey: seller.publicKey(), storeName: "Tienda Humo", whatsapp: "59171234567", city: "Santa Cruz" });
  const link = await api("/api/links", { sellerPubkey: seller.publicKey(), product, priceBs, deliveryDays: days, demoWindow: Boolean(opts.demo) });
  console.log(`link /p/${link.slug}  ${link.amount_units} unidades`);
  await activate(buyer);
  const fund = await api(`/api/orders/${link.slug}/pay`, { buyer: buyer.publicKey(), recipient: "Ana Pérez", city: "Cochabamba" });
  await signRun(buyer, fund);
  if (opts.noShip) return { seller, buyer, slug: link.slug };
  const ship = await api(`/api/orders/${link.slug}/action`, { action: "ship", signer: seller.publicKey(), company: "Trans Copacabana (encomiendas)", tracking: "SRV-2026-118734", weight: "1" });
  await signRun(seller, ship);
  return { seller, buyer, slug: link.slug };
}

async function feliz() {
  console.log("== caso feliz ==");
  const { buyer, seller, slug } = await setupOrder("Zapatillas Nike talla 40", 450, 3);
  // Con PP_DEMO=1 se puede pagar al vendedor 1 minuto después del envío.
  for (let i = 0; ; i++) {
    try {
      await signRun(buyer, await api(`/api/orders/${slug}/action`, { action: "confirm", signer: buyer.publicKey() }));
      break;
    } catch (e) {
      if (i > 20 || !/Podrás pagar/.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  const v = await api(`/api/orders/${slug}?onchain=1`);
  console.log("estado:", v.order.status, "desglose:", v.breakdown, "on-chain:", v.onchain?.flags, v.onchain?.balance);
  const s = await api(`/api/sellers/${seller.publicKey()}/panel`);
  console.log("saldo vendedor:", s.balance);
}

async function disputa() {
  console.log("== disputa 70/30 ==");
  const { buyer, slug } = await setupOrder("Polera Adidas M", 300, 5);
  const d = await api(`/api/orders/${slug}/action`, { action: "dispute", signer: buyer.publicKey(), reason: "Dañado o distinto a lo descrito", text: "La polera vino rota", video: "https://example.com/desempaque.mp4" });
  await signRun(buyer, d);
  const h = { "x-arbitro-key": env.ARBITRO_PANEL_KEY };
  const probe = await api("/api/arbitro/probe", { slug }, h);
  console.log("intento de desvío:", probe);
  const r = await api("/api/arbitro/resolve", { slug, buyerBps: 7000, reason: "Dañado o distinto a lo descrito" }, h);
  console.log(`  ✓ resolución https://stellar.expert/explorer/testnet/tx/${r.hash}`);
  const v = await api(`/api/orders/${slug}?onchain=1`);
  console.log("estado:", v.order.status, "reparto:", v.split, "on-chain:", v.onchain?.flags, v.onchain?.balance);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** v2: "Necesito más tiempo" (extend, una vez) y liberación automática al vencer la revisión extendida. */
async function extend() {
  console.log("== extend + auto_release (v2, plazos de demo de 2 min) ==");
  const { buyer, slug } = await setupOrder("Celular de prueba extend", 500, 3, { demo: true });
  let v = await api(`/api/orders/${slug}`);
  const before = v.order.deadline;
  await signRun(buyer, await api(`/api/orders/${slug}/extend`, { signer: buyer.publicKey() }));
  v = await api(`/api/orders/${slug}`);
  console.log("revisión:", new Date(before).toISOString(), "→", new Date(v.order.deadline).toISOString(), "extended:", v.order.extended);
  try {
    await api(`/api/orders/${slug}/extend`, { signer: buyer.publicKey() });
    throw new Error("un segundo extend no debía prepararse");
  } catch (e) {
    console.log("  ✓ segundo extend rechazado:", e.message);
  }
  while (Date.now() < v.order.deadline + 8000) await sleep(5000);
  const r = await api(`/api/orders/${slug}/auto-release`, {});
  console.log(`  ✓ auto_release https://stellar.expert/explorer/testnet/tx/${r.hash}`);
  v = await api(`/api/orders/${slug}?onchain=1`);
  console.log("estado:", v.order.status, "on-chain:", v.onchain?.flags, v.onchain?.balance);
}

/** v2: el vendedor no despacha a tiempo → disputa de la plataforma + refund_unshipped, sin firmas de usuarios. */
async function devolucion() {
  console.log("== devolución por no despacho (v2, plazo de demo de 2 min) ==");
  const { slug } = await setupOrder("Celular que nunca se envía", 500, 3, { demo: true, noShip: true });
  let v = await api(`/api/orders/${slug}`);
  console.log("despachar antes de:", new Date(v.order.ship_deadline).toISOString());
  while (v.order.status !== "devuelto") {
    await sleep(5000);
    v = await api(`/api/orders/${slug}`);
  }
  v = await api(`/api/orders/${slug}?onchain=1`);
  console.log("estado:", v.order.status, "reparto:", v.split, "on-chain:", v.onchain?.flags, v.onchain?.balance);
  for (const t of v.txs.slice(-2)) console.log(`  ✓ ${t.label}  https://stellar.expert/explorer/testnet/tx/${t.hash}`);
}

const which = process.argv[2];
if (which === "extend") await extend();
if (which === "devolucion") await devolucion();
if (!which || which === "feliz") await feliz();
if (!which || which === "disputa") await disputa();
