// Devolución completa (H-4, PP_DEVOLUCION_COMPLETA=1 en la app): avisos del bot con "Te devolvimos todo lo que
// pagaste" y el link a las dos transacciones, y la espera del poller hasta que el reintegro se confirme.
// Con el interruptor apagado la app no manda `reintegro` y todo queda como siempre.
import { describe, expect, it } from "vitest";
import type { AppClient } from "../src/app/client.ts";
import type { ChangesFeed, Order, OrderStatus, OrderView, Reintegro } from "../src/app/types.ts";
import { notice, type OutMsg } from "../src/engine/messages.ts";
import { Poller, REINTEGRO_ESPERA_MS } from "../src/notify/poller.ts";

const U = "https://pp.test";
const H_DEV = "a".repeat(64);
const H_REI = "b".repeat(64);
const SELLER_WA = "59171234567";
const BUYER_WA = "59176543210";

/** Pedido v2 de Bs 1.800 con la protección a cargo del comprador: pagó 156,1965812 USD de prueba (Bs 1.827,50). */
const order: Order = {
  slug: "celular-samsung-a54-d4e5f6", seller_pubkey: "G", product: "Celular Samsung A54", description: "", photo_url: "",
  price_bs_cents: 180000, amount_units: "1561965812", fx: 11.7, delivery_days: 3, status: "devuelto", buyer_pubkey: "GB",
  funded_at: 1, deadline: null, shipped_evidence: null, shipped_at: null, dispute_by: null, dispute_reason: null, buyer_bps: 10000,
  released_at: null, resolved_at: 2, refunded_at: 2, created_at: 1, updated_at: 2, code: "PP-4821", category: "Celular",
  proteccion: "comprador", proteccion_bs_cents: 2700, ship_deadline: 1, extended: 0,
};
// 1.561.965.812 − floor(0,3%) 4.685.897 − floor(2%) 31.239.316 = 1.526.040.599 de vuelta; la diferencia, 35.925.213.
const confirmado: Reintegro = { estado: "confirmado", pagado: "1561965812", recibido: "1526040599", monto: "35925213", devolucion_hash: H_DEV, hash: H_REI };
const pendiente: Reintegro = { ...confirmado, estado: "enviado", hash: null };

const view = (o: Partial<Order> = {}, reintegro?: Reintegro): OrderView => ({
  order: { ...order, ...o },
  seller: { store_name: "Tienda Demo", whatsapp: SELLER_WA, pubkey: "G", completedSales: 1 },
  platformFeeBps: 200,
  mode: "guardian",
  split: { buyer: "1526040599", seller: "0", platform: "31239316", tw: "4685897" },
  ...(reintegro ? { reintegro } : {}),
});

const BANNED =
  /\b(cripto\w*|crypto\w*|tokens?|stablecoins?|wallets?|llaves?|blockchain|garant[ií]as?|garantizad\w*|segur[oa]s?|custodi\w*|arbitraje|[aá]rbitr[oa]s?|plataforma de pagos|pasarela|stellar|xlm)\b|100\s?%/i;
const ok = (m: OutMsg) => {
  expect(m.text).not.toMatch(BANNED);
  expect(m.text.length).toBeLessThanOrEqual(1024);
  return m.text;
};

describe("avisos con la devolución completa", () => {
  it("devuelto: 'Te devolvimos todo lo que pagaste', cuánto puso el contrato y cuánto Trato, y las dos transacciones", () => {
    const t = ok(notice.refunded({ appUrl: U, view: view({}, confirmado) }, "comprador"));
    expect(t).toBe(
      [
        "↩️ PP-4821: el vendedor no marcó el envío de *Celular Samsung A54* a tiempo. Te devolvimos todo lo que pagaste: Bs 1.827,50. El contrato te devolvió Bs 1.785,47 y Trato te transfirió las comisiones (Bs 42,03).",
        `Devolución: ${U}/registro/${H_DEV}`,
        `Reintegro: ${U}/registro/${H_REI}`,
        `${U}/p/${order.slug}`,
      ].join("\n"),
    );
    expect(t).not.toMatch(/menos las comisiones/);
  });

  it("resuelto con todo para el comprador: el mismo texto, desde el reclamo", () => {
    const t = ok(notice.resolved({ appUrl: U, view: view({ status: "resuelto" }, confirmado) }, "comprador"));
    expect(t).toMatch(/^⚖️ PP-4821: el revisor resolvió el reclamo de \*Celular Samsung A54\* a tu favor\. Te devolvimos todo lo que pagaste: Bs 1\.827,50\./);
    expect(t).toContain(`Reintegro: ${U}/registro/${H_REI}`);
  });

  it("el vendedor recibe el aviso de siempre", () => {
    expect(notice.refunded({ appUrl: U, view: view({}, confirmado) }, "vendedor")).toEqual(notice.refunded({ appUrl: U, view: view() }, "vendedor"));
    expect(notice.resolved({ appUrl: U, view: view({ status: "resuelto" }, confirmado) }, "vendedor")).toEqual(
      notice.resolved({ appUrl: U, view: view({ status: "resuelto" }) }, "vendedor"),
    );
  });

  it("sin reintegro (interruptor apagado) o sin confirmar, el aviso del comprador queda como siempre", () => {
    const hoy = notice.refunded({ appUrl: U, view: view() }, "comprador");
    expect(hoy.text).toContain("(tu pago menos las comisiones)");
    expect(notice.refunded({ appUrl: U, view: view({}, pendiente) }, "comprador")).toEqual(hoy);
    expect(notice.refunded({ appUrl: U, view: view({}, { ...confirmado, hash: null }) }, "comprador")).toEqual(hoy);
    const hoyR = notice.resolved({ appUrl: U, view: view({ status: "resuelto" }) }, "comprador");
    expect(notice.resolved({ appUrl: U, view: view({ status: "resuelto" }, pendiente) }, "comprador")).toEqual(hoyR);
  });
});

