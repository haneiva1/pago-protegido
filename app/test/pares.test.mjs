// El día que se despliegue v3: las compras v1 y v2 siguen contando y sus eventos se siguen leyendo.
// Proceso propio (node --test corre cada archivo aparte) porque cfg() lee PP_GUARDIAN_ID una sola vez.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { V1, V2, compra, contrato, redFalsa } from "./red-falsa.mjs";

const V3 = { guardian: contrato(201), arbiter: contrato(202) };
process.env.PP_GUARDIAN_ID = V3.guardian;
process.env.PP_ARBITER_ID = V3.arbiter;
process.env.PP_DB_PATH = path.join(mkdtempSync(path.join(os.tmpdir(), "pares-")), "t.db");
const { db } = await import("../src/lib/server/db.ts");
const { estadoIndexador, ingestEvents, reglasIndexador, verificarPendientes } = await import("../src/lib/server/metrics.ts");

const red = redFalsa();
globalThis.__ppRpc = red.server;
globalThis.fetch = red.fetch;

test("con v3 en la config, los pares aceptados son v3, v2 y v1, sin repetidos", () => {
  const pares = reglasIndexador().pares.map((p) => `${p.guardian}/${p.arbiter}`);
  assert.deepEqual(new Set(pares), new Set([V3, V2, V1].map((p) => `${p.guardian}/${p.arbiter}`)));
  assert.equal(pares.length, 3);
});

test("con v3 en la config, una compra v2 de Trato sigue contando (no falla en «roles»)", async () => {
  const c = red.genuina(compra(1), V2);
  db().prepare(`INSERT INTO sellers (pubkey, store_name, whatsapp, created_at) VALUES (?, 'Tienda', '59170000000', 0)`).run(c.seller);
  db()
    .prepare(
      `INSERT INTO orders (slug, seller_pubkey, product, price_bs_cents, amount_units, fx, delivery_days, status, escrow_id, created_at, updated_at)
       VALUES ('v2', ?, 'Zapatillas', 100000, ?, 11.7, 3, 'pagado', ?, 0, 0)`,
    )
    .run(c.seller, c.amount, c.escrow);
  db()
    .prepare(`INSERT INTO pp_events (id, kind, escrow, ledger, closed_at, tx_hash, data_json) VALUES ('ev', 'pp_funded', ?, 1, '2026-11-01T00:00:00Z', ?, ?)`)
    .run(c.escrow, c.tx_fondeo, JSON.stringify({ buyer: c.buyer, seller: c.seller, amount: c.amount }));
  await verificarPendientes();
  const st = estadoIndexador();
  assert.deepEqual(st.descartadas.map((d) => d.motivo), []);
  assert.equal(st.ok.has(c.escrow), true);
});

test("ingestEvents lee los eventos de los contratos de todos los pares (v3, v2 y v1)", async () => {
  await ingestEvents(true);
  const ids = red.filtros.flat().flatMap((f) => f.contractIds);
  assert.deepEqual(new Set(ids), new Set([V3, V2, V1].flatMap((p) => [p.guardian, p.arbiter])));
});
