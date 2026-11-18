import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Solo lectura contra Stellar TESTNET: métricas en vivo, perfil verificable de la tienda y tarjeta del vendedor, con
// los eventos reales de los contratos v2 (compras de las pruebas del equipo). No firma ni envía transacciones.
// Lo corre `npm run test:e2e:publico` (sin claves) y también `npm run test:e2e` (después del flujo con pagos).

const DIR = path.join(__dirname, "capturas");
fs.mkdirSync(DIR, { recursive: true });
const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
const TX_LINK = 'a[href*="stellar.expert/explorer/testnet/tx/"]';
const WHATSAPP = { "user-agent": "WhatsApp/2.24.20.80 A" };
const TIENDA_WA = "59170004444";

// Misma lista que pago-protegido.spec.ts. /metricas y /tienda son pantallas de usuarios: van las dos listas.
const LEGALES = [/\bseguro\b/i, /garant[ií]a/i, /garantizad/i, /100\s?%/, /custodia/i, /plataforma de pagos/i, /pasarela/i, /billetera Pago Protegido/i, /arbitraje/i, /árbitro/i];
const TECNICAS = [/cripto/i, /\btoken/i, /stablecoin/i, /\bwallet\b/i, /\bllaves?\b/i, /billetera propia/i, /blockchain/i, /stellar/i];

async function revisarPalabras(page: Page) {
  const text = await page.locator("body").innerText();
  for (const re of [...LEGALES, ...TECNICAS]) expect(text, `palabra prohibida ${re} en ${page.url()}`).not.toMatch(re);
}

async function capturar(page: Page, nombre: string) {
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
  await revisarPalabras(page);
  const original = page.viewportSize() ?? MOBILE;
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.setViewportSize(MOBILE);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(DIR, `${nombre}-celular.png`), fullPage: true });
  await page.setViewportSize(DESKTOP);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(DIR, `${nombre}-escritorio.png`), fullPage: true, scale: "css" });
  await page.setViewportSize(original);
}

function metas(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/<meta\s+(?:property|name)="([^"]+)"\s+content="([^"]*)"/g)) {
    out[m[1]] ??= m[2].replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
  }
  return out;
}
const pngSize = (b: Buffer) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) });
const numero = (s: string) => Number(s.replace(/\D/g, ""));

test.describe.configure({ mode: "serial" });

