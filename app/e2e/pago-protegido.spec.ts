import { expect, test, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// E2E contra Stellar TESTNET (transacciones reales). Recorre el caso feliz y el de disputa 70/30
// y guarda capturas en tamaño celular y escritorio en e2e/capturas/.

const DIR = path.join(__dirname, "capturas");
fs.mkdirSync(DIR, { recursive: true });
const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
const CHAIN = { timeout: 240_000 }; // operaciones que esperan a la red
const TX_LINK = 'a[href*="stellar.expert/explorer/testnet/tx/"]';

test.describe.configure({ mode: "serial" });

async function capturar(page: Page, nombre: string) {
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
  // La interfaz nunca dice "cripto".
  expect(await page.locator("body").innerText()).not.toMatch(/cripto/i);
  const original = page.viewportSize() ?? MOBILE;
  // Arriba de todo: si no, el encabezado fijo (sticky) aparece en medio de la captura de página completa.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.setViewportSize(MOBILE);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(DIR, `${nombre}-celular.png`), fullPage: true });
  await page.setViewportSize(DESKTOP);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(DIR, `${nombre}-escritorio.png`), fullPage: true, scale: "css" });
  await page.setViewportSize(original);
}

async function nuevoVendedor(browser: Browser, tienda: string, whatsapp: string, capturas = false) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/vender");
  await page.getByLabel("Nombre de la tienda").fill(tienda);
  if (capturas) await capturar(page, "02-onboarding-tienda");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Número de WhatsApp").fill(whatsapp);
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("button", { name: "Crear mi billetera y continuar" })).toBeVisible();
  if (capturas) await capturar(page, "03-onboarding-billetera");
  await page.getByRole("button", { name: "Crear mi billetera y continuar" }).click();
  await page.waitForURL("**/panel**", CHAIN);
  await expect(page.getByTestId("tienda")).toHaveText(tienda);
  return page;
}

async function crearLink(page: Page, p: { producto: string; descripcion: string; precio: number; dias: number }, captura?: string) {
  await page.getByLabel("Producto").fill(p.producto);
  await page.getByLabel("Descripción corta").fill(p.descripcion);
  await page.getByLabel("Precio en Bs").fill(String(p.precio));
  await page.getByLabel("Días de entrega").selectOption(String(p.dias));
  if (captura) await capturar(page, captura);
  await page.getByRole("button", { name: "Crear link" }).click();
  const url = (await page.getByTestId("link-url").textContent())!.trim();
  expect(url).toMatch(/\/p\/[a-z0-9-]+$/);
  return { url, slug: url.split("/p/")[1] };
}

async function pagar(browser: Browser, url: string, capturas: boolean) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(url);
  await expect(page.getByTestId("producto")).toBeVisible();
  await expect(page.getByText("Cómo te protegemos")).toBeVisible();
  if (capturas) await capturar(page, "06-comprador-antes-de-pagar");
  await page.getByRole("button", { name: /Pagar protegido/ }).click();
  await expect(page.getByTestId("rampa-simulada")).toHaveText("Rampa simulada en testnet. En producción la hace una entidad certificada por ASFI.");
  if (capturas) await capturar(page, "07-comprador-qr-rampa-simulada");
  await page.getByRole("button", { name: "Simular pago del banco (testnet)" }).click();
  await expect(page.getByTestId("estado-pedido")).toContainText("Tu plata está protegida", CHAIN);
  await expect(page.locator(TX_LINK).first()).toBeVisible();
  return page;
}

async function marcarEnviado(seller: Page, slug: string, codigo: string) {
  await seller.reload();
  const card = seller.getByTestId(`pedido-${slug}`);
  await expect(card.getByTestId("estado")).toHaveText("Pagado (despacha)", { timeout: 60_000 });
  await card.getByLabel("Código de encomienda o link de la foto del envío").fill(codigo);
  await card.getByRole("button", { name: "Marcar como enviado" }).click();
  await expect(card.getByTestId("estado")).toHaveText("Enviado", CHAIN);
  return card;
}

test("caso feliz: link → pago protegido → enviado → recibí conforme → liberado", async ({ browser }) => {
  // Vendedor
  const landing = await browser.newPage();
  await landing.goto("/");
  await expect(landing.getByRole("heading", { level: 1 })).toHaveText("Vende por redes sin que desconfíen de ti.");
  await capturar(landing, "01-landing");
  await landing.close();

  const seller = await nuevoVendedor(browser, "Tienda Sofi", "59171234567", true);
  await expect(seller.getByRole("heading", { name: "Tu primer link" })).toBeVisible();
  const { url, slug } = await crearLink(
    seller,
    { producto: "Zapatillas Nike talla 40", descripcion: "Originales, nuevas en caja.", precio: 450, dias: 3 },
    "04-panel-primer-link",
  );
  await expect(seller.getByTestId("link-creado").getByTestId("whatsapp")).toContainText(url);
  await capturar(seller, "05-panel-link-creado");

  // Comprador paga con la rampa simulada: el escrow queda fondeado.
  const buyer = await pagar(browser, url, true);
  await expect(buyer.getByTestId("onchain")).toContainText("38,46 USD de prueba", { timeout: 60_000 });
  await capturar(buyer, "08-comprador-pagado");

  // Vendedor marca enviado con el código de encomienda.
  const card = await marcarEnviado(seller, slug, "SRV-2026-118734");
  await expect(card.getByTestId("whatsapp")).toContainText("SRV-2026-118734");
  await capturar(seller, "09-vendedor-enviado");

  // Comprador confirma: se aprueba y se libera.
  await buyer.reload();
  await expect(buyer.getByTestId("linea-de-tiempo")).toContainText("SRV-2026-118734");
  await expect(buyer.getByTestId("plazo")).toBeVisible();
  await capturar(buyer, "10-comprador-enviado");
  await buyer.getByRole("button", { name: /Recibí conforme/ }).click();
  await expect(buyer.getByTestId("estado-pedido")).toContainText("Pago liberado al vendedor", CHAIN);
  const desglose = buyer.getByTestId("desglose");
  await expect(desglose).toContainText("37,58"); // vendedor: 38,4615385 − 2 % − 0,3 %
  await expect(desglose).toContainText("0,77"); // plataforma 2 %
  await expect(desglose).toContainText("0,12"); // Trustless Work 0,3 %
  await capturar(buyer, "11-comprador-liberado");

  // El vendedor ve el saldo.
  await seller.reload();
  await expect(card.getByTestId("estado")).toHaveText("Liberado", { timeout: 60_000 });
  await expect(seller.getByTestId("saldo")).toHaveText("37,58");
  await capturar(seller, "12-vendedor-liberado");
});

