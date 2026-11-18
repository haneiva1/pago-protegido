import { describe, expect, it } from "vitest";
import type { Order, OrderView, SellerData } from "../src/app/types.ts";
import { fmtBs, fmtUsd, msg, notice, type OutMsg } from "../src/engine/messages.ts";

const order: Order = {
  slug: "zapatillas-nike-40-a1b2c3", seller_pubkey: "G", product: "Zapatillas Nike 40", description: "", photo_url: "",
  price_bs_cents: 45000, amount_units: "384615385", fx: 11.7, delivery_days: 3, status: "pagado", buyer_pubkey: "GB",
  funded_at: 1, deadline: Date.UTC(2026, 10, 24, 15), shipped_evidence: "OLV-1", shipped_at: 2, dispute_by: "comprador",
  dispute_reason: "No llegó", buyer_bps: 7000, released_at: null, resolved_at: null, created_at: 1, updated_at: 1,
};
const view: OrderView = {
  order, seller: { store_name: "Tienda Demo", whatsapp: "59171234567", pubkey: "G", completedSales: 1 }, platformFeeBps: 200, mode: "guardian",
  breakdown: { seller: "375769231", platform: "7692307", tw: "1153846" }, split: { buyer: "1", seller: "112730769", platform: "0", tw: "0" },
};
const data: SellerData = { seller: { pubkey: "G", store_name: "Tienda Demo", whatsapp: "59171234567", created_at: 0, completedSales: 1 }, orders: [order], balance: "375769231" };

/** Todos los mensajes posibles del bot, para revisarlos en bloque. */
function everyMessage(): OutMsg[] {
  const u = "https://pp.test";
  const d = { appUrl: u, view };
  const statuses = ["esperando_pago", "pagado", "enviado", "liberado", "en_disputa", "resuelto"] as const;
  return [
    msg.help("Tienda Demo"), msg.notRegistered(u, "59170000000"), msg.unknown(), msg.thanks(), msg.cancelled(), msg.askProduct(),
    msg.askPrice("Polera"), msg.askPrice("Polera", true), msg.askPriceInBs(), msg.priceOutOfRange(), msg.askDays(), msg.askDays(true),
    msg.daysOutOfRange(), ...msg.linkCreated(u, order), msg.orders(u, data), msg.orders(u, { ...data, orders: [] }),
    msg.orderNotFound("x"), msg.askCode("estado"), msg.askCode("enviado"), ...statuses.map((s) => msg.status(u, { ...view, order: { ...order, status: s } })),
    msg.askEvidence("Polera"), msg.cannotShip({ ...order, status: "esperando_pago" }), msg.shipLink(u, order, "OLV-1"), msg.balance(u, data),
    msg.appError("x"), msg.linked("Tienda Demo"), notice.paid(d), notice.shippedSeller(d), notice.arrived(d), notice.released(d),
    notice.dispute(d), notice.resolved(d, "vendedor"), notice.resolved(d, "comprador"), notice.reminder(d, Date.UTC(2026, 10, 24, 0)),
    // Anti-fraude
    msg.sellerWelcome("Tienda Demo"), msg.verifyOk(view), msg.verifyOk({ ...view, order: { ...order, status: "esperando_pago" } }),
    ...(["shortener", "lookalike", "hidden", "other", "bad_path", "bad_slug", "not_found", "invalid"] as const).map((r) =>
      msg.verifyFake("https://pago-protegido.co/p/x-a1b2c3", "pago-protegido.co", r, u),
    ),
    msg.verifyAsk(), msg.verifyUnavailable(), msg.reportThanks("bit.ly"), msg.reportAsk(),
    msg.buyerHelp("problema", u), msg.buyerHelp("tiempo", u), msg.buyerHelp("ok", null),
    notice.disputeBuyer(d), notice.antiPressure(d), notice.reminder(d, Date.UTC(2026, 10, 24, 14, 30)),
  ];
}

describe("mensajes", () => {
  it("nunca dicen 'cripto' (la moneda es 'USD de prueba') y caben en WhatsApp", () => {
    for (const m of everyMessage()) {
      expect(m.text).not.toMatch(/cripto|crypto|blockchain|token|stellar|xlm/i);
      expect(m.text.length).toBeLessThanOrEqual(1024);
      expect(m.buttons?.length ?? 0).toBeLessThanOrEqual(3);
      for (const b of m.buttons ?? []) expect([...b.title].length).toBeLessThanOrEqual(20);
    }
  });

  it("palabras prohibidas: cripto, token, stablecoin, wallet, llave, blockchain, garantía, seguro, custodia", () => {
    const banned = /\b(cripto\w*|crypto\w*|tokens?|stablecoins?|wallets?|llaves?|blockchain|garant[ií]as?|segur[oa]s?|custodi\w*)\b/i;
    for (const m of everyMessage()) {
      for (const t of [m.text, ...(m.buttons ?? []).map((b) => b.title)]) expect(t, t).not.toMatch(banned);
    }
  });

  it("nunca dicen '¡Te pagaron!': la plata sigue guardada hasta que se libera", () => {
    for (const m of everyMessage()) expect(m.text).not.toMatch(/(?<!no )te pagaron/i);
  });

  it("formatea montos como la app (Bs y USD de prueba en es-BO)", () => {
    expect(fmtBs(45000)).toBe("Bs 450,00");
    expect(fmtBs(120050)).toBe("Bs 1.200,50");
    expect(fmtUsd("384615385")).toBe("38,46");
    const [created] = msg.linkCreated("https://pp.test", order);
    expect(created.text).toContain("*Zapatillas Nike 40* · Bs 450,00 (≈ 38,46 USD de prueba) · entrega en 3 días");
    expect(created.text).toContain("Código: *a1b2c3*");
  });

  it("el saldo suma lo protegido en pedidos en curso", () => {
    const m = msg.balance("https://pp.test", data);
    expect(m.text).toMatch(/Tu saldo: \*37,58 USD de prueba\*/);
    expect(m.text).toMatch(/\*Bs 450,00\* protegidos en 1 pedido en camino/);
  });

  it("el recordatorio dice cuándo se libera, en hora de Bolivia", () => {
    const t = notice.reminder({ appUrl: "https://pp.test", view }, Date.UTC(2026, 10, 24, 0)).text;
    expect(t).toMatch(/en unas 15 h/);
    expect(t).toMatch(/11:00/); // 15:00 UTC = 11:00 en La Paz
  });
});
