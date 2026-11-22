// El cliente de red no se guarda en globalThis (abrir /metricas antes del primer pago rompía los pagos) y la consulta de
// eventos se parte en tandas de 5 contratos, que es lo máximo que acepta el RPC. Sin red ni llaves.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { StrKey } from "@stellar/stellar-sdk";
import { redFalsa } from "./red-falsa.mjs";

process.env.PP_DB_PATH = path.join(mkdtempSync(path.join(os.tmpdir(), "tandas-")), "t.db");
const { db } = await import("../src/lib/server/db.ts");
const { enTandas, ingestEventsDe } = await import("../src/lib/server/metrics.ts");
const { server } = await import("../src/lib/server/stellar.ts");

const contrato = (n) => StrKey.encodeContract(Buffer.alloc(32, n));

test("el cliente de red NO queda en globalThis y se reutiliza", () => {
  delete globalThis.__ppRpc;
  const a = server();
  assert.equal(globalThis.__ppRpc, undefined, "una ruta que lo crea no puede dejarlo para las demás");
  assert.equal(server(), a);
});

test("enTandas: nunca más de 5 por tanda y no pierde ninguno", () => {
  const ids = Array.from({ length: 12 }, (_, i) => i);
  const t = enTandas(ids);
  assert.deepEqual(t.map((x) => x.length), [5, 5, 2]);
  assert.deepEqual(t.flat(), ids);
  assert.deepEqual(enTandas([]), []);
});

test("6 contratos: se piden en tandas de 5 y el RPC no rechaza nada", async () => {
  db().prepare(`DELETE FROM pp_events`).run();
  const red = redFalsa();
  globalThis.__ppRpc = red.server;
  const ids = [1, 2, 3, 4, 5, 6].map(contrato);
  // Con un único filtro de 6, la red falsa lanza "maximum 5 contract IDs per filter", igual que el RPC público.
  const r = await ingestEventsDe(ids);
  assert.equal(r.latest, 100);
  assert.deepEqual(red.filtros.map((f) => f[0].contractIds.length), [5, 1]);
  assert.deepEqual(red.filtros.flatMap((f) => f[0].contractIds), ids);
  delete globalThis.__ppRpc;
});