test("disputa: reclamo del comprador y el árbitro reparte 70/30", async ({ browser }) => {
  const seller = await nuevoVendedor(browser, "Moda Andina", "59176543210");
  const { url, slug } = await crearLink(seller, { producto: "Polera Adidas talla M", descripcion: "Color negro.", precio: 300, dias: 5 });
  const buyer = await pagar(browser, url, false);
  await marcarEnviado(seller, slug, "OLVA-55821");

  // El comprador abre un reclamo.
  await buyer.reload();
  await buyer.getByRole("button", { name: "Tengo un problema" }).click();
  await buyer.getByLabel("Motivo").selectOption("Llegó dañado");
  await buyer.getByLabel("Cuéntanos más").fill("La polera llegó rota en la manga.");
  await capturar(buyer, "20-comprador-tengo-un-problema");
  await buyer.getByRole("button", { name: "Enviar reclamo" }).click();
  await expect(buyer.getByTestId("estado-pedido")).toContainText("Reclamo abierto", CHAIN);
  await capturar(buyer, "21-comprador-reclamo-abierto");

  // El vendedor deja su versión.
  await seller.reload();
  const card = seller.getByTestId(`pedido-${slug}`);
  await expect(card.getByTestId("estado")).toHaveText("En disputa", { timeout: 60_000 });
  await card.getByLabel("Tu versión para el árbitro").fill("La envié en buen estado; adjunto la guía OLVA-55821.");
  await card.getByRole("button", { name: "Enviar mi versión" }).click();
  await expect(card.getByRole("button", { name: "Actualizar mi versión" })).toBeVisible({ timeout: 30_000 });
  await capturar(seller, "22-vendedor-en-disputa");

  // El árbitro reparte 70 % comprador / 30 % vendedor.
  const arbCtx = await browser.newContext({ viewport: DESKTOP });
  const arb = await arbCtx.newPage();
  await arb.goto("/arbitro");
  await expect(arb.getByTestId("texto-fijo")).toContainText(
    "El árbitro solo puede repartir entre comprador y vendedor. El contrato no permite otro destino.",
  );
  await arb.getByLabel("Clave del árbitro").fill(process.env.ARBITRO_PANEL_KEY ?? "");
  await arb.getByRole("button", { name: "Entrar" }).click();
  const dispute = arb.getByTestId(`disputa-${slug}`);
  await expect(dispute).toBeVisible({ timeout: 60_000 });
  await expect(dispute).toContainText("La envié en buen estado");
  await expect(dispute.getByTestId("estado-onchain")).toContainText("En disputa: sí");
  await dispute.getByTestId("slider").fill("70");
  await expect(dispute.getByTestId("pct")).toHaveText("70%");
  await expect(dispute.getByTestId("vista-previa")).toContainText("17,54"); // 70 % de 25,6410256 menos comisiones
  await dispute.getByRole("button", { name: "Probar: mandar la plata a otra cuenta" }).click();
  await expect(dispute.getByTestId("resultado-desvio")).toContainText("Rechazado", { timeout: 60_000 });
  await capturar(arb, "23-arbitro-70-30-desvio-rechazado");
  await dispute.getByRole("button", { name: "Resolver" }).click();
  await expect(arb.getByText("Resueltas recientemente")).toBeVisible(CHAIN);
  await expect(arb.getByTestId("reparto").first()).toContainText("Comprador (70%)");
  await capturar(arb, "24-arbitro-resuelto");

  // Comprador y vendedor ven la resolución.
  await buyer.reload();
  await expect(buyer.getByTestId("estado-pedido")).toContainText("Reclamo resuelto", { timeout: 60_000 });
  await expect(buyer.getByTestId("reparto")).toContainText("17,54");
  await expect(buyer.getByTestId("reparto")).toContainText("7,52");
  await capturar(buyer, "25-comprador-resuelto");
  await seller.reload();
  await expect(card.getByTestId("estado")).toHaveText("Resuelto", { timeout: 60_000 });
  await capturar(seller, "26-vendedor-resuelto");

  const info = await browser.newPage();
  await info.goto("/como-funciona");
  await expect(info.getByRole("heading", { level: 1 })).toHaveText("Cómo funciona");
  await capturar(info, "30-como-funciona");
});
