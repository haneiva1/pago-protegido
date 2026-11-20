// Tests del indexador verificado con la base SQLite real de la app y una red falsa (red-falsa.mjs): sin red ni llaves.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, test } from "node:test";
import { V1, V2, compra, redFalsa } from "./red-falsa.mjs";

process.env.PP_DB_PATH = path.join(mkdtempSync(path.join(os.tmpdir(), "indexador-")), "t.db");
const { db } = await import("../src/lib/server/db.ts");
const { estadoIndexador, reglasIndexador, verificarPendientes } = await import("../src/lib/server/metrics.ts");

let red;
beforeEach(() => {
  for (const t of ["pp_events", "orders", "sellers", "escrow_verificado"]) db().prepare(`DELETE FROM ${t}`).run();
  red = redFalsa();
  globalThis.__ppRpc = red.server;
  globalThis.fetch = red.fetch;
});

/** El evento `pp_funded` de la compra, como lo guarda ingestEvents. */
function fondeo(c, ledger = 1000) {
  db()
    .prepare(`INSERT INTO pp_events (id, kind, escrow, ledger, closed_at, tx_hash, data_json) VALUES (?, 'pp_funded', ?, ?, ?, ?, ?)`)
    .run(`ev-${c.escrow}`, c.escrow, ledger, new Date(ledger * 5000).toISOString(), c.tx_fondeo, JSON.stringify({ buyer: c.buyer, seller: c.seller, amount: c.amount }));
  return c;
}

/** El pedido de la app que creó el escrow (orders.escrow_id). */
function pedido(c) {
  db().prepare(`INSERT OR IGNORE INTO sellers (pubkey, store_name, whatsapp, created_at) VALUES (?, 'Tienda', '59170000000', 0)`).run(c.seller);
  db()
    .prepare(
      `INSERT INTO orders (slug, seller_pubkey, product, price_bs_cents, amount_units, fx, delivery_days, status, escrow_id, created_at, updated_at)
       VALUES (?, ?, 'Zapatillas', 100000, ?, 11.7, 3, 'pagado', ?, 0, 0)`,
    )
    .run(`s-${c.escrow.slice(1, 9)}`, c.seller, c.amount, c.escrow);
  return c;
}

const motivoDe = (c) => estadoIndexador().descartadas.find((d) => d.escrow === c.escrow)?.motivo;

test("con la config de hoy (v2), los pares aceptados son v2 y v1, sin repetir v2", () => {
  assert.deepEqual(reglasIndexador().pares, [V2, V1]);
});

test("una compra genuina creada por Trato cuenta", async () => {
  const c = pedido(fondeo(red.genuina(compra(1))));
  await verificarPendientes();
  assert.equal(estadoIndexador().ok.has(c.escrow), true);
});

test("5.ª regla: un escrow genuino de TW creado por un tercero (pasa las otras cuatro reglas) no cuenta, y no se lee la red", async () => {
  const deTrato = pedido(fondeo(red.genuina(compra(1))));
  const deTercero = fondeo(red.genuina(compra(2)), 1001); // mismos roles, moneda y transfer exacto, pero no es de un pedido
  await verificarPendientes();
  const st = estadoIndexador();
  assert.equal(st.ok.has(deTrato.escrow), true);
  assert.equal(st.ok.has(deTercero.escrow), false, "el escrow del tercero suma una venta");
  assert.equal(motivoDe(deTercero), "origen");
  assert.deepEqual(red.de(deTercero), [], "un escrow ajeno no gasta lecturas del RPC");
});

// ---------- Falta de dato transitoria: pendiente, nunca descartada ----------

const MIN = 60_000;
const pendiente = (c) => {
  const st = estadoIndexador();
  return !st.ok.has(c.escrow) && !st.descartadas.some((d) => d.escrow === c.escrow) && st.pendientes > 0;
};

test("RPC atrasado y Horizon todavía sin la tx (404) → pendiente, no descartada; cuando la red la tiene, cuenta", async () => {
  const c = pedido(fondeo(red.genuina(compra(1))));
  red.horizon.delete(c.tx_fondeo); // ni el RPC (NOT_FOUND) ni Horizon (404) tienen todavía el pago
  const t0 = Date.now();
  await verificarPendientes({ ahora: t0 });
  assert.equal(motivoDe(c), undefined, "una falta de dato quedó guardada como falla probada");
  assert.equal(pendiente(c), true);
  red.genuina(c); // un rato después la red ya tiene la tx
  await verificarPendientes({ ahora: t0 + 2 * MIN });
  assert.equal(estadoIndexador().ok.has(c.escrow), true);
});

test("instancia archivada por TTL (sin instancia, get_escrow MissingValue) → pendiente, no «no es TW»", async () => {
  const c = pedido(fondeo(red.genuina(compra(1))));
  red.instancias.set(c.escrow, "archivada");
  red.escrows.set(c.escrow, "archivada");
  await verificarPendientes();
  assert.equal(motivoDe(c), undefined);
  assert.equal(pendiente(c), true);
});

test("una contradicción probada descarta aunque falten otros datos: la tx existe y no trae la transferencia", async () => {
  const c = pedido(fondeo(red.genuina(compra(1))));
  red.instancias.set(c.escrow, "archivada");
  red.escrows.set(c.escrow, "archivada");
  red.horizon.set(c.tx_fondeo, []); // Horizon encontró el pago, sin ningún transfer
  await verificarPendientes();
  assert.equal(motivoDe(c), "fondeo");
});

test("espera creciente: una compra pendiente no se relee antes de tiempo y cada intento espera más", async () => {
  const c = pedido(fondeo(red.genuina(compra(1))));
  red.horizon.delete(c.tx_fondeo);
  const lecturas = () => red.de(c).length;
  const t0 = Date.now();
  await verificarPendientes({ ahora: t0 });
  const n1 = lecturas();
  assert.ok(n1 > 0);
  await verificarPendientes({ ahora: t0 + 1000 });
  assert.equal(lecturas(), n1, "se releyó la red antes de la espera");
  await verificarPendientes({ ahora: t0 + MIN + 1000 }); // 2.º intento, después de 1 min
  const n2 = lecturas();
  assert.ok(n2 > n1);
  await verificarPendientes({ ahora: t0 + 2 * MIN + 2000 }); // 1 min después del 2.º: todavía espera (2 min)
  assert.equal(lecturas(), n2, "la espera no creció");
  await verificarPendientes({ ahora: t0 + 3 * MIN + 2000 });
  assert.ok(lecturas() > n2);
});

test("los hechos quedan guardados: si cambia la huella de las reglas, se reevalúa sin leer la red (la instancia ya archivada no pierde su verificación)", async () => {
  const c = pedido(fondeo(red.genuina(compra(1))));
  await verificarPendientes();
  assert.equal(estadoIndexador().ok.has(c.escrow), true);
  // Una semana después la instancia está archivada, el pago salió de la ventana del RPC y cambian las reglas.
  red.instancias.set(c.escrow, "archivada");
  red.escrows.set(c.escrow, "archivada");
  red.horizon.delete(c.tx_fondeo);
  db().prepare(`UPDATE escrow_verificado SET reglas = 'huella-anterior'`).run();
  red.llamadas.length = 0;
  await verificarPendientes();
  assert.equal(estadoIndexador().ok.has(c.escrow), true, "la compra perdió su verificación");
  assert.deepEqual(red.de(c), [], "se volvió a leer la red");
});
