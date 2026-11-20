import { expect, test, type Browser, type BrowserContext, type FrameLocator, type Locator, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import guion from "./guion.json";
import { escenarioHtml, sinLocalhost, subtitulos, toques } from "./pantalla";

// Video de la demo v3 (npm run demo:video): recorrido en TESTNET grabado por escenas, en el orden del guion
// (guion.json, sacado de GUION-VIDEO.md). Este spec graba los clips; las placas (portada, problema, Stellar, plan y
// cierre) las arma scripts/video-join.mjs, que al final une todo en pago-protegido/demo/v3/trato-demo-v3.mp4.
//   bot        la vendedora crea el link en el simulador de WhatsApp;
//   comprador  el comprador abre el link en su celular: «Dos salidas», el QR y «Esperando tu pago…»; paga;
//   despacho   la vendedora registra el envío con la foto de la guía (la huella queda en el contrato);
//   cobro      el comprador confirma, la vendedora cobra y se ve la transacción en stellar.expert;
//   probar     /probar: «Intenta desviar la plata» y el error del contrato en rojo (opcional: si /probar no está,
//              el video sale sin esa escena; VIDEO_PROBAR=0 la salta y VIDEO_PROBAR=1 la exige).
// Las escenas de celular se graban en un «escenario» de 1280x720 (pantalla.ts) servido en el mismo origen de la app
// (/__video/escena, interceptado por Playwright): la página real va en un iframe de 390 px y el subtítulo al costado.
// Subtítulos: el texto de la columna «Voz», en bloques de una o dos líneas, inyectados en la página. En cada subtítulo
// y en cada captura se revisan las palabras prohibidas, que el subtítulo ocupe 2 líneas o menos y que no se vea
// "localhost" en ningún marco: las URLs locales se reemplazan en pantalla por «trato · link de pago» y similares
// (solo en el contexto del video). Capturas clave en pago-protegido/demo/v3/.

const OUT_DIR = process.env.PP_VIDEO_DIR ? path.resolve(process.env.PP_VIDEO_DIR) : path.resolve(__dirname, "..", "..", "demo", "v3");
const CLIPS = path.join(OUT_DIR, "clips");
const RAW = path.join(CLIPS, "raw");
const PANTALLA = { width: 1280, height: 720 };
const CHAIN = { timeout: 240_000 };
const SIM = process.env.E2E_SIM_URL!;
const EXPLORER = "https://stellar.expert/explorer/testnet";
const IMEI = "356938035643809";
const GUIA = "SRV-2026-130077";
const ESCENARIO = escenarioHtml(fs.readFileSync(path.join(__dirname, "..", "src", "app", "icon.svg"), "utf8"));

type Escena = (typeof guion.escenas)[number];
const ESCENAS = new Map<string, Escena>(guion.escenas.map((e) => [e.id, e]));
const V = (id: string) => ESCENAS.get(id)!.bloques;
const numero = (id: string) => String(guion.escenas.findIndex((e) => e.id === id) + 1).padStart(2, "0");
const PROHIBIDAS = guion.prohibidas.map((s) => new RegExp(s, "i"));
const LOCALHOST = /localhost|127\.0\.0\.1/i;
/** Segundos para leer un subtítulo (los mismos que usa video-join.mjs para no acelerar ese tramo). */
const leer = (t: string) => Math.max(guion.lectura.min, guion.lectura.base + t.replace(/\n/g, " ").length / guion.lectura.cps);

type Estado = Awaited<ReturnType<BrowserContext["storageState"]>>;
/** Cuentas locales (localStorage) que pasan de una escena a la otra. */
type Cuentas = { storage?: Estado };
type Celular = { rol: string; titulo: string; detalle: string; ruta: string };

// ---------- Subtítulos, revisiones y capturas ----------

/** Línea de tiempo del clip que se está grabando: cuándo empieza la escena y cuándo aparece cada subtítulo. */
let linea: { t0: number; inicio: number; subs: { t: number; read: number; text: string }[] } | null = null;
const ahora = () => (linea ? (Date.now() - linea.t0) / 1000 : 0);
/** Desde acá se ve la escena (lo anterior es la carga de la página y se recorta al unir). */
const marcarInicio = () => {
  if (linea) linea.inicio = ahora();
};

function revisarTexto(texto: string, donde: string) {
  for (const re of PROHIBIDAS) expect(texto, `palabra prohibida ${re} en ${donde}`).not.toMatch(re);
  expect(texto, `"localhost" en ${donde}`).not.toMatch(LOCALHOST);
}

/** Que no se vea "localhost" en ninguna parte (texto visible y campos de todos los marcos). */
async function sinLocalhostVisible(p: Page, donde: string) {
  for (const f of p.frames()) {
    const texto = await f
      .evaluate(() => {
        (window as unknown as { __ppSinLocalhost?: () => void }).__ppSinLocalhost?.();
        const campos = [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")]
          .filter((e) => !e.dataset.ppOculto && e.type !== "hidden" && e.getClientRects().length > 0)
          .map((e) => e.value);
        return [document.body?.innerText ?? "", ...campos].join("\n");
      })
      .catch(() => "");
    expect(texto, `"localhost" a la vista en ${donde} (${f === p.mainFrame() ? "página" : "marco"} ${f.url()})`).not.toMatch(LOCALHOST);
  }
}

/** Muestra un subtítulo (o lo saca, con null) y lo anota en la línea de tiempo del clip. */
async function mostrar(p: Page, texto: string | null) {
  if (texto !== null) revisarTexto(texto, "el subtítulo");
  await p.evaluate((t) => (window as unknown as { __ppSub: (t: string | null) => void }).__ppSub(t), texto);
  if (texto === null) return;
  linea?.subs.push({ t: ahora(), read: leer(texto), text: texto });
  const lineas = await p.evaluate(() => {
    const el = document.getElementById("pp-sub");
    return el ? Math.round((el.getBoundingClientRect().height - 24) / 30) : 0;
  });
  expect(lineas, `el subtítulo ocupa más de dos líneas: «${texto}»`).toBeLessThanOrEqual(2);
  await sinLocalhostVisible(p, `el subtítulo «${texto.split("\n")[0]}»`);
}

/** Subtítulo mientras pasa algo en pantalla; queda al menos su tiempo de lectura. */
async function narrar(p: Page, texto: string, accion?: () => Promise<void>) {
  const t0 = Date.now();
  await mostrar(p, texto);
  if (accion) await accion();
  const resto = leer(texto) * 1000 - (Date.now() - t0);
  if (resto > 0) await p.waitForTimeout(resto);
}

/** Captura clave (lo que se ve, con el subtítulo) en pago-protegido/demo/v3/. */
async function shot(p: Page, nombre: string) {
  await p.waitForTimeout(300);
  await sinLocalhostVisible(p, `la captura ${nombre}`);
  await p.screenshot({ path: path.join(OUT_DIR, `${nombre}.png`) });
}

async function escribir(l: Locator, texto: string) {
  await l.click();
  await l.pressSequentially(texto, { delay: 40 });
}

async function suave(l: Locator, bloque: ScrollLogicalPosition = "center") {
  await l.evaluate((el, b) => el.scrollIntoView({ behavior: "smooth", block: b }), bloque, { timeout: 15_000 });
  await l.page().waitForTimeout(900);
}

async function resaltar(l: Locator, ms = 2600) {
  await l
    .evaluate((el, ms) => {
      const h = el as HTMLElement;
      const antes = { s: h.style.boxShadow, t: h.style.transition };
      h.style.transition = "box-shadow .3s ease";
      h.style.boxShadow = "0 0 0 4px rgba(245,158,11,.95), 0 0 0 10px rgba(245,158,11,.25)";
      setTimeout(() => {
        h.style.boxShadow = antes.s;
        h.style.transition = antes.t;
      }, ms);
    }, ms, { timeout: 10_000 })
    .catch(() => {});
}

// ---------- Contextos, clips y escenario ----------

async function nuevoContexto(browser: Browser, cuentas: Cuentas | null, grabar: boolean) {
  const ctx = await browser.newContext({
    viewport: PANTALLA,
    deviceScaleFactor: 1,
    locale: "es-BO",
    timezoneId: "America/La_Paz",
    storageState: cuentas?.storage,
    recordVideo: grabar ? { dir: RAW, size: PANTALLA } : undefined,
  });
  await ctx.addInitScript(subtitulos);
  await ctx.addInitScript(sinLocalhost, new URL(SIM).origin);
  await ctx.addInitScript(toques);
  await ctx.route("**/__video/escena", (r) => r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: ESCENARIO }));
  return ctx;
}

