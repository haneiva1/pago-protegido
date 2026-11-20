// Lo que ve cualquiera con el link de un pedido, sin firma. `npm run test:api`.
//
// El caso: GET /api/orders/<slug> devolvía la foto del paquete, la ciudad de destino, el texto, la foto y el video del
// reclamo y la respuesta del vendedor; la línea de tiempo pública decía la ciudad y el IMEI. Y el slug y el código del
// pedido iban a la red (engagement_id y description del escrow), así que desde los escrows publicados en /transparencia
// se llegaba a cada pedido.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import { firma, llamar, nuevoLink, src } from "./entorno.mjs";

const { orders, txs } = await import(src("lib/server/db.ts"));
const { reiniciarLimites } = await import(src("lib/server/limite.ts"));
const { escrows } = await import(new URL("./stubs/escrow.mjs", import.meta.url).href);

const PRIVADOS = {
  ship_photo: "https://ejemplo.com/guia-con-nombre-y-telefono.jpg",
  ship_city: "Cochabamba",
  dispute_text: "Me llegó una caja vacía, mi dirección es…",
  dispute_photo: "https://ejemplo.com/reclamo.jpg",
  dispute_video: "https://ejemplo.com/desempaque.mp4",
  seller_reply: "Lo despaché con el IMEI correcto",
};

test("la vista pública del pedido no trae la evidencia del envío ni del reclamo", async () => {
  const { slug } = nuevoLink();
  orders.update(slug, { status: "en_disputa", ship_company: "Bolivia Express", ship_tracking: "BX-123", ship_weight: "1", ...PRIVADOS });
  const r = await llamar("orders/[slug]", { method: "GET", path: `/api/orders/${slug}`, params: { slug } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  for (const campo of Object.keys(PRIVADOS)) assert.equal(r.body.order[campo], undefined, `${campo} no tiene que ser público`);
  // Lo que el comprador necesita para retirar el paquete sigue ahí.
  assert.equal(r.body.order.ship_company, "Bolivia Express");
  assert.equal(r.body.order.ship_tracking, "BX-123");
});

test("el escrow nuevo no lleva el slug ni el código del pedido", async () => {
  const kp = Keypair.random();
  const { slug, code } = nuevoLink();
  reiniciarLimites();
  const r = await llamar("orders/[slug]/pay", {
    path: `/api/orders/${slug}/pay`,
    params: { slug },
    body: { recipient: "Ana Pérez", city: "Cochabamba", whatsapp: "76543210" },
    firma: await firma(kp, "POST", `/api/orders/${slug}/pay`),
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const props = escrows.at(-1);
  const enRed = JSON.stringify(props);
  assert.ok(!enRed.includes(slug), `el slug aparece en el escrow: ${props.engagement_id} / ${props.description}`);
  assert.ok(!enRed.includes(code), "el código del pedido aparece en el escrow");
  assert.match(props.engagement_id, /^pp-[0-9a-f]{16}$/);
});

test("la línea de tiempo pública del envío no dice la ciudad ni el IMEI", async () => {
  const { slug } = nuevoLink();
  const { prepareAction, submitSigned } = await import(src("lib/server/orders.ts"));
  const { TransactionBuilder, Networks } = await import("@stellar/stellar-sdk");
  const { tienda } = await import("./entorno.mjs");
  orders.update(slug, {
    status: "pagado",
    category: "Celular",
    buyer_pubkey: Keypair.random().publicKey(),
    escrow_id: "CPRIVACIDAD1",
    escrow_json: "{}",
    ship_deadline: Date.now() + 86_400_000,
  });
  const prep = await prepareAction(slug, {
    action: "ship",
    signer: tienda.publicKey(),
    company: "Entrega en persona",
    weight: "0.4",
    photo: "https://ejemplo.com/paquete.jpg",
    city: "Tarija",
    imei: "356938035643809",
  });
  const tx = TransactionBuilder.fromXDR(prep.xdr, Networks.TESTNET);
  tx.sign(tienda);
  await submitSigned(tx.toXDR());
  const linea = txs.forOrder(slug).find((t) => t.kind === "envio");
  assert.ok(linea, "falta la línea del envío");
  assert.ok(!linea.label.includes("Tarija"), linea.label);
  assert.ok(!linea.label.includes("356938035643809"), linea.label);
});
