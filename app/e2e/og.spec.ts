import { Keypair } from "@stellar/stellar-sdk";
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Vista previa del link cuando el vendedor lo pega en WhatsApp (Open Graph + Twitter card).
// No hace transacciones: crear la tienda y el link es solo base de datos.

const WHATSAPP = { "user-agent": "WhatsApp/2.24.20.80 A" };
const DIR = path.join(__dirname, "capturas");

function metas(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/<meta\s+(?:property|name)="([^"]+)"\s+content="([^"]*)"/g)) {
    out[m[1]] ??= m[2].replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
  }
  return out;
}
const pngSize = (b: Buffer) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) });

test("vista previa del link en WhatsApp: Open Graph por pedido, en la landing y logo", async ({ request, page }) => {
  const pubkey = Keypair.random().publicKey();
  expect((await request.post("/api/sellers", { data: { pubkey, storeName: "Tienda Sofi", whatsapp: "59171234567" } })).ok()).toBe(true);
  const link = (await (await request.post("/api/links", { data: { sellerPubkey: pubkey, product: "Zapatillas Nike talla 40", priceBs: 450, deliveryDays: 3 } })).json()) as { slug: string };

  // Pedido: título con producto y precio, descripción con la tienda y la promesa, imagen 1200x630.
  const m = metas(await (await request.get(`/p/${link.slug}`, { headers: WHATSAPP })).text());
  expect(m["og:title"]).toBe("Zapatillas Nike talla 40 · Bs 450,00 | Trato");
  expect(m["og:description"]).toContain("Tienda Sofi te envió un link de pago protegido");
  expect(m["og:description"]).toContain("Tu plata queda guardada hasta que confirmes que te llegó");
  expect(m["og:site_name"]).toBe("Trato");
  expect(m["twitter:card"]).toBe("summary_large_image");
  expect(m["og:image"]).toMatch(new RegExp(`^http://localhost:\\d+/p/${link.slug}/opengraph-image`));
  expect([m["og:image:width"], m["og:image:height"]]).toEqual(["1200", "630"]);
  const img = await request.get(m["og:image"]);
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toContain("image/png");
  const buf = await img.body();
  expect(pngSize(buf)).toEqual({ w: 1200, h: 630 });
  fs.writeFileSync(path.join(DIR, "og-pedido.png"), buf);

  // Landing: imagen genérica de la marca.
  const home = metas(await (await request.get("/", { headers: WHATSAPP })).text());
  expect(home["og:title"]).toContain("Trato");
  expect(home["og:description"]).toContain("plata queda guardada");
  expect(home["twitter:card"]).toBe("summary_large_image");
  expect(home["og:image"]).toMatch(/^http:\/\/localhost:\d+\/opengraph-image/);
  const himg = await request.get(home["og:image"]);
  expect(himg.status()).toBe(200);
  const hbuf = await himg.body();
  expect(pngSize(hbuf)).toEqual({ w: 1200, h: 630 });
  fs.writeFileSync(path.join(DIR, "og-landing.png"), hbuf);

  // Logo propio como favicon.
  await page.goto("/");
  const icon = await page.locator('link[rel="icon"][href*="icon.svg"]').first().getAttribute("href");
  expect(icon).toBeTruthy();
  const svg = await request.get(icon!);
  expect(svg.status()).toBe(200);
  expect(await svg.text()).toContain("<svg");
});