/** Una escena grabada: contexto nuevo (con las cuentas locales), video propio y su línea de tiempo de subtítulos. */
async function clip(browser: Browser, id: string, cuentas: Cuentas | null, fn: (p: Page) => Promise<void>, prep?: (ctx: BrowserContext) => Promise<void>) {
  const ctx = await nuevoContexto(browser, cuentas, true);
  if (prep) await prep(ctx);
  const page = await ctx.newPage();
  linea = { t0: Date.now(), inicio: 0, subs: [] };
  let ok = false;
  try {
    await fn(page);
    if (cuentas) cuentas.storage = await ctx.storageState();
    ok = true;
  } finally {
    const video = page.video()!;
    const meta = linea;
    linea = null;
    await ctx.close();
    const base = path.join(CLIPS, `${numero(id)}-${id}`);
    if (ok) {
      await video.saveAs(`${base}.webm`);
      fs.writeFileSync(`${base}.subs.json`, JSON.stringify(meta, null, 2));
    }
    await video.delete().catch(() => {});
  }
}

/** Preparación fuera de cámara (mismas cuentas locales, sin grabar). */
async function fueraDeCamara(browser: Browser, cuentas: Cuentas, fn: (p: Page) => Promise<void>) {
  const ctx = await nuevoContexto(browser, cuentas, false);
  try {
    await fn(await ctx.newPage());
    cuentas.storage = await ctx.storageState();
  } finally {
    await ctx.close();
  }
}

