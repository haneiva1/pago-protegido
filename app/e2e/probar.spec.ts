import { expect, test, type Page } from "@playwright/test";
import { randomInt } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// /probar contra Stellar TESTNET (transacciones reales), con PP_PROBAR=1 y plazos de demo: el vendedor y el comprador
// en dos marcos de celular con las páginas reales, el registro en vivo, el intento de desvío y "Empezar de nuevo".
// Capturas de celular y escritorio en e2e/capturas/80-…; en cada una se revisa que no haya palabras prohibidas.

const DIR = path.join(__dirname, "capturas");
fs.mkdirSync(DIR, { recursive: true });
const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };
// Para interactuar: alto suficiente para que los dos celulares quepan enteros (la barra fija de "Pagar" vive abajo del marco).
const ESCRITORIO_ALTO = { width: 1280, height: 1400 };
const CHAIN = { timeout: 240_000 };
const TX_LINK = 'a[href*="stellar.expert/explorer/testnet/tx/"]';
const PROHIBIDAS = [
  /garant[ií]a/i,
  /\bseguro\b/i,
  /custodia/i,
  /arbitraje/i,
  /árbitro/i,
  /100\s?%/,
  /cripto/i,
  /\btoken/i,
  /stablecoin/i,
  /\bwallet\b/i,
  /\bllaves?\b/i,
  /blockchain/i,
  /stellar/i,
];
/** Forma de una clave secreta de Stellar (S + 55 caracteres en base32). Ninguna respuesta del servidor puede traer una. */
const SECRETO = /\bS[A-Z2-7]{55}\b/;

async function revisarPalabras(page: Page) {
  const text = await page.locator("body").innerText();
  for (const re of PROHIBIDAS) expect(text, `palabra prohibida ${re} en ${page.url()}`).not.toMatch(re);
  // Los marcos tienen las páginas del vendedor y del comprador: misma lista estricta.
  for (const f of page.frames().filter((f) => f !== page.mainFrame())) {
    const t = await f.locator("body").innerText().catch(() => "");
    for (const re of PROHIBIDAS) expect(t, `palabra prohibida ${re} en el marco ${f.url()}`).not.toMatch(re);
  }
}

async function capturar(page: Page, nombre: string) {
  await revisarPalabras(page);
  const original = page.viewportSize() ?? ESCRITORIO_ALTO;
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.setViewportSize(MOBILE);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(DIR, `${nombre}-celular.png`), fullPage: true });
  await page.setViewportSize(DESKTOP);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(DIR, `${nombre}-escritorio.png`), fullPage: true, scale: "css" });
  await page.setViewportSize(original);
  await page.waitForTimeout(200);
}

