import { Keypair } from "@stellar/stellar-sdk";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { firmado } from "./firma";

// E2E contra Stellar TESTNET (transacciones reales), en modo guardián y modo demo (PP_DEMO=1: "Pagar al vendedor" se
// habilita 1 minuto después del envío). Guarda capturas en celular y escritorio en e2e/capturas/ y en cada captura revisa
// que no aparezcan palabras prohibidas.

const DIR = path.join(__dirname, "capturas");
fs.mkdirSync(DIR, { recursive: true });
const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
const CHAIN = { timeout: 240_000 }; // operaciones que esperan a la red
const TX_LINK = 'a[href*="stellar.expert/explorer/testnet/tx/"]';

// Palabras prohibidas. Legales: en todas las pantallas. Técnicas: en las del comprador y del vendedor
// (el panel del revisor, /como-funciona y /transparencia pueden ser técnicos).
const LEGALES = [/\bseguro\b/i, /garant[ií]a/i, /garantizad/i, /100\s?%/, /custodia/i, /plataforma de pagos/i, /pasarela/i, /billetera Pago Protegido/i, /billetera Trato/i, /arbitraje/i, /árbitro/i];
const TECNICAS = [/cripto/i, /\btoken/i, /stablecoin/i, /\bwallet\b/i, /\bllaves?\b/i, /billetera propia/i, /blockchain/i, /stellar/i];
type Kind = "usuario" | "tecnica" | "chat";

async function revisarPalabras(page: Page, kind: Kind) {
  if (kind === "chat") return; // el chat del simulador es del bot, fuera de la app
  const text = await page.locator("body").innerText();
  for (const re of kind === "usuario" ? [...LEGALES, ...TECNICAS] : LEGALES) {
    expect(text, `palabra prohibida ${re} en ${page.url()}`).not.toMatch(re);
  }
}

test.describe.configure({ mode: "serial" });