async function escenario(p: Page, c: Celular) {
  await p.goto("/__video/escena");
  await cambiarCelular(p, c);
}

/** Cambia lo que muestra el celular (y los textos del costado) sin recargar el escenario: el subtítulo sigue. */
async function cambiarCelular(p: Page, c: Celular) {
  for (const t of [c.rol, c.titulo, c.detalle]) revisarTexto(t, "el escenario");
  await p.evaluate((c) => {
    document.getElementById("rol")!.textContent = c.rol;
    document.getElementById("titulo")!.textContent = c.titulo;
    document.getElementById("detalle")!.textContent = c.detalle;
    (document.getElementById("celular") as HTMLIFrameElement).src = c.ruta;
  }, c);
  const ruta = c.ruta.split("?")[0];
  await expect
    .poll(
      () => {
        try {
          return new URL(p.frame({ name: "celular" })?.url() ?? "").pathname;
        } catch {
          return "";
        }
      },
      { timeout: 30_000 },
    )
    .toBe(ruta);
  await p.frame({ name: "celular" })!.waitForLoadState("domcontentloaded");
}

const enCelular = (p: Page) => p.frameLocator("#celular");

// ---------- Pasos con la red ----------

/** "Simular pago del banco": encadena varias transacciones en testnet; si la red falla, se reintenta (es idempotente). */
async function pagarConReintentos(r: Page | FrameLocator) {
  const ok = r.getByTestId("estado-pedido");
  const err = r.getByTestId("error");
  for (let i = 1; ; i++) {
    await r.getByRole("button", { name: "Simular pago del banco (modo práctica)" }).click();
    await expect(ok.or(err).first()).toBeVisible(CHAIN);
    if (await ok.isVisible()) return;
    const msg = await err.first().innerText();
    console.log(`[video] pago, intento ${i} falló en la red: ${msg}`);
    if (i >= 3) throw new Error(`El pago falló 3 veces: ${msg}`);
  }
}

/** Foto de una guía de encomienda (genérica, sin marca de ninguna empresa) para subirla como evidencia. */
async function fotoDeGuia(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 640 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.setContent(`<body style="margin:0;width:900px;height:640px;display:flex;align-items:center;justify-content:center;
    background:repeating-linear-gradient(95deg,#8a6a4b 0 22px,#7d5f42 22px 47px,#94734f 47px 70px);font-family:Helvetica,Arial,sans-serif">
    <div style="width:620px;background:#fbfaf6;padding:30px 34px;transform:rotate(-3deg);box-shadow:0 18px 40px rgba(0,0,0,.45);color:#1f2937">
      <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:3px solid #1f2937;padding-bottom:10px">
        <b style="font-size:30px;letter-spacing:1px">GUÍA DE ENCOMIENDA</b><span style="font-size:18px">Original · remitente</span></div>
      <div style="font-size:26px;margin-top:14px">N° <b>${GUIA}</b></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;font-size:19px;margin-top:14px;line-height:1.35">
        <div><small style="color:#6b7280">Remitente</small><br>Tienda Sofi · Santa Cruz</div>
        <div><small style="color:#6b7280">Destinatario</small><br>Ana Pérez · Cochabamba</div>
        <div><small style="color:#6b7280">Contenido</small><br>1 celular, en caja</div>
        <div><small style="color:#6b7280">Peso</small><br>0,4 kg</div>
      </div>
      <div style="height:70px;margin-top:18px;background:repeating-linear-gradient(90deg,#111 0 3px,transparent 3px 5px,#111 5px 6px,transparent 6px 10px,#111 10px 14px,transparent 14px 16px)"></div>
    </div></body>`);
  const foto = await p.screenshot({ type: "jpeg", quality: 88 });
  await ctx.close();
  return foto;
}

