import { describe, expect, it } from "vitest";
import { SLUG_RE, checkLink, findLinks, isLookalike, brandsOf, parseLink } from "../src/engine/links.ts";

// Dominio de producción hipotético y el de desarrollo: los dos casos de PP_APP_URL.
const PROD = ["pagoprotegido.bo"];
const DEV = ["localhost:3000"];
const SLUG = "zapatillas-nike-40-a1b2c3";

describe("verificador: links auténticos (solo el dominio canónico exacto)", () => {
  it.each([
    `https://pagoprotegido.bo/p/${SLUG}`,
    `http://pagoprotegido.bo/p/${SLUG}`,
    `pagoprotegido.bo/p/${SLUG}`,
    `https://PagoProtegido.BO/p/${SLUG}/`,
    `https://pagoprotegido.bo/p/${SLUG}?utm=wa#arriba`,
    `<https://pagoprotegido.bo/p/${SLUG}>.`,
    `*https://pagoprotegido.bo/p/${SLUG}*`,
  ])("%s", (link) => {
    expect(checkLink(link, PROD)).toEqual({ ok: true, host: "pagoprotegido.bo", slug: SLUG });
  });

  it("en desarrollo el canónico es localhost con su puerto exacto", () => {
    expect(checkLink(`http://localhost:3000/p/${SLUG}`, DEV)).toMatchObject({ ok: true, slug: SLUG });
    expect(checkLink(`http://localhost:3001/p/${SLUG}`, DEV)).toMatchObject({ ok: false, reason: "other" });
  });
});

describe("verificador: dominios parecidos", () => {
  it.each([
    "https://pago-protegido.co/p/" + SLUG,
    "https://pago-protegido.bo/p/" + SLUG,
    "https://pagoprotegido.co/p/" + SLUG,
    "https://pagoprotegido.com/p/" + SLUG,
    "https://pagoprotegid0.bo/p/" + SLUG,
    "https://pag0pr0tegid0.com/p/" + SLUG,
    "https://pagoprotegldo.bo/p/" + SLUG,
    "https://pagoprotejido.com/p/" + SLUG,
    "https://pagosprotegidos.net/p/" + SLUG,
    "https://pago.protegido.site/p/" + SLUG,
    "https://pagoprotegído.bo/p/" + SLUG, // con tilde (IDN)
    "https://pаgoprotegido.bo/p/" + SLUG, // "а" cirílica
    "https://xn--pagoprotegdo-0db.bo/p/" + SLUG, // punycode de "pagoprotegído"
    "https://pagoprotegido-bo.com/p/" + SLUG,
    "https://www.pagoprotegido.bo.co/p/" + SLUG,
    "https://pagoprotegido.bo.cobrar-ya.com/p/" + SLUG, // subdominio engañoso
    "https://pagoprotegido.secure-pay.xyz/p/" + SLUG, // subdominio engañoso
    "https://secure-pagoprotegido.xyz/p/" + SLUG,
    "https://pagoprotegido.bo./p/" + SLUG, // punto final: no es el dominio exacto
  ])("%s → falso por imitación", (link) => {
    expect(checkLink(link, PROD)).toMatchObject({ ok: false, reason: "lookalike" });
  });

  it("también imita al nombre del dominio canónico, sea cual sea", () => {
    expect(brandsOf(["tiendasegura.com"])).toContain("tlendasegura");
    expect(isLookalike("tiendasegura.com.pe", brandsOf(["tiendasegura.com"]))).toBe(true);
    expect(brandsOf(DEV)).toEqual(["pagoprotegldo"]); // localhost no es una marca
  });

  it("un dominio cualquiera es falso, pero no se acusa de imitación", () => {
    expect(checkLink("https://mercadolibre.com.bo/p/" + SLUG, PROD)).toMatchObject({ ok: false, reason: "other", host: "mercadolibre.com.bo" });
    expect(checkLink("https://google.com", PROD)).toMatchObject({ ok: false, reason: "other" });
  });

  it("un link que esconde su destino con usuario@ es falso", () => {
    expect(checkLink(`https://pagoprotegido.bo@evil.com/p/${SLUG}`, PROD)).toMatchObject({ ok: false, reason: "hidden", host: "evil.com" });
    expect(checkLink(`https://evil.com@pagoprotegido.bo/p/${SLUG}`, PROD)).toMatchObject({ ok: false, reason: "hidden" });
  });
});

