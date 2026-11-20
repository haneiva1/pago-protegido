// Tests del indexador verificado con la base SQLite real de la app y una red falsa (red-falsa.mjs): sin red ni llaves.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, test } from "node:test";
import { compra, redFalsa } from "./red-falsa.mjs";

process.env.PP_DB_PATH = path.join(mkdtempSync(path.join(os.tmpdir(), "indexador-")), "t.db");
const { db } = await import("../src/lib/server/db.ts");
const { estadoIndexador, verificarPendientes } = await import("../src/lib/server/metrics.ts");

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
