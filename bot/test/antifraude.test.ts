import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppError, HttpAppClient } from "../src/app/client.ts";
import { Bot } from "../src/bot.ts";
import { routePublic, step } from "../src/engine/engine.ts";
import { ANTI_PRESSURE, QR_WARNING, SELLER_NO_LINK, VERIFY_FAKE, type OutMsg } from "../src/engine/messages.ts";
import { DEMO_BUYER_PHONE, DEMO_SELLER, startMockApp, type MockApp } from "../src/mock/app-mock.ts";
import { Poller } from "../src/notify/poller.ts";
import { ReportStore } from "../src/reports.ts";

const SELLER = DEMO_SELLER.whatsapp;
const BUYER = DEMO_BUYER_PHONE;
const URL_ = "https://pp.test";
let app: MockApp;
let bot: Bot;

const texts = async (phone: string, text: string) => (await bot.handle(phone, text)).map((m) => m.text);
const newLink = (product = "Zapatillas Nike 40", priceBs = 450) => app.createLink({ sellerPubkey: DEMO_SELLER.pubkey, product, priceBs, deliveryDays: 3 });

afterEach(() => app?.close());

describe("verificador de links (bot contra la app de mentira)", () => {
  let reportsFile: string;
  beforeEach(async () => {
    app = await startMockApp({ botKey: "k" });
    reportsFile = join(mkdtempSync(join(tmpdir(), "pp-reportes-")), "reportes.jsonl");
    bot = new Bot({ client: new HttpAppClient(app.url, "k"), appUrl: URL_, reports: new ReportStore(reportsFile) });
  });

  it("link auténtico: tienda, producto, precio, código y estado — también para quien no tiene tienda", async () => {
    const o = newLink();
    const [out] = await texts(BUYER, `verificar ${URL_}/p/${o.slug}`);
    expect(out.split("\n")[0]).toBe(`✅ Auténtico: Tienda Demo, Zapatillas Nike 40, Bs 450,00, pedido ${o.code}. Estado: Esperando pago`);
    expect(out).toMatch(/Puedes pagar en ese link/);
    app.advance(o.slug, "pagar");
    const [paid] = await texts(BUYER, `${URL_}/p/${o.slug}`); // reenviado tal cual, sin "verificar"
    expect(paid.split("\n")[0]).toMatch(/Estado: Pagado$/);
    expect(paid).toMatch(/si te piden pagarlo otra vez, es estafa/);
  });

  it("un link reenviado dentro de un mensaje se verifica solo", async () => {
    const o = newLink();
    const [ok] = await texts(BUYER, `Hola! Te paso el link de pago 👉 ${URL_}/p/${o.slug} gracias`);
    expect(ok).toMatch(/^✅ Auténtico: Tienda Demo/);
    const [fake] = await texts(BUYER, `Entra aquí para cobrar tu venta: https://pago-protegido.co/p/${o.slug}`);
    expect(fake.split("\n")[0]).toBe(VERIFY_FAKE);
  });

  it.each([
    ["dominio parecido", "https://pago-protegido.co/p/SLUG", /imita nuestro nombre/],
    ["cero por o", "https://pagoprotegid0.bo/p/SLUG", /imita nuestro nombre/],
    ["subdominio engañoso", "https://pp.test.pagos-bo.com/p/SLUG", /no es nuestro dominio/],
    ["acortador bit.ly", "https://bit.ly/3xYz", /link acortado \(bit\.ly\)/],
    ["acortador tinyurl", "tinyurl.com/pago-ya", /link acortado \(tinyurl\.com\)/],
    ["usuario@ escondido", "https://pp.test@evil.com/p/SLUG", /esconde su verdadero destino/],
    ["slug inválido", "https://pp.test/p/zapatillas", /no es válido/],
    ["no es /p/", "https://pp.test/cobrar?id=SLUG", /No es un link de pago/],
    ["http con otro puerto", "http://pp.test:8080/p/SLUG", /no es nuestro dominio/],
  ])("%s → ⚠️ NO es de Trato", async (_name, link, why) => {
    const o = newLink();
    const [out] = await texts(BUYER, `verificar ${link.replace("SLUG", o.slug)}`);
    expect(out.split("\n")[0]).toBe(VERIFY_FAKE);
    expect(out).toMatch(why);
    expect(out).toContain(`Los links de pago reales empiezan con ${URL_}/p/`);
  });

  it("dominio y forma correctos pero el pedido no existe → falso", async () => {
    const [out] = await texts(BUYER, `verificar ${URL_}/p/zapatillas-abcdef`);
    expect(out.split("\n")[0]).toBe(VERIFY_FAKE);
    expect(out).toMatch(/Ese pedido no existe/);
  });

  it("si la app no responde, no dice que es auténtico ni falso: pide no pagar todavía", async () => {
    const broken = new HttpAppClient(app.url, "k");
    broken.order = async () => {
      throw new Error("ECONNREFUSED");
    };
    bot = new Bot({ client: broken, appUrl: URL_ });
    const [out] = await texts(BUYER, `verificar ${URL_}/p/zapatillas-abcdef`);
    expect(out).toMatch(/No pude verificar ese link ahora\. \*No pagues\*/);
    broken.order = async () => {
      throw new AppError("No encontramos ese link de pago", 404);
    };
    expect((await texts(BUYER, `verificar ${URL_}/p/zapatillas-abcdef`))[0].split("\n")[0]).toBe(VERIFY_FAKE);
  });

  it("'verificar' sin link pide el link; varios links → una respuesta por link", async () => {
    expect((await texts(BUYER, "verificar"))[0]).toMatch(/Mándame el link/);
    const o = newLink();
    const out = await texts(BUYER, `verifica ${URL_}/p/${o.slug} y https://bit.ly/x`);
    expect(out.map((t) => t.split("\n")[0])).toEqual([expect.stringMatching(/^✅ Auténtico/), VERIFY_FAKE]);
  });

  it("acepta como canónicos PP_APP_URL y PP_PUBLIC_URL (túnel), nada más", async () => {
    const o = newLink();
    bot = new Bot({ client: new HttpAppClient(app.url, "k"), appUrl: URL_, canonicalHosts: [app.url, URL_] });
    expect((await texts(BUYER, `${app.url}/p/${o.slug}`))[0]).toMatch(/^✅ Auténtico/);
    expect((await texts(BUYER, `${URL_}/p/${o.slug}`))[0]).toMatch(/^✅ Auténtico/);
    expect((await texts(BUYER, `https://otro.test/p/${o.slug}`))[0].split("\n")[0]).toBe(VERIFY_FAKE);
  });

  it("el vendedor puede mandar el link de la foto como guía sin que se verifique", async () => {
    const o = newLink();
    app.advance(o.slug, "pagar");
    const code = o.slug.slice(-6);
    expect((await texts(SELLER, `enviado ${code} https://fotos.example.com/guia.jpg`)).join("\n")).toMatch(/confírmalo desde tu cuenta/);
    await texts(SELLER, `enviado ${code}`); // pide la guía
    const out = (await texts(SELLER, "https://fotos.example.com/guia.jpg")).join("\n");
    expect(out).toContain(`/panel?enviar=${o.slug}&evidencia=${encodeURIComponent("https://fotos.example.com/guia.jpg")}`);
  });

  it("reportar <link>: lo guarda en el archivo local y agradece", async () => {
    const [out] = await texts(BUYER, "reportar https://pago-protegido.co/p/zapatillas-a1b2c3 me pidieron confirmar antes");
    expect(out).toMatch(/¡Gracias por avisar!.*pago-protegido\.co/s);
    expect((await texts(SELLER, "denunciar bit.ly/abc"))[0]).toMatch(/Gracias/);
    const lines = readFileSync(reportsFile, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toEqual([
      expect.objectContaining({ from: BUYER, link: "https://pago-protegido.co/p/zapatillas-a1b2c3", host: "pago-protegido.co", verdict: "lookalike", note: expect.stringContaining("me pidieron confirmar") }),
      expect.objectContaining({ from: SELLER, link: "bit.ly/abc", host: "bit.ly", verdict: "shortener" }),
    ]);
    expect(new ReportStore(reportsFile).all()).toHaveLength(2);
    expect((await texts(BUYER, "reportar"))[0]).toMatch(/Qué link quieres reportar/);
  });

  it("botones del recordatorio: 'Tengo un problema', 'Necesito más tiempo' y 'Sí, todo bien' llevan a la página del pedido", async () => {
    const o = newLink();
    expect((await texts(BUYER, `problema ${o.slug}`))[0]).toMatch(new RegExp(`Tengo un problema.*👉 ${URL_}/p/${o.slug}`, "s"));
    expect((await texts(BUYER, `tiempo ${o.slug}`))[0]).toMatch(new RegExp(`Nadie puede alargar el plazo por chat.*👉 ${URL_}/p/${o.slug}`, "s"));
    expect((await texts(BUYER, `todo bien ${o.slug}`))[0]).toMatch(/Pagar al vendedor/);
    expect((await texts(BUYER, "Tengo un problema"))[0]).toMatch(/Busca el link de tu pedido/);
  });
});

describe("avisos al vendedor", () => {
  beforeEach(async () => {
    app = await startMockApp({ botKey: "k" });
    bot = new Bot({ client: new HttpAppClient(app.url, "k"), appUrl: URL_ });
  });

  it("registro: el aviso 'para cobrar no tienes que abrir ningún link' va al invitar y la primera vez, una sola vez", async () => {
    expect((await texts("59170000000", "hola")).join("\n")).toContain(SELLER_NO_LINK);
    const first = await texts(SELLER, "hola");
    expect(first[0]).toContain(SELLER_NO_LINK);
    expect(first[1]).toMatch(/Soy el asistente/);
    expect((await texts(SELLER, "hola")).join("\n")).not.toContain(SELLER_NO_LINK);
  });

  it("al entregar el link de pago: 'el QR de pago nunca está a nombre de una persona'", async () => {
    bot.greeted.add(SELLER);
    const [first, second] = await texts(SELLER, "vendo zapatillas nike 40 a 450 bs entrega 3 días");
    expect(first).toMatch(/Tu link de pago/);
    expect(first).toContain(QR_WARNING);
    expect(second).toMatch(/Reenvíale esto/);
  });
});

describe("motor: qué va al verificador", () => {
  const T = 1_700_000_000_000;
  it("comandos y links reenviados, pero no la guía de un envío", () => {
    expect(routePublic("verificar pago-protegido.co", undefined, T)).toEqual({ kind: "verify", links: ["pago-protegido.co"] });
    expect(routePublic("Verifícame esto: https://x.com/p/a", undefined, T)).toEqual({ kind: "verify", links: ["https://x.com/p/a"] });
    expect(routePublic("es real? https://x.com/p/a", undefined, T)).toEqual({ kind: "verify", links: ["https://x.com/p/a"] });
    expect(routePublic("vendo zapatillas 450", undefined, T)).toBeNull();
    expect(routePublic("enviado a1b2c3 https://foto.com/1", undefined, T)).toBeNull();
    const asking = step(undefined, "x", T).session;
    expect(routePublic("https://foto.com/1", { ...asking, step: "ask_evidence", code: "a1b2c3" }, T)).toBeNull();
    expect(routePublic("https://foto.com/1", { ...asking, step: "ask_evidence", code: "a1b2c3" }, T + 31 * 60_000)).toEqual({ kind: "verify", links: ["https://foto.com/1"] });
    expect(routePublic("reportar www.pagoprotegido.bo.evil.com/p/a", undefined, T)).toMatchObject({ kind: "report", link: "www.pagoprotegido.bo.evil.com/p/a" });
  });
});

describe("avisos al comprador: anti-presión y recordatorios 48/24/2 h", () => {
  let clock: number;
  let inbox: { to: string; msg: OutMsg }[];
  async function setup(opts: { unitMs?: number; hours?: number[]; shipMs?: (d: number) => number; inspectMs?: (d: number) => number } = {}) {
    clock = 1_800_000_000_000;
    app = await startMockApp({ now: () => clock, shipMs: opts.shipMs, inspectMs: opts.inspectMs });
    inbox = [];
    return new Poller({
      client: new HttpAppClient(app.url),
      appUrl: URL_,
      send: async (to, msg) => void inbox.push({ to, msg }),
      now: () => clock,
      reminderHours: opts.hours,
      reminderUnitMs: opts.unitMs,
    });
  }
  const H = 3_600_000;

  it("al pagar y al marcar enviado, el comprador recibe el texto anti-presión", async () => {
    const poller = await setup();
    const o = newLink();
    app.advance(o.slug, "pagar");
    clock += 1000;
    const paid = (await poller.tick()).filter((s) => s.to === BUYER);
    expect(paid.map((s) => s.kind)).toEqual(["anti_presion"]);
    expect(paid[0].msg.text).toContain(ANTI_PRESSURE);
    expect(paid[0].msg.text).toMatch(/tu pago de Bs 450,00 por \*Zapatillas Nike 40\* está guardado/);
    app.advance(o.slug, "enviar");
    clock += 1000;
    const shipped = (await poller.tick()).filter((s) => s.to === BUYER);
    expect(shipped.map((s) => s.kind)).toEqual(["te_llego"]);
    expect(shipped[0].msg.text).toContain(ANTI_PRESSURE); // se repite
    clock += 1000;
    expect(await poller.tick()).toEqual([]); // y no se repite más
  });

  it("sin WhatsApp del comprador no hay aviso; si lo deja después, le llega una vez", async () => {
    const poller = await setup();
    const o = newLink();
    app.advance(o.slug, "pagar", { buyerPhone: null });
    clock += 1000;
    expect((await poller.tick()).map((s) => s.to)).toEqual([SELLER]);
    const row = app.orders.get(o.slug)!;
    row.buyer_whatsapp = BUYER; // POST /api/orders/:slug/buyer-contact
    row.updated_at = clock;
    clock += 1000;
    const late = await poller.tick();
    expect(late.map((s) => [s.to, s.kind])).toEqual([[BUYER, "anti_presion"]]);
    clock += 1000;
    expect(await poller.tick()).toEqual([]);
  });

  it("el reclamo también le llega al comprador: el pago queda congelado", async () => {
    const poller = await setup();
    const o = newLink();
    app.advance(o.slug, "pagar");
    clock += 1000;
    await poller.tick();
    app.advance(o.slug, "reclamar");
    clock += 1000;
    const d = await poller.tick();
    expect(d.map((s) => [s.to, s.kind])).toEqual([
      [SELLER, "reclamo"],
      [BUYER, "reclamo"],
    ]);
    expect(d[1].msg.text).toMatch(/hay un reclamo .*“No llegó”.* congelado/s);
  });

  it("recordatorios a las 48 h, 24 h y 2 h, cada uno una vez, con 'Tengo un problema' y 'Necesito más tiempo'", async () => {
    const poller = await setup();
    const o = newLink(); // 3 días de entrega → revisión de 6 días desde el envío
    app.advance(o.slug, "pagar");
    app.advance(o.slug, "enviar");
    clock += 1000;
    await poller.tick();
    const deadline = app.orders.get(o.slug)!.deadline!;
    const at = async (leftMs: number) => {
      clock = deadline - leftMs;
      return (await poller.tick()).filter((s) => s.kind === "recordatorio");
    };
    expect(await at(49 * H)).toEqual([]);
    const r48 = await at(47.5 * H);
    expect(r48).toHaveLength(1);
    expect(r48[0].to).toBe(BUYER);
    expect(r48[0].msg.text).toMatch(/se libera solo al vendedor en unas 48 h/);
    expect(await at(30 * H)).toEqual([]);
    const r24 = await at(23 * H);
    expect(r24[0].msg.text).toMatch(/en unas 23 h/);
    expect(await at(3 * H)).toEqual([]);
    const r2 = await at(1.5 * H);
    expect(r2[0].msg.text).toMatch(/en unas 2 h/);
    expect(await at(0.5 * H)).toEqual([]);

    const m = r2[0].msg;
    const page = `${URL_}/p/${o.slug}`;
    expect(m.text).toContain(`*Tengo un problema* → ${page}`);
    expect(m.text).toContain(`*Necesito más tiempo* (una sola vez) → ${page}`);
    expect(m.buttons?.map((b) => b.title)).toEqual(["Sí, todo bien", "Tengo un problema", "Necesito más tiempo"]);
    expect(m.buttons?.map((b) => b.id)).toEqual([`todo bien ${o.slug}`, `problema ${o.slug}`, `tiempo ${o.slug}`]);
  });

  it("el plazo arranca al marcar enviado (contrato v2): antes no hay hora de liberación ni recordatorios", async () => {
    const poller = await setup();
    const o = newLink();
    app.advance(o.slug, "pagar");
    clock += 1000;
    await poller.tick();
    expect(app.orders.get(o.slug)!.deadline).toBeNull(); // pagado: solo corre el plazo de despacho
    clock += 2 * 24 * H; // despacha 2 días después del pago
    app.advance(o.slug, "enviar");
    clock += 1000;
    await poller.tick();
    const deadline = app.orders.get(o.slug)!.deadline!;
    expect(deadline).toBe(app.orders.get(o.slug)!.shipped_at! + 6 * 24 * H);
    clock = deadline - 47 * H;
    expect((await poller.tick()).filter((s) => s.kind === "recordatorio")).toHaveLength(1); // el de 48 h, contado desde el envío
  });

  it("con una revisión corta, los hitos que caen antes del envío no se mandan", async () => {
    const poller = await setup({ inspectMs: () => 30 * H });
    const o = newLink();
    app.advance(o.slug, "pagar");
    app.advance(o.slug, "enviar"); // la liberación queda a 30 h del envío
    const deadline = app.orders.get(o.slug)!.deadline!;
    await poller.tick();
    clock += 1000;
    expect((await poller.tick()).filter((s) => s.kind === "recordatorio")).toEqual([]); // nada de "48 h"
    clock = deadline - 20 * H;
    expect((await poller.tick()).filter((s) => s.kind === "recordatorio")).toHaveLength(1); // el de 24 h
  });

  it("si el bot estuvo apagado y se juntan hitos, manda solo el más urgente", async () => {
    const poller = await setup();
    const o = newLink();
    app.advance(o.slug, "pagar");
    app.advance(o.slug, "enviar");
    clock += 1000;
    await poller.tick();
    clock = app.orders.get(o.slug)!.deadline! - 1 * H;
    const r = (await poller.tick()).filter((s) => s.kind === "recordatorio");
    expect(r).toHaveLength(1);
    expect(r[0].msg.text).toMatch(/en unos 60 min|en unas 1 h/);
    clock += 10 * 60_000;
    expect(await poller.tick()).toEqual([]);
  });

  it("modo demo: los recordatorios se escalan a minutos (48, 24 y 2 min)", async () => {
    const M = 60_000;
    const poller = await setup({ unitMs: M, shipMs: (d) => d * 24 * M, inspectMs: (d) => (d + 3) * 24 * M });
    const o = newLink();
    app.advance(o.slug, "pagar");
    app.advance(o.slug, "enviar");
    clock += 1000;
    await poller.tick();
    const deadline = app.orders.get(o.slug)!.deadline!;
    expect(deadline - clock).toBeLessThan(145 * M); // (3 + 3) × 24 minutos
    const at = async (left: number) => {
      clock = deadline - left;
      return (await poller.tick()).filter((s) => s.kind === "recordatorio").map((s) => s.msg.text);
    };
    expect(await at(49 * M)).toEqual([]);
    expect(await at(47 * M)).toEqual([expect.stringMatching(/en unos 47 min/)]);
    expect(await at(23 * M)).toEqual([expect.stringMatching(/en unos 23 min/)]);
    expect(await at(1.5 * M)).toEqual([expect.stringMatching(/en unos 2 min/)]);
  });
});
