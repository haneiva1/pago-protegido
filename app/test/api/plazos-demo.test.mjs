// Plazos de demostración (2 minutos) solo con el servidor en modo demo (PP_DEMO=1). `npm run test:api`.
//
// El caso: `demoWindow` lo mandaba quien llamaba a la API. Un vendedor estafador creaba su link con plazos de
// 2 minutos, registraba un envío falso apenas le pagaban y a los 2 minutos cobraba, antes de que el paquete existiera.
// La firma de la tienda no lo frena: el estafador firma con su propia tienda.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { firma, llamar, src, tienda } from "./entorno.mjs";

const { orders } = await import(src("lib/server/db.ts"));
const { DEMO_WINDOW_SECS } = await import(src("lib/server/orders.ts"));

const antes = { demo: process.env.PP_DEMO, probar: process.env.PP_PROBAR };
afterEach(() => {
  for (const [k, v] of [["PP_DEMO", antes.demo], ["PP_PROBAR", antes.probar]]) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

async function crearLink(body, headers = {}) {
  return llamar("links", {
    path: "/api/links",
    body: { product: "Celular Samsung Galaxy A35", priceBs: 2500, deliveryDays: 3, ...body },
    firma: await firma(tienda, "POST", "/api/links"),
    headers,
  });
}

test("/probar con PP_PROBAR=1 (sin PP_DEMO) sigue creando links con plazos de demostración desde sus marcos", async () => {
  delete process.env.PP_DEMO;
  process.env.PP_PROBAR = "1";
  const r = await crearLink({}, { "x-pp-probar": "1" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(orders.get(r.body.slug).window_secs, DEMO_WINDOW_SECS);
});

test("con PP_PROBAR=1, fuera de los marcos de /probar no se pueden pedir plazos de demostración", async () => {
  delete process.env.PP_DEMO;
  process.env.PP_PROBAR = "1";
  const r = await crearLink({ demoWindow: true });
  assert.equal(r.status, 400, JSON.stringify(r.body));
  // Tampoco mandando `marcoProbar` en el cuerpo: lo decide la ruta.
  const r2 = await crearLink({ marcoProbar: true });
  assert.equal(r2.status, 200, JSON.stringify(r2.body));
  assert.equal(orders.get(r2.body.slug).window_secs, null);
});

test("fuera del modo demo, un link con plazos de demostración se rechaza", async () => {
  delete process.env.PP_DEMO;
  const r = await crearLink({ demoWindow: true });
  assert.equal(r.status, 400, JSON.stringify(r.body));
  assert.match(r.body.error, /modo demo/);
});

test("fuera del modo demo, un link normal usa los días de despacho", async () => {
  delete process.env.PP_DEMO;
  const r = await crearLink({});
  assert.equal(r.status, 200, JSON.stringify(r.body));
  // Los plazos salen de `window_secs` (demo) o de los días de despacho (orders.ts: shipSecs, inspectSecs).
  const o = orders.get(r.body.slug);
  assert.equal(o.window_secs, null);
  assert.equal(o.delivery_days, 3);
});

test("con PP_DEMO=1, el link de demostración tiene plazos de 2 minutos", async () => {
  process.env.PP_DEMO = "1";
  const r = await crearLink({ demoWindow: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(orders.get(r.body.slug).window_secs, DEMO_WINDOW_SECS);
});
