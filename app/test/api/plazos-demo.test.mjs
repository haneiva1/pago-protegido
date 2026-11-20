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

const antes = process.env.PP_DEMO;
afterEach(() => {
  if (antes === undefined) delete process.env.PP_DEMO;
  else process.env.PP_DEMO = antes;
});

async function crearLink(body) {
  return llamar("links", {
    path: "/api/links",
    body: { product: "Celular Samsung Galaxy A35", priceBs: 2500, deliveryDays: 3, ...body },
    firma: await firma(tienda, "POST", "/api/links"),
  });
}

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
