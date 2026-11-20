// Tests unitarios de la API firmada: `npm run test:api` (node --test, sin red: ver registro.mjs).
// Cada ruta que actúa por una cuenta: sin firma → 401, firma de otra cuenta → 403, firma válida → 200, nonce reusado → 401.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ctx, firma, llamar, nuevoLink, otra, comprador, tienda, src } from "./entorno.mjs";

const { orders, db } = await import(src("lib/server/db.ts"));

/** Cada caso arma la llamada con la firma (o sin ella) de una cuenta; `prep` deja el pedido en el estado que necesita. */
const CASOS = [
  {
    ruta: "POST /api/sellers",
    archivo: "sellers",
    dueño: tienda,
    armar: () => ({ path: "/api/sellers", body: { pubkey: tienda.publicKey(), storeName: "Tienda Sofi", whatsapp: "59171234567", city: "Santa Cruz" } }),
  },
  {
    ruta: "GET /api/sellers/<cuenta>/panel",
    archivo: "sellers/[pubkey]/panel",
    dueño: tienda,
    armar: () => ({ method: "GET", path: `/api/sellers/${tienda.publicKey()}/panel`, params: { pubkey: tienda.publicKey() } }),
  },
  {
    ruta: "POST /api/links",
    archivo: "links",
    dueño: tienda,
    armar: () => ({ path: "/api/links", body: { sellerPubkey: tienda.publicKey(), product: "Polera", priceBs: 120, deliveryDays: 2 } }),
  },
  {
    ruta: "PATCH /api/links/<slug>",
    archivo: "links/[slug]",
    dueño: tienda,
    armar: () => {
      const { slug } = nuevoLink();
      return { method: "PATCH", path: `/api/links/${slug}`, body: { proteccion: "vendedor" }, params: { slug } };
    },
  },
  {
    ruta: "POST /api/orders/<slug>/buyer-contact",
    archivo: "orders/[slug]/buyer-contact",
    dueño: comprador,
    armar: () => {
      const { slug } = nuevoLink();
      orders.update(slug, { buyer_pubkey: comprador.publicKey(), status: "pagado" });
      return { path: `/api/orders/${slug}/buyer-contact`, body: { whatsapp: "76543210" }, params: { slug } };
    },
  },
  {
    ruta: "POST /api/orders/<slug>/reply",
    archivo: "orders/[slug]/reply",
    dueño: tienda,
    armar: () => {
      const { slug } = nuevoLink();
      orders.update(slug, { buyer_pubkey: comprador.publicKey(), status: "en_disputa", dispute_by: "comprador" });
      return { path: `/api/orders/${slug}/reply`, body: { text: "Envié lo publicado." }, params: { slug } };
    },
  },
  {
    ruta: "POST /api/orders/<slug>/pay",
    archivo: "orders/[slug]/pay",
    dueño: comprador,
    armar: () => {
      const { slug } = nuevoLink();
      return { path: `/api/orders/${slug}/pay`, body: { buyer: comprador.publicKey(), recipient: "Ana Pérez", city: "Cochabamba" }, params: { slug } };
    },
  },
];

for (const c of CASOS) {
  test(`${c.ruta}: sin firma → 401`, async () => {
    const a = c.armar();
    const r = await llamar(c.archivo, a);
    assert.equal(r.status, 401, JSON.stringify(r.body));
  });

  test(`${c.ruta}: firma de otra cuenta → 403`, async () => {
    const a = c.armar();
    const r = await llamar(c.archivo, { ...a, firma: await firma(otra, a.method ?? "POST", a.path) });
    assert.equal(r.status, 403, JSON.stringify(r.body));
  });

  test(`${c.ruta}: firma válida → 200; el mismo nonce otra vez → 401`, async () => {
    const a = c.armar();
    const f = await firma(c.dueño, a.method ?? "POST", a.path);
    const ok = await llamar(c.archivo, { ...a, firma: f });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const otraVez = await llamar(c.archivo, { ...a, firma: f });
    assert.equal(otraVez.status, 401, JSON.stringify(otraVez.body));
    assert.match(otraVez.body.error, /venció o ya se usó/);
  });
}

test("la firma vale solo para la ruta y el método que se pidieron", async () => {
  const { slug } = nuevoLink();
  orders.update(slug, { buyer_pubkey: comprador.publicKey(), status: "pagado" });
  const paraOtraRuta = await firma(comprador, "POST", `/api/orders/${slug}/reply`);
  const r = await llamar("orders/[slug]/buyer-contact", { path: `/api/orders/${slug}/buyer-contact`, body: { whatsapp: "76543210" }, params: { slug }, firma: paraOtraRuta });
  assert.equal(r.status, 401);
  const paraGet = await firma(comprador, "GET", `/api/orders/${slug}/buyer-contact`);
  const r2 = await llamar("orders/[slug]/buyer-contact", { path: `/api/orders/${slug}/buyer-contact`, body: { whatsapp: "76543210" }, params: { slug }, firma: paraGet });
  assert.equal(r2.status, 401);
});