/** "📷 Sacar foto" de la guía: la cámara del celular se reemplaza por el selector de archivos. */
async function sacarFotoDeGuia(p: Page, card: Locator, slug: string, foto: Buffer) {
  const caja = card.getByTestId(`evidencia-guia-${slug}`);
  const archivo = { name: "guia.jpg", mimeType: "image/jpeg", buffer: foto };
  const selector = p.waitForEvent("filechooser", { timeout: 5_000 }).catch(() => null);
  await caja.getByRole("button", { name: /Sacar foto/ }).click();
  const fc = await selector;
  if (fc) await fc.setFiles(archivo);
  else await caja.getByLabel("Foto de la guía: cámara").setInputFiles(archivo);
}

/** La transacción en stellar.expert (puede tardar unos segundos en indexarla). */
async function verEnStellarExpert(p: Page, hash: string) {
  for (let i = 1; i <= 3; i++) {
    await p.goto(`${EXPLORER}/tx/${hash}`, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => {});
    const lista = await p
      .getByText(hash)
      .first()
      .waitFor({ timeout: 20_000 })
      .then(() => p.getByText("Successful").first().waitFor({ timeout: 10_000 }))
      .then(
        () => true,
        () => false,
      );
    if (lista) return true;
    console.log(`[video] stellar.expert todavía no muestra ${hash} (intento ${i})`);
    await p.waitForTimeout(5_000);
  }
  return false;
}

/** /probar está en esta versión de la app (PP_PROBAR=1)? */
async function probarDisponible(app: string) {
  if (process.env.VIDEO_PROBAR === "0") return false;
  const r = await fetch(`${app}/probar`).catch(() => null);
  const ok = r?.status === 200;
  if (!ok && process.env.VIDEO_PROBAR === "1") throw new Error(`/probar no está disponible (HTTP ${r?.status ?? "sin respuesta"}): ¿falta PP_PROBAR=1?`);
  if (!ok) console.warn(`[video] /probar no está disponible (HTTP ${r?.status ?? "sin respuesta"}): el video sale sin esa escena.`);
  return ok;
}

/**
 * Fuera de cámara, en /probar: tienda y link en el celular del vendedor, pago en el del comprador. Devuelve las cuentas
 * de prueba (pp.probar.*) para grabar el intento de desvío. Ojo: desde el pago, el vendedor tiene 2 minutos para
 * registrar el envío; si no, la plata vuelve sola al comprador y ya no hay nada que desviar. Por eso se graba enseguida.
 */
