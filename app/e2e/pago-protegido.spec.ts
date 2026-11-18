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
  await page.getByLabel("Días de entrega", { exact: true }).selectOption(String(p.dias));
  if (captura) await capturar(page, captura);
  await page.getByRole("button", { name: "Crear link" }).click();
  const url = (await page.getByTestId("link-url").textContent())!.trim();
  expect(url).toMatch(/\/p\/[a-z0-9-]+$/);
  return { url, slug: url.split("/p/")[1] };
}

async function pagar(browser: Browser, url: string, capturas: boolean, whatsapp?: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(url);
  await expect(page.getByTestId("producto")).toBeVisible();
  await expect(page.getByText("Cómo te protegemos")).toBeVisible();
  if (capturas) await capturar(page, "06-comprador-antes-de-pagar");
  await page.getByRole("button", { name: /Pagar protegido/ }).click();
  await expect(page.getByTestId("rampa-simulada")).toHaveText("Rampa simulada en testnet. En producción la hace una entidad certificada por ASFI.");
  if (capturas) await capturar(page, "07-comprador-qr-rampa-simulada");
  // El pago encadena varias transacciones en testnet (rampa, deploy del escrow, fondeo). Si la red falla,
  // la pantalla muestra el error y se puede reintentar: el flujo es idempotente (no vuelve a emitir la rampa).
  if (whatsapp) await page.getByLabel("Tu WhatsApp para avisarte").fill(whatsapp);
  const simular = page.getByRole("button", { name: "Simular pago del banco (testnet)" });
  const ok = page.getByTestId("estado-pedido");
  const err = page.getByTestId("error"); // ojo: Next.js tiene un route announcer con role="alert"
  for (let intento = 1; ; intento++) {
    await simular.click();
    await expect(ok.or(err).first()).toBeVisible(CHAIN);
    if (await ok.isVisible()) break;
    const msg = await err.first().innerText();
    console.log(`[e2e] pago, intento ${intento} falló en la red: ${msg}`);
    if (intento >= 3) throw new Error(`El pago falló 3 veces: ${msg}`);
  }
  await expect(ok).toContainText("Tu plata está protegida", CHAIN);
  await expect(page.locator(TX_LINK).first()).toBeVisible();
  // H-2: la instancia ejecuta el WASM de Trustless Work y tiene los roles del modo guardián.
  await expect(page.getByTestId("sello-verificado")).toContainText("Contrato verificado");
  await expect(page.getByTestId("sello-verificado")).toContainText("pp_guardian");
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
  // La vista previa sale de pp_arbiter.quote (simulación de solo lectura).
  await expect(dispute.getByTestId("fuente-vista-previa")).toContainText("pp_arbiter.quote", { timeout: 60_000 });
  await expect(dispute.getByTestId("vista-previa")).toContainText("17,54"); // 70 % de 25,6410256 menos comisiones
  await expect(dispute.getByTestId("vista-previa")).toContainText("7,52");
  // Desvío: la llave del árbitro llama directo al escrow hacia una tercera cuenta y el CONTRATO lo rechaza.
  await dispute.getByRole("button", { name: "Probar: mandar la plata a otra cuenta" }).click();
  await expect(dispute.getByTestId("resultado-desvio")).toContainText("Rechazado por el contrato", { timeout: 60_000 });
  await expect(dispute.getByTestId("resultado-desvio")).toContainText("Error(Contract, #12)");
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

test("liberación automática: plazo corto de demo (2 min) y pp_guardian.auto_release", async ({ browser }) => {
  const seller = await nuevoVendedor(browser, "Bazar Express", "59170001111");
  await seller.goto("/panel?demo=1");
  await seller.getByLabel(/Plazo corto de demo/).check();
  const { url, slug } = await crearLink(
    seller,
    { producto: "Audífonos Bluetooth", descripcion: "Con estuche de carga.", precio: 150, dias: 1 },
    "40-panel-plazo-corto-demo",
  );
  const buyer = await pagar(browser, url, false);
  await marcarEnviado(seller, slug, "BOA-77310");

  // Cuenta regresiva en la página del comprador y en el panel del vendedor.
  await buyer.reload();
  await expect(buyer.getByTestId("cuenta-regresiva")).toBeVisible({ timeout: 60_000 });
  await capturar(buyer, "41-comprador-cuenta-regresiva");
  await seller.reload();
  await expect(seller.getByTestId(`pedido-${slug}`).getByTestId("plazo")).toBeVisible({ timeout: 60_000 });
  await capturar(seller, "42-vendedor-cuenta-regresiva");

  // Vence el plazo: aparece "Liberar ahora (plazo vencido)" y llama a pp_guardian.auto_release (sin firmas).
  const btn = buyer.getByRole("button", { name: /Liberar ahora \(plazo vencido\)/ });
  await expect(btn).toBeVisible({ timeout: 5 * 60_000 });
  await capturar(buyer, "43-comprador-plazo-vencido");
  await expect(async () => {
    if (await btn.isVisible()) await btn.click({ timeout: 5_000 }).catch(() => {});
    await expect(buyer.getByTestId("estado-pedido")).toContainText("Pago liberado al vendedor", { timeout: 45_000 });
  }).toPass({ timeout: 4 * 60_000, intervals: [5_000] });
  await expect(buyer.getByTestId("desglose")).toBeVisible();
  await expect(buyer.getByText("Venció el plazo: se liberó el pago al vendedor")).toBeVisible();
  await capturar(buyer, "44-comprador-liberado-por-plazo");

  await seller.reload();
  await expect(seller.getByTestId(`pedido-${slug}`).getByTestId("estado")).toHaveText("Liberado", { timeout: 60_000 });
  await capturar(seller, "45-vendedor-liberado-por-plazo");
});

// ---------- Bot de WhatsApp (simulador) contra la app real en testnet ----------

async function say(chat: Page, text: string) {
  const input = chat.getByLabel("Mensaje");
  await input.fill(text);
  await input.press("Enter");
  await expect(chat.getByTestId("my-msg").last()).toContainText(text);
}
const botSays = (chat: Page, text: string) => chat.getByTestId("bot-msg").filter({ hasText: text }).last();

test("bot de WhatsApp: vender por chat → pago con WhatsApp → enviado desde el link del bot → liberado", async ({ browser, request }) => {
  const SIM = process.env.E2E_SIM_URL!;
  const SELLER_WA = process.env.E2E_SELLER_WA!;

  // El bot manda a /vender?wa=… a los números sin tienda: el número llega precargado.
  const seller = await (await browser.newContext()).newPage();
  await seller.goto(`/vender?wa=${SELLER_WA}`);
  await seller.getByLabel("Nombre de la tienda").fill("Tienda del Bot");
  await seller.getByRole("button", { name: "Continuar" }).click();
  await expect(seller.getByLabel("Número de WhatsApp")).toHaveValue(SELLER_WA);
  await seller.getByRole("button", { name: "Continuar" }).click();
  await seller.getByRole("button", { name: "Crear mi billetera y continuar" }).click();
  await seller.waitForURL("**/panel**", CHAIN);

  // 1) El vendedor vende desde el chat y recibe el link.
  const chat = await (await browser.newContext()).newPage();
  await chat.goto(SIM);
  await say(chat, "vendo zapatillas nike 40 a 450 bs entrega 3 días");
  const link = chat.locator('[data-testid="bot-msg"] a[href*="/p/zapatillas-nike-40-"]').first();
  await expect(link).toBeVisible({ timeout: 60_000 });
  const url = (await link.getAttribute("href"))!;
  const slug = url.split("/p/")[1];
  expect(url.startsWith("http://localhost:")).toBe(true);
  await capturar(chat, "bot-01-chat-link");

  // 2) El comprador abre el link en la app y paga dejando su WhatsApp.
  const buyer = await pagar(browser, url, false, "591 76543210");
  await capturar(buyer, "bot-02-app-pagado");
  // Privacidad: el WhatsApp del comprador no sale en la vista pública, y el feed del bot pide la clave.
  expect(await (await request.get(`/api/orders/${slug}`)).text()).not.toContain("76543210");
  expect((await request.get(`/api/bot/changes?since=0`)).status()).toBe(401);

  // 3) El bot avisa al vendedor: ¡Te pagaron!
  await expect(botSays(chat, "¡Te pagaron!")).toBeVisible({ timeout: 90_000 });
  await capturar(chat, "bot-03-chat-te-pagaron");

  // 4) El vendedor pide marcar enviado por el chat y firma en la app desde el link del bot.
  await say(chat, `enviado ${slug.slice(-6)} SRV-2026-555001`);
  const shipLink = chat.locator('[data-testid="bot-msg"] a[href*="/panel?enviar="]').last();
  await expect(shipLink).toBeVisible({ timeout: 30_000 });
  await capturar(chat, "bot-04-chat-link-enviar");
  await seller.goto((await shipLink.getAttribute("href"))!);
  const card = seller.getByTestId(`pedido-${slug}`);
  await expect(card.getByLabel("Código de encomienda o link de la foto del envío")).toHaveValue("SRV-2026-555001", { timeout: 60_000 });
  await capturar(seller, "bot-05-app-panel-enviar");
  await card.getByRole("button", { name: "Marcar como enviado" }).click();
  await expect(card.getByTestId("estado")).toHaveText("Enviado", CHAIN);

  // 5) Al comprador le llega "¿Te llegó?" (tenemos su WhatsApp).
  await expect(botSays(chat, "figura como enviado")).toBeVisible({ timeout: 90_000 });
  await chat.locator("#as-buyer").click();
  await expect(botSays(chat, "¿Te llegó?")).toBeVisible({ timeout: 60_000 });
  await capturar(chat, "bot-06-chat-comprador-te-llego");

  // 6) El comprador confirma en la app y el bot avisa al vendedor: liberado.
  await buyer.reload();
  await buyer.getByRole("button", { name: /Recibí conforme/ }).click();
  await expect(buyer.getByTestId("estado-pedido")).toContainText("Pago liberado al vendedor", CHAIN);
  await capturar(buyer, "bot-07-app-liberado");
  await chat.locator("#as-seller").click();
  await expect(botSays(chat, "Liberado")).toBeVisible({ timeout: 90_000 });
  await expect(botSays(chat, "Liberado")).toContainText("37,58");
  await capturar(chat, "bot-08-chat-liberado");
});
