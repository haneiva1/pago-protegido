// Tests unitarios de las ciudades para los plazos: `npm run test:unit` (node --test, sin dependencias).
import assert from "node:assert/strict";
import { test } from "node:test";
import { esperaParaConfirmar, mismaCiudad } from "../src/lib/ciudades.ts";

test("La Paz y El Alto cuentan como la misma ciudad para el plazo de confirmación", () => {
  assert.equal(mismaCiudad("La Paz", "El Alto"), true);
  assert.equal(mismaCiudad("El Alto", "La Paz"), true);
  assert.equal(mismaCiudad("El Alto", "El Alto"), true);
  assert.equal(mismaCiudad("Cochabamba", "Cochabamba"), true);
  assert.equal(mismaCiudad("La Paz", "Cochabamba"), false);
  assert.equal(mismaCiudad("El Alto", "Oruro"), false);
  assert.equal(mismaCiudad("Otra", "Otra"), false);
  assert.equal(mismaCiudad(null, "La Paz"), false);
  assert.deepEqual(esperaParaConfirmar("La Paz", "El Alto"), { ms: 2 * 3600_000, label: "2 horas (misma ciudad)" });
  assert.deepEqual(esperaParaConfirmar("El Alto", "La Paz"), { ms: 2 * 3600_000, label: "2 horas (misma ciudad)" });
  assert.deepEqual(esperaParaConfirmar("Santa Cruz", "Cochabamba"), { ms: 24 * 3600_000, label: "24 horas (otra ciudad)" });
  assert.deepEqual(esperaParaConfirmar(undefined, "Cochabamba"), { ms: 24 * 3600_000, label: "24 horas (otra ciudad)" });
});
