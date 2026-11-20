// Links que no se pueden bloquear: reserva corta del comprador, códigos de 8 caracteres y límite por IP. `npm run test:api`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import { firma, llamar, nuevoLink, src } from "./entorno.mjs";

const { orders, pending, txs } = await import(src("lib/server/db.ts"));
const { PAGO_EN_CURSO_MS, newCode, submitSigned } = await import(src("lib/server/orders.ts"));
const { limitar, reiniciarLimites, LIMITES } = await import(src("lib/server/limite.ts"));

async function pagar(kp, slug) {
  reiniciarLimites();
  return llamar("orders/[slug]/pay", {
    path: `/api/orders/${slug}/pay`,
    params: { slug },
    body: { recipient: "Ana Pérez", city: "Cochabamba", whatsapp: "76543210" },
    firma: await firma(kp, "POST", `/api/orders/${slug}/pay`),
  });
}

test("quien empieza a pagar y no firma el fondeo bloquea el link solo 10 minutos", async () => {
  const { slug } = nuevoLink();
  const a = Keypair.random();
  const b = Keypair.random();
  const ra = await pagar(a, slug);
  assert.equal(ra.status, 200, JSON.stringify(ra.body));
  const o = orders.get(slug);
  assert.equal(o.buyer_pubkey, a.publicKey());
  assert.ok(o.buyer_lease_until > Date.now() + PAGO_EN_CURSO_MS - 5_000);

  // Mientras dura la reserva, otra persona no puede pagar.
  const rb = await pagar(b, slug);
  assert.equal(rb.status, 409);
  assert.match(rb.body.error, /Otra persona está pagando este link\. Si no termina, se libera a las/);

  // Vence la reserva: la vista pública ya no muestra comprador y B puede pagar con su propio contrato.
  orders.update(slug, { buyer_lease_until: Date.now() - 1 });
  const vista = await llamar("orders/[slug]", { method: "GET", path: `/api/orders/${slug}`, params: { slug } });
  assert.equal(vista.body.order.buyer_pubkey, null);
  const rb2 = await pagar(b, slug);
  assert.equal(rb2.status, 200, JSON.stringify(rb2.body));
  const o2 = orders.get(slug);
  assert.equal(o2.buyer_pubkey, b.publicKey());
  assert.notEqual(o2.escrow_id, o.escrow_id);
  assert.equal(JSON.parse(o2.escrow_json).roles.approver, b.publicKey());
  assert.equal(o2.buyer_whatsapp, "59176543210");
  // Del intento de A no queda la rampa ni el contrato en el registro del pedido.
  assert.equal(txs.forOrder(slug).filter((t) => t.kind === "rampa").length, 1);

  // El fondeo que A había recibido ya no se acepta (ni aunque lo firme ahora).
  assert.equal(pending.take(ra.body.hash), undefined);
  const { TransactionBuilder, Networks } = await import("@stellar/stellar-sdk");
  const txA = TransactionBuilder.fromXDR(ra.body.xdr, Networks.TESTNET);
  txA.sign(a);
  await assert.rejects(submitSigned(txA.toXDR()), /desconocida o ya enviada/);
});

test("el fondeo armado vence antes que la reserva: nunca hay un fondeo vivo de un comprador liberado", async () => {
  const { slug } = nuevoLink();
  const a = Keypair.random();
  const r = await pagar(a, slug);
  const { TransactionBuilder, Networks } = await import("@stellar/stellar-sdk");
  const tx = TransactionBuilder.fromXDR(r.body.xdr, Networks.TESTNET);
  const venceTx = Number(tx.timeBounds.maxTime) * 1000;
  assert.ok(orders.get(slug).buyer_lease_until - venceTx >= 4 * 60_000, "la reserva dura al menos 4 minutos más que la transacción");
});

test("si el pago se completa, el comprador queda fijo aunque pase la reserva", async () => {
  const { slug } = nuevoLink();
  const a = Keypair.random();
  await pagar(a, slug);
  orders.update(slug, { status: "pagado", buyer_lease_until: Date.now() - 1 });
  const r = await pagar(Keypair.random(), slug);
  assert.equal(r.status, 409);
  assert.match(r.body.error, /ya fue pagado/);
  assert.equal(orders.get(slug).buyer_pubkey, a.publicKey());
});

test("códigos: PP- y 8 caracteres sin 0/O/1/I/L, con letra y número, todos distintos", () => {
  const vistos = new Set();
  for (let i = 0; i < 2000; i++) {
    const c = newCode();
    assert.match(c, /^PP-[2-9A-HJKMNP-Z]{8}$/);
    assert.match(c.slice(3), /\d/);
    assert.match(c.slice(3), /[A-Z]/);
    vistos.add(c);
  }
  assert.equal(vistos.size, 2000);
  assert.match(nuevoLink().code, /^PP-[2-9A-HJKMNP-Z]{8}$/);
});

test("/api/verificar: el código nuevo trae el link; uno viejo de 4 dígitos no (se puede adivinar)", async () => {
  const l = nuevoLink();
  const ver = (codigo) => llamar("verificar", { method: "GET", path: `/api/verificar?codigo=${encodeURIComponent(codigo)}` });
  for (const c of [l.code, l.code.toLowerCase(), l.code.replace("PP-", "pp "), l.code.slice(3)]) {
    reiniciarLimites();
    const r = await ver(c);
    assert.equal(r.status, 200, c);
    assert.equal(r.body.slug, l.slug);
    assert.equal(r.body.code, l.code);
  }
  const viejo = nuevoLink();
  orders.update(viejo.slug, { code: "PP-4821" });
  const r = await ver("pp 4821");
  assert.equal(r.status, 200);
  assert.equal(r.body.slug, null);
  assert.equal(r.body.product, "Zapatillas talla 40");
  assert.equal((await ver("PP-ZZZZZZZZ")).status, 404);
});

test("límite por IP: pasado el máximo por minuto responde 429, por IP y por ruta", async () => {
  reiniciarLimites();
  const req = (ip) => new Request("http://localhost/api/verificar", { headers: { "x-forwarded-for": `1.2.3.4, ${ip}` } });
  const t = Date.now();
  for (let i = 0; i < LIMITES.verificar; i++) limitar(req("10.0.0.1"), "verificar", t);
  assert.throws(() => limitar(req("10.0.0.1"), "verificar", t), (e) => e.status === 429);
  // Otra IP (la última de x-forwarded-for, la que agrega el proxy) y otra ruta tienen su propia cuenta.
  limitar(req("10.0.0.2"), "verificar", t);
  limitar(req("10.0.0.1"), "pago", t);
  // Al minuto se vuelve a abrir.
  limitar(req("10.0.0.1"), "verificar", t + 60_000);

  // Por la ruta: /api/verificar responde 429 con el texto en español.
  reiniciarLimites();
  let ultimo;
  for (let i = 0; i <= LIMITES.verificar; i++) ultimo = await llamar("verificar", { method: "GET", path: "/api/verificar?codigo=PP-ZZZZZZZZ", headers: { "x-forwarded-for": "10.9.9.9" } });
  assert.equal(ultimo.status, 429);
  assert.match(ultimo.body.error, /Demasiados intentos/);
  reiniciarLimites();
});
