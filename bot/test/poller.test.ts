import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HttpAppClient } from "../src/app/client.ts";
import type { OutMsg } from "../src/engine/messages.ts";
import { DEMO_BUYER_PHONE, DEMO_SELLER, startMockApp, type MockApp } from "../src/mock/app-mock.ts";
import { Poller } from "../src/notify/poller.ts";

let app: MockApp;
let clock: number;
let inbox: { to: string; msg: OutMsg }[];

async function setup(botEndpoints = true) {
  clock = 1_800_000_000_000;
  app = await startMockApp({ botEndpoints, now: () => clock });
  inbox = [];
  const poller = new Poller({
    client: new HttpAppClient(app.url),
    appUrl: "https://pp.test",
    send: async (to, msg) => void inbox.push({ to, msg }),
    now: () => clock,
    reminderHours: 24,
  });
  return poller;
}
const link = () => app.createLink({ sellerPubkey: DEMO_SELLER.pubkey, product: "Zapatillas Nike 40", priceBs: 450, deliveryDays: 3 });
const step = () => (clock += 1000);

afterEach(() => app?.close());

describe("avisos por cambio de estado (GET /api/bot/changes)", () => {
  let poller: Poller;
  beforeEach(async () => {
    poller = await setup();
  });

  it("pagado → al vendedor: pago GUARDADO, despacha y marca enviado; al comprador, el aviso anti-presión", async () => {
    const o = link();
    step();
    expect(await poller.tick()).toEqual([]); // link nuevo: nada que avisar
    app.advance(o.slug, "pagar");
    step();
    const sent = await poller.tick();
    expect(sent.map((s) => [s.to, s.kind])).toEqual([
      [DEMO_SELLER.whatsapp, "pagado"],
      [DEMO_BUYER_PHONE, "anti_presion"],
    ]);
    expect(sent[0].msg.text).toMatch(/tu cliente pagó Bs 450,00 .* el pago está GUARDADO en el contrato, todavía no en tu cuenta/);
    expect(sent[0].msg.text).toContain("no de una captura");
    expect(sent[0].msg.text).toMatch(/Compruébalo en tu panel:\n👉 http\S+\/panel\n/);
    expect(sent[0].msg.text).not.toMatch(/te pagaron/i);
    expect(sent[0].msg.text).toMatch(new RegExp(`Despacha antes del .* y marca enviado: escríbeme \\*enviado ${o.code}`));
    expect(sent[0].msg.text).toMatch(new RegExp(`^💸 ${o.code}:`));
    step();
    expect(await poller.tick()).toEqual([]); // no repite
  });

  it("enviado → al comprador '¿te llegó?'; liberado → al vendedor con el monto neto", async () => {
    const o = link();
    app.advance(o.slug, "pagar");
    step();
    await poller.tick();
    app.advance(o.slug, "enviar", { evidence: "OLV-777" });
    step();
    const sent = await poller.tick();
    expect(sent.map((s) => [s.to, s.kind])).toEqual([
      [DEMO_SELLER.whatsapp, "enviado_vendedor"],
      [DEMO_BUYER_PHONE, "te_llego"],
    ]);
    expect(sent[1].msg.text).toMatch(/¿Te llegó\?.*Pagar al vendedor.*Necesito más tiempo/s);
    expect(sent[1].msg.text).toContain("OLV-777");
    app.advance(o.slug, "confirmar");
    step();
    const rel = await poller.tick();
    expect(rel[0]).toMatchObject({ to: DEMO_SELLER.whatsapp, kind: "liberado" });
    // El cliente pagó la protección: el vendedor recibe el precio completo (Bs 450 = 38,46 USD de prueba).
    expect(rel[0].msg.text).toMatch(/¡Liberado!.*38,46 USD de prueba/s);
  });

  it("reclamo abierto y resolución del revisor", async () => {
    const o = link();
    app.advance(o.slug, "pagar");
    step();
    await poller.tick();
    app.advance(o.slug, "reclamar");
    step();
    const d = await poller.tick();
    expect(d[0]).toMatchObject({ kind: "reclamo", to: DEMO_SELLER.whatsapp });
    expect(d[0].msg.text).toMatch(/Reclamo abierto.*“No llegó”.*congelada/s);
    app.advance(o.slug, "resolver");
    step();
    const r = await poller.tick();
    expect(r.map((s) => [s.to, s.kind])).toEqual([
      [DEMO_SELLER.whatsapp, "resuelto"],
      [DEMO_BUYER_PHONE, "resuelto"],
    ]);
    expect(r[0].msg.text).toMatch(/30% para ti y 70% para el comprador/);
  });

  it("recordatorio al comprador una sola vez antes de la liberación automática", async () => {
    const o = link();
    app.advance(o.slug, "pagar");
    app.advance(o.slug, "enviar");
    step();
    await poller.tick();
    clock = app.orders.get(o.slug)!.deadline! - 30 * 3_600_000; // faltan 30 h: todavía no
    expect((await poller.tick()).filter((s) => s.kind === "recordatorio")).toEqual([]);
    clock += 10 * 3_600_000; // faltan 20 h
    const sent = await poller.tick();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: DEMO_BUYER_PHONE, kind: "recordatorio" });
    expect(sent[0].msg.text).toMatch(/se libera solo al vendedor en unas 20 h/);
    clock += 3_600_000;
    expect(await poller.tick()).toEqual([]);
  });

  it("no se despachó a tiempo → 'devuelto': aviso a los dos con lo que vuelve al comprador", async () => {
    const o = link();
    app.advance(o.slug, "pagar");
    step();
    await poller.tick();
    clock = app.orders.get(o.slug)!.ship_deadline! + 1000;
    app.advance(o.slug, "devolver");
    const sent = await poller.tick();
    expect(sent.map((s) => [s.to, s.kind])).toEqual([
      [DEMO_SELLER.whatsapp, "devuelto"],
      [DEMO_BUYER_PHONE, "devuelto"],
    ]);
    expect(sent[0].msg.text).toMatch(new RegExp(`^↩️ ${o.code}: no se marcó el envío a tiempo\\. Devolvimos Bs [\\d.,]+ al comprador`));
    expect(sent[1].msg.text).toMatch(/Te devolvimos Bs/);
    step();
    expect(await poller.tick()).toEqual([]);
  });

  it("'Necesito más tiempo': aviso al vendedor y los recordatorios se reprograman con la nueva hora", async () => {
    const o = link();
    app.advance(o.slug, "pagar");
    app.advance(o.slug, "enviar");
    step();
    await poller.tick();
    const first = app.orders.get(o.slug)!.deadline!;
    clock = first - 20 * 3_600_000; // faltan 20 h: recordatorio de 24 h
    expect((await poller.tick()).map((s) => s.kind)).toEqual(["recordatorio"]);
    app.advance(o.slug, "extender");
    step();
    const ext = await poller.tick();
    expect(ext.map((s) => [s.to, s.kind])).toEqual([[DEMO_SELLER.whatsapp, "mas_tiempo"]]);
    expect(ext[0].msg.text).toMatch(/pidió más tiempo.*Solo se puede pedir una vez/s);
    const next = app.orders.get(o.slug)!.deadline!;
    expect(next).toBe(first + 6 * 86_400_000);
    clock = next - 30 * 3_600_000;
    expect(await poller.tick()).toEqual([]);
    clock = next - 20 * 3_600_000; // el de 24 h, otra vez, con la hora nueva
    const r = await poller.tick();
    expect(r.map((s) => s.kind)).toEqual(["recordatorio"]);
    expect(r[0].msg.text).toContain("Ya usaste *Necesito más tiempo*");
  });

  it("sin número del comprador solo avisa al vendedor", async () => {
    const o = link();
    app.advance(o.slug, "pagar", { buyerPhone: null });
    app.advance(o.slug, "enviar");
    step();
    const sent = await poller.tick();
    expect(sent.map((s) => s.to)).toEqual([DEMO_SELLER.whatsapp]);
  });
});

describe("plan B sin /api/bot/changes", () => {
  it("revisa uno por uno los pedidos que el bot conoce", async () => {
    const poller = await setup(false);
    const o = link();
    poller.track(o, DEMO_SELLER.whatsapp);
    app.advance(o.slug, "pagar");
    step();
    const sent = await poller.tick();
    expect(sent.map((s) => s.kind)).toEqual(["pagado"]);
    expect(app.calls.filter((c) => c.startsWith(`GET /api/orders/${o.slug}`)).length).toBeGreaterThan(0);
  });
});
