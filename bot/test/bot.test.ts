import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppError, HttpAppClient } from "../src/app/client.ts";
import { Bot } from "../src/bot.ts";
import { DEMO_SELLER, startMockApp, type MockApp } from "../src/mock/app-mock.ts";

const SELLER = DEMO_SELLER.whatsapp;
let app: MockApp;
let bot: Bot;

async function setup(opts: Parameters<typeof startMockApp>[0] = {}) {
  app = await startMockApp(opts);
  bot = new Bot({ client: new HttpAppClient(app.url, opts.botKey), appUrl: "https://pp.test" });
}
const texts = async (phone: string, text: string) => (await bot.handle(phone, text)).map((m) => m.text).join("\n---\n");

afterEach(() => app?.close());

describe("bot contra la API (mock)", () => {
  beforeEach(() => setup({ botKey: "secreto" }));

  it("número sin tienda → link de registro a la web", async () => {
    const out = await texts("+591 7000 0000", "hola");
    expect(out).toContain("todavía no tiene tienda");
    expect(out).toContain("https://pp.test/vender?wa=59170000000");
  });

  it("mi perfil → link del perfil público (/tienda/<slug>) para la bio, sin el teléfono", async () => {
    const out = await texts(SELLER, "mi perfil");
    expect(out).toContain(`https://pp.test/tienda/${DEMO_SELLER.slug}`);
    expect(out).toContain("Vendo con Pago Protegido");
    expect(out).not.toContain(SELLER);
  });

  it("vender en un mensaje crea el link real (POST /api/links) y lo devuelve", async () => {
    const out = await texts(SELLER, "vendo zapatillas nike 40 a 450 bs entrega 3 días");
    const order = [...app.orders.values()][0];
    expect(order).toMatchObject({ product: "Zapatillas nike 40", price_bs_cents: 45000, delivery_days: 3, status: "esperando_pago" });
    expect(out).toContain(`https://pp.test/p/${order.slug}`);
    expect(out).toContain(`Código: *${order.code}*`);
    expect(order).toMatchObject({ proteccion: "comprador", category: "Otro", proteccion_bs_cents: 675 });
    expect(out).toContain("Paga Bs 456,75 (≈ 39,04 USD de prueba) y tú recibes Bs 450,00.");
    expect(app.calls.some((c) => c.startsWith("GET /api/bot/sellers?phone=59171234567"))).toBe(true);
  });

  it("mis ventas, estado y saldo leen GET /api/sellers/:pubkey y /api/orders/:slug", async () => {
    const o = app.createLink({ sellerPubkey: DEMO_SELLER.pubkey, product: "Polera", priceBs: 120, deliveryDays: 2 });
    app.advance(o.slug, "pagar");
    expect(await texts(SELLER, "mis ventas")).toMatch(/💸 \*Polera\* · Bs 120,00 · Pagado \(despacha\)/);
    expect(await texts(SELLER, `estado ${o.slug.slice(-6)}`)).toMatch(/Despacha antes del .* y luego escríbeme/);
    expect(await texts(SELLER, `estado ${o.code}`)).toMatch(/Despacha antes del/);
    expect(await texts(SELLER, `estado ${o.code!.replace("PP-", "pp ")}`)).toMatch(/Despacha antes del/);
    app.advance(o.slug, "confirmar");
    // La protección la pagó el cliente: el vendedor recibe al menos el precio (Bs 120 = 10,26 USD de prueba).
    expect(await texts(SELLER, "saldo")).toMatch(/Tu saldo: \*10,26 USD de prueba\*/);
  });

  it("enviado: no firma nada, manda el link para confirmar con la billetera", async () => {
    const o = app.createLink({ sellerPubkey: DEMO_SELLER.pubkey, product: "Polera", priceBs: 120, deliveryDays: 2 });
    const code = o.slug.slice(-6);
    expect(await texts(SELLER, `enviado ${code} OLV-1`)).toMatch(/todavía no te pagaron/);
    app.advance(o.slug, "pagar");
    expect(await texts(SELLER, `enviado ${code}`)).toMatch(/código de encomienda o guía/);
    const out = await texts(SELLER, "OLV-12345");
    expect(out).toContain(`https://pp.test/panel?enviar=${o.slug}&evidencia=OLV-12345`);
    expect(out).toMatch(/no puedo firmar por ti/);
    expect(app.orders.get(o.slug)!.status).toBe("pagado"); // el bot no cambió nada
  });

  it("guion del video: celular → link de una, categoría Celular y [Yo la regalo] cambia el link (PATCH)", async () => {
    const created = await bot.handle(SELLER, "vendo celular Samsung A54 a 1800 bs entrega 3 días");
    const order = [...app.orders.values()][0];
    expect(order).toMatchObject({ product: "Celular Samsung A54", price_bs_cents: 180000, delivery_days: 3, category: "Celular", proteccion: "comprador" });
    expect(created.map((m) => m.text).join("\n")).toContain(`https://pp.test/p/${order.slug}`);
    const first = created.find((m) => m.text.includes("Tu link de pago protegido"))!;
    expect(first.text).toContain(`Código: *${order.code}*`);
    expect(first.buttons?.map((b) => b.title)).toEqual(["La paga mi cliente", "Yo la regalo", "🛍️ Vender otro"]);
    const out = await texts(SELLER, `regalo ${order.slug}`);
    expect(out).toMatch(/la regalas tú/);
    expect(app.orders.get(order.slug)).toMatchObject({ proteccion: "vendedor", proteccion_bs_cents: 0 });
    expect(app.calls).toContain(`PATCH /api/links/${order.slug}`);
    expect(await texts(SELLER, "la paga mi cliente")).toMatch(/la paga tu cliente/); // sin código: el último link sin pagar
    app.advance(order.slug, "pagar");
    expect(await texts(SELLER, `regalo ${order.slug}`)).toMatch(/no pude hacerlo 😕: Ya no se puede cambiar/);
  });

  it("enviado con el código PP; vencido el plazo de despacho, ya no manda el link", async () => {
    const o = app.createLink({ sellerPubkey: DEMO_SELLER.pubkey, product: "Polera", priceBs: 120, deliveryDays: 2 });
    app.advance(o.slug, "pagar");
    expect(await texts(SELLER, `enviado ${o.code} OLV-1`)).toContain(`/panel?enviar=${o.slug}&evidencia=OLV-1`);
    const late = new Bot({ client: new HttpAppClient(app.url, "secreto"), appUrl: "https://pp.test", now: () => app.orders.get(o.slug)!.ship_deadline! + 1 });
    expect((await late.handle(SELLER, `enviado ${o.code} OLV-1`)).map((m) => m.text).join("\n")).toMatch(/el plazo para despachar venció .* La plata vuelve sola a tu cliente/);
  });

  it("no muestra pedidos de otra tienda", async () => {
    app.sellers.set("GOTRA", { pubkey: "GOTRA", store_name: "Otra", whatsapp: "59160000000", created_at: 0 });
    const ajeno = app.createLink({ sellerPubkey: "GOTRA", product: "Secreto", priceBs: 10, deliveryDays: 1 });
    expect(await texts(SELLER, `estado ${ajeno.slug}`)).toMatch(/No encontré el pedido/);
  });

  it("errores de la app llegan en español", async () => {
    const broken = new HttpAppClient(app.url, "secreto");
    broken.createLink = async () => {
      throw new AppError("El precio tiene que estar entre Bs 1 y Bs 100.000", 400);
    };
    bot = new Bot({ client: broken, appUrl: "https://pp.test" });
    expect(await texts(SELLER, "vendo polera 120 bs 2 dias")).toMatch(/no pude hacerlo 😕: El precio tiene que estar entre/);
    bot = new Bot({ client: new HttpAppClient("http://127.0.0.1:9"), appUrl: "https://pp.test" });
    expect(await texts(SELLER, "hola")).toMatch(/no pude hacerlo 😕: la app no responde/);
  });
});

describe("plan B: la app todavía no tiene /api/bot/*", () => {
  beforeEach(() => setup({ botEndpoints: false }));

  it("pide registrarse y acepta 'vincular <billetera>' solo si el WhatsApp coincide", async () => {
    expect(await texts(SELLER, "hola")).toMatch(/todavía no tiene tienda/);
    expect(await texts("59160000000", `vincular ${DEMO_SELLER.pubkey}`)).toMatch(/No encontré una tienda/);
    expect(await texts(SELLER, `vincular ${DEMO_SELLER.pubkey}`)).toMatch(/quedó vinculado a \*Tienda Demo\*/);
    expect(await texts(SELLER, "vender zapatillas 450 3 dias")).toMatch(/\/p\/zapatillas-/);
  });
});