async function capturar(page: Page, nombre: string, kind: Kind = "usuario") {
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
  await revisarPalabras(page, kind);
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

async function nuevoVendedor(browser: Browser, tienda: string, whatsapp: string | null, ciudad: string, opts: { capturas?: boolean; url?: string } = {}) {
  const page = await (await browser.newContext()).newPage();
  await page.goto(opts.url ?? "/vender");
  await page.getByLabel("Nombre de la tienda").fill(tienda);
  await page.getByLabel("Tu ciudad").selectOption(ciudad);
  if (opts.capturas) await capturar(page, "02-onboarding-tienda");
  await page.getByRole("button", { name: "Continuar" }).click();
  if (whatsapp) await page.getByLabel("Número de WhatsApp").fill(whatsapp);
  await page.getByRole("button", { name: "Continuar" }).click();
  const crear = page.getByRole("button", { name: "Crear mi cuenta de cobro y continuar" });
  await expect(crear).toBeVisible();
  if (opts.capturas) await capturar(page, "03-onboarding-cuenta");
  await crear.click();
  await page.waitForURL("**/panel**", CHAIN);
  await expect(page.getByTestId("tienda")).toHaveText(tienda);
  return page;
}

async function crearLink(
  page: Page,
  p: { producto: string; descripcion: string; precio: number; dias: number; categoria: string; quienPaga?: "comprador" | "vendedor"; demo?: boolean; flete?: RegExp },
  captura?: string,
) {
  if (p.demo) {
    await page.goto("/panel?demo=1");
    await page.getByLabel(/Plazo corto de demo/).check();
  }
  // Link rápido (M9): producto, precio, días para despachar y flete en una pantalla; lo demás en "Más detalles".
  await page.getByLabel("Producto").fill(p.producto);
  await page.getByLabel("Precio en Bs").fill(String(p.precio));
  await page.getByLabel("Días para despachar", { exact: true }).selectOption(String(p.dias));
  if (p.flete) await page.getByTestId("flete-vendedor").getByText(p.flete).click();
  if (p.quienPaga === "vendedor") await page.getByRole("radio", { name: /Yo la regalo/ }).check();
  if (captura) await capturar(page, captura);
  const mas = page.getByTestId("mas-detalles");
  if (!(await mas.evaluate((e) => (e as HTMLDetailsElement).open))) await mas.locator("summary").click();
  await page.getByLabel(/^Categoría/).selectOption(p.categoria);
  await page.getByLabel("Descripción corta").fill(p.descripcion);
  await page.getByRole("button", { name: "Crear link" }).click();
  const url = (await page.getByTestId("link-url").textContent())!.trim();
  expect(url).toMatch(/\/p\/[a-z0-9-]+$/);
  return { url, slug: url.split("/p/")[1] };
}

async function pagar(
  browser: Browser,
  url: string,
  o: { capturas?: boolean; whatsapp?: string; quien?: string; ciudad?: string; agencia?: string; telefono?: string; flete?: string; antes?: (p: Page) => Promise<void> } = {},
) {
  const page = await (await browser.newContext()).newPage();
  await page.goto(url);
  await expect(page.getByTestId("codigo")).toHaveText(/Compra protegida · PP-[2-9A-HJKMNP-Z]{8}/);
  // Primer pantallazo: producto, total, "Dos salidas" y el botón de pagar fijo abajo.
  await expect(page.getByTestId("promesa")).toContainText("Tu plata queda guardada. Solo tiene dos salidas:");
  await expect(page.getByTestId("salida-comprador")).toContainText("De vuelta a ti, si no lo despacha hasta el");
  await expect(page.getByTestId("reputacion")).toBeVisible();
  await expect(page.getByTestId("antifraude")).toContainText("Si un QR de Trato está a nombre de una persona, es estafa.");
  await expect(page.getByTestId("modo-practica")).toContainText("Modo práctica: no se mueve dinero real");
  if (o.antes) await o.antes(page);
  if (o.capturas) await capturar(page, "06-comprador-antes-de-pagar");
  // El botón fijo abre la hoja con los datos de entrega; al continuar se muestra el QR.
  await page.getByTestId("barra-pagar").getByRole("button", { name: /Pagar Bs .* con QR/ }).click();
  await expect(page.getByTestId("datos-entrega")).toBeVisible();
  await page.getByLabel("Quién recibe").fill(o.quien ?? "Ana Pérez");
  await page.getByLabel("Ciudad de destino").selectOption(o.ciudad ?? "Cochabamba");
  if (o.agencia) await page.getByLabel(/Agencia preferida/).fill(o.agencia);
  if (o.whatsapp) await page.getByLabel(/Tu WhatsApp para avisarte/).fill(o.whatsapp);
  if (o.telefono) await page.getByLabel(/Teléfono de quien recoge/).fill(o.telefono);
  if (o.flete) await page.getByLabel(/¿Y el flete\?/).selectOption(o.flete);
  if (o.capturas) await capturar(page, "06b-comprador-datos-de-entrega");
  await page.getByRole("button", { name: /Ver el QR para pagar Bs/ }).click();
  await expect(page.getByTestId("rampa-simulada")).toHaveText("Rampa simulada en testnet. En producción la hace una entidad certificada por ASFI.");
  // QR como se paga en Bolivia: guardarlo o compartirlo y subirlo desde la galería del banco.
  const qr = page.getByTestId("qr");
  await expect(qr.getByTestId("imagen-qr")).toBeVisible();
  await expect(qr.getByRole("button", { name: /Guardar QR/ })).toBeEnabled();
  await expect(qr.getByRole("button", { name: /Compartir QR/ })).toBeEnabled();
  await expect(qr.getByTestId("pasos-qr")).toContainText("Abre tu banco → Pagar con QR → Galería");
  await expect(qr.getByTestId("esperando-pago")).toHaveText("Esperando tu pago…");
  await expect(qr.getByTestId("qr-entidad")).toContainText("nunca de una persona");
  if (o.capturas) await capturar(page, "07-comprador-qr-rampa-simulada");
  // El pago encadena varias transacciones en testnet (rampa, deploy del escrow, fondeo). Si la red falla,
  // la pantalla muestra el error y se puede reintentar: el flujo es idempotente (no vuelve a emitir la rampa).
  const simular = page.getByRole("button", { name: "Simular pago del banco (modo práctica)" });
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
  await expect(ok).toContainText("Tu pago está guardado", CHAIN);
  await expect(page.locator(TX_LINK).first()).toBeVisible();
  // H-2 en pantalla: pago bloqueado en un contrato público, con "Ver registro público".
  await expect(page.getByTestId("registro-publico")).toContainText("Pago bloqueado en un contrato público: solo puede ir al vendedor o volver a ti.");
  await expect(page.getByTestId("registro-publico").getByRole("link", { name: /Ver registro público/ })).toBeVisible();
  return page;
}

/** Una foto PNG de verdad (captura de un rincón de la pantalla), para subirla como evidencia. */
const fotoDe = (page: Page, y: number) => page.screenshot({ clip: { x: 0, y, width: 160, height: 120 } });

async function llenarEnvio(card: Locator, e: { empresa: string; guia?: string; peso: string; ciudad?: string; fotos?: [Buffer, Buffer]; imei?: string }) {
  await card.getByLabel("Empresa de envío").selectOption(e.empresa);
  if (e.guia) await card.getByLabel("Número de guía").fill(e.guia);
  await card.getByLabel("Peso declarado (kg)").fill(e.peso);
  if (e.ciudad) await card.getByLabel("Ciudad de destino").selectOption(e.ciudad);
  if (e.fotos) {
    // Envío con foto (M9): la guía y el paquete desde la galería; cada una se sube con su huella.
    await card.getByLabel("Foto de la guía: galería").setInputFiles({ name: "guia.png", mimeType: "image/png", buffer: e.fotos[0] });
    await card.getByLabel("Foto del paquete: galería").setInputFiles({ name: "paquete.png", mimeType: "image/png", buffer: e.fotos[1] });
    await expect(card.getByTestId("fotos-envio").getByTestId("huella")).toHaveCount(2);
  }
  if (e.imei) await card.getByLabel(/IMEI del celular/).fill(e.imei);
}

async function marcarEnviado(seller: Page, slug: string, e: Parameters<typeof llenarEnvio>[1], captura?: string) {
  await seller.reload();
  const card = seller.getByTestId(`pedido-${slug}`);
  await expect(card.getByTestId("estado")).toHaveText("Pagado (despacha)", { timeout: 60_000 });
  await expect(card.getByTestId("datos-entrega-vendedor")).toBeVisible();
  await llenarEnvio(card, e);
  if (captura) {
    await card.scrollIntoViewIfNeeded();
    await capturar(seller, captura);
  }
  await card.getByRole("button", { name: "Marcar como enviado" }).click();
  await expect(card.getByTestId("estado")).toHaveText("Enviado", CHAIN);
  return card;
}

/** "Pagar al vendedor (irreversible)": se habilita 1 minuto después del envío (modo demo) y pregunta antes. */
async function abrirPregunta(buyer: Page) {
  const btn = buyer.getByRole("button", { name: "Pagar al vendedor (irreversible)" });
  await expect(btn).toBeVisible({ timeout: 60_000 });
  await expect(btn).toBeEnabled({ timeout: 150_000 });
  await btn.click();
  await expect(buyer.getByTestId("pregunta-confirmar")).toContainText("¿Tienes el producto en tus manos y lo revisaste?");
}

test("caso feliz: el comprador paga la protección, datos de entrega, envío con evidencia y pago al vendedor", async ({ browser }) => {
  const landing = await browser.newPage();
  await landing.goto("/");
  await expect(landing.getByRole("heading", { level: 1 })).toHaveText("Vende a otras ciudades sin que desconfíen de ti");
  await expect(landing.getByText("El contra entrega no cruza departamentos. Trato sí.")).toBeVisible();
  // Una sola versión: el segmento (celulares y electrónica, Bs 1.000 a 7.000) y el rótulo "Ejemplo" en los datos ilustrativos.
  await expect(landing.getByText("Celulares y electrónica entre ciudades · Bs 1.000 a 7.000")).toBeVisible();
  await expect(landing.getByTestId("ejemplo")).toHaveText("Ejemplo");
  await expect(landing.getByText("Celular Samsung Galaxy A35")).toBeVisible();
  await capturar(landing, "01-landing");
  await landing.close();

  const seller = await nuevoVendedor(browser, "Tienda Sofi", "59171234567", "Santa Cruz", { capturas: true });
  await expect(seller.getByRole("heading", { name: "Tu primer link" })).toBeVisible();
  await expect(seller.getByTestId("antifraude-vendedor")).toContainText("Para cobrar no tienes que abrir ningún link.");
  await seller.getByLabel("Precio en Bs").fill("450");
  await expect(seller.getByTestId("vista-previa-link")).toContainText("Bs 456,75"); // 450 + 1,5 %
  const { url, slug } = await crearLink(
    seller,
    { producto: "Zapatillas Nike talla 40", descripcion: "Originales, nuevas en caja.", precio: 450, dias: 3, categoria: "Ropa y calzado", flete: /^Por pagar$/ },
    "04-panel-primer-link",
  );
  await expect(seller.getByTestId("link-creado").getByTestId("whatsapp")).toContainText(url);
  // El mensaje para WhatsApp ya dice quién paga el flete, y se comparte con el menú del celular.
  await expect(seller.getByTestId("link-creado").getByTestId("whatsapp")).toContainText("🚚 Flete por pagar al recoger.");
  await expect(seller.getByTestId("compartir-link")).toBeVisible();
  await expect(seller.getByTestId("pendientes")).toContainText("Nada pendiente");
  await capturar(seller, "05-panel-link-creado");

  // Comprador: ve la protección (la paga él), deja los datos de entrega y paga.
  const buyer = await pagar(browser, url, {
    capturas: true,
    whatsapp: "591 76543210",
    quien: "Ana Pérez",
    ciudad: "Cochabamba",
    agencia: "Trans Copacabana, terminal",
    telefono: "70011223",
    flete: "por_pagar",
    antes: async (p) => {
      await expect(p.getByTestId("vendedor")).toContainText("Vendedor: Tienda Sofi · Santa Cruz");
      await expect(p.getByTestId("reputacion")).toContainText("Tienda Sofi · Santa Cruz");
      await expect(p.getByTestId("reputacion")).toContainText("Tienda nueva · igual tu plata queda guardada");
      await expect(p.getByTestId("vendedor")).toContainText("Tienda nueva");
      await expect(p.getByTestId("vendedor")).toContainText("Verificación de identidad: pendiente");
      await expect(p.getByTestId("proteccion")).toContainText("Bs 6,75");
      await expect(p.getByTestId("proteccion")).toContainText("Bs 456,75");
      await expect(p.getByRole("button", { name: "🔒 Pagar Bs 456,75 con QR" })).toBeVisible();
    },
  });
  await capturar(buyer, "08-comprador-pagado");
  await expect(buyer.getByTestId("compra-en-este-navegador")).toContainText("Tu compra quedó en este navegador");
  await buyer.getByRole("button", { name: "Agregar a inicio" }).click();
  await expect(buyer.getByTestId("ayuda-inicio")).toBeVisible();
  // El mismo link desde otro navegador: explica qué pasa y qué hacer, en vez de una pantalla sin botones.
  const otro = await (await browser.newContext()).newPage();
  await otro.goto(url);
  await expect(otro.getByTestId("otro-navegador")).toContainText("¿Pagaste tú este pedido?");
  await expect(otro.getByTestId("otro-navegador")).toContainText("Si la tienda no despacha hasta el");
  await capturar(otro, "08b-comprador-otro-navegador");
  await otro.close();

  // Vendedor: "Pendientes de hoy" le dice qué despachar; registra el envío con las fotos de la guía y del paquete.
  await seller.reload();
  const pendiente = seller.getByTestId(`pendiente-${slug}`);
  await expect(pendiente).toContainText("Despachar: Zapatillas Nike talla 40", { timeout: 60_000 });
  await expect(pendiente).toContainText(/hasta el/);
  await expect(seller.getByTestId("por-cobrar")).toContainText("Y 1 venta en curso por Bs 450,00, ya guardada en el contrato");
  await capturar(seller, "78-vendedor-pendientes-de-hoy");
  const card = await marcarEnviado(
    seller,
    slug,
    { empresa: "Trans Copacabana (encomiendas)", guia: "SRV-2026-118734", peso: "1,2", fotos: [await fotoDe(seller, 0), await fotoDe(seller, 240)] },
    "79-vendedor-envio-con-foto",
  );
  // La huella SHA-256 de cada foto va en la evidencia que registró mark_shipped: empresa|guía|peso|paquete|guía.
  const registrado = (await (await seller.request.get(`/api/orders/${slug}`)).json()).order.shipped_evidence;
  expect(registrado).toMatch(/^Trans Copacabana \(encomiendas\)\|SRV-2026-118734\|1\.2kg\|[0-9a-f]{64}\|[0-9a-f]{64}$/);
  await expect(seller.getByTestId(`pendiente-${slug}`)).toHaveCount(0);
  await expect(card.getByTestId("datos-entrega-vendedor")).toContainText("Ana Pérez");
  await expect(card.getByTestId("datos-entrega-vendedor")).toContainText("Cochabamba");
  // Lo que el comprador cargó para el último tramo: teléfono de quien recoge y flete.
  await expect(card.getByTestId("telefono-recoge")).toContainText("70011223");
  await expect(card.getByTestId("flete-pedido")).toContainText("Flete por pagar al recoger");
  await capturar(seller, "09-vendedor-enviado");

  // Comprador: "Pagar al vendedor" recién se habilita después de la espera, y pregunta antes.
  await buyer.reload();
  await expect(buyer.getByTestId("linea-de-tiempo")).toContainText("guía SRV-2026-118734");

  // Reclamo guiado con evidencia desde la galería: la foto se comprime, se sube con su huella y no se envía el reclamo.
  await buyer.getByTestId("confirmar").getByRole("button", { name: "Tengo un problema" }).click();
  const reclamo = buyer.getByTestId("reclamo");
  await reclamo.getByText("Llegó vacío o con otro producto").click();
  await expect(reclamo.getByTestId("evidencia-pedida")).toContainText("Video continuo del desempaque, sin cortes (obligatorio desde Bs 300).");
  await expect(reclamo.getByTestId("plazos-reclamo")).toContainText("el revisor decide en 72 h");
  const foto = await buyer.screenshot({ clip: { x: 0, y: 0, width: 160, height: 160 } });
  await reclamo.getByLabel("Foto del paquete: galería").setInputFiles({ name: "paquete.png", mimeType: "image/png", buffer: foto });
  await expect(reclamo.getByTestId("evidencia-foto").getByTestId("huella")).toBeVisible();
  await capturar(buyer, "09b-comprador-reclamo-guiado");
  await reclamo.getByRole("button", { name: "Cancelar" }).click();
  // /api/evidencia: guarda el archivo con su SHA-256 como nombre y el link lleva la huella.
  const subida = await (await buyer.request.post(`/api/evidencia?pedido=${slug}`, { data: foto, headers: { "content-type": "image/png" } })).json();
  expect(subida.url).toMatch(new RegExp(`/api/evidencia/${subida.sha256}\\.png$`));
  const vuelta = await buyer.request.get(subida.url);
  expect(vuelta.headers()["content-type"]).toBe("image/png");
  expect(createHash("sha256").update(await vuelta.body()).digest("hex")).toBe(subida.sha256);
  expect((await buyer.request.post("/api/evidencia?pedido=no-existe", { data: foto })).status()).toBe(404);
  expect((await buyer.request.post(`/api/evidencia?pedido=${slug}`, { data: Buffer.from("no es una imagen ni un video") })).status()).toBe(415);

  // Seguimiento tipo delivery: "Tu próximo paso" dice dónde recoger, con la guía y el flete; "Ya lo recogí" avanza.
  const paso = buyer.getByTestId("proximo-paso");
  await expect(paso).toContainText("Recoge en Trans Copacabana (encomiendas) con tu carnet y la guía SRV-2026-118734");
  await expect(paso).toContainText("Flete por pagar al recoger");
  await expect(paso.getByRole("button", { name: "Todavía no llegó" })).toBeVisible();
  await expect(buyer.getByTestId("paso-2")).toHaveAttribute("data-hecho", "si");
  await expect(buyer.getByTestId("paso-3")).toHaveAttribute("data-hecho", "no");
  await capturar(buyer, "09c-comprador-proximo-paso");
  await paso.getByRole("button", { name: "Ya lo recogí" }).click();
  await expect(buyer.getByTestId("paso-3")).toHaveAttribute("data-hecho", "si");
  await expect(paso).toContainText("Revísalo antes de pagar");
  // El teléfono de quien recoge no sale en la vista pública (sí el flete).
  const vista = await (await buyer.request.get(`/api/orders/${slug}`)).text();
  expect(vista).not.toContain("70011223");
  expect(vista).toContain('"flete":"por_pagar"');
  await expect(buyer.getByRole("button", { name: "Pagar al vendedor (irreversible)" })).toBeDisabled();
  await expect(buyer.getByTestId("espera-confirmar")).toBeVisible();
  await expect(buyer.getByText("Después ya no puedes reclamar.")).toBeVisible();
  await capturar(buyer, "10-comprador-espera-para-pagar");
  await abrirPregunta(buyer);
  await capturar(buyer, "11-comprador-pregunta-antes-de-pagar");
  await buyer.getByRole("button", { name: "Sí, lo tengo y está bien" }).click();
  await expect(buyer.getByTestId("estado-pedido")).toContainText("Se pagó al vendedor", CHAIN);
  await expect(buyer.getByTestId("desglose")).toContainText("Bs 450,04"); // el vendedor recibe el precio completo
  // Después de liberar ya no dice "Pago bloqueado": el texto depende del estado.
  await expect(buyer.getByTestId("registro-publico")).toContainText("Pago liberado al vendedor");
  await expect(buyer.getByTestId("registro-publico")).not.toContainText("bloqueado");
  await capturar(buyer, "12-comprador-pagado-al-vendedor");

  await seller.reload();
  await expect(card.getByTestId("estado")).toHaveText("Liberado", { timeout: 60_000 });
  await expect(seller.getByTestId("saldo")).toHaveText("Bs 450,04");
  await capturar(seller, "13-vendedor-cobrado");

  // Perfil verificable: la tarjeta del vendedor enlaza a /tienda/<slug> con los mismos números (registro público).
  const tarjeta = buyer.getByTestId("vendedor");
  await expect(async () => {
    await buyer.reload();
    await expect(tarjeta.getByTestId("num-ventas")).toContainText(/1\s*venta protegida/, { timeout: 5_000 });
  }).toPass({ timeout: 180_000 });
  await expect(tarjeta.getByTestId("num-sin-reclamo")).toContainText("Todas");
  await expect(tarjeta.getByTestId("num-perdidos")).toContainText(/0\s*reclamos perdidos/);
  await capturar(buyer, "75-comprador-tarjeta-tras-venta");
  await tarjeta.getByTestId("link-perfil-tienda").click();
  await expect(buyer).toHaveURL(/\/tienda\/tienda-sofi-[0-9a-f]{4}$/);
  await expect(buyer.getByTestId("perfil-nombre")).toHaveText("Tienda Sofi");
  await expect(buyer.getByTestId("sello")).toContainText("Vende con Trato");
  await expect(buyer.getByTestId("num-ventas")).toContainText(/1\s*venta protegida/);
  await expect(buyer.getByTestId("num-despacho")).not.toContainText("—");
  await expect(buyer.getByTestId("verificacion")).toHaveText("Verificación de identidad: pendiente (modo práctica)");
  await expect(buyer.getByTestId("operacion").first().locator(TX_LINK).first()).toBeVisible();
  expect(await buyer.locator("body").innerText()).not.toMatch(/WhatsApp\s*\+?\d/);
  await capturar(buyer, "76-tienda-perfil-recien-vendio");

  // Panel del vendedor: sus propios KPIs (ventas protegidas, % sin reclamo y tiempo hasta el cobro).
  await seller.goto("/panel");
  const tus = seller.getByTestId("kpis-vendedor");
  await expect(tus.getByTestId("kpi-ventas")).toContainText(/1\s*venta protegida/, CHAIN);
  await expect(tus.getByTestId("kpi-sin-reclamo")).toContainText("Todas");
  await expect(tus.getByTestId("kpi-cobro")).not.toContainText("—");
  await expect(tus.getByTestId("link-mi-perfil")).toHaveAttribute("href", /\/tienda\/tienda-sofi-[0-9a-f]{4}$/);
  // La insignia "Vendo con Trato" está en el panel (antes en /tienda, donde la veía el comprador).
  const insignia = seller.getByTestId("insignia");
  await expect(insignia.getByTestId("link-perfil")).toHaveText(/^http:\/\/localhost:\d+\/tienda\/tienda-sofi-[0-9a-f]{4}$/);
  await expect(insignia.getByRole("button", { name: "Copiar link" })).toBeVisible();
  await expect(insignia.getByRole("button", { name: "Copiar texto para la bio" })).toBeVisible();
  await capturar(seller, "77-vendedor-tus-numeros");

  // "Pasar a mi banco", simulado: explica el depósito en bolivianos y no pide ningún dato bancario.
  await seller.getByRole("button", { name: "🏦 Pasar a mi banco" }).click();
  const banco = seller.getByTestId("pasar-a-mi-banco");
  await expect(banco.getByTestId("banco-simulado")).toHaveText("Simulado en testnet");
  await expect(banco).toContainText("te deposita en bolivianos en tu cuenta");
  await expect(banco).toContainText("no te pedimos número de cuenta ni ningún dato bancario");
  await expect(banco.locator("input, select, textarea")).toHaveCount(0);
  await capturar(seller, "80-vendedor-pasar-a-mi-banco");
  await banco.getByRole("button", { name: "Entendido" }).click();

  // "Duplicar": el link rápido se llena con el link anterior, flete incluido.
  await seller.getByTestId(`pedido-${slug}`).getByTestId("duplicar").click();
  await expect(seller.getByTestId("duplicado")).toContainText("Copia de PP-");
  await expect(seller.getByLabel("Producto")).toHaveValue("Zapatillas Nike talla 40");
  await expect(seller.getByLabel("Precio en Bs")).toHaveValue("450");
  await expect(seller.getByTestId("flete-vendedor").getByRole("radio", { name: "Por pagar" })).toBeChecked();
});

test("presión para confirmar abre un reclamo; el vendedor regala la protección; el revisor reparte 70/30", async ({ browser }) => {
  const seller = await nuevoVendedor(browser, "Moda Andina", "59176543210", "La Paz");
  await seller.getByRole("radio", { name: /Yo la regalo/ }).check();
  await seller.getByLabel("Precio en Bs").fill("300");
  await expect(seller.getByTestId("vista-previa-link")).toContainText("Tu cliente paga Bs 300,00");
  const { url, slug } = await crearLink(seller, {
    producto: "Polera Adidas talla M",
    descripcion: "Color negro.",
    precio: 300,
    dias: 5,
    categoria: "Ropa y calzado",
    quienPaga: "vendedor",
  });
  const buyer = await pagar(browser, url, {
    ciudad: "Oruro",
    antes: async (p) => {
      await expect(p.getByTestId("proteccion")).toContainText("la paga el vendedor");
      await expect(p.getByRole("button", { name: "🔒 Pagar Bs 300,00 con QR" })).toBeVisible();
    },
  });
  await marcarEnviado(seller, slug, { empresa: "Bolívar (encomiendas)", guia: "OLVA-55821", peso: "0,4", fotos: [await fotoDe(seller, 120), await fotoDe(seller, 360)] });

  // El comprador responde "El vendedor me pide que confirme": se abre un reclamo y se marca al vendedor.
  await buyer.reload();
  await abrirPregunta(buyer);
  await buyer.getByRole("button", { name: "El vendedor me pide que confirme" }).click();
  // Pide una confirmación antes de abrir el reclamo por presión (antes bastaba un toque).
  await expect(buyer.getByTestId("confirmar-presion")).toContainText("¿La tienda te pide que le pagues antes de tener el producto?");
  await capturar(buyer, "19-comprador-confirma-presion");
  await buyer.getByRole("button", { name: "Sí, abrir un reclamo" }).click();
  await expect(buyer.getByTestId("aviso-presion")).toBeVisible();
  await expect(buyer.getByTestId("estado-pedido")).toContainText("Reclamo abierto", CHAIN);
  await expect(buyer.getByTestId("linea-de-tiempo")).toContainText("Presión para confirmar");
  await capturar(buyer, "20-comprador-presion-reclamo");

  await seller.reload();
  const card = seller.getByTestId(`pedido-${slug}`);
  await expect(card.getByTestId("estado")).toHaveText("En disputa", { timeout: 60_000 });
  await card.getByLabel("Tu versión para el revisor").fill("Nunca le pedí que confirme; adjunto la guía OLVA-55821.");
  await card.getByRole("button", { name: "Enviar mi versión" }).click();
  await expect(card.getByRole("button", { name: "Actualizar mi versión" })).toBeVisible({ timeout: 30_000 });
  await capturar(seller, "21-vendedor-en-disputa");

  // Revisor: motivo obligatorio, slider sin valor por defecto, historial de evidencia, rechazo del contrato al desvío.
  const rev = await (await browser.newContext({ viewport: DESKTOP })).newPage();
  await rev.goto("/arbitro"); // redirige a /revisor
  await expect(rev).toHaveURL(/\/revisor$/);
  await expect(rev.getByTestId("texto-fijo")).toContainText("El revisor solo puede repartir entre comprador y vendedor. El contrato no permite otro destino.");
  await rev.getByLabel("Clave del revisor").fill(process.env.ARBITRO_PANEL_KEY ?? "");
  await rev.getByRole("button", { name: "Entrar" }).click();
  const dispute = rev.getByTestId(`disputa-${slug}`);
  await expect(dispute).toBeVisible({ timeout: 60_000 });
  await expect(dispute).toContainText("reporte(s) de presión para confirmar");
  const hist = dispute.getByTestId("historial-evidencia");
  await expect(hist).toContainText("Envío (vendedor)");
  await expect(hist).toContainText("guía OLVA-55821");
  await expect(hist).toContainText("Reclamo");
  await expect(hist).toContainText("Respuesta del vendedor");
  // M10: la regla que aplica según el motivo, los plazos y la evidencia de las dos partes con su huella comprobada.
  await expect(dispute.getByTestId("regla-aplica")).toContainText("Entrega no registrada o dirección distinta a la del link, gana el comprador");
  await expect(dispute.getByTestId("regla-aplica")).toContainText("Comprueba con la empresa el estado de la guía (Bolívar (encomiendas), guía OLVA-55821)");
  await expect(dispute.getByTestId("plazos-revisor")).toContainText("El vendedor responde");
  await expect(dispute.getByTestId("plazos-revisor")).toContainText("Decides");
  const partes = dispute.getByTestId("evidencia-partes");
  await expect(partes.getByTestId("miniatura")).toHaveCount(2);
  await expect(partes.getByTestId("coincide")).toHaveCount(2, { timeout: 30_000 });
  await expect(partes).toContainText("La misma huella está en la evidencia que registró mark_shipped.");
  await partes.scrollIntoViewIfNeeded();
  await capturar(rev, "81-revisor-regla-y-evidencia", "tecnica");
  const resolver = dispute.getByRole("button", { name: "Resolver" });
  await expect(resolver).toBeDisabled();
  await expect(dispute.getByTestId("sin-reparto")).toBeVisible();
  await dispute.getByTestId("motivo-fallo").selectOption("Presión para confirmar");
  await expect(resolver).toBeDisabled(); // falta elegir el reparto
  await dispute.getByTestId("slider").fill("70");
  await expect(dispute.getByTestId("pct")).toHaveText("70%");
  await expect(dispute.getByTestId("fuente-vista-previa")).toContainText("pp_arbiter.quote", { timeout: 60_000 });
  await expect(dispute.getByTestId("vista-previa")).toContainText("Bs 205,17");
  await expect(dispute.getByTestId("vista-previa")).toContainText("Bs 87,93");
  await dispute.getByRole("button", { name: "Probar: mandar la plata a otra cuenta" }).click();
  await expect(dispute.getByTestId("resultado-desvio")).toContainText("Rechazado por el contrato", { timeout: 60_000 });
  await expect(dispute.getByTestId("resultado-desvio")).toContainText("Error(Contract, #12)");
  await capturar(rev, "22-revisor-70-30-desvio-rechazado", "tecnica");
  await resolver.click();
  await expect(rev.getByText("Resueltos recientemente")).toBeVisible(CHAIN);
  await expect(rev.getByTestId("reparto").first()).toContainText("Comprador (70%)");
  await capturar(rev, "23-revisor-resuelto", "tecnica");

  await buyer.reload();
  await expect(buyer.getByTestId("estado-pedido")).toContainText("Reclamo resuelto", { timeout: 60_000 });
  await expect(buyer.getByTestId("reparto")).toContainText("Bs 205,17");
  await expect(buyer.getByTestId("reparto")).toContainText("Bs 87,93");
  await capturar(buyer, "24-comprador-resuelto");

  const info = await browser.newPage();
  await info.goto("/como-funciona");
  await expect(info.getByTestId("politica-reclamos")).toContainText("Arrepentirse no es motivo.");
  await expect(info.getByTestId("real-simulado")).toContainText("Qué es real y qué es simulado");
  await capturar(info, "30-como-funciona", "tecnica");
});

test("celular (v2): IMEI obligatorio, revisión desde el envío, «Necesito más tiempo» una vez y liberación automática", async ({ browser }) => {
  const seller = await nuevoVendedor(browser, "Bazar Express", "59170001111", "Cochabamba");
  const { url, slug } = await crearLink(
    seller,
    { producto: "Celular Samsung Galaxy A15", descripcion: "128 GB, sellado.", precio: 1200, dias: 1, categoria: "Celular", demo: true },
    "40-panel-plazo-corto-demo",
  );
  const buyer = await pagar(browser, url, { ciudad: "Cochabamba" });
  // v2: antes del envío corre el plazo de despacho (no la revisión).
  await expect(buyer.getByTestId("plazo-despacho")).toContainText("El vendedor tiene que despachar antes del");
  await expect(buyer.getByTestId("cuenta-regresiva")).toHaveCount(0);

  // Sin IMEI no se puede marcar enviado.
  await seller.reload();
  const card = seller.getByTestId(`pedido-${slug}`);
  await expect(card.getByTestId("estado")).toHaveText("Pagado (despacha)", { timeout: 60_000 });
  await llenarEnvio(card, { empresa: "Entrega en persona", peso: "0,3" });
  await card.getByRole("button", { name: "Marcar como enviado" }).click();
  await expect(card.getByTestId("error")).toContainText("IMEI es obligatorio");
  await card.getByLabel(/IMEI del celular/).fill("356938035643809");
  await card.getByRole("button", { name: "Marcar como enviado" }).click();
  await expect(card.getByTestId("estado")).toHaveText("Enviado", CHAIN);

  await buyer.reload();
  await expect(buyer.getByTestId("imei")).toContainText("356938035643809");
  await expect(buyer.getByTestId("imei")).toContainText("Marca *#06# en el equipo y compara");
  await expect(buyer.getByTestId("cuenta-regresiva")).toBeVisible({ timeout: 60_000 });
  await capturar(buyer, "41-comprador-imei-cuenta-regresiva");

  // "Necesito más tiempo" (pp_guardian.extend): una sola vez, firmado por el comprador; suma otra ventana de revisión.
  const plazoAntes = await buyer.getByTestId("plazo").locator(".text-xs").first().innerText();
  await buyer.getByRole("button", { name: "Necesito más tiempo" }).click();
  await expect(buyer.getByTestId("extendido")).toContainText("ya pidió más tiempo una vez", CHAIN);
  await expect(buyer.getByText(/Pediste más tiempo para revisar/)).toBeVisible();
  await expect(buyer.getByRole("button", { name: "Necesito más tiempo" })).toHaveCount(0);
  expect(await buyer.getByTestId("plazo").locator(".text-xs").first().innerText()).not.toBe(plazoAntes);
  await capturar(buyer, "41b-comprador-pidio-mas-tiempo");
  await seller.reload();
  await expect(seller.getByTestId(`pedido-${slug}`).getByTestId("plazo")).toBeVisible({ timeout: 60_000 });
  await expect(seller.getByTestId(`pedido-${slug}`).getByTestId("extendido")).toBeVisible();
  await capturar(seller, "42-vendedor-cuenta-regresiva");

  const btn = buyer.getByRole("button", { name: /Liberar ahora \(plazo vencido\)/ });
  await expect(btn).toBeVisible({ timeout: 6 * 60_000 });
  await capturar(buyer, "43-comprador-plazo-vencido");
  await expect(async () => {
    if (await btn.isVisible()) await btn.click({ timeout: 5_000 }).catch(() => {});
    await expect(buyer.getByTestId("estado-pedido")).toContainText("Se pagó al vendedor", { timeout: 45_000 });
  }).toPass({ timeout: 4 * 60_000, intervals: [5_000] });
  await expect(buyer.getByText("Venció el plazo: se pagó al vendedor")).toBeVisible();
  await capturar(buyer, "44-comprador-liberado-por-plazo");
  await seller.reload();
  await expect(seller.getByTestId(`pedido-${slug}`).getByTestId("estado")).toHaveText("Liberado", { timeout: 60_000 });
  await capturar(seller, "45-vendedor-liberado-por-plazo");
});

test("devolución automática (v2): el vendedor no despacha a tiempo y el pago vuelve al comprador sin reclamo", async ({ browser }) => {
  const seller = await nuevoVendedor(browser, "Tienda Lenta", "59170002222", "Oruro");
  const { url, slug } = await crearLink(seller, { producto: "Celular Xiaomi Redmi 13", descripcion: "Nuevo.", precio: 900, dias: 1, categoria: "Celular", demo: true });
  const buyer = await pagar(browser, url, { ciudad: "Sucre" });
  await expect(buyer.getByTestId("plazo-despacho")).toContainText("te devolvemos el pago automáticamente");
  await seller.reload();
  const card = seller.getByTestId(`pedido-${slug}`);
  await expect(card.getByTestId("plazo-despacho")).toContainText("Despacha antes del", { timeout: 60_000 });
  await capturar(seller, "46-vendedor-plazo-de-despacho");

  // Nadie toca nada: al vencer el plazo de despacho (2 min en demo), la app abre la disputa como plataforma
  // y pp_arbiter.refund_unshipped devuelve el pago. La página del comprador se actualiza sola.
  await expect(buyer.getByTestId("estado-pedido")).toContainText("Te devolvimos tu pago", { timeout: 6 * 60_000 });
  await expect(buyer.getByTestId("devolucion")).toContainText("El vendedor no registró el envío antes del plazo");
  await expect(buyer.getByTestId("registro-publico")).toContainText("Te devolvimos el pago");
  await expect(buyer.getByText("Se devolvió el pago al comprador: el vendedor no despachó a tiempo")).toBeVisible();
  await expect(buyer.locator(TX_LINK).last()).toBeVisible();
  await capturar(buyer, "47-comprador-devuelto-sin-despacho");
  await seller.reload();
  await expect(card.getByTestId("estado")).toHaveText("Devuelto (no se despachó)", { timeout: 60_000 });
  await expect(card.getByTestId("devuelto-vendedor")).toBeVisible();
  await capturar(seller, "48-vendedor-devuelto-sin-despacho");
});

// ---------- Bot de WhatsApp (simulador) contra la app real en testnet ----------

async function say(chat: Page, text: string) {
  const input = chat.getByLabel("Mensaje");
  await input.fill(text);
  await input.press("Enter");
  await expect(chat.getByTestId("my-msg").last()).toContainText(text);
}
const botSays = (chat: Page, text: string) => chat.getByTestId("bot-msg").filter({ hasText: text }).last();

test("bot de WhatsApp: vender por chat → pago con datos de entrega → enviado desde el link del bot → pago al vendedor", async ({ browser, request }) => {
  const SIM = process.env.E2E_SIM_URL!;
  const SELLER_WA = process.env.E2E_SELLER_WA!;

  // El bot manda a /vender?wa=… a los números sin tienda: el número llega precargado.
  const seller = await (await browser.newContext()).newPage();
  await seller.goto(`/vender?wa=${SELLER_WA}`);
  await seller.getByLabel("Nombre de la tienda").fill("Tienda del Bot");
  await seller.getByLabel("Tu ciudad").selectOption("Santa Cruz");
  await seller.getByRole("button", { name: "Continuar" }).click();
  await expect(seller.getByLabel("Número de WhatsApp")).toHaveValue(SELLER_WA);
  await seller.getByRole("button", { name: "Continuar" }).click();
  await seller.getByRole("button", { name: "Crear mi cuenta de cobro y continuar" }).click();
  await seller.waitForURL("**/panel**", CHAIN);

  const chat = await (await browser.newContext()).newPage();
  await chat.goto(SIM);
  await say(chat, "vendo zapatillas nike 40 a 450 bs entrega 3 días");
  const link = chat.locator('[data-testid="bot-msg"] a[href*="/p/zapatillas-nike-40-"]').first();
  await expect(link).toBeVisible({ timeout: 60_000 });
  const url = (await link.getAttribute("href"))!;
  const slug = url.split("/p/")[1];
  await capturar(chat, "bot-01-chat-link", "chat");

  const buyer = await pagar(browser, url, { whatsapp: "591 76543210", quien: "Rosa Quispe", ciudad: "La Paz" });
  await capturar(buyer, "bot-02-app-pagado");
  // Privacidad: ni el WhatsApp ni los datos de entrega del comprador salen en la vista pública; /api/bot pide clave.
  const publico = await (await request.get(`/api/orders/${slug}`)).text();
  expect(publico).not.toContain("76543210");
  expect(publico).not.toContain("Rosa Quispe");
  expect((await request.get(`/api/bot/changes?since=0`)).status()).toBe(401);
  // API firmada: la tienda pública no trae compradores ni contactos; panel, tienda, links y contacto piden la firma de
  // la cuenta (el bot creó el link de arriba con su clave de servidor).
  const tiendaPk = ((await (await request.get(`/api/orders/${slug}`)).json()) as { order: { seller_pubkey: string } }).order.seller_pubkey;
  const tiendaPublica = await (await request.get(`/api/sellers/${tiendaPk}`)).text();
  for (const dato of ["76543210", "Rosa Quispe", SELLER_WA]) expect(tiendaPublica).not.toContain(dato);
  expect((await request.get(`/api/sellers/${tiendaPk}/panel`)).status()).toBe(401);
  expect((await request.post("/api/sellers", { data: { pubkey: tiendaPk, storeName: "Tienda Robada", whatsapp: "59170009999" } })).status()).toBe(401);
  expect((await request.post("/api/links", { data: { sellerPubkey: tiendaPk, product: "Falso", priceBs: 10, deliveryDays: 1 } })).status()).toBe(401);
  expect((await request.post(`/api/orders/${slug}/buyer-contact`, { data: { buyer: "x", whatsapp: "70000000" } })).status()).toBe(401);

  await expect(botSays(chat, "el pago está GUARDADO")).toBeVisible({ timeout: 90_000 });
  await capturar(chat, "bot-03-chat-te-pagaron", "chat");

  await say(chat, `enviado ${slug.slice(-6)} SRV-2026-555001`);
  const shipLink = chat.locator('[data-testid="bot-msg"] a[href*="/panel?enviar="]').last();
  await expect(shipLink).toBeVisible({ timeout: 30_000 });
  await capturar(chat, "bot-04-chat-link-enviar", "chat");
  await seller.goto((await shipLink.getAttribute("href"))!);
  const card = seller.getByTestId(`pedido-${slug}`);
  await expect(card.getByLabel("Número de guía")).toHaveValue("SRV-2026-555001", { timeout: 60_000 });
  await expect(card.getByLabel("Ciudad de destino")).toHaveValue("La Paz");
  await llenarEnvio(card, { empresa: "El Dorado (encomiendas)", peso: "1" });
  await capturar(seller, "bot-05-app-panel-enviar");
  await card.getByRole("button", { name: "Marcar como enviado" }).click();
  await expect(card.getByTestId("estado")).toHaveText("Enviado", CHAIN);

  await expect(botSays(chat, "figura como enviado")).toBeVisible({ timeout: 90_000 });
  await chat.locator("#as-buyer").click();
  await expect(botSays(chat, "¿Te llegó?")).toBeVisible({ timeout: 60_000 });
  await capturar(chat, "bot-06-chat-comprador-te-llego", "chat");

  await buyer.reload();
  await abrirPregunta(buyer);
  await buyer.getByRole("button", { name: "Sí, lo tengo y está bien" }).click();
  await expect(buyer.getByTestId("estado-pedido")).toContainText("Se pagó al vendedor", CHAIN);
  await capturar(buyer, "bot-07-app-pagado-al-vendedor");
  await chat.locator("#as-seller").click();
  await expect(botSays(chat, "Liberado")).toBeVisible({ timeout: 90_000 });
  await capturar(chat, "bot-08-chat-liberado", "chat");
});

test("transparencia: pruebas del equipo (con reclamos forzados) y piloto aparte, con datos reales de testnet", async ({ page, request }) => {
  await page.goto("/transparencia");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Transparencia");
  await expect(page.getByText("Estas cifras se calculan con datos públicos de la red Stellar (testnet). Cualquiera puede verificarlas.")).toBeVisible();
  await expect(page.getByTestId("pruebas-equipo")).toHaveText("Pruebas del equipo en testnet (incluye reclamos forzados)");
  await expect(page.getByTestId("piloto")).toContainText("Piloto con vendedores reales");
  await expect(page.getByTestId("como-terminaron")).toContainText("reclamos forzados");
  const compras = Number((await page.getByTestId("compras-protegidas").locator("p").nth(1).innerText()).replace(/\D/g, ""));
  expect(compras).toBeGreaterThan(0);
  await expect(page.getByTestId("ultimas-operaciones").locator(TX_LINK).first()).toBeVisible();
  const m = await (await request.get("/api/transparencia")).json();
  expect(m.compras_protegidas).toBeGreaterThanOrEqual(compras);
  expect(
    m.liberadas_por_confirmacion + m.liberadas_por_plazo + m.disputas.resueltas_por_arbitro + m.disputas.reembolsos_sin_envio + m.disputas.pendientes + m.en_curso,
  ).toBe(m.compras_protegidas);
  await capturar(page, "60-transparencia", "tecnica");
});

test("palabras prohibidas en todas las pantallas, /verificar, /pedir, /piloto y piloto:csv", async ({ page, request, browser }) => {
  // Un link real (sin transacciones) para /p/[slug] y /verificar.
  const kp = Keypair.random();
  const pubkey = kp.publicKey();
  expect((await firmado(request, kp, "POST", "/api/sellers", { pubkey, storeName: "Tienda Verificable", whatsapp: "59170002222", city: "Tarija" })).ok()).toBe(true);
  const link = (await (await firmado(request, kp, "POST", "/api/links", { sellerPubkey: pubkey, product: "Chamarra de cuero", priceBs: 800, deliveryDays: 4, category: "Ropa y calzado" })).json()) as {
    slug: string;
    code: string;
  };
  expect(link.code).toMatch(/^PP-[2-9A-HJKMNP-Z]{8}$/);

  // Abierto dentro de Instagram (navegador interno): pide abrirlo en Safari o Chrome antes de pagar, con "Copiar link".
  const ig = await (
    await browser.newContext({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 337.0.3.23.54 (iPhone14,5; iOS 17_5; es_BO; es)",
    })
  ).newPage();
  await ig.goto(`/p/${link.slug}`);
  await expect(ig.getByTestId("aviso-navegador-interno")).toContainText("Estás dentro de Instagram. Abre este link en Safari antes de pagar.");
  await expect(ig.getByTestId("copiar-link")).toBeVisible();
  await capturar(ig, "65-comprador-navegador-interno");
  await ig.close();

  await page.goto(`/verificar?codigo=${link.code}`);
  const res = page.getByTestId("resultado-verificar");
  await expect(res).toContainText("Tienda Verificable");
  await expect(res).toContainText("Chamarra de cuero");
  await expect(res).toContainText("Esperando pago");
  await expect(res.getByRole("link", { name: "Abrir el link auténtico" })).toHaveAttribute("href", `/p/${link.slug}`);
  await capturar(page, "61-verificar");
  // Un link que no existe: 404 con el aviso de que puede ser falso.
  expect((await request.get("/p/no-existe-0000")).status()).toBe(404);
  await page.goto("/p/no-existe-0000");
  await expect(page.getByTestId("link-no-encontrado")).toContainText("Puede ser un link falso");
  await capturar(page, "64-comprador-link-no-existe");

  await page.goto("/verificar?codigo=PP-0001");
  await expect(page.getByTestId("error")).toContainText("No encontramos un pedido con ese código");

  await page.goto("/pedir");
  await page.getByLabel("¿Qué quieres comprar?").fill("Chamarra de cuero");
  await page.getByLabel(/Precio acordado/).fill("800");
  await expect(page.getByTestId("mensaje-pedir")).toContainText("¿Me lo vendes con Trato?");
  await capturar(page, "62-pedir");

  await page.goto("/piloto");
  await page.getByLabel("Tu nombre").fill("Carla Mendoza");
  await page.getByLabel("Nombre de la tienda").fill("Tienda Piloto");
  await page.getByLabel("Ciudad", { exact: true }).selectOption("Sucre");
  await expect(page.getByText(/celulares y electrónica .*\(tickets de Bs 1\.000 a 7\.000\)/)).toBeVisible();
  await page.getByLabel("¿Qué vendes?").fill("Celulares y accesorios");
  await page.getByLabel("¿A qué ciudades envías?").fill("La Paz, Santa Cruz");
  await page.getByLabel("Ticket promedio (Bs)").fill("900");
  await page.getByLabel("WhatsApp", { exact: true }).fill("59170003333");
  await page.getByRole("button", { name: "Quiero entrar al piloto" }).click();
  await expect(page.getByTestId("error")).toContainText("consentimiento");
  await page.getByLabel(/Acepto que Trato guarde estos datos/).check();
  await page.getByRole("button", { name: "Quiero entrar al piloto" }).click();
  await expect(page.getByTestId("piloto-listo")).toBeVisible();
  await capturar(page, "63-piloto");
  await page.getByRole("link", { name: "Crear mi tienda ahora" }).click();
  await expect(page.getByText("Vienes del piloto: tu tienda queda marcada como vendedor del piloto.")).toBeVisible();

  const csv = execFileSync("node", ["scripts/piloto-csv.mjs"], { encoding: "utf8", env: { ...process.env, PP_DB_PATH: "data/e2e.db", PILOTO_CSV: "data/piloto-e2e.csv" } });
  expect(csv).toContain("Tienda Piloto");
  expect(csv.split("\n")[0]).toBe("created_at,name,store,city,sells,ships_to,avg_ticket,whatsapp,consent,seller_pubkey");

  // Barrido de palabras prohibidas.
  const pantallas: [string, Kind][] = [
    ["/", "usuario"],
    ["/vender", "usuario"],
    ["/panel", "usuario"],
    [`/p/${link.slug}`, "usuario"],
    ["/verificar", "usuario"],
    ["/pedir", "usuario"],
    ["/piloto", "usuario"],
    ["/metricas", "usuario"],
    ["/metricas/equipo/compras", "usuario"],
    ["/metricas/piloto/reclamos", "usuario"],
    ["/como-funciona", "tecnica"],
    ["/transparencia", "tecnica"],
    ["/revisor", "tecnica"],
  ];
  for (const [ruta, kind] of pantallas) {
    await page.goto(ruta);
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    await revisarPalabras(page, kind);
  }
});