async function prepararProbar(browser: Browser): Promise<Cuentas> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1400 }, deviceScaleFactor: 1, locale: "es-BO", timezoneId: "America/La_Paz" });
  try {
    const p = await ctx.newPage();
    await p.goto("/probar");
    await expect(p.getByRole("heading", { level: 1 })).toHaveText("Prueba Trato de punta a punta");
    const v = p.frameLocator('iframe[name="vendedor"]');
    await v.getByLabel("Nombre de la tienda").fill("Celulares Rocío");
    await v.getByLabel("Tu ciudad").selectOption("La Paz");
    await v.getByRole("button", { name: "Continuar" }).click();
    await v.getByLabel("Número de WhatsApp").fill("59170004321");
    await v.getByRole("button", { name: "Continuar" }).click();
    await v.getByRole("button", { name: "Crear mi cuenta de cobro y continuar" }).click();
    await expect(v.getByTestId("tienda")).toHaveText("Celulares Rocío", CHAIN);
    await v.getByLabel("Producto").fill("Celular iPhone 13 128 GB");
    await v.getByLabel("Precio en Bs").fill("3900");
    await v.getByRole("button", { name: "Crear link" }).click();
    await expect(v.getByTestId("link-url")).toBeVisible({ timeout: 30_000 });
    const c = p.frameLocator('iframe[name="comprador"]');
    await expect(c.getByTestId("codigo")).toBeVisible({ timeout: 30_000 });
    await c.getByTestId("barra-pagar").getByRole("button", { name: /Pagar Bs .* con QR/ }).click();
    await c.getByLabel("Quién recibe").fill("Luis Rojas");
    await c.getByLabel("Ciudad de destino").selectOption("Oruro");
    await c.getByRole("button", { name: /Ver el QR para pagar Bs/ }).click();
    await pagarConReintentos(c);
    await expect(c.getByTestId("estado-pedido")).toContainText("Tu pago está guardado", CHAIN);
    await expect(p.getByTestId("desviar")).toBeEnabled({ timeout: 30_000 });
    return { storage: await ctx.storageState() };
  } finally {
    await ctx.close();
  }
}

// ---------- El video ----------

