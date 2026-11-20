// Tests unitarios de la lógica pura del comprador: `npm run test:unit` (node --test, sin dependencias).
import assert from "node:assert/strict";
import { test } from "node:test";
import { fmtPlazo, plazosDelPedido } from "../src/lib/comprador.ts";

test("plazos: despacho y revisión del pedido (v2), con los valores por defecto", () => {
  assert.deepEqual(plazosDelPedido({ ship_secs: 120, inspect_secs: 120, delivery_days: 1 }), { despacho: 120, revision: 120 });
  assert.deepEqual(plazosDelPedido({ delivery_days: 3 }), { despacho: 3 * 86400, revision: 6 * 86400 });
  assert.deepEqual(plazosDelPedido({ window_secs: 600, delivery_days: 3 }), { despacho: 600, revision: 600 });
});

test("fmtPlazo: días y minutos en palabras", () => {
  assert.equal(fmtPlazo(86400), "1 día");
  assert.equal(fmtPlazo(6 * 86400), "6 días");
  assert.equal(fmtPlazo(120), "2 minutos");
  assert.equal(fmtPlazo(30), "1 minuto");
});
