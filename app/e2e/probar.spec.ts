import { expect, test, type FrameLocator, type Locator, type Page } from "@playwright/test";
import { randomInt } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// /probar contra Stellar TESTNET (transacciones reales), con PP_PROBAR=1 y plazos de demo: la tienda y el comprador en
// dos iPhone con un chat como el de WhatsApp (respuestas rápidas que disparan las acciones reales), la plata esperando
// entre los dos, el estafador rechazado por el contrato, el cajón "Ver en la red" y "Empezar de nuevo".
// Capturas de celular y escritorio en e2e/capturas/80-…; en cada una se revisa que no haya palabras prohibidas.

const DIR = path.join(__dirname, "capturas");
fs.mkdirSync(DIR, { recursive: true });
const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };
// Para interactuar: alto suficiente para que TODA la página quepa sin desplazarla. Si Playwright tuviera que desplazar la
// página madre para llegar a un botón dentro de un iPhone, el punto del clic quedaría bajo el encabezado fijo del sitio.
const ESCRITORIO_ALTO = { width: 1280, height: 3000 };
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
  // Los marcos tienen los chats y la página de pago: misma lista estricta.
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

/** Respuesta rápida del chat: un botón bajo el último mensaje del bot. */
const toca = (chat: FrameLocator, id: string) => chat.getByTestId(`chat-boton-${id}`);

/** Clic dentro de un iPhone (o en sus hojas y overlay): centra el elemento en su marco y en la página antes de hacer clic. Si
 * Playwright tuviera que desplazar la página madre por su cuenta, el punto del clic podría quedar bajo el encabezado fijo del sitio. */
async function clic(l: Locator) {
  await l.waitFor();
  await l.evaluate((el) => el.scrollIntoView({ block: "center", inline: "nearest" }));
  await l.click();
}

