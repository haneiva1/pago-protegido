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

async function setupOrder(product, priceBs, days) {
  const seller = Keypair.random();
  const buyer = Keypair.random();
  await activate(seller);
  await api("/api/sellers", { pubkey: seller.publicKey(), storeName: "Tienda Humo", whatsapp: "59171234567" });
  const link = await api("/api/links", { sellerPubkey: seller.publicKey(), product, priceBs, deliveryDays: days });
  console.log(`link /p/${link.slug}  ${link.amount_units} unidades`);
  await activate(buyer);
  const fund = await api(`/api/orders/${link.slug}/pay`, { buyer: buyer.publicKey() });
  await signRun(buyer, fund);
  const ship = await api(`/api/orders/${link.slug}/action`, { action: "ship", signer: seller.publicKey(), evidence: "SRV-2026-118734" });
  await signRun(seller, ship);
  return { seller, buyer, slug: link.slug };
}

async function feliz() {
  console.log("== caso feliz ==");
  const { buyer, seller, slug } = await setupOrder("Zapatillas Nike talla 40", 450, 3);
  const confirm = await api(`/api/orders/${slug}/action`, { action: "confirm", signer: buyer.publicKey() });
  await signRun(buyer, confirm);
  const v = await api(`/api/orders/${slug}?onchain=1`);
  console.log("estado:", v.order.status, "desglose:", v.breakdown, "on-chain:", v.onchain?.flags, v.onchain?.balance);
  const s = await api(`/api/sellers/${seller.publicKey()}`);
  console.log("saldo vendedor:", s.balance);
}

async function disputa() {
  console.log("== disputa 70/30 ==");
  const { buyer, slug } = await setupOrder("Polera Adidas M", 300, 5);
  const d = await api(`/api/orders/${slug}/action`, { action: "dispute", signer: buyer.publicKey(), reason: "Llegó dañado", text: "La polera vino rota" });
  await signRun(buyer, d);
  const h = { "x-arbitro-key": env.ARBITRO_PANEL_KEY };
  const probe = await api("/api/arbitro/probe", { slug }, h);
  console.log("intento de desvío:", probe);
  const r = await api("/api/arbitro/resolve", { slug, buyerBps: 7000 }, h);
  console.log(`  ✓ resolución https://stellar.expert/explorer/testnet/tx/${r.hash}`);
  const v = await api(`/api/orders/${slug}?onchain=1`);
  console.log("estado:", v.order.status, "reparto:", v.split, "on-chain:", v.onchain?.flags, v.onchain?.balance);
}

const which = process.argv[2];
if (!which || which === "feliz") await feliz();
if (!which || which === "disputa") await disputa();
