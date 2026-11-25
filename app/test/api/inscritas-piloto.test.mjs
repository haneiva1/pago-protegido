// El contador "tiendas inscritas al piloto" de /metricas y /api/metricas. `npm run test:api`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { llamar, nuevoLink, src } from "./entorno.mjs";

const { reiniciarLimites } = await import(src("lib/server/limite.ts"));
const { COMPRAS_INTERNAS, rotuloCompras, rotuloMonto, rotuloVentas } = await import(src("lib/kpi-format.ts"));

const FICHA = {
  name: "Rosaura Quispe",
  store: "Calzados Rosaura",
  city: "Cochabamba",
  sells: "Botines de cuero",
  shipsTo: "La Paz y Tarija",
  avgTicket: "Bs 350",
  whatsapp: "70011223",
  consent: true,
};

const inscribir = async (extra = {}) => {
  reiniciarLimites();
  return llamar("piloto", { path: "/api/piloto", body: { ...FICHA, ...extra } });
};
const metricas = async () => {
  globalThis.__ppMetricas = undefined; // sin la caché de 30 s
  const r = await llamar("metricas", { method: "GET", path: "/api/metricas" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
};

test("cuenta las tiendas inscritas, una por WhatsApp, y no las suma con las compras", async () => {
  const antes = await metricas();
  assert.equal(antes.tiendas_inscritas_piloto, 0);
  assert.equal((await inscribir()).status, 200);
  // La misma tienda otra vez, con el número escrito de otra forma: sigue siendo una.
  assert.equal((await inscribir({ whatsapp: "+591 700 11223" })).status, 200);
  assert.equal((await metricas()).tiendas_inscritas_piloto, 1);
  assert.equal((await inscribir({ store: "Cel Center", whatsapp: "59176655443" })).status, 200);
  const m = await metricas();
  assert.equal(m.tiendas_inscritas_piloto, 2);
  assert.equal(m.piloto.kpis.compras, antes.piloto.kpis.compras);
  assert.equal(m.equipo.kpis.compras, antes.equipo.kpis.compras);
});

test("una inscripción rechazada (sin consentimiento) no cuenta", async () => {
  const antes = (await metricas()).tiendas_inscritas_piloto;
  assert.equal((await inscribir({ whatsapp: "71112233", consent: false })).status, 400);
  assert.equal((await metricas()).tiendas_inscritas_piloto, antes);
});

test("/api/metricas no trae ningún dato de las inscripciones, solo el número", async () => {
  await inscribir();
  const json = JSON.stringify(await metricas());
  for (const dato of ["Rosaura", "Calzados", "Cochabamba", "Botines", "Tarija", "Bs 350", "70011223"]) {
    assert.ok(!json.includes(dato), `aparece "${dato}"`);
  }
});

test("las compras del equipo se llaman compras de prueba internas, y las del piloto no", () => {
  assert.equal(COMPRAS_INTERNAS, "Compras de prueba internas en testnet");
  assert.equal(rotuloCompras("equipo"), COMPRAS_INTERNAS);
  assert.equal(rotuloMonto("equipo"), "Monto de prueba");
  assert.equal(rotuloCompras("piloto"), "Compras con Trato");
  assert.equal(rotuloMonto("piloto"), "Monto protegido");
});

test("las ventas de una tienda que no es del piloto se llaman compras de prueba internas", async () => {
  assert.equal(rotuloVentas(1, false), "compra de prueba interna en testnet");
  assert.equal(rotuloVentas(57, false), "compras de prueba internas en testnet");
  assert.equal(rotuloVentas(1, true), "venta con Trato");
  assert.equal(rotuloVentas(3, true), "ventas con Trato");
  // La página de pago sabe si la tienda es del piloto.
  const { slug } = nuevoLink();
  const r = await llamar("orders/[slug]", { method: "GET", path: `/api/orders/${slug}`, params: { slug } });
  assert.equal(r.body.seller.pilot, false);
});