test("/probar: dos chats de WhatsApp simulados, la plata entre los dos, el estafador rechazado por el contrato y el cobro", async ({ browser, baseURL }) => {
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
  await expect(page.getByTestId("titulo-etapa")).toHaveText("1. La Zapatería se registra");
  await expect(page.getByTestId("ahora")).toHaveText("Escribe Hola y toca Crear mi cuenta");
  // El botón del estafador aparece recién con la plata en el contrato.
  await expect(page.getByTestId("desviar")).toHaveCount(0);
  await expect(page.getByTestId("dos-salidas")).toHaveText("Dos salidas, nunca una tercera.");
  // El registro y los plazos viven en el cajón "Ver en la red".
  await page.getByTestId("ver-detalles").click();
  await expect(page.getByTestId("cajon-red")).toHaveAttribute("data-abierto", "si");
  await expect(page.getByTestId("dentro-de-whatsapp")).toContainText("Trato funciona dentro de WhatsApp");
  await expect(page.getByTestId("plazos")).toContainText("2 minutos para registrar el envío");
  await expect(page.getByTestId("registro")).toContainText("Todavía no hay movimientos");
  await page.getByTestId("cerrar-cajon").click();
  await expect(page.getByTestId("cajon-red")).toHaveAttribute("data-abierto", "no");

  // Los dos iPhone: el chat de la tienda y el del comprador, sin el encabezado ni el pie del sitio (modo embebido).
  const vendedor = page.frameLocator('iframe[name="vendedor"]');
  const comprador = page.frameLocator('iframe[name="comprador"]');
  await expect(vendedor.getByTestId("chat-vendedor")).toBeVisible();
  await expect(vendedor.locator("header[data-chrome]")).toBeHidden();
  await expect(vendedor.locator("footer[data-chrome]")).toBeHidden();
  await expect(comprador.getByTestId("esperando-link")).toContainText("Todavía no te llegó ningún link");
  await capturar(page, "80-probar-inicio");

  // 1. La Zapatería se registra: "Hola" → "Crear mi cuenta" → hoja con nombre y ciudad prellenados → "Listo" (cuenta de prueba nueva,
  // activada por el servidor). 2. Vende: "Vender…" crea el link real; "Mandar al cliente" lo hace llegar al otro chat.
  await clic(toca(vendedor, "hola"));
  await clic(toca(vendedor, "crear-cuenta"));
  await expect(vendedor.getByTestId("form-cuenta").getByLabel("Nombre de la tienda")).toHaveValue("Zapatería");
  await clic(vendedor.getByTestId("listo"));
  await expect(toca(vendedor, "vender")).toBeVisible(CHAIN);
  await clic(toca(vendedor, "vender"));
  await expect(page.getByTestId("titulo-etapa")).toHaveText("2. La Zapatería vende");
  await expect(toca(vendedor, "mandar")).toBeVisible({ timeout: 60_000 });
  const url = (await vendedor.getByTestId("chat-tarjeta").first().getAttribute("href"))!;
  const slug = url.split("/p/")[1];
  expect(slug).toMatch(/^[a-z0-9-]+$/);
  // Desde /probar el link usa los plazos de demo (2 minutos), aunque el panel no tenga ?demo=1.
  const vista = await (await page.request.get(`/api/orders/${slug}`)).json();
  expect(vista.order.window_secs).toBe(120);
  expect(vista.confirmDelay).toBe("1 minuto (modo demo)");

  const link = page.getByTestId("paso-registro-link");
  await expect(link).toHaveAttribute("data-hecho", "si", { timeout: 30_000 });
  await expect(link).toContainText("Se activó la cuenta de cobro del vendedor");
  await expect(link).toContainText(/Link PP-[2-9A-HJKMNP-Z]{8} creado: todavía no se movió plata/);
  await expect(link.locator(TX_LINK)).toHaveCount(1);

  // El link llega al chat del comprador cuando la tienda lo manda.
  await clic(toca(vendedor, "mandar"));
  await expect(toca(comprador, "pagar")).toBeVisible({ timeout: 30_000 });
  await expect(comprador.getByTestId("chat-tarjeta").first()).toHaveAttribute("href", url);
  await expect(page.getByTestId("titulo-etapa")).toHaveText("3. El comprador paga");
  await expect(page.getByTestId("ahora")).toHaveText("Abre el link y paga con un toque");
  await capturar(page, "81-probar-link-en-el-comprador");

  // 2. Pagar: "Abrir y pagar" abre la página de pago real dentro del celular: datos de entrega, QR y pago simulado del banco
  // (con reintentos si la red falla, como el e2e con pagos).
  await clic(toca(comprador, "pagar"));
  const pago = comprador.frameLocator('iframe[name="pago"]');
  // La página de pago: con un toque si los datos de entrega vienen precargados; si no, el camino de siempre (datos, QR).
  await clic(pago.getByTestId("barra-pagar").getByRole("button", { name: /^Pagar Bs/ }));
  if (await pago.getByLabel("Quién recibe").isVisible().catch(() => false)) {
    await pago.getByLabel("Quién recibe").fill("Ana Pérez");
    await pago.getByLabel("Ciudad de destino").selectOption("Cochabamba");
    await clic(pago.getByRole("button", { name: /Ver el QR para pagar Bs/ }));
  }
  // Dentro de /probar el pago sale con ese único toque; si la página todavía pide "Simular pago del banco", se toca también.
  const simular = pago.getByRole("button", { name: "Simular pago del banco (modo práctica)" });
  const ok = pago.getByTestId("estado-pedido");
  const err = pago.getByTestId("error");
  for (let intento = 1; ; intento++) {
    if (await simular.waitFor({ timeout: 4000 }).then(() => true, () => false)) await clic(simular);
    await expect(ok.or(err).first()).toBeVisible(CHAIN);
    if (await ok.isVisible()) break;
    const msg = await err.first().innerText();
    console.log(`[e2e probar] pago, intento ${intento} falló en la red: ${msg}`);
    if (intento >= 3) throw new Error(`El pago falló 3 veces: ${msg}`);
    await clic(pago.getByTestId("barra-pagar").getByRole("button", { name: /^Pagar Bs/ }));
  }
  await expect(ok).toContainText("Tu pago está guardado", CHAIN);
  // El chat vuelve solo y cuenta que la plata quedó guardada; la tienda recibe el aviso con "Ya lo envié".
  await expect(comprador.getByTestId("chat-pagado")).toBeVisible({ timeout: 30_000 });
  await expect(comprador.getByTestId("chat-overlay")).toBeHidden({ timeout: 15_000 });
  // Un solo botón por momento: la tienda no puede despachar hasta que el estafador quede bloqueado.
  await expect(toca(vendedor, "enviado")).toHaveCount(0);

  const pagoReg = page.getByTestId("paso-registro-pago");
  await expect(pagoReg).toHaveAttribute("data-hecho", "si", { timeout: 30_000 });
  await expect(pagoReg).toContainText("Pago simulado del banco");
  await expect(pagoReg).toContainText("Se creó el contrato de este pedido");
  await expect(pagoReg).toContainText("El comprador guardó el pago en el contrato");
  expect(await pagoReg.locator(TX_LINK).count()).toBeGreaterThanOrEqual(3);
  await expect(page.getByTestId("registro-contrato")).toHaveAttribute("href", /stellar\.expert\/explorer\/testnet\/contract\/C[A-Z2-7]{55}$/);
  await expect(page.getByTestId("titulo-etapa")).toHaveText("3. La plata quedó guardada");

  // 3. Un estafador lo intenta: simulación real contra el contrato, rechazada con el error del contrato, en rojo de marca,
  // y contada en el chat del comprador como un mensaje de un número desconocido que Trato bloquea.
  await expect(page.getByTestId("desviar")).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId("desviar").click();
  const error = page.getByTestId("desvio-error");
  await expect(error).toHaveText("Error(Contract, #12)", CHAIN);
  await expect(error).toHaveClass(/text-error-700/);
  await expect(error).toHaveCSS("color", "rgb(155, 30, 34)");
  await expect(page.getByTestId("desvio-resultado")).toContainText("Rechazado por el contrato");
  await expect(page.getByTestId("desvio-resultado")).toContainText("no se envió nada");
  await expect(page.getByTestId("registro-desvio")).toContainText("Intento de desvío rechazado: Error(Contract, #12)");
  await expect(comprador.getByTestId("chat-estafa")).toContainText("Soy del banco");
  await expect(comprador.getByTestId("chat-bloqueo")).toContainText("Bloqueado: la plata solo puede ir a la Zapatería o volver a ti", { timeout: 30_000 });
  // El error crudo del contrato queda en el cajón, no en el chat.
  await expect(comprador.getByTestId("chat-bloqueo")).not.toContainText("Error(Contract");
  await expect(page.getByTestId("titulo-etapa")).toHaveText("3. La Zapatería despacha");
  await expect(toca(vendedor, "enviado")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("desviar")).toHaveCount(0);
  await capturar(page, "82-probar-desvio-rechazado");

  // 4. La tienda despacha: "Ya lo envié" registra el envío real con los datos de la demo, sin formulario (tiene 2 minutos desde el pago).
  await clic(toca(vendedor, "enviado"));
  await expect(vendedor.getByTestId("chat-enviado")).toContainText("Envío registrado", CHAIN);
  const envio = page.getByTestId("paso-registro-envio");
  await expect(envio).toHaveAttribute("data-hecho", "si", { timeout: 30_000 });
  await expect(envio.locator(TX_LINK)).toHaveCount(1);
  await expect(comprador.getByTestId("chat-enviado")).toContainText("¿Te llegó?", { timeout: 30_000 });
  await expect(page.getByTestId("titulo-etapa")).toHaveText("4. La Zapatería cobra");

  // 5. El comprador recibe y paga: "Sí, me llegó" se habilita 1 minuto después del envío y pregunta antes.
  const meLlego = toca(comprador, "me-llego");
  await expect(meLlego).toBeVisible({ timeout: 60_000 });
  await expect(meLlego).toBeEnabled({ timeout: 150_000 });
  await clic(meLlego);
  await clic(comprador.getByTestId("chat-hoja").getByRole("button", { name: "Sí, lo tengo y está bien" }));
  await expect(comprador.getByTestId("chat-liberado")).toContainText("Pagaste a Zapatería", CHAIN);
  const cobro = page.getByTestId("paso-registro-cobro");
  await expect(cobro).toHaveAttribute("data-hecho", "si", { timeout: 30_000 });
  await expect(cobro).toContainText("Se pagó al vendedor");
  await expect(cobro.locator(TX_LINK)).toHaveCount(1);
  // La tienda cobró lo suyo: el precio completo (la protección la pagó el comprador) más el redondeo del contrato.
  await expect(vendedor.getByTestId("chat-liberado")).toContainText("Cobraste Bs 450", { timeout: 60_000 });
  await expect(page.getByTestId("desvio-espera")).toHaveText("La plata ya salió del contrato por una de sus salidas.");
  await expect(page.getByTestId("titulo-etapa")).toHaveText("4. La Zapatería cobró");
  await expect(page.getByTestId("ahora")).toHaveText("La plata llegó a su cuenta");
  // El cierre: lo que ya está construido, con el resumen de esta prueba.
  await expect(page.getByTestId("construido")).toContainText("Lo que ya está construido");
  await expect(page.getByTestId("construido-resumen")).toContainText(/\d+ transacciones públicas/);
  await capturar(page, "83-probar-pagado-al-vendedor");

  // Celular: los dos chats van en pestañas.
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

  // Empezar de nuevo: cuentas nuevas, chats y registro limpios.
  await page.getByTestId("empezar-de-nuevo").click();
  await expect(comprador.getByTestId("esperando-link")).toBeVisible({ timeout: 30_000 });
  await expect(toca(vendedor, "hola")).toBeVisible({ timeout: 30_000 });
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