describe("verificador: acortadores", () => {
  it.each(["https://bit.ly/3xYz", "bit.ly/3xYz", "https://tinyurl.com/pago-zapatillas", "https://preview.tinyurl.com/abc", "https://t.co/abc", "https://cutt.ly/abc", "https://acortar.link/abc", "https://rb.gy/abc", "https://is.gd/abc", "https://shorturl.at/abc", "https://wa.link/abc", "https://pagoprotegido.page.link/abc"])(
    "%s → falso (acortador)",
    (link) => {
      expect(checkLink(link, PROD)).toMatchObject({ ok: false, reason: "shortener" });
    },
  );
});

describe("verificador: slugs y rutas inválidos en el dominio canónico", () => {
  it.each([
    ["https://pagoprotegido.bo/p/zapatillas", "bad_slug"], // sin el sufijo hex
    ["https://pagoprotegido.bo/p/zapatillas-zzzzzz", "bad_slug"], // sufijo no hex
    ["https://pagoprotegido.bo/p/Zapatillas-A1B2C3", "bad_slug"], // mayúsculas: la app no las genera
    ["https://pagoprotegido.bo/p/a-b-c-d-e-a1b2c3", "bad_slug"], // más de 4 palabras
    ["https://pagoprotegido.bo/p/zapatillas-a1b2c3%00", "bad_slug"],
    ["https://pagoprotegido.bo/p/%E0%A4%A", "bad_slug"],
    ["https://pagoprotegido.bo/p/..%2Fpanel", "bad_slug"],
    ["https://pagoprotegido.bo/p/zapatillas-a1b2c3/pagar", "bad_path"],
    ["https://pagoprotegido.bo/pagar/zapatillas-a1b2c3", "bad_path"],
    ["https://pagoprotegido.bo/panel?enviar=zapatillas-a1b2c3", "bad_path"],
    ["https://pagoprotegido.bo/", "bad_path"],
  ])("%s → %s", (link, reason) => {
    expect(checkLink(link, PROD)).toMatchObject({ ok: false, reason });
  });

  it("la forma del slug es la de slugify de la app", () => {
    for (const ok of ["pedido-ff00aa", "a-000000", "iphone-13-pro-max-0a1b2c", "x".repeat(32) + "-abcdef"]) expect(SLUG_RE.test(ok)).toBe(true);
    for (const bad of ["ff00aa", "-ff00aa", "a--b-ff00aa", "x".repeat(33) + "-abcdef", "pedido-ff00aa-"]) expect(SLUG_RE.test(bad)).toBe(false);
  });

  it("lo que no es un link http(s) no se acepta", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,hola", "ftp://pagoprotegido.bo/p/" + SLUG, "hola", "", "Bs. 450"]) {
      expect(parseLink(bad)).toBeNull();
      expect(checkLink(bad, PROD)).toMatchObject({ ok: false, reason: "invalid" });
    }
  });
});

describe("links en un mensaje reenviado", () => {
  it("encuentra links con http(s), www. o de acortadores, sin la puntuación pegada", () => {
    const text = `¡Hola! Paga aquí (https://pago-protegido.co/p/${SLUG}), o en www.pagoprotegido.bo/p/${SLUG}. Más rápido: bit.ly/3xYz!`;
    expect(findLinks(text)).toEqual([`https://pago-protegido.co/p/${SLUG}`, `www.pagoprotegido.bo/p/${SLUG}`, "bit.ly/3xYz"]);
  });

  it("no confunde precios, tallas ni guías con links", () => {
    expect(findLinks("vendo zapatillas nike 40 a Bs. 1.200 entrega 3 días")).toEqual([]);
    expect(findLinks("enviado a1b2c3 OLV-12345")).toEqual([]);
    expect(findLinks("zapatillas.nike talla 40")).toEqual([]);
  });
});
