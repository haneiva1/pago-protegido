import { describe, expect, it } from "vitest";
import { SESSION_TTL_MS, detectIntent, step, type Session } from "../src/engine/engine.ts";

const T = 1_700_000_000_000;

/** Conversa con el motor puro y devuelve la última respuesta. */
function talk(lines: string[], start?: Session) {
  let s = start;
  let last: ReturnType<typeof step> | undefined;
  for (const [i, l] of lines.entries()) {
    last = step(s, l, T + i * 1000);
    s = last.session;
  }
  return last!;
}

describe("intenciones", () => {
  it.each([
    ["hola", "help"],
    ["Buenas tardes!", "help"],
    ["ayuda", "help"],
    ["mis ventas", "myOrders"],
    ["ventas", "myOrders"],
    ["saldo", "balance"],
    ["¿cuánto tengo?", "balance"],
    ["vendo zapatillas 450", "sell"],
    ["Hola, quiero vender una polera", "sell"],
    ["gracias", "thanks"],
    ["cancelar", "cancel"],
    ["qwerty", "none"],
  ])("%s → %s", (text, kind) => {
    expect(detectIntent(text).kind).toBe(kind);
  });

  it("estado y enviado con argumentos (la guía conserva mayúsculas)", () => {
    expect(detectIntent("estado a1b2c3")).toEqual({ kind: "status", code: "a1b2c3" });
    expect(detectIntent("Estado del pedido a1b2c3")).toEqual({ kind: "status", code: "a1b2c3" });
    expect(detectIntent("enviado a1b2c3 OLV-12345 Trans Copacabana")).toEqual({ kind: "shipped", code: "a1b2c3", evidence: "OLV-12345 Trans Copacabana" });
    expect(detectIntent("ya envié a1b2c3 BOA-778")).toEqual({ kind: "shipped", code: "a1b2c3", evidence: "BOA-778" });
    expect(detectIntent("enviado")).toEqual({ kind: "shipped", code: undefined, evidence: undefined });
  });
});

describe("venta en un solo mensaje", () => {
  it("con todo, devuelve el comando para crear el link y deja la sesión libre", () => {
    const r = talk(["vendo zapatillas nike 40 a 450 bs entrega 3 días"]);
    expect(r.command).toEqual({ kind: "createLink", product: "Zapatillas nike 40", priceBs: 450, days: 3 });
    expect(r.session.step).toBe("idle");
    expect(r.replies).toEqual([]);
  });
});

describe("preguntas guiadas", () => {
  it("falta todo: producto → precio → días", () => {
    let r = talk(["vender"]);
    expect(r.session.step).toBe("ask_product");
    expect(r.replies[0].text).toMatch(/Qué vas a vender/);
    r = step(r.session, "Chompa de alpaca", T + 1);
    expect(r.session.step).toBe("ask_price");
    expect(r.replies[0].text).toMatch(/A cuánto vendes \*Chompa de alpaca\*/);
    r = step(r.session, "Bs 1.200", T + 2);
    expect(r.session.step).toBe("ask_days");
    expect(r.replies[0].buttons?.map((b) => b.id)).toEqual(["1 día", "3 días", "7 días"]);
    r = step(r.session, "3 días", T + 3);
    expect(r.command).toEqual({ kind: "createLink", product: "Chompa de alpaca", priceBs: 1200, days: 3 });
  });

  it("falta solo el precio", () => {
    const r = talk(["vendo polera entrega 2 días", "120"]);
    expect(r.command).toEqual({ kind: "createLink", product: "Polera", priceBs: 120, days: 2 });
  });

  it("falta solo los días: 'vender zapatillas 450' → botón '3 días'", () => {
    const first = talk(["vender zapatillas 450"]);
    expect(first.session.step).toBe("ask_days");
    expect(first.session.draft).toEqual({ product: "Zapatillas", priceBs: 450 });
    const r = step(first.session, "3 días", T + 5);
    expect(r.command).toMatchObject({ kind: "createLink", priceBs: 450, days: 3 });
  });

  it("vuelve a preguntar si la respuesta no sirve o está fuera de rango", () => {
    expect(talk(["vender zapatillas 450", "no sé"]).replies[0].text).toMatch(/No entendí los días/);
    const r = talk(["vender zapatillas 450", "20 días"]);
    expect(r.session.step).toBe("ask_days");
    expect(r.replies[0].text).toMatch(/de 1 a 15/);
    expect(talk(["vendo auto 500000 bs 3 dias"]).replies[0].text).toMatch(/entre Bs 1 y Bs 100\.000/);
    expect(talk(["vendo celular 40 dólares 3 días"]).replies[0].text).toMatch(/en bolivianos/);
  });

  it("cancelar y los comandos globales cortan la pregunta guiada", () => {
    expect(talk(["vender", "cancelar"]).session.step).toBe("idle");
    expect(talk(["vender", "cancelar"]).replies[0].text).toMatch(/lo dejamos ahí/);
    expect(talk(["vender zapatillas 450", "mis ventas"]).command).toEqual({ kind: "myOrders" });
  });

  it("la sesión guiada vence a los 30 minutos", () => {
    const s = step(undefined, "vender zapatillas 450", T).session;
    const r = step(s, "3", T + SESSION_TTL_MS + 1);
    expect(r.command).toBeUndefined();
    expect(r.replies[0].text).toMatch(/no te entendí/);
  });

  it("'enviado <código>' sin guía pide el código de encomienda", () => {
    const r = talk(["enviado a1b2c3"]);
    expect(r.command).toEqual({ kind: "shipped", code: "a1b2c3", evidence: undefined });
  });
});
