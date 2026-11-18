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

  it("vender en un mensaje crea el link real (POST /api/links) y lo devuelve", async () => {
    const out = await texts(SELLER, "vendo zapatillas nike 40 a 450 bs entrega 3 días");
    const order = [...app.orders.values()][0];
    expect(order).toMatchObject({ product: "Zapatillas nike 40", price_bs_cents: 45000, delivery_days: 3, status: "esperando_pago" });
    expect(out).toContain(`https://pp.test/p/${order.slug}`);
    expect(out).toContain("≈ 38,46 USD de prueba");
    expect(app.calls.some((c) => c.startsWith("GET /api/bot/sellers?phone=59171234567"))).toBe(true);
  });

  it("mis ventas, estado y saldo leen GET /api/sellers/:pubkey y /api/orders/:slug", async () => {
    const o = app.createLink({ sellerPubkey: DEMO_SELLER.pubkey, product: "Polera", priceBs: 120, deliveryDays: 2 });
    app.advance(o.slug, "pagar");
    expect(await texts(SELLER, "mis ventas")).toMatch(/💸 \*Polera\* · Bs 120,00 · Pagado \(despacha\)/);
    expect(await texts(SELLER, `estado ${o.slug.slice(-6)}`)).toMatch(/Despacha y luego escríbeme/);
    app.advance(o.slug, "confirmar");
    expect(await texts(SELLER, "saldo")).toMatch(/Tu saldo: \*10,02 USD de prueba\*/);
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
