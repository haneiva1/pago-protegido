// Antes de liberar un link o darlo por libre, se le pregunta a la red si el fondeo ya entró. `npm run test:api`.
//
// El caso: el comprador A firma el fondeo y /api/tx/submit lo envía, pero la red tarda más que la espera de
// sendAndWait (o el RPC falla al consultarlo). El fondeo entra igual, y la base queda en "esperando_pago". Si el link
// se libera solo por la hora, el comprador B paga otro contrato, el vendedor le despacha a B y la plata de A queda en
// un contrato que la app ya no conoce. La red es la que sabe: si hay compra registrada, el pedido está pagado; si no se
// puede saber, no se libera.
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import { firma, llamar, nuevoLink, src, tienda } from "./entorno.mjs";

const { orders } = await import(src("lib/server/db.ts"));
const { orderView, sweepOverdue } = await import(src("lib/server/orders.ts"));
const { reiniciarLimites } = await import(src("lib/server/limite.ts"));
const { cadena } = await import(new URL("./stubs/escrow.mjs", import.meta.url).href);

const FONDEADO_EN = Date.parse("2026-11-20T06:00:00Z");
const compraEnCadena = () => ({
  fundedAt: FONDEADO_EN,
  shipDeadline: FONDEADO_EN + 3 * 86_400_000,
  shippedAt: null,
  releaseAt: null,
  extended: false,
  evidence: null,
});

beforeEach(() => {
  cadena.compras.clear();
  cadena.estados.clear();
  cadena.caida = false;
});

/** Lo que lee la página con `?onchain=1`: el escrow de TW con saldo. */
const estadoConSaldo = () => ({
  balance: "1234",
  flags: { disputed: false, released: false, resolved: false },
  milestone: null,
  roles: null,
});

async function pagar(kp, slug) {
  reiniciarLimites();
  return llamar("orders/[slug]/pay", {
    path: `/api/orders/${slug}/pay`,
    params: { slug },
    body: { recipient: "Ana Pérez", city: "Cochabamba", whatsapp: "76543210" },
    firma: await firma(kp, "POST", `/api/orders/${slug}/pay`),
  });
}

async function cambiarProteccion(slug, proteccion) {
  reiniciarLimites();
  return llamar("links/[slug]", {
    method: "PATCH",
    path: `/api/links/${slug}`,
    params: { slug },
    body: { proteccion },
    firma: await firma(tienda, "PATCH", `/api/links/${slug}`),
  });
}

/** A empezó a pagar (hay contrato y fondeo armado) y su reserva ya venció. */
async function intentoVencido() {
  const { slug } = nuevoLink();
  const a = Keypair.random();
  const r = await pagar(a, slug);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  orders.update(slug, { buyer_lease_until: Date.now() - 1 });
  return { slug, a, escrow: orders.get(slug).escrow_id };
}

test("fondeo que entró en la red con la base atrasada: otro comprador no puede tomar el link y el pedido queda pagado", async () => {
  const { slug, a, escrow } = await intentoVencido();
  cadena.compras.set(escrow, compraEnCadena());

  const rb = await pagar(Keypair.random(), slug);
  assert.equal(rb.status, 409, JSON.stringify(rb.body));
  assert.match(rb.body.error, /ya fue pagado/);

  const o = orders.get(slug);
  assert.equal(o.status, "pagado");
  assert.equal(o.buyer_pubkey, a.publicKey(), "el comprador sigue siendo quien pagó");
  assert.equal(o.escrow_id, escrow, "el contrato con la plata sigue siendo el del pedido");
  assert.equal(o.funded_at, FONDEADO_EN, "los plazos salen de la red");
  assert.equal(o.ship_deadline, FONDEADO_EN + 3 * 86_400_000);
});

test("si la red no responde, el link no se libera", async () => {
  const { slug, a, escrow } = await intentoVencido();
  cadena.caida = true;

  const rb = await pagar(Keypair.random(), slug);
  assert.equal(rb.status, 503, JSON.stringify(rb.body));
  assert.match(rb.body.error, /No pudimos confirmar/);

  const o = orders.get(slug);
  assert.equal(o.status, "esperando_pago");
  assert.equal(o.buyer_pubkey, a.publicKey());
  assert.equal(o.escrow_id, escrow);
});

test("sin fondeo en la red, el link se libera como antes y paga el siguiente", async () => {
  const { slug, escrow } = await intentoVencido();
  const b = Keypair.random();
  const rb = await pagar(b, slug);
  assert.equal(rb.status, 200, JSON.stringify(rb.body));
  const o = orders.get(slug);
  assert.equal(o.buyer_pubkey, b.publicKey());
  assert.notEqual(o.escrow_id, escrow);
});