test("/probar: dos celulares reales, registro en vivo, desvío rechazado por el contrato y pago al vendedor", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ viewport: ESCRITORIO_ALTO, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const lecturas: Promise<void>[] = [];
  const conSecreto: string[] = [];
  page.on("response", (r) => {
    if (!r.url().startsWith(baseURL!)) return;
    lecturas.push(
      r
        .text()
        .then((t) => {
          if (SECRETO.test(t)) conSecreto.push(r.url());
        })
        .catch(() => {}),
    );
  });

  await page.goto("/probar");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Prueba Trato de punta a punta");
  await expect(page.getByTestId("esperando-link")).toContainText("Todavía no te llegó ningún link");
  await expect(page.getByTestId("desviar")).toBeDisabled();
  await expect(page.getByTestId("plazos")).toContainText("2 minutos para registrar el envío");
  await expect(page.getByTestId("dos-salidas")).toHaveText("Dos salidas, nunca una tercera.");

  // Marco del vendedor: la página real de /vender, sin el encabezado ni el pie del sitio (modo embebido).
  const vendedor = page.frameLocator('iframe[name="vendedor"]');
  await expect(vendedor.getByLabel("Nombre de la tienda")).toBeVisible();
  await expect(vendedor.locator("header[data-chrome]")).toBeHidden();
  await expect(vendedor.locator("footer[data-chrome]")).toBeHidden();
  await capturar(page, "80-probar-inicio");

  // 1. Crear el link: el vendedor crea su tienda (cuenta de prueba nueva, activada por el servidor) y el link.
  await vendedor.getByLabel("Nombre de la tienda").fill("Tienda Sofi");
  await vendedor.getByLabel("Tu ciudad").selectOption("Santa Cruz");
  await vendedor.getByRole("button", { name: "Continuar" }).click();
  await vendedor.getByLabel("Número de WhatsApp").fill("59171234567");
  await vendedor.getByRole("button", { name: "Continuar" }).click();
  await vendedor.getByRole("button", { name: "Crear mi cuenta de cobro y continuar" }).click();
  await expect(vendedor.getByTestId("tienda")).toHaveText("Tienda Sofi", CHAIN);
  // Link rápido (PR #7): producto, precio y días para despachar; la categoría va en "Más detalles".
  await vendedor.getByLabel("Producto").fill("Zapatillas Nike talla 40");
  await vendedor.getByLabel("Precio en Bs").fill("450");
  await vendedor.getByLabel("Días para despachar", { exact: true }).selectOption("3");
  const mas = vendedor.getByTestId("mas-detalles");
  if (!(await mas.evaluate((e) => (e as HTMLDetailsElement).open))) await mas.locator("summary").click();
  await vendedor.getByLabel(/^Categoría/).selectOption("Ropa y calzado");
  await vendedor.getByRole("button", { name: "Crear link" }).click();
  const url = (await vendedor.getByTestId("link-url").textContent())!.trim();
  const slug = url.split("/p/")[1];
  expect(slug).toMatch(/^[a-z0-9-]+$/);
  // Desde /probar el link usa los plazos de demo (2 minutos), aunque el panel no tenga ?demo=1.
  const vista = await (await page.request.get(`/api/orders/${slug}`)).json();
  expect(vista.order.window_secs).toBe(120);
  expect(vista.confirmDelay).toBe("1 minuto (modo demo)");

  const link = page.getByTestId("paso-registro-link");
  await expect(link).toHaveAttribute("data-hecho", "si", { timeout: 30_000 });
  await expect(link).toContainText("Se activó la cuenta de cobro del vendedor");
  await expect(link).toContainText(/Link PP-\d{4,5} creado: todavía no se movió plata/);
  await expect(link.locator(TX_LINK)).toHaveCount(1);

  // El link llega solo al celular del comprador.
  const comprador = page.frameLocator('iframe[name="comprador"]');
  await expect(comprador.getByTestId("codigo")).toHaveText(/Compra protegida · PP-\d{4,5}/, { timeout: 30_000 });
  await expect(page.getByTestId("ahora")).toContainText("El link llegó al celular del comprador");
  await capturar(page, "81-probar-link-en-el-comprador");

  // 2. Pagar: datos de entrega, QR y pago simulado del banco (con reintentos si la red falla, como el e2e con pagos).
  await comprador.getByTestId("barra-pagar").getByRole("button", { name: /Pagar Bs .* con QR/ }).click();
  await comprador.getByLabel("Quién recibe").fill("Ana Pérez");
  await comprador.getByLabel("Ciudad de destino").selectOption("Cochabamba");
  await comprador.getByRole("button", { name: /Ver el QR para pagar Bs/ }).click();
  const simular = comprador.getByRole("button", { name: "Simular pago del banco (modo práctica)" });
  const ok = comprador.getByTestId("estado-pedido");
  const err = comprador.getByTestId("error");
  for (let intento = 1; ; intento++) {
    await simular.click();
    await expect(ok.or(err).first()).toBeVisible(CHAIN);
    if (await ok.isVisible()) break;
    const msg = await err.first().innerText();
    console.log(`[e2e probar] pago, intento ${intento} falló en la red: ${msg}`);
    if (intento >= 3) throw new Error(`El pago falló 3 veces: ${msg}`);
  }
  await expect(ok).toContainText("Tu pago está guardado", CHAIN);

  const pago = page.getByTestId("paso-registro-pago");
  await expect(pago).toHaveAttribute("data-hecho", "si", { timeout: 30_000 });
  await expect(pago).toContainText("Pago simulado del banco");
  await expect(pago).toContainText("Se creó el contrato de este pedido");
  await expect(pago).toContainText("El comprador guardó el pago en el contrato");
  expect(await pago.locator(TX_LINK).count()).toBeGreaterThanOrEqual(3);
  await expect(page.getByTestId("registro-contrato")).toHaveAttribute("href", /stellar\.expert\/explorer\/testnet\/contract\/C[A-Z2-7]{55}$/);

  // 3. Intenta desviar la plata: simulación real contra el contrato, rechazada con el error del contrato, en rojo.
  await expect(page.getByTestId("desviar")).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId("desviar").click();
  const error = page.getByTestId("desvio-error");
  await expect(error).toHaveText("Error(Contract, #12)", CHAIN);
  // En rojo: rose-700 (Chrome lo devuelve en lab(); otros navegadores, en rgb u oklch).
  await expect(error).toHaveClass(/text-rose-700/);
  await expect(error).toHaveCSS("color", /^(rgb\(19\d, 1\d, 6\d\)|oklch\(0\.51|lab\(41\.\d+ 71\.)/);
  await expect(page.getByTestId("desvio-resultado")).toContainText("Rechazado por el contrato");
  await expect(page.getByTestId("desvio-resultado")).toContainText("no se envió nada");
  await expect(page.getByTestId("registro-desvio")).toContainText("Intento de desvío rechazado: Error(Contract, #12)");
  await capturar(page, "82-probar-desvio-rechazado");

  // 4. Registrar el envío (el vendedor tiene 2 minutos desde el pago).
  const card = vendedor.getByTestId(`pedido-${slug}`);
  await expect(card.getByTestId("estado")).toHaveText("Pagado (despacha)", { timeout: 60_000 });
  await card.getByLabel("Empresa de envío").selectOption("Trans Copacabana (encomiendas)");
  await card.getByLabel("Número de guía").fill("SRV-2026-118734");
  await card.getByLabel("Peso declarado (kg)").fill("1,2");
  await card.getByRole("button", { name: "Marcar como enviado" }).click();
  await expect(card.getByTestId("estado")).toHaveText("Enviado", CHAIN);
  const envio = page.getByTestId("paso-registro-envio");
  await expect(envio).toHaveAttribute("data-hecho", "si", { timeout: 30_000 });
  await expect(envio.locator(TX_LINK)).toHaveCount(1);

  // 5. Pagar al vendedor: se habilita 1 minuto después del envío y pregunta antes.
  const pagarVendedor = comprador.getByRole("button", { name: "Pagar al vendedor (irreversible)" });
  await expect(pagarVendedor).toBeVisible({ timeout: 60_000 });
  await expect(pagarVendedor).toBeEnabled({ timeout: 150_000 });
  await pagarVendedor.click();
  await comprador.getByRole("button", { name: "Sí, lo tengo y está bien" }).click();
  await expect(comprador.getByTestId("estado-pedido")).toContainText("Se pagó al vendedor", CHAIN);
  const cobro = page.getByTestId("paso-registro-cobro");
  await expect(cobro).toHaveAttribute("data-hecho", "si", { timeout: 30_000 });
  await expect(cobro).toContainText("Se pagó al vendedor");
  await expect(cobro.locator(TX_LINK)).toHaveCount(1);
  await expect(vendedor.getByTestId("saldo")).toHaveText("Bs 450,04", { timeout: 60_000 });
  await expect(page.getByTestId("desviar")).toBeDisabled();
  await expect(page.getByTestId("desvio-espera")).toHaveText("La plata ya salió del contrato por una de sus salidas.");
  await expect(page.getByTestId("ahora")).toContainText("Listo: el vendedor cobró");
  await capturar(page, "83-probar-pagado-al-vendedor");

  // Celular: el vendedor y el comprador van en pestañas.
  await page.setViewportSize(MOBILE);
  await expect(page.getByTestId("tab-vendedor")).toBeVisible();
  await page.getByTestId("tab-vendedor").click();
  await expect(page.getByTestId("marco-vendedor")).toBeVisible();
  await expect(page.getByTestId("marco-comprador")).toBeHidden();
  await page.getByTestId("tab-comprador").click();
  await expect(page.getByTestId("marco-comprador")).toBeVisible();
  await expect(page.getByTestId("marco-vendedor")).toBeHidden();
  await page.screenshot({ path: path.join(DIR, "84-probar-pestanas-celular.png") });
  await page.setViewportSize(ESCRITORIO_ALTO);

  // Cada rol con su propia cuenta de prueba, aparte de las de la app.
  const cuentas = await page.evaluate(() => ["pp.probar.vendedor", "pp.probar.comprador", "pp.billetera.vendedor", "pp.billetera.comprador"].map((k) => localStorage.getItem(k) !== null));
  expect(cuentas).toEqual([true, true, false, false]);

  // Empezar de nuevo: cuentas nuevas, marcos y registro limpios.
  await page.getByTestId("empezar-de-nuevo").click();
  await expect(page.getByTestId("esperando-link")).toBeVisible();
  await expect(vendedor.getByLabel("Nombre de la tienda")).toBeVisible();
  await expect(page.getByTestId("registro")).toContainText("Todavía no hay movimientos");
  expect(await page.evaluate(() => [localStorage.getItem("pp.probar.vendedor"), localStorage.getItem("pp.probar.comprador")])).toEqual([null, null]);

  // Ninguna clave del equipo (ni ninguna otra) llegó al navegador en las respuestas del servidor.
  await Promise.all(lecturas);
  expect(conSecreto).toEqual([]);
  await ctx.close();
});

test("/probar: límite de pruebas por IP y rutas cerradas a pedidos sin plata guardada", async ({ request }) => {
  const ip = { "x-forwarded-for": `203.0.113.${randomInt(1, 255)}` };
  for (let i = 0; i < 6; i++) expect((await request.post("/api/probar/inicio", { headers: ip })).status()).toBe(200);
  const limite = await request.post("/api/probar/inicio", { headers: ip });
  expect(limite.status()).toBe(429);
  expect((await limite.json()).error).toMatch(/Llegaste al límite de pruebas por hora/);
  expect((await request.post("/api/probar/desvio", { data: { slug: "no-existe" } })).status()).toBe(404);
  expect((await request.get("/api/probar/registro?vendedor=nada")).status()).toBe(400);
});