test("firma alterada, de otra cuenta con el nonce ajeno, o vencida → 401", async () => {
  const a = { path: "/api/sellers", body: { pubkey: tienda.publicKey(), storeName: "Tienda Sofi", whatsapp: "59171234567" } };
  const [cuenta, nonce, f] = (await firma(tienda, "POST", a.path)).split(".");
  const alterada = `${cuenta}.${nonce}.${f.slice(0, -4)}AAA=`;
  assert.equal((await llamar("sellers", { ...a, firma: alterada })).status, 401);

  // El nonce de la tienda firmado por otra cuenta que dice ser la tienda.
  const d = await firma(tienda, "POST", a.path);
  const [, n2] = d.split(".");
  const { mensaje } = db().prepare("SELECT mensaje FROM firma_desafios WHERE nonce = ?").get(n2);
  const { firmarSep53 } = await import(src("lib/sep53.ts"));
  assert.equal((await llamar("sellers", { ...a, firma: `${tienda.publicKey()}.${n2}.${firmarSep53(otra, mensaje)}` })).status, 401);

  const v = await firma(tienda, "POST", a.path);
  db().prepare("UPDATE firma_desafios SET vence = ? WHERE nonce = ?").run(Date.now() - 1, v.split(".")[1]);
  const r = await llamar("sellers", { ...a, firma: v });
  assert.equal(r.status, 401);
  assert.match(r.body.error, /venció/);
});

test("desafío: cuenta, método y ruta válidos; vence en 2 minutos", async () => {
  const { POST } = await import(src("app/api/firma/desafio/route.ts"));
  const pedir = (b) => POST(new Request("http://localhost/api/firma/desafio", { method: "POST", body: JSON.stringify(b) }));
  assert.equal((await pedir({ cuenta: "GNOVALE", metodo: "POST", ruta: "/api/sellers" })).status, 400);
  assert.equal((await pedir({ cuenta: tienda.publicKey(), metodo: "DELETE", ruta: "/api/sellers" })).status, 400);
  assert.equal((await pedir({ cuenta: tienda.publicKey(), metodo: "POST", ruta: "https://otro.sitio/api" })).status, 400);
  const ok = await pedir({ cuenta: tienda.publicKey(), metodo: "post", ruta: "/api/sellers" });
  const d = await ok.json();
  assert.equal(ok.status, 200);
  assert.match(d.mensaje, /^Trato: confirmo que esta cuenta es mía\.\nCuenta: G[A-Z2-7]{55}\nAcción: POST \/api\/sellers\nCódigo: [0-9a-f]{48}\nVence: /);
  assert.ok(d.vence - Date.now() <= 2 * 60_000 && d.vence - Date.now() > 60_000);
});

test("el bot entra con su clave de servidor (links y panel); con otra clave → 401", async () => {
  const bot = { "x-bot-key": process.env.PP_BOT_KEY };
  const link = await llamar("links", { path: "/api/links", headers: bot, body: { sellerPubkey: tienda.publicKey(), product: "Polera", priceBs: 120, deliveryDays: 2 } });
  assert.equal(link.status, 200);
  const patch = await llamar("links/[slug]", { method: "PATCH", path: `/api/links/${link.body.slug}`, headers: bot, params: { slug: link.body.slug }, body: { sellerPubkey: tienda.publicKey(), proteccion: "vendedor" } });
  assert.equal(patch.status, 200);
  const panel = await llamar("sellers/[pubkey]/panel", { method: "GET", path: `/api/sellers/${tienda.publicKey()}/panel`, headers: bot, params: { pubkey: tienda.publicKey() } });
  assert.equal(panel.status, 200);
  const mala = await llamar("links", { path: "/api/links", headers: { "x-bot-key": "otra-clave" }, body: { sellerPubkey: tienda.publicKey(), product: "Polera", priceBs: 120, deliveryDays: 2 } });
  assert.equal(mala.status, 401);
});

test("privacidad: GET /api/sellers/<cuenta> no trae compradores ni contactos; el panel firmado sí trae la entrega", async () => {
  const { slug } = nuevoLink();
  orders.update(slug, { buyer_pubkey: comprador.publicKey(), status: "pagado", recipient_name: "Ana Pérez", dest_city: "Cochabamba", pref_agency: "Trans Copacabana", buyer_whatsapp: "59176543210" });
  const pub = await llamar("sellers/[pubkey]", { method: "GET", path: `/api/sellers/${tienda.publicKey()}`, params: { pubkey: tienda.publicKey() } });
  assert.equal(pub.status, 200);
  const texto = JSON.stringify(pub.body);
  for (const dato of ["Ana Pérez", "Cochabamba", "Trans Copacabana", "59176543210", "59171234567", comprador.publicKey()]) assert.ok(!texto.includes(dato), dato);
  assert.equal(pub.body.seller.store_name, "Tienda Sofi");
  assert.equal(pub.body.orders, undefined);

  const panel = await llamar("sellers/[pubkey]/panel", { method: "GET", path: `/api/sellers/${tienda.publicKey()}/panel`, params: { pubkey: tienda.publicKey() }, firma: await firma(tienda, "GET", `/api/sellers/${tienda.publicKey()}/panel`) });
  assert.equal(panel.status, 200);
  const o = panel.body.orders.find((x) => x.slug === slug);
  assert.equal(o.recipient_name, "Ana Pérez");
  assert.equal(o.buyer_whatsapp, undefined);
});

test("contexto de los tests", () => assert.ok(ctx.db.endsWith(".db")));