test("video de la demo v3 (3 minutos o menos)", async ({ browser, baseURL }) => {
  const APP = baseURL!;
  // El guion: los bloques dan exactamente el texto de la voz, de 1 o 2 líneas, sin palabras prohibidas ni "localhost".
  for (const e of guion.escenas) {
    expect(e.bloques.join(" ").replace(/\n/g, " "), `los bloques de «${e.id}» no dan el texto de la voz`).toBe(e.voz);
    for (const b of e.bloques) {
      revisarTexto(b, `el guion («${e.id}»)`);
      expect(b.split("\n").length, `bloque de más de dos líneas en «${e.id}»`).toBeLessThanOrEqual(2);
    }
  }
  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(RAW, { recursive: true });
  const SELLER_WA = process.env.E2E_SELLER_WA!;
  // Las cuentas locales de la vendedora y del comprador (distintas, en el mismo origen), de escena en escena.
  const cuentas: Cuentas = {};
  const avisos: string[] = [];
  const fotoGuia = await fotoDeGuia(browser);

  // Fuera de cámara: la vendedora ya tiene su tienda con el mismo WhatsApp que el simulador del bot.
  await fueraDeCamara(browser, cuentas, async (p) => {
    await p.goto(`/vender?wa=${SELLER_WA}`);
    await p.getByLabel("Nombre de la tienda").fill("Tienda Sofi");
    await p.getByLabel("Tu ciudad").selectOption("Santa Cruz");
    await p.getByRole("button", { name: "Continuar" }).click();
    await expect(p.getByLabel("Número de WhatsApp")).toHaveValue(SELLER_WA);
    await p.getByRole("button", { name: "Continuar" }).click();
    await p.getByRole("button", { name: "Crear mi cuenta de cobro y continuar" }).click();
    await p.waitForURL("**/panel**", CHAIN);
  });

  // 0:35–0:55 · La vendedora crea el link desde WhatsApp (simulador del bot, contra la app real).
  let url = "";
  await clip(browser, "bot", null, async (p) => {
    await p.goto(SIM);
    const mensaje = p.getByLabel("Mensaje");
    await expect(mensaje).toBeVisible();
    await expect(p.locator("#chat .pill").first()).toBeVisible();
    await p.waitForTimeout(500);
    marcarInicio();
    await narrar(p, V("bot")[0], async () => {
      await p.waitForTimeout(700);
      await escribir(mensaje, "vendo celular Samsung A54 a 1800 bs entrega 3 días");
      await mensaje.press("Enter");
    });
    const link = p.locator('[data-testid="bot-msg"] a[href*="/p/celular-samsung-a54-"]').first();
    await expect(link).toBeVisible({ timeout: 60_000 });
    url = (await link.getAttribute("href"))!;
    await expect(p.getByTestId("bot-msg").filter({ hasText: /PP-[2-9A-HJKMNP-Z]{8}/ }).first()).toBeVisible();
    await expect(p.getByTestId("bot-msg").filter({ hasText: "Reenvíale esto a tu cliente" })).toBeVisible({ timeout: 30_000 });
    await narrar(p, V("bot")[1], async () => {
      await p.waitForTimeout(600);
      // El último link es el del mensaje para reenviarle al cliente (el chat queda abajo, en ese mensaje).
      await resaltar(p.locator('[data-testid="bot-msg"] a[href*="/p/celular-samsung-a54-"]').last(), 2400);
    });
    await shot(p, "01-bot-link-whatsapp");
    await p.waitForTimeout(600);
  });
  const slug = new URL(url).pathname.split("/p/")[1];
  expect(slug).toMatch(/^celular-samsung-a54-[a-z0-9-]+$/);

  // 0:55–1:20 · El comprador abre el link en su celular: «Dos salidas», el QR, «Esperando tu pago…»; paga (rampa simulada).
  await clip(browser, "comprador", cuentas, async (p) => {
    await escenario(p, { rol: "📱 Celular del comprador", titulo: "Ana, en Cochabamba", detalle: "Le llegó el link de Tienda Sofi por WhatsApp.", ruta: `/p/${slug}` });
    const c = enCelular(p);
    await expect(c.getByTestId("promesa")).toContainText("Solo tiene dos salidas", { timeout: 30_000 });
    await p.waitForTimeout(700);
    marcarInicio();
    await narrar(p, V("comprador")[0], async () => {
      await p.waitForTimeout(1000);
      await suave(c.getByTestId("promesa"));
    });
    await narrar(p, V("comprador")[1], async () => {
      await resaltar(c.getByTestId("salida-tienda"), 2200);
      await p.waitForTimeout(2000);
      await resaltar(c.getByTestId("salida-comprador"), 2400);
    });
    await shot(p, "02-comprador-dos-salidas");
    await c.getByTestId("barra-pagar").getByRole("button", { name: /Pagar Bs .* con QR/ }).click();
    await expect(c.getByTestId("datos-entrega")).toBeVisible();
    await escribir(c.getByLabel("Quién recibe"), "Ana Pérez");
    await c.getByLabel("Ciudad de destino").selectOption("Cochabamba");
    await p.waitForTimeout(400);
    await c.getByRole("button", { name: /Ver el QR para pagar Bs/ }).click();
    await expect(c.getByTestId("esperando-pago")).toHaveText("Esperando tu pago…");
    await expect(c.getByTestId("rampa-simulada")).toHaveText("Rampa simulada en testnet. En producción la hace una entidad certificada por ASFI.");
    await p.waitForTimeout(700);
    await narrar(p, V("comprador")[2], async () => {
      await suave(c.getByTestId("esperando-pago"));
    });
    await shot(p, "03-comprador-qr-esperando-pago");
    await narrar(p, V("comprador")[3], async () => {
      await resaltar(c.getByTestId("rampa-simulada"), 2600);
      await p.waitForTimeout(1800);
      await pagarConReintentos(c);
    });
    await expect(c.getByTestId("estado-pedido")).toContainText("Tu pago está guardado", CHAIN);
    await mostrar(p, null);
    await c.locator("body").evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await p.waitForTimeout(2600);
  });

  // 1:20–1:40 · La vendedora despacha y saca una foto de la guía: la huella va en el registro del envío (mark_shipped).
  await clip(browser, "despacho", cuentas, async (p) => {
    await escenario(p, { rol: "📱 Celular de la vendedora", titulo: "Tienda Sofi, en Santa Cruz", detalle: "Su cliente ya pagó: ahora despacha.", ruta: "/panel" });
    const c = enCelular(p);
    const pendiente = c.getByTestId(`pendiente-${slug}`);
    await expect(pendiente).toBeVisible({ timeout: 60_000 });
    const card = c.getByTestId(`pedido-${slug}`);
    const evidencia = card.getByTestId(`evidencia-guia-${slug}`);
    await p.waitForTimeout(600);
    marcarInicio();
    await narrar(p, V("despacho")[0], async () => {
      await suave(pendiente);
      await pendiente.getByRole("button").click(); // "Pendientes de hoy" baja al pedido y lo resalta
      await p.waitForTimeout(1200);
      await expect(card.getByTestId("estado")).toHaveText("Pagado (despacha)");
      await card.getByLabel("Empresa de envío").selectOption("Trans Copacabana (encomiendas)");
      await escribir(card.getByLabel("Número de guía"), GUIA);
      await card.getByLabel("Peso declarado (kg)").fill("0,4");
      await suave(card.getByTestId("fotos-envio"));
      await sacarFotoDeGuia(p, card, slug, fotoGuia);
      await expect(evidencia.getByTestId("huella")).toBeVisible({ timeout: 30_000 });
    });
    await shot(p, "04-vendedora-foto-de-la-guia");
    await narrar(p, V("despacho")[1], async () => {
      await resaltar(evidencia, 2800);
      await p.waitForTimeout(2200);
      const imei = card.getByLabel(/IMEI del celular/);
      if (await imei.count()) {
        await suave(imei);
        await escribir(imei, IMEI);
      }
      const enviar = card.getByRole("button", { name: "Marcar como enviado" });
      await suave(enviar);
      await enviar.click();
      await expect(card.getByTestId("estado")).toHaveText("Enviado", CHAIN);
    });
    await suave(card, "start");
    await p.waitForTimeout(2400);
  });
  // La huella de la foto quedó en la evidencia que registró mark_shipped: empresa|guía|peso|…|<sha256 de la guía>.
  const enviado = (await (await fetch(`${APP}/api/orders/${slug}`)).json()) as { order: { shipped_evidence: string | null } };
  expect(enviado.order.shipped_evidence ?? "").toMatch(/[0-9a-f]{64}$/);

  // 2:00–2:20 · /probar: «Intenta desviar la plata» y el error del contrato en rojo. Se graba acá (y no al final) porque
  // en /probar el envío vence a los 2 minutos del pago; además, mientras tanto corre la espera de 1 minuto del modo demo
  // para «Pagar al vendedor» del pedido principal. En el video va después del cobro (07-probar).
  let errorProbar: string | null = null;
  if (await probarDisponible(APP)) {
    try {
      const prueba = await prepararProbar(browser);
      await clip(
        browser,
        "probar",
        prueba,
        async (p) => {
          await p.goto("/probar");
          await expect(p.getByTestId("paso-registro-pago")).toHaveAttribute("data-hecho", "si", { timeout: 60_000 });
          const desviar = p.getByTestId("desviar");
          await expect(desviar).toBeEnabled({ timeout: 30_000 });
          await expect(p.frameLocator('iframe[name="comprador"]').getByTestId("estado-pedido")).toContainText("Tu pago está guardado", { timeout: 60_000 });
          await p.waitForTimeout(900);
          marcarInicio();
          await narrar(p, V("probar")[0], async () => {
            await p.waitForTimeout(900);
            await suave(p.getByTestId("desvio"));
            await resaltar(desviar, 1600);
            await p.waitForTimeout(1200);
            await desviar.click();
          });
          const error = p.getByTestId("desvio-error");
          await expect(error).toHaveText(/^Error\(Contract, #\d+\)$/, CHAIN);
          await expect(p.getByTestId("desvio-resultado")).toContainText("Rechazado por el contrato");
          await expect(error).toHaveClass(/text-rose-700/); // en rojo
          await suave(p.getByTestId("desvio-resultado"));
          await narrar(p, V("probar")[1], async () => {
            await resaltar(error, 3200);
          });
          await shot(p, "07-probar-desvio-rechazado");
          await p.waitForTimeout(1200);
        },
        async (ctx) => {
          // Retoma la prueba preparada sin contarla otra vez en el límite por IP de /probar.
          await ctx.addInitScript(() => {
            try {
              if (location.pathname === "/probar") sessionStorage.setItem("pp.probar.sesion", "1");
            } catch {}
          });
        },
      );
    } catch (e) {
      errorProbar = (e as Error).message;
      console.error(`[video] La escena de /probar falló y queda fuera del video: ${errorProbar}`);
    }
  }

  // Fuera de cámara: "Pagar al vendedor" se habilita 1 minuto después del envío (modo demo).
  for (let i = 0; i < 60; i++) {
    const v = (await (await fetch(`${APP}/api/orders/${slug}`)).json()) as { order: { confirm_after: number | null } };
    if (v.order.confirm_after && Date.now() > v.order.confirm_after + 2000) break;
    await new Promise((r) => setTimeout(r, 3000));
  }

  // 1:40–2:00 · El comprador confirma, la vendedora cobra y la transacción aparece en stellar.expert.
  const hashes: { pago: string | null; envio: string | null; confirmacion: string | null; pedido: string | null; slug: string } = {
    pago: null,
    envio: null,
    confirmacion: null,
    pedido: null,
    slug,
  };
  await clip(browser, "cobro", cuentas, async (p) => {
    await escenario(p, { rol: "📱 Celular del comprador", titulo: "Ana recogió el celular", detalle: "Lo revisó en la terminal de Cochabamba.", ruta: `/p/${slug}` });
    const c = enCelular(p);
    const paso = c.getByTestId("proximo-paso");
    await expect(paso.getByRole("button", { name: "Ya lo recogí" })).toBeVisible({ timeout: 60_000 });
    await p.waitForTimeout(600);
    marcarInicio();
    await narrar(p, V("cobro")[0], async () => {
      await suave(paso);
      await paso.getByRole("button", { name: "Ya lo recogí" }).click();
      const pagarVendedor = c.getByRole("button", { name: "Pagar al vendedor (irreversible)" });
      await expect(pagarVendedor).toBeEnabled({ timeout: 150_000 });
      await suave(pagarVendedor);
      await pagarVendedor.click();
      await expect(c.getByTestId("pregunta-confirmar")).toContainText("¿Tienes el producto en tus manos y lo revisaste?");
      await suave(c.getByTestId("pregunta-confirmar"));
      await p.waitForTimeout(800);
      await c.getByRole("button", { name: "Sí, lo tengo y está bien" }).click();
    });
    await expect(c.getByTestId("estado-pedido")).toContainText("Se pagó al vendedor", CHAIN);
    await c.locator("body").evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await p.waitForTimeout(1600);

    // Los 3 hashes del flujo feliz (para el cierre) y la confirmación, que es la que se abre en stellar.expert.
    const vista = (await (await fetch(`${APP}/api/orders/${slug}`)).json()) as { order: { code: string | null }; txs: { kind: string; hash: string | null }[] };
    const hash = (kind: string) => vista.txs.filter((t) => t.kind === kind && t.hash).at(-1)?.hash ?? null;
    Object.assign(hashes, { pago: hash("fondeo"), envio: hash("envio"), confirmacion: hash("liberacion"), pedido: vista.order.code });
    expect(hashes.pago && hashes.envio && hashes.confirmacion, `faltan hashes del flujo feliz: ${JSON.stringify(hashes)}`).toBeTruthy();

    await cambiarCelular(p, { rol: "📱 Celular de la vendedora", titulo: "Tienda Sofi cobró", detalle: "Le llega el precio completo.", ruta: "/panel" });
    const saldo = c.getByTestId("saldo");
    await expect(saldo).toHaveText(/^Bs [1-9]/, { timeout: 60_000 });
    await narrar(p, V("cobro")[1], async () => {
      await p.waitForTimeout(500);
      await resaltar(saldo.locator(".."), 2600);
    });
    await shot(p, "05-vendedora-cobro");

    if (await verEnStellarExpert(p, hashes.confirmacion!)) {
      await p
        .evaluate(() => {
          // Resalta el estado de la transacción en stellar.expert (mejor esfuerzo: es una página de terceros).
          const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          for (let n = w.nextNode(); n; n = w.nextNode()) {
            if (n.nodeValue?.trim() === "Successful" && n.parentElement) {
              Object.assign(n.parentElement.style, { boxShadow: "0 0 0 3px rgba(245,158,11,.95)", borderRadius: "6px" });
              break;
            }
          }
        })
        .catch(() => {});
      await p.waitForTimeout(800);
      await narrar(p, V("cobro")[2]);
      await shot(p, "06-stellar-expert-confirmacion");
    } else {
      avisos.push("stellar.expert no mostró la transacción de confirmación: la escena de cobro quedó sin esa parte.");
      await narrar(p, V("cobro")[2]);
    }
    await p.waitForTimeout(800);
  });
  fs.writeFileSync(path.join(CLIPS, "hashes.json"), JSON.stringify(hashes, null, 2));

  // Une los clips con las placas en el mp4 de 1280x720 (o deja los webm si no hay ffmpeg).
  fs.rmSync(RAW, { recursive: true, force: true });
  execFileSync("node", [path.join(__dirname, "..", "scripts", "video-join.mjs")], { stdio: "inherit", env: { ...process.env, PP_VIDEO_DIR: OUT_DIR } });
  for (const a of avisos) console.warn(`[video] ⚠️  ${a}`);
  expect(errorProbar, "la escena de /probar falló: el video se armó sin ella").toBeNull();
});
