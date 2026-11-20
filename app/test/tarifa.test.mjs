// La tarifa de docs/TECNICO.md, con los mismos ejemplos: `npm run test:unit` (node --test, sin dependencias).
// Usa el tipo de cambio de la demo (FX_BS_PER_USD por defecto: 11,7) y el mismo reparto que el contrato.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fmtBsUnits, linkAmounts, releaseBreakdown } from "../src/lib/format.ts";

const FX = 11.7;

test("Bs 450, la paga el comprador: protección Bs 6,75, paga Bs 456,75, el vendedor recibe Bs 450,04 y la plataforma 117 bps", () => {
  const l = linkAmounts(45_000, FX, "comprador");
  assert.equal(l.protectionBsCents, 675);
  assert.equal(fmtBsUnits(l.amount, FX), "Bs 456,75");
  assert.equal(l.platformBps, 117);
  const r = releaseBreakdown(l.amount, l.platformBps);
  assert.ok(r.seller >= l.price, "el vendedor nunca recibe menos que el precio");
  assert.equal(fmtBsUnits(r.seller, FX), "Bs 450,04");
});

test("Bs 300, la regala el vendedor: el comprador paga Bs 300,00 y al vendedor le quedan Bs 293,10 (2% + 0,3%)", () => {
  const l = linkAmounts(30_000, FX, "vendedor");
  assert.equal(l.protectionBsCents, 0);
  assert.equal(l.platformBps, 200);
  assert.equal(fmtBsUnits(l.amount, FX), "Bs 300,00");
  assert.equal(fmtBsUnits(releaseBreakdown(l.amount, l.platformBps).seller, FX), "Bs 293,10");
});

test("topes de la protección: Bs 100 → Bs 5 (mínimo) y Bs 5.000 → Bs 50 (tope)", () => {
  assert.equal(linkAmounts(10_000, FX, "comprador").protectionBsCents, 500);
  assert.equal(linkAmounts(500_000, FX, "comprador").protectionBsCents, 5_000);
});
