// Plazos del pedido pagado: el envío con un reclamo abierto, la liberación por plazo y el reclamo fuera de plazo.
// `npm run test:api`.
//
// Casos que fallaban antes:
// - El comprador paga y reclama "No envió" antes de que el vendedor registre el envío. La app ya no dejaba registrarlo
//   (pp_guardian sí lo permite, D-18) y, al vencer el plazo de despacho, la devolución automática le daba todo al
//   comprador sin que decidiera el revisor: el comprador se quedaba con el paquete y con la plata.
// - La pantalla dice "Se libera sola", pero nada llamaba a auto_release: solo la devolución era automática.
// - Pasada la revisión, el comprador todavía podía abrir un reclamo.
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import { nuevoLink, src, tienda } from "./entorno.mjs";

const { orders } = await import(src("lib/server/db.ts"));
const { prepareAction, submitSigned, sweepOverdue } = await import(src("lib/server/orders.ts"));
const { TransactionBuilder, Networks } = await import("@stellar/stellar-sdk");
const { cadena } = await import(new URL("./stubs/escrow.mjs", import.meta.url).href);

const HORA = 3_600_000;
const comprador = Keypair.random();

beforeEach(() => {
  cadena.compras.clear();
  cadena.estados.clear();
  cadena.caida = false;
  cadena.liberados.length = 0;
  cadena.devueltos.length = 0;
});

let n = 0;
/** Un pedido ya pagado por `comprador`, con su escrow, y el estado que se le quiera pisar. */
function pedidoPagado(cambios = {}) {
  const l = nuevoLink();
  const ahora = Date.now();
  orders.update(l.slug, {
    status: "pagado",
    buyer_pubkey: comprador.publicKey(),
    escrow_id: `CPAGADO${++n}`,
    escrow_json: "{}",
    funded_at: ahora - HORA,
    ship_deadline: ahora + 48 * HORA,
    ...cambios,
  });
  return l.slug;
}

/** El comprador o el vendedor firman la transacción que armó el servidor y la mandan, como el navegador. */
async function firmarYMandar(prep, kp) {
  const tx = TransactionBuilder.fromXDR(prep.xdr, Networks.TESTNET);
  tx.sign(kp);
  return submitSigned(tx.toXDR());
}

const envio = { company: "Entrega en persona", weight: "1", photo: "https://ejemplo.com/paquete.jpg", city: "Cochabamba" };

test("con un reclamo abierto, el vendedor puede registrar el envío y el pedido sigue en disputa", async () => {
  const slug = pedidoPagado({ status: "en_disputa", dispute_by: "comprador", dispute_reason: "No envió", disputed_at: Date.now() });
  const prep = await prepareAction(slug, { action: "ship", signer: tienda.publicKey(), ...envio });
  await firmarYMandar(prep, tienda);
  const o = orders.get(slug);
  assert.equal(o.status, "en_disputa", "decide el revisor, no pasa a enviado");
  assert.ok(o.shipped_at, "el envío queda registrado");
  assert.equal(o.ship_company, "Entrega en persona");
});

test("si el vendedor registró el envío durante el reclamo, al vencer el despacho no hay devolución automática", async () => {
  const slug = pedidoPagado({ status: "en_disputa", dispute_by: "comprador", dispute_reason: "No envió", disputed_at: Date.now() });
  await firmarYMandar(await prepareAction(slug, { action: "ship", signer: tienda.publicKey(), ...envio }), tienda);
  orders.update(slug, { ship_deadline: Date.now() - 48 * HORA });
  await sweepOverdue(true);
  assert.equal(cadena.devueltos.length, 0);
  assert.equal(orders.get(slug).status, "en_disputa");
});

test("sin envío registrado, el reclamo no impide la devolución por falta de despacho", async () => {
  const slug = pedidoPagado({ status: "en_disputa", dispute_by: "comprador", dispute_reason: "No envió", ship_deadline: Date.now() - 48 * HORA });
  await sweepOverdue(true);
  assert.deepEqual(cadena.devueltos, [orders.get(slug).escrow_id]);
  assert.equal(orders.get(slug).status, "devuelto");
});

test("pasado el plazo de despacho, ya no se puede registrar el envío", async () => {
  const slug = pedidoPagado({ ship_deadline: Date.now() - 1000 });
  await assert.rejects(prepareAction(slug, { action: "ship", signer: tienda.publicKey(), ...envio }), { status: 409 });
});

test("al vencer la revisión sin reclamo, el barrido le paga al vendedor", async () => {
  const slug = pedidoPagado({ status: "enviado", shipped_at: Date.now() - 72 * HORA, deadline: Date.now() - 24 * HORA });
  await sweepOverdue(true);
  assert.deepEqual(cadena.liberados, [orders.get(slug).escrow_id]);
  assert.equal(orders.get(slug).status, "liberado");
});

test("el barrido no libera una revisión que todavía corre", async () => {
  const slug = pedidoPagado({ status: "enviado", shipped_at: Date.now() - HORA, deadline: Date.now() + 23 * HORA });
  await sweepOverdue(true);
  assert.equal(cadena.liberados.length, 0);
  assert.equal(orders.get(slug).status, "enviado");
});

test("el barrido no libera si la red tiene un reclamo abierto que la base todavía no vio", async () => {
  const slug = pedidoPagado({ status: "enviado", shipped_at: Date.now() - 72 * HORA, deadline: Date.now() - 24 * HORA });
  cadena.estados.set(orders.get(slug).escrow_id, { balance: "1234", flags: { disputed: true, released: false, resolved: false }, milestone: null, roles: null });
  await sweepOverdue(true);
  assert.equal(cadena.liberados.length, 0);
});

test("pasada la revisión, el comprador ya no puede abrir un reclamo", async () => {
  const slug = pedidoPagado({ status: "enviado", shipped_at: Date.now() - 72 * HORA, deadline: Date.now() - 1000 });
  await assert.rejects(
    prepareAction(slug, { action: "dispute", signer: comprador.publicKey(), reason: "No llegó", text: "", photo: "", video: "" }),
    (e) => e.status === 409 && /tiempo de revisión/.test(e.message),
  );
});

test("dentro de la revisión, el comprador sí puede reclamar", async () => {
  const slug = pedidoPagado({ status: "enviado", shipped_at: Date.now() - HORA, deadline: Date.now() + 23 * HORA });
  const prep = await prepareAction(slug, { action: "dispute", signer: comprador.publicKey(), reason: "No llegó", text: "", photo: "", video: "" });
  assert.equal(prep.action, "dispute");
});