/** App falsa: un pedido cuya vista se cambia a mano, con el feed de cambios. */
function fakeApp(initial: OrderView) {
  let v = initial;
  const client: Pick<AppClient, "order" | "changes"> = {
    async order() {
      return structuredClone(v);
    },
    async changes(since: number): Promise<ChangesFeed> {
      const o = v.order;
      const changes = o.updated_at >= since ? [{ slug: o.slug, status: o.status, updated_at: o.updated_at, buyer_whatsapp: BUYER_WA }] : [];
      return { now: clock, changes };
    },
  };
  return { client: client as AppClient, set: (nv: OrderView) => (v = nv) };
}
let clock = 1_800_000_000_000;

function setup(status: OrderStatus, reintegro?: Reintegro) {
  clock = 1_800_000_000_000;
  const app = fakeApp(view({ status: "pagado", updated_at: clock - 5000 }));
  const sent: { to: string; text: string }[] = [];
  const poller = new Poller({ client: app.client, appUrl: U, send: async (to, m) => void sent.push({ to, text: m.text }), now: () => clock });
  poller.track({ slug: order.slug, status: "pagado" }, SELLER_WA);
  poller.state.cursor = clock - 10_000;
  return {
    poller,
    sent,
    /** La app pasa el pedido a `status` (con o sin reintegro) y toca updated_at. */
    cambiar(r: Reintegro | undefined = reintegro) {
      app.set(view({ status, updated_at: clock }, r));
    },
  };
}

describe("poller: el aviso de la devolución espera al reintegro", () => {
  it("devuelto con el reintegro en camino: no avisa todavía; cuando se confirma, un solo aviso con todo", async () => {
    const s = setup("devuelto", pendiente);
    await s.poller.tick(); // ve "pagado" (ya conocido)
    s.sent.length = 0;
    clock += 2000;
    s.cambiar();
    clock += 1000;
    expect(await s.poller.tick()).toEqual([]);
    expect(s.poller.state.orders[order.slug]).toMatchObject({ status: "pagado", reintegroDesde: clock, buyerPhone: BUYER_WA });
    clock += 20_000;
    expect(await s.poller.tick()).toEqual([]); // sigue esperando aunque el feed ya no lo traiga
    s.cambiar(confirmado);
    clock += 2000;
    const out = await s.poller.tick();
    expect(out.map((x) => [x.to, x.kind])).toEqual([
      [SELLER_WA, "devuelto"],
      [BUYER_WA, "devuelto"],
    ]);
    expect(out[1].msg.text).toContain("Te devolvimos todo lo que pagaste");
    expect(s.poller.state.orders[order.slug].status).toBe("devuelto");
    expect(s.poller.state.orders[order.slug].reintegroDesde).toBeUndefined();
    clock += 2000;
    expect(await s.poller.tick()).toEqual([]); // no repite
  });

  it(`si el reintegro no se confirma en ${REINTEGRO_ESPERA_MS / 60_000} minutos, va el aviso de siempre (una vez)`, async () => {
    const s = setup("devuelto", pendiente);
    await s.poller.tick();
    clock += 2000;
    s.cambiar();
    clock += 1000;
    expect(await s.poller.tick()).toEqual([]);
    clock += REINTEGRO_ESPERA_MS;
    const out = await s.poller.tick();
    expect(out.map((x) => x.kind)).toEqual(["devuelto", "devuelto"]);
    expect(out[1].msg.text).toContain("(tu pago menos las comisiones)");
    clock += 2000;
    expect(await s.poller.tick()).toEqual([]);
  });

  it("resuelto con todo para el comprador: también espera al reintegro", async () => {
    const s = setup("resuelto", pendiente);
    await s.poller.tick();
    clock += 2000;
    s.cambiar();
    clock += 1000;
    expect(await s.poller.tick()).toEqual([]);
    s.cambiar(confirmado);
    clock += 1000;
    const out = await s.poller.tick();
    expect(out.map((x) => x.kind)).toEqual(["resuelto", "resuelto"]);
    expect(out[1].msg.text).toMatch(/a tu favor\. Te devolvimos todo lo que pagaste/);
  });

  it("interruptor apagado (sin reintegro en la vista): avisa al instante, como siempre", async () => {
    const s = setup("devuelto");
    await s.poller.tick();
    clock += 2000;
    s.cambiar();
    clock += 1000;
    const out = await s.poller.tick();
    expect(out.map((x) => [x.to, x.kind])).toEqual([
      [SELLER_WA, "devuelto"],
      [BUYER_WA, "devuelto"],
    ]);
    expect(out[1].msg.text).toContain("(tu pago menos las comisiones)");
    expect(s.poller.state.orders[order.slug].reintegroDesde).toBeUndefined();
  });
});
