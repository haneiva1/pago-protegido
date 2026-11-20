import { describe, expect, it } from "vitest";
import { inferCategory, matchOrder, normCodes, normPhone, orderCode, parseAmount, parseSell, shortCode } from "../src/engine/parse.ts";

describe("precios en bolivianos", () => {
  it.each([
    ["450bs", 450],
    ["450 bs", 450],
    ["Bs. 450", 450],
    ["Bs 450", 450],
    ["Bs450", 450],
    ["Bs 1.200", 1200],
    ["1.200 Bs", 1200],
    ["Bs. 1.200,50", 1200.5],
    ["450 bolivianos", 450],
    ["450 pesos", 450],
    ["Bs 250.-", 250],
    ["a 5 mil bs", 5000],
  ])("%s → Bs %d", (text, bs) => {
    expect(parseSell(text).priceBs).toBe(bs);
  });

  it("lee formatos numéricos bolivianos (punto de miles, coma decimal)", () => {
    expect(["1.200", "1.200,50", "450,5", "450.-", "1,200.50", "12.5", "abc"].map(parseAmount)).toEqual([1200, 1200.5, 450.5, 450, 1200.5, 12.5, null]);
  });

  it("con moneda gana el monto mayor: la talla no es el precio", () => {
    expect(parseSell("zapatillas 40 Bs 450")).toMatchObject({ product: "Zapatillas 40", priceBs: 450 });
    expect(parseSell("vendo polera talla 40 a 80 Bs")).toMatchObject({ product: "Polera talla 40", priceBs: 80 });
  });

  it("detecta dólares para pedir el precio en Bs", () => {
    expect(parseSell("vendo celular 40 dólares")).toMatchObject({ usd: true, product: "Celular" });
    expect(parseSell("vendo audífonos JBL $us 30").usd).toBe(true);
  });
});

describe("frases bolivianas completas", () => {
  it("vendo zapatillas nike 40 a 450 bs entrega 3 días", () => {
    expect(parseSell("vendo zapatillas nike 40 a 450 bs entrega 3 días")).toEqual({ product: "Zapatillas nike 40", priceBs: 450, days: 3 });
  });

  it.each([
    ["vender zapatillas 450", { product: "Zapatillas", priceBs: 450 }],
    ["Vendo iPhone 13 a 3.500 Bs, entrega mañana", { product: "iPhone 13", priceBs: 3500, days: 1 }],
    ["vendo mochila Bs 250.- entrega en una semana", { product: "Mochila", priceBs: 250, days: 7 }],
    ["Vendo chompa de alpaca 180bs 5 días", { product: "Chompa de alpaca", priceBs: 180, days: 5 }],
    ["vendo laptop 16gb a 5 mil bs 2 dias", { product: "Laptop 16gb", priceBs: 5000, days: 2 }],
    ["Hola, quiero vender una polera talla M a 80 pesos, llega en dos días", { product: "Polera talla M", priceBs: 80, days: 2 }],
    ["venta de torta para mañana a 100 bolivianos", { product: "Torta", priceBs: 100, days: 1 }],
  ])("%s", (text, want) => {
    expect(parseSell(text)).toEqual(want);
  });

  it("respuestas sueltas a las preguntas guiadas", () => {
    expect(parseSell("3", "days")).toEqual({ days: 3 });
    expect(parseSell("tres días", "days")).toEqual({ days: 3 });
    expect(parseSell("pasado mañana", "days")).toEqual({ days: 2 });
    expect(parseSell("450", "price")).toEqual({ priceBs: 450 });
    expect(parseSell("iphone 13", "none")).toEqual({ product: "Iphone 13" });
  });
});

describe("teléfonos y códigos", () => {
  it("normaliza números de Bolivia", () => {
    expect(normPhone("+591 7123-4567")).toBe("59171234567");
    expect(normPhone("71234567")).toBe("59171234567");
    expect(normPhone("59171234567")).toBe("59171234567");
  });

  it("encuentra un pedido por código corto o slug", () => {
    const list = [{ slug: "zapatillas-nike-a1b2c3" }, { slug: "polera-ff00aa" }];
    expect(shortCode("zapatillas-nike-a1b2c3")).toBe("a1b2c3");
    expect(matchOrder(list, "A1B2C3")?.slug).toBe("zapatillas-nike-a1b2c3");
    expect(matchOrder(list, "polera-ff00aa")?.slug).toBe("polera-ff00aa");
    expect(matchOrder(list, "zzzzzz")).toBeUndefined();
  });

  it("código PP que genera la app: PP-4821, pp 4821 o solo 4821; el hex queda para pedidos viejos", () => {
    const list = [
      { slug: "celular-samsung-a54-a1b2c3", code: "PP-4821" },
      { slug: "polera-ff00aa", code: null },
    ];
    for (const c of ["PP-4821", "pp-4821", "pp 4821", "PP4821", "4821", "#4821"]) expect(matchOrder(list, c)?.slug, c).toBe("celular-samsung-a54-a1b2c3");
    expect(matchOrder(list, "a1b2c3")?.slug).toBe("celular-samsung-a54-a1b2c3");
    expect(matchOrder(list, "ff00aa")?.slug).toBe("polera-ff00aa");
    expect(matchOrder(list, "PP-1111")).toBeUndefined();
    expect(orderCode(list[0])).toBe("PP-4821");
    expect(orderCode(list[1])).toBe("ff00aa");
    expect(normCodes("enviado pp 4821 OLV-1")).toBe("enviado PP-4821 OLV-1");
  });

  it("código de 8 caracteres (PP-7KM4Q9TX): con o sin PP, en minúsculas; no confunde palabras", () => {
    const list = [
      { slug: "celular-samsung-a54-a1b2c3", code: "PP-7KM4Q9TX" },
      { slug: "polera-adidas-d4e5f6", code: "PP-4821" },
    ];
    for (const c of ["PP-7KM4Q9TX", "pp-7km4q9tx", "pp 7km4q9tx", "PP7KM4Q9TX", "7KM4Q9TX", "#7km4q9tx"]) expect(matchOrder(list, c)?.slug, c).toBe("celular-samsung-a54-a1b2c3");
    expect(matchOrder(list, "PP-7KM4Q9TY")).toBeUndefined();
    expect(matchOrder(list, "4821")?.slug).toBe("polera-adidas-d4e5f6");
    expect(normCodes("enviado pp 7km4q9tx OLV-1")).toBe("enviado PP-7KM4Q9TX OLV-1");
    expect(normCodes("pp gracias")).toBe("pp gracias");
    expect(normCodes("pp abcdefgh")).toBe("pp abcdefgh");
  });

  it("categoría: Celular si el producto lo parece (la app pide el IMEI)", () => {
    for (const p of ["Celular Samsung A54", "iPhone 13 128GB", "Xiaomi Redmi Note 12", "Motorola G84", "teléfono Huawei", "Galaxy S23"]) expect(inferCategory(p), p).toBe("Celular");
    for (const p of ["Zapatillas Nike 40", "Polera", "Chompa de alpaca", "Audífonos JBL"]) expect(inferCategory(p), p).toBe("Otro");
  });
});

describe("guion del video", () => {
  it('"vendo celular Samsung A54 a 1800 bs entrega 3 días"', () => {
    expect(parseSell("vendo celular Samsung A54 a 1800 bs entrega 3 días")).toEqual({ product: "Celular Samsung A54", priceBs: 1800, days: 3 });
  });
});