test("métricas en vivo: piloto y pruebas del equipo por separado, cada número con sus operaciones y un gráfico por día", async ({ page, request }) => {
  // Enlazada desde la landing y desde /transparencia.
  await page.goto("/");
  await page.getByTestId("link-metricas").click();
  await expect(page).toHaveURL(/\/metricas$/);
  await page.goto("/transparencia");
  await page.getByTestId("link-metricas").click();
  await expect(page).toHaveURL(/\/metricas$/);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Métricas en vivo");
  await expect(page.getByTestId("actualizado")).toContainText(/Actualizado: \d/);
  await expect(page.getByTestId("aviso-red")).toHaveCount(0);
  await expect(page.getByTestId("titulo-piloto")).toHaveText("Piloto con vendedores reales");
  await expect(page.getByTestId("titulo-equipo")).toHaveText("Pruebas del equipo en testnet (incluye reclamos forzados)");

  const eq = page.getByTestId("grupo-equipo");
  for (const id of ["kpi-compras", "kpi-monto", "kpi-sin-reclamo", "kpi-cobro", "kpi-reclamos", "kpi-devoluciones", "kpi-mas-tiempo", "kpi-despacho"]) {
    await expect(eq.getByTestId(id)).toBeVisible();
    await expect(eq.getByTestId(id)).toHaveAttribute("href", /^\/metricas\/equipo\/[a-z-]+$/);
  }
  const compras = numero(await eq.getByTestId("kpi-compras").getByTestId("valor").innerText());
  expect(compras).toBeGreaterThan(0);
  await expect(eq.getByTestId("kpi-monto").getByTestId("valor")).toContainText(/^Bs \d/);
  await expect(eq.getByTestId("kpi-cobro").getByTestId("valor")).not.toHaveText("—");
  // Gráfico por día (SVG propio, sin librerías): al menos una barra de compras y una de monto.
  const grafico = eq.getByTestId("grafico-equipo");
  await expect(grafico.locator("svg")).toHaveCount(2);
  await expect(grafico.locator("svg").first().locator("rect title").first()).toBeAttached();
  await capturar(page, "70-metricas");

  // JSON = pantalla, y los grupos nunca se mezclan: /api/transparencia cuenta lo mismo por separado.
  await expect
    .poll(async () => {
      const [m, t] = await Promise.all([(await request.get("/api/metricas")).json(), (await request.get("/api/transparencia")).json()]);
      return [m.equipo.kpis.compras === t.compras_protegidas, m.piloto.kpis.compras === t.piloto.compras_protegidas];
    })
    .toEqual([true, true]);
  const m = await (await request.get("/api/metricas")).json();
  for (const g of [m.equipo, m.piloto]) {
    const k = g.kpis;
    expect(k.cerradas + k.en_curso).toBe(k.compras);
    expect(k.reclamos.en_revision + k.reclamos.resueltos).toBe(k.reclamos.total);
    expect(k.confirmadas_sin_reclamo + k.plazo_sin_reclamo).toBe(k.ventas_sin_reclamo);
    expect(k.ventas_sin_reclamo).toBeLessThanOrEqual(k.pagadas_al_vendedor);
    expect(g.diario).toHaveLength(30);
    expect(g.diario.reduce((a: number, d: { compras: number }) => a + d.compras, 0)).toBeLessThanOrEqual(k.compras);
  }
  expect(m.actualizado).toBeGreaterThan(Date.now() - 10 * 60_000);
  expect(m.error).toBeNull();

  // Cada número abre la lista de operaciones que lo forman, con links al registro público.
  await eq.getByTestId("kpi-compras").click();
  await expect(page).toHaveURL(/\/metricas\/equipo\/compras$/);
  await expect(page.getByTestId("grupo-detalle")).toHaveText("Pruebas del equipo en testnet");
  await expect(page.getByTestId("total-detalle")).toContainText(`${compras.toLocaleString("es-BO")} compras`);
  await expect(page.getByTestId("operacion").first().locator(TX_LINK).first()).toBeVisible();
  await capturar(page, "71-metricas-operaciones");
  await page.goto("/metricas/equipo/reclamos");
  await expect(page.getByTestId("operacion")).toHaveCount(m.equipo.kpis.reclamos.total);
  await expect(page.getByTestId("operacion").first().getByRole("link", { name: "Reclamo" })).toHaveAttribute("href", /stellar\.expert\/explorer\/testnet\/tx\//);
  await page.goto("/metricas/equipo/devoluciones");
  await expect(page.getByTestId("operacion")).toHaveCount(m.equipo.kpis.devoluciones_sin_despacho);
  await page.goto("/metricas/equipo/mas-tiempo");
  await expect(page.getByTestId("operacion")).toHaveCount(m.equipo.kpis.mas_tiempo);
  if (m.equipo.kpis.mas_tiempo > 0) await expect(page.getByTestId("operacion").first().getByRole("link", { name: "Más tiempo" })).toBeVisible();
  await page.goto("/metricas/piloto/compras");
  await expect(page.getByTestId("grupo-detalle")).toHaveText("Piloto con vendedores reales");
  await expect(page.getByTestId("operacion")).toHaveCount(m.piloto.kpis.compras);
  expect((await request.get("/metricas/otro/compras")).status()).toBe(404);
});

test("perfil verificable de la tienda (/tienda/<slug>): mismos números que la tarjeta del vendedor, insignia OG y sin datos personales", async ({ page, request }) => {
  // Una cuenta de vendedor de las pruebas del equipo con ventas reales en testnet. Se registra como tienda solo en esta
  // base local (crear la tienda no firma nada, DECISIONES 15): sus números salen del registro público.
  const t = (await (await request.get("/api/transparencia")).json()) as { compras: { seller: string; state: string }[] };
  // Que todavía no sea tienda en esta base: con `npm run test:e2e` corre después del flujo con pagos, que ya registró
  // sus tiendas, y el slug se asigna una sola vez y no cambia al renombrar (DECISIONES 93).
  const pagadas = [...new Set(t.compras.filter((c) => c.state === "liberada_confirmacion" || c.state === "liberada_plazo").map((c) => c.seller))];
  let vendedor: string | undefined;
  for (const s of pagadas) if ((await request.get(`/api/sellers/${s}`)).status() === 404) { vendedor = s; break; }
  expect(vendedor, "una compra pagada en testnet a una cuenta que todavía no es tienda en esta base").toBeTruthy();
  expect((await request.post("/api/sellers", { data: { pubkey: vendedor, storeName: "Calzados Sofi", whatsapp: TIENDA_WA, city: "Cochabamba" } })).ok()).toBe(true);
  const link = (await (await request.post("/api/links", { data: { sellerPubkey: vendedor, product: "Zapatillas urbanas talla 40", priceBs: 450, deliveryDays: 3 } })).json()) as {
    slug: string;
  };

  // Página de pago del comprador: la tarjeta del vendedor muestra los números y enlaza al perfil.
  await page.goto(`/p/${link.slug}`);
  const tarjeta = page.getByTestId("vendedor");
  await expect(tarjeta).toContainText("Vendedor: Calzados Sofi · Cochabamba");
  await expect(tarjeta).toContainText("Verificación de identidad: pendiente (modo práctica)");
  await expect(tarjeta.getByTestId("num-ventas")).not.toContainText(/^0\s/);
  const enTarjeta: Record<string, string> = {};
  for (const id of ["num-ventas", "num-sin-reclamo", "num-despacho", "num-perdidos"]) enTarjeta[id] = await tarjeta.getByTestId(id).locator("p").first().innerText();
  expect(numero(enTarjeta["num-ventas"])).toBeGreaterThan(0);
  await capturar(page, "72-comprador-tarjeta-vendedor");

  await tarjeta.getByTestId("link-perfil-tienda").click();
  await expect(page).toHaveURL(/\/tienda\/calzados-sofi-[0-9a-f]{4}$/);
  const slug = new URL(page.url()).pathname.split("/").pop()!;
  await expect(page.getByTestId("perfil-nombre")).toHaveText("Calzados Sofi");
  await expect(page.getByTestId("sello")).toContainText("Vende con Pago Protegido");
  await expect(page.getByTestId("perfil-tienda")).toContainText(/Vende con Pago Protegido desde \S+ de \d{4}/);
  await expect(page.getByTestId("verificacion")).toHaveText("Verificación de identidad: pendiente (modo práctica)");
  // Los mismos números que la tarjeta del comprador.
  for (const [id, v] of Object.entries(enTarjeta)) await expect(page.getByTestId("perfil-tienda").getByTestId(id).locator("p").first()).toHaveText(v);
  // Historial verificable: cada compra con su link al registro público, y la cuenta de la tienda.
  await expect(page.getByTestId("operacion").first().locator(TX_LINK).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver la cuenta de la tienda en el registro público" })).toHaveAttribute("href", new RegExp(`/account/${vendedor}$`));
  // Sin datos personales: ni el teléfono (completo o parcial) ni la dirección.
  const html = await page.content();
  expect(html).not.toContain(TIENDA_WA);
  expect(html).not.toContain(TIENDA_WA.slice(-8));
  expect(await page.locator("body").innerText()).not.toMatch(/WhatsApp|direcci[oó]n:/i);

  // Insignia para la bio: link y texto listos para copiar, imagen para descargar.
  const url = await page.getByTestId("link-perfil").innerText();
  expect(url).toMatch(new RegExp(`^http://localhost:\\d+/tienda/${slug}$`));
  await expect(page.getByTestId("insignia").getByRole("button", { name: "Copiar link" })).toBeVisible();
  await expect(page.getByTestId("insignia").getByRole("button", { name: "Copiar texto para la bio" })).toBeVisible();
  const descarga = await request.get(`/tienda/${slug}/insignia`);
  expect(descarga.status()).toBe(200);
  expect(descarga.headers()["content-type"]).toContain("image/png");
  await capturar(page, "73-tienda-perfil");

  // Vista previa al pegar el link en Instagram, TikTok o WhatsApp: "Vende con Pago Protegido" y sus números.
  const meta = metas(await (await request.get(`/tienda/${slug}`, { headers: WHATSAPP })).text());
  expect(meta["og:title"]).toBe("Calzados Sofi vende con Pago Protegido");
  expect(meta["og:description"]).toContain(`${numero(enTarjeta["num-ventas"])} venta`);
  expect(meta["og:description"]).toContain("sin reclamo");
  expect(meta["og:description"]).not.toContain(TIENDA_WA);
  expect(meta["twitter:card"]).toBe("summary_large_image");
  expect(meta["og:image"]).toMatch(new RegExp(`^http://localhost:\\d+/tienda/${slug}/opengraph-image`));
  const img = await request.get(meta["og:image"]);
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toContain("image/png");
  const buf = await img.body();
  expect(pngSize(buf)).toEqual({ w: 1200, h: 630 });
  fs.writeFileSync(path.join(DIR, "og-tienda.png"), buf);

  expect((await request.get("/tienda/no-existe-0000")).status()).toBe(404);
});
