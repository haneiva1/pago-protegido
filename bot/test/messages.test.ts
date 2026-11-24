import { describe, expect, it } from "vitest";
import type { Order, OrderView, SellerData } from "../src/app/types.ts";
import { fmtBs, fmtEnvio, fmtReparto, fmtUsd, msg, notice, usarRed, type OutMsg } from "../src/engine/messages.ts";

const order: Order = {
  slug: "zapatillas-nike-40-a1b2c3", seller_pubkey: "G", product: "Zapatillas Nike 40", description: "", photo_url: "",
  price_bs_cents: 45000, amount_units: "384615385", fx: 11.7, delivery_days: 3, status: "pagado", buyer_pubkey: "GB",
  funded_at: 1, deadline: Date.UTC(2026, 10, 24, 15), shipped_evidence: "OLV-1", shipped_at: 2, dispute_by: "comprador",
  dispute_reason: "No llegó", buyer_bps: 7000, released_at: null, resolved_at: null, created_at: 1, updated_at: 1,
};
/** Pedido v2: código PP, protección del comprador y plazos del contrato. */
const v2: Order = {
  ...order, slug: "celular-samsung-a54-d4e5f6", product: "Celular Samsung A54", price_bs_cents: 180000, amount_units: "1561965812",
  code: "PP-4821", category: "Celular", proteccion: "comprador", proteccion_bs_cents: 2700, ship_deadline: Date.UTC(2026, 10, 21, 15), extended: 0,
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
  const statuses = ["esperando_pago", "pagado", "enviado", "liberado", "en_disputa", "resuelto", "devuelto"] as const;
  const d2 = { appUrl: u, view: { ...view, order: v2 } };
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
    // v2
    ...msg.linkCreated(u, v2, "Tienda Demo"), ...msg.linkCreated(u, { ...v2, proteccion: "vendedor", proteccion_bs_cents: 0 }),
    msg.proteccionSet(v2), msg.proteccionNoOrder(), msg.shipLate(v2), msg.cannotShip({ ...v2, status: "devuelto" }),
    ...statuses.map((s) => msg.status(u, { ...view, order: { ...v2, status: s } })),
    notice.paid(d2), notice.shippedSeller(d2), notice.arrived(d2), notice.antiPressure({ appUrl: u, view: { ...view, order: { ...v2, status: "pagado" } } }),
    notice.refunded(d2, "vendedor"), notice.refunded(d2, "comprador"), notice.extended(d2),
    notice.reminder({ appUrl: u, view: { ...view, order: { ...v2, extended: 1 } } }, Date.UTC(2026, 10, 24, 0)),
    // WhatsApp real
    msg.sellerWelcome("Tienda Demo", true), msg.novedades(1), msg.novedades(3), msg.alDia(), msg.avisosActivos(), msg.avisosSinCompra(),
    msg.compradorHola(u), msg.soloTexto(), msg.sinNumero(),
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

  it("palabras prohibidas: cripto, token, stablecoin, wallet, llave, blockchain, garantía, seguro, custodia, arbitraje, árbitro, 100%, plataforma de pagos", () => {
    const banned =
      /\b(cripto\w*|crypto\w*|tokens?|stablecoins?|wallets?|llaves?|blockchain|garant[ií]as?|garantizad\w*|segur[oa]s?|custodi\w*|arbitraje|[aá]rbitr[oa]s?|plataforma de pagos|pasarela)\b|100\s?%/i;
    for (const m of everyMessage()) {
      for (const t of [m.text, ...(m.buttons ?? []).map((b) => b.title)]) expect(t, t).not.toMatch(banned);
    }
  });

  it("el comprador paga con 'Pagar al vendedor' (ya no 'Recibí conforme')", () => {
    for (const m of everyMessage()) expect(m.text).not.toMatch(/recib[ií] conforme/i);
    expect(notice.arrived({ appUrl: "https://pp.test", view }).text).toContain("*Pagar al vendedor*");
    expect(msg.buyerHelp("ok", "https://pp.test/p/x").text).toContain("*Pagar al vendedor*");
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

  it("v2: código PP, quién paga la protección y el texto para el cliente igual al de la app", () => {
    const [created, , forward] = msg.linkCreated("https://pp.test", v2, "Tienda Demo");
    expect(created.text).toContain("Código: *PP-4821*");
    expect(created.text).toContain("🛡️ Protección: la paga tu cliente (Bs 27,00). Paga Bs 1.827,00 (≈ 156,20 USD de prueba) y tú recibes Bs 1.800,00.");
    expect(created.buttons?.map((b) => [b.id, b.title])).toEqual([
      [`cliente ${v2.slug}`, "La paga mi cliente"],
      [`regalo ${v2.slug}`, "Yo la regalo"],
      ["vender", "🛍️ Vender otro"],
    ]);
    expect(forward.text).toBe(
      `¡Hola! 👋 Te paso el link de pago protegido de Tienda Demo para *Celular Samsung A54* (Bs 1.800,00).\n\nTu plata queda guardada en un contrato y solo me llega cuando confirmas que recibiste. Si hay un problema, un tercero revisa el reclamo.\n\n👉 https://pp.test/p/${v2.slug}`,
    );
    const regalo = msg.proteccionSet({ ...v2, proteccion: "vendedor", proteccion_bs_cents: 0 }).text;
    expect(regalo).toContain("la regalas tú. Tu cliente paga Bs 1.800,00");
  });

  it("v2: despacho con fecha límite, devolución automática y 'Necesito más tiempo' una sola vez", () => {
    const d2 = { appUrl: "https://pp.test", view: { ...view, order: { ...v2, status: "pagado" as const } } };
    expect(notice.paid(d2).text).toMatch(/PP-4821: tu cliente pagó Bs 1\.800,00 .*Despacha antes del sábado, 21 de noviembre, 11:00.* y marca enviado: escríbeme \*enviado PP-4821/s);
    expect(notice.paid(d2).text).toContain("Si no se marca enviado a tiempo, la plata vuelve sola a tu cliente.");
    // El aviso de pago: la plata está en el contrato, no es una captura, y trae el link al panel.
    expect(notice.paid(d2).text).toContain("el pago está GUARDADO en el contrato, todavía no en tu cuenta");
    expect(notice.paid(d2).text).toContain("Este aviso sale del contrato, no de una captura");
    expect(notice.paid(d2).text).toContain("👉 https://pp.test/panel\n");
    expect(notice.antiPressure(d2).text).toMatch(/Si no lo envían hasta el sábado, 21 de noviembre, 11:00.*, te lo devolvemos automáticamente\./);
    const dev = { appUrl: "https://pp.test", view: { ...view, split: undefined, order: { ...v2, status: "devuelto" as const } } };
    // 156,1965812 USD − 0,3% − 2% = 152,6040555 USD × 11,70 = Bs 1.785,47
    expect(notice.refunded(dev, "vendedor").text).toBe("↩️ PP-4821: no se marcó el envío a tiempo. Devolvimos Bs 1.785,47 al comprador. El pedido de *Celular Samsung A54* quedó cerrado.");
    expect(notice.refunded(dev, "comprador").text).toMatch(/^↩️ PP-4821: el vendedor no marcó el envío .* Te devolvimos Bs 1\.785,47/s);
    const ext = notice.reminder({ appUrl: "https://pp.test", view: { ...view, order: { ...v2, status: "enviado", extended: 1 } } }, Date.UTC(2026, 10, 24, 0));
    expect(ext.text).toContain("Ya usaste *Necesito más tiempo*");
    expect(ext.buttons?.map((b) => b.title)).toEqual(["Sí, todo bien", "Tengo un problema"]);
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

describe("textos limpios para el cliente", () => {
  it("fmtEnvio: empresa · guía · peso, sin el texto crudo ni la huella de la foto", () => {
    expect(fmtEnvio("Bolívar (encomiendas)|SRV-2026-130077|0.4kg|3f9a1c2b7d8e")).toBe("Bolívar (encomiendas) · guía SRV-2026-130077 · 0,4 kg");
    expect(fmtEnvio("Entrega en persona|-|1kg|-")).toBe("Entrega en persona · 1 kg");
    expect(fmtEnvio("OLV-1")).toBe("OLV-1"); // guía suelta (enviado <código> <guía>)
    expect(fmtEnvio(null)).toBe("");
  });

  it("fmtReparto: los repartos totales dicen «todo para…», nunca 100%", () => {
    expect(fmtReparto(100)).toBe("todo para el comprador");
    expect(fmtReparto(0)).toBe("todo para el vendedor");
    expect(fmtReparto(70)).toBe("70% para el comprador y 30% para el vendedor");
    expect(fmtReparto(70, "vendedor")).toBe("30% para ti y 70% para el comprador");
    expect(fmtReparto(70, "comprador")).toBe("70% para ti y 30% para el vendedor");
    expect(fmtReparto(100, "comprador")).toBe("todo para ti");
    expect(fmtReparto(0, "comprador")).toBe("todo para el vendedor");
    expect(fmtReparto(62.5)).toBe("62,5% para el comprador y 37,5% para el vendedor");
  });

  it("los avisos de envío y de reclamo resuelto usan esos textos", () => {
    const enviado: Order = { ...order, status: "enviado", shipped_evidence: "Bolívar (encomiendas)|SRV-2026-130077|0.4kg|3f9a1c2b7d8e" };
    const view = { order: enviado, seller: { store_name: "Tienda Sofi" } } as unknown as OrderView;
    const t = notice.arrived({ appUrl: "https://pp.test", view }).text;
    expect(t).toContain("(Bolívar (encomiendas) · guía SRV-2026-130077 · 0,4 kg)");
    expect(t).not.toContain("|");
    const total = { order: { ...order, status: "resuelto", buyer_bps: 10000 }, seller: { store_name: "Tienda Sofi" } } as unknown as OrderView;
    expect(notice.resolved({ appUrl: "https://pp.test", view: total }, "vendedor").text).toContain("todo para el comprador");
    expect(notice.resolved({ appUrl: "https://pp.test", view: total }, "comprador").text).toContain("todo para ti");
    expect(notice.resolved({ appUrl: "https://pp.test", view: total }, "vendedor").text).not.toMatch(/100\s?%/);
  });
});

describe("la red de la app (STELLAR_NETWORK)", () => {
  it("en mainnet la moneda es USDC, avisa que es plata real y todo sigue cabiendo en WhatsApp", () => {
    usarRed("mainnet");
    try {
      const todos = everyMessage();
      for (const m of todos) {
        expect(m.text).not.toMatch(/USD de prueba|cripto|token|stellar|xlm/i);
        expect(m.text.length).toBeLessThanOrEqual(1024);
      }
      expect(todos.some((m) => m.text.includes("USDC"))).toBe(true);
      expect(msg.linkCreated("https://pp.test", v2)[0].text).toContain("Prueba real en mainnet: plata real, montos chicos.");
    } finally {
      usarRed("testnet");
    }
  });

  it("en testnet nada cambia", () => {
    for (const m of everyMessage()) expect(m.text).not.toMatch(/mainnet|USDC/);
  });
});