test("el mismo comprador que vuelve después de un fondeo que entró: el pedido queda pagado, no se arma otro fondeo", async () => {
  const { slug, a, escrow } = await intentoVencido();
  cadena.compras.set(escrow, compraEnCadena());
  const ra = await pagar(a, slug);
  assert.equal(ra.status, 409, JSON.stringify(ra.body));
  assert.match(ra.body.error, /ya fue pagado/);
  assert.equal(orders.get(slug).status, "pagado");
});

test("el vendedor no puede cambiar la protección de un link cuyo fondeo ya entró, ni liberarlo si la red no responde", async () => {
  const caso1 = await intentoVencido();
  cadena.compras.set(caso1.escrow, compraEnCadena());
  const r1 = await cambiarProteccion(caso1.slug, "vendedor");
  assert.equal(r1.status, 409, JSON.stringify(r1.body));
  assert.equal(orders.get(caso1.slug).status, "pagado");

  const caso2 = await intentoVencido();
  cadena.caida = true;
  const r2 = await cambiarProteccion(caso2.slug, "vendedor");
  assert.equal(r2.status, 503, JSON.stringify(r2.body));
  assert.equal(orders.get(caso2.slug).buyer_pubkey, caso2.a.publicKey());
  assert.equal(orders.get(caso2.slug).escrow_id, caso2.escrow);
});

test("la página del pedido (con la red) se pone al día sola si el fondeo entró, aun dentro de la reserva", async () => {
  const { slug } = nuevoLink();
  const a = Keypair.random();
  assert.equal((await pagar(a, slug)).status, 200);
  const escrow = orders.get(slug).escrow_id;
  // Sin saldo en el escrow, la página no consulta la compra (no suma llamadas en el camino normal).
  // Antes se pone al día el barrido (intentos que dejaron otros tests), para medir solo la página.
  await sweepOverdue(true);
  const antes = cadena.consultas;
  await orderView(slug, true);
  assert.equal(cadena.consultas, antes);
  // Con saldo y compra registrada, el pedido pasa a pagado aunque /api/tx/submit no lo haya anotado.
  cadena.estados.set(escrow, estadoConSaldo());
  cadena.compras.set(escrow, compraEnCadena());
  const v = await orderView(slug, true);
  assert.equal(v.order.status, "pagado");
  assert.equal(orders.get(slug).buyer_pubkey, a.publicKey());
});

test("polvo en el escrow no cuenta como pago: sin compra registrada, el pedido sigue esperando", async () => {
  const { slug } = nuevoLink();
  assert.equal((await pagar(Keypair.random(), slug)).status, 200);
  cadena.estados.set(orders.get(slug).escrow_id, estadoConSaldo());
  const v = await orderView(slug, true);
  assert.equal(v.order.status, "esperando_pago");
});

test("el barrido pone al día los intentos vencidos: pagado si entró, y una sola consulta si no entró", async () => {
  const entro = await intentoVencido();
  cadena.compras.set(entro.escrow, compraEnCadena());
  const noEntro = await intentoVencido();

  // Sin red: no cambia nada y se vuelve a intentar en el próximo barrido.
  cadena.caida = true;
  await sweepOverdue(true);
  for (const c of [entro, noEntro]) {
    assert.equal(orders.get(c.slug).status, "esperando_pago");
    assert.equal(orders.get(c.slug).escrow_id, c.escrow);
  }

  cadena.caida = false;
  await sweepOverdue(true);
  assert.equal(orders.get(entro.slug).status, "pagado");
  assert.equal(orders.get(entro.slug).funded_at, FONDEADO_EN);
  // Sin fondeo: el link queda como estaba (se libera cuando otro pague) y no se vuelve a consultar.
  assert.equal(orders.get(noEntro.slug).status, "esperando_pago");
  assert.equal(orders.get(noEntro.slug).buyer_pubkey, noEntro.a.publicKey());
  const antes = cadena.consultas;
  await sweepOverdue(true);
  assert.equal(cadena.consultas, antes, "un intento vencido sin fondeo se consulta una sola vez");
});

test("el barrido no consulta la red por intentos que todavía están dentro de su reserva", async () => {
  const { slug } = nuevoLink();
  const r = await pagar(Keypair.random(), slug);
  assert.equal(r.status, 200);
  const antes = cadena.consultas;
  await sweepOverdue(true);
  assert.equal(cadena.consultas, antes);
  assert.equal(orders.get(slug).status, "esperando_pago");
});
