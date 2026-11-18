import { Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Video de la demo v2 (npm run demo:video): recorrido en TESTNET con los contratos v2, grabado por escenas
// (clips) con subtítulos en español inyectados en la página. Guion:
//   1. la vendedora le escribe al bot "vendo celular Samsung A54 a 1800 bs entrega 3 días" y recibe el link;
//   2. el comprador paga (la rampa simulada lo dice en pantalla);
//   3. la vendedora marca enviado con empresa, guía e IMEI (pp_guardian.mark_shipped);
//   4. el comprador confirma con la pregunta obligatoria;
//   5. se le paga a la vendedora y se ve el link al registro público;
//   6. el revisor intenta mandar la plata a una tercera cuenta y el contrato lo rechaza.
// Además guarda 6 capturas clave en pago-protegido/demo/v2/. Al final, scripts/video-join.mjs une los clips en
// pago-protegido/demo/v2/pago-protegido-demo-v2.mp4 (1280x720, 2 minutos o menos).

const OUT_DIR = path.resolve(__dirname, "..", "..", "demo", "v2");
const CLIPS = path.join(OUT_DIR, "clips");
const RAW = path.join(CLIPS, "raw");
const DESKTOP = { width: 1280, height: 720 };
const MOBILE = { width: 390, height: 844 };
const CHAIN = { timeout: 240_000 };
const SIM = process.env.E2E_SIM_URL!;
const IMEI = "356938035643809";

type State = Awaited<ReturnType<BrowserContext["storageState"]>>;
type Actor = { storage?: State };

/** Overlay de subtítulos: sobrevive a las navegaciones dentro de la misma pestaña (sessionStorage). */
function subtitles() {
  const KEY = "__pp_sub";
  const render = (text: string | null) => {
    let el = document.getElementById("pp-sub");
    if (!text) return el?.remove();
    if (!el) {
      el = document.createElement("div");
      el.id = "pp-sub";
      const small = window.innerWidth < 600;
      Object.assign(el.style, {
        position: "fixed",
        left: "50%",
        bottom: small ? "18px" : "26px",
        transform: "translateX(-50%)",
        zIndex: "2147483647",
        background: "rgba(15,23,42,.9)",
        color: "#fff",
        padding: small ? "10px 14px" : "12px 22px",
        borderRadius: "14px",
        font: `600 ${small ? 15 : 21}px/1.35 system-ui, -apple-system, sans-serif`,
        width: "max-content",
        maxWidth: small ? "92vw" : "80vw",
        textAlign: "center",
        boxShadow: "0 10px 30px rgba(0,0,0,.3)",
        pointerEvents: "none",
      });
      (document.body ?? document.documentElement).appendChild(el);
    }
    el.textContent = text;
  };
  (window as unknown as { __ppSub: (t: string) => void }).__ppSub = (t: string) => {
    sessionStorage.setItem(KEY, t);
    render(t);
  };
  document.addEventListener("DOMContentLoaded", () => render(sessionStorage.getItem(KEY)));
}

// Los subtítulos también respetan la lista de palabras prohibidas de las pantallas de usuarios.
const PROHIBIDAS = [/garant[ií]a/i, /\bseguro\b/i, /custodia/i, /arbitraje/i, /árbitro/i, /100\s?%/, /plataforma de pagos/i, /cripto/i, /\btoken/i, /\bwallet\b/i, /\bllaves?\b/i, /blockchain/i];

async function sub(page: Page, text: string, ms = 2200) {
  for (const re of PROHIBIDAS) expect(text, `palabra prohibida ${re} en el subtítulo`).not.toMatch(re);
  await page.evaluate((t) => (window as unknown as { __ppSub: (t: string) => void }).__ppSub(t), text);
  if (ms) await page.waitForTimeout(ms);
}
async function typeIn(l: Locator, text: string) {
  await l.click();
  await l.pressSequentially(text, { delay: 35 });
}
async function glide(page: Page, px: number) {
  for (let i = 0; i < px / 120; i++) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(70);
  }
}
/** Captura clave (lo que se ve en pantalla, con el subtítulo) en pago-protegido/demo/v2/. */
async function shot(page: Page, name: string) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
}

let clipN = 0;
async function newCtx(browser: Browser, device: "desktop" | "mobile", actor: Actor | null, record: boolean) {
  const size = device === "desktop" ? DESKTOP : MOBILE;
  const ctx = await browser.newContext({
    viewport: size,
    deviceScaleFactor: device === "mobile" ? 2 : 1,
    isMobile: device === "mobile",
    hasTouch: device === "mobile",
    locale: "es-BO",
    timezoneId: "America/La_Paz",
    storageState: actor?.storage,
    recordVideo: record ? { dir: RAW, size } : undefined,
  });
  await ctx.addInitScript(subtitles);
  return ctx;
}

/** Una escena grabada: contexto nuevo (con la cuenta local del actor), video propio. */
async function clip(browser: Browser, name: string, device: "desktop" | "mobile", actor: Actor | null, fn: (p: Page) => Promise<void>) {
  const ctx = await newCtx(browser, device, actor, true);
  const page = await ctx.newPage();
  await fn(page);
  if (actor) actor.storage = await ctx.storageState();
  const video = page.video()!;
  await ctx.close();
  await video.saveAs(path.join(CLIPS, `${String(++clipN).padStart(2, "0")}-${name}.webm`));
  await video.delete();
}

/** Preparación fuera de cámara (mismo contexto y cuenta local, sin grabar). */
async function offCamera(browser: Browser, device: "desktop" | "mobile", actor: Actor, fn: (p: Page) => Promise<void>) {
  const ctx = await newCtx(browser, device, actor, false);
  await fn(await ctx.newPage());
  actor.storage = await ctx.storageState();
  await ctx.close();
}

async function payWithRetry(p: Page) {
  const ok = p.getByTestId("estado-pedido");
  const err = p.getByTestId("error");
  for (let i = 1; ; i++) {
    await p.getByRole("button", { name: "Simular pago del banco (modo práctica)" }).click();
    await expect(ok.or(err).first()).toBeVisible(CHAIN);
    if (await ok.isVisible()) return;
    if (i >= 3) throw new Error(`El pago falló 3 veces: ${await err.first().innerText()}`);
  }
}

// ---- API directa (fuera de cámara): segunda compra con reclamo para la escena del revisor ----
async function api<T>(base: string, p: string, body?: unknown): Promise<T> {
  const r = await fetch(base + p, { method: body ? "POST" : "GET", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(`${p}: ${j.error}`);
  return j;
}
async function signRun(base: string, kp: Keypair, prepared: { xdr: string } | undefined) {
  let cur: { xdr: string; next?: { xdr: string } } | undefined = prepared;
  while (cur) {
    const tx = TransactionBuilder.fromXDR(cur.xdr, Networks.TESTNET);
    tx.sign(kp);
    cur = (await api<{ next?: { xdr: string } }>(base, "/api/tx/submit", { signedXdr: tx.toXDR() })).next;
  }
}

test("video de la demo v2 (2 minutos o menos)", async ({ browser }) => {
  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(RAW, { recursive: true });
  const seller: Actor = {};
  const buyer: Actor = {};
  const SELLER_WA = process.env.E2E_SELLER_WA!;

  // Fuera de cámara: la vendedora ya tiene su tienda con el mismo WhatsApp que el simulador.
  await offCamera(browser, "desktop", seller, async (p) => {
    await p.goto(`/vender?wa=${SELLER_WA}`);
    await p.getByLabel("Nombre de la tienda").fill("Tienda Sofi");
    await p.getByLabel("Tu ciudad").selectOption("Santa Cruz");
    await p.getByRole("button", { name: "Continuar" }).click();
    await p.getByRole("button", { name: "Continuar" }).click();
    await p.getByRole("button", { name: "Crear mi cuenta de cobro y continuar" }).click();
    await p.waitForURL("**/panel**", CHAIN);
  });

  // 1. La vendedora crea el link escribiéndole al bot.
  let url = "";
  await clip(browser, "bot-link", "desktop", null, async (p) => {
    await p.goto(SIM);
    await sub(p, "1. La vendedora le escribe al asistente de WhatsApp", 1200);
    await typeIn(p.getByLabel("Mensaje"), "vendo celular Samsung A54 a 1800 bs entrega 3 días");
    await p.getByLabel("Mensaje").press("Enter");
    const link = p.locator('[data-testid="bot-msg"] a[href*="/p/celular-samsung-a54-"]').first();
    await expect(link).toBeVisible({ timeout: 60_000 });
    url = (await link.getAttribute("href"))!;
    await expect(p.getByTestId("bot-msg").filter({ hasText: /PP-\d{4,5}/ }).first()).toBeVisible();
    await sub(p, "Recibe su link de pago con código PP, listo para mandárselo a su cliente", 1800);
    await shot(p, "01-bot-link-whatsapp");
    await p.waitForTimeout(800);
  });
  const slug = url.split("/p/")[1];
  const app = new URL(url).origin;

  // 2. El comprador paga en el celular; la rampa simulada lo dice en pantalla.
  await clip(browser, "comprador-paga", "mobile", buyer, async (p) => {
    await p.goto(url);
    await sub(p, "2. El comprador, en otra ciudad, abre el link en su celular", 1600);
    await glide(p, 600);
    await p.getByLabel("Quién recibe").fill("Ana Pérez");
    await p.getByLabel("Ciudad de destino").selectOption("Cochabamba");
    await p.getByLabel(/Tu WhatsApp para avisarte/).fill("591 76543210");
    await p.getByRole("button", { name: /Pagar Bs .* con QR/ }).click();
    await expect(p.getByTestId("rampa-simulada")).toHaveText("Rampa simulada en testnet. En producción la hace una entidad certificada por ASFI.");
    await p.getByTestId("rampa-simulada").scrollIntoViewIfNeeded();
    await sub(p, "Paga con QR. Aquí el banco está simulado y la pantalla lo dice", 1600);
    await shot(p, "02-comprador-rampa-simulada");
    await sub(p, "Se crea el contrato de esta compra y la plata queda bloqueada ahí", 0);
    await payWithRetry(p);
    await expect(p.getByTestId("estado-pedido")).toContainText("Tu pago está guardado", CHAIN);
    await p.getByTestId("registro-publico").scrollIntoViewIfNeeded();
    await sub(p, "Solo puede ir a la vendedora o volver al comprador. El despacho tiene plazo.", 2600);
  });

  // 3. La vendedora despacha y registra empresa, guía e IMEI (pp_guardian.mark_shipped).
  await clip(browser, "vendedora-envia", "desktop", seller, async (p) => {
    await p.goto("/panel");
    const card = p.getByTestId(`pedido-${slug}`);
    await expect(card.getByTestId("estado")).toHaveText("Pagado (despacha)", { timeout: 60_000 });
    await card.scrollIntoViewIfNeeded();
    await sub(p, "3. La vendedora ve a quién enviar y hasta cuándo despachar", 1800);
    await card.getByLabel("Empresa de envío").selectOption("Trans Copacabana (encomiendas)");
    await typeIn(card.getByLabel("Número de guía"), "SRV-2026-130077");
    await card.getByLabel("Peso declarado (kg)").fill("0,4");
    await typeIn(card.getByLabel(/IMEI del celular/), IMEI);
    await sub(p, "Registra empresa, guía e IMEI. Desde ahora corre el plazo de revisión", 0);
    await card.getByRole("button", { name: "Marcar como enviado" }).click();
    await expect(card.getByTestId("estado")).toHaveText("Enviado", CHAIN);
    await card.getByTestId("plazo").scrollIntoViewIfNeeded();
    await sub(p, "El envío queda fijo en el contrato y ya no se puede cambiar", 1600);
    await shot(p, "03-vendedor-enviado-guia-imei");
  });

  // Fuera de cámara: "Pagar al vendedor" se habilita 1 minuto después del envío (modo demo).
  for (let i = 0; i < 40; i++) {
    const v = await api<{ order: { confirm_after: number | null } }>(app, `/api/orders/${slug}`);
    if (v.order.confirm_after && Date.now() > v.order.confirm_after + 2000) break;
    await new Promise((r) => setTimeout(r, 3000));
  }

  // 4. El comprador revisa el IMEI y confirma con la pregunta obligatoria.
  await clip(browser, "comprador-confirma", "mobile", buyer, async (p) => {
    await p.goto(url);
    await p.getByTestId("imei").scrollIntoViewIfNeeded();
    await sub(p, "4. Le llega el celular: compara el IMEI marcando *#06#", 1800);
    await p.getByRole("button", { name: "Pagar al vendedor (irreversible)" }).click();
    await expect(p.getByTestId("pregunta-confirmar")).toContainText("¿Tienes el producto en tus manos y lo revisaste?");
    await p.getByTestId("pregunta-confirmar").scrollIntoViewIfNeeded();
    await sub(p, "Antes de pagar, una pregunta obligatoria", 1400);
    await shot(p, "04-comprador-pregunta-obligatoria");
    await p.getByRole("button", { name: "Sí, lo tengo y está bien" }).click();
    await expect(p.getByTestId("estado-pedido")).toContainText("Se pagó al vendedor", CHAIN);
    await sub(p, "Listo: se le pagó a la vendedora", 1200);
  });

  // 5. La vendedora cobra y se ve el link al registro público.
  await clip(browser, "vendedora-cobra", "desktop", seller, async (p) => {
    await p.goto("/panel");
    const card = p.getByTestId(`pedido-${slug}`);
    await expect(card.getByTestId("estado")).toHaveText("Liberado", { timeout: 60_000 });
    const registro = card.getByRole("link", { name: /Ver registro público del pedido/ });
    await registro.scrollIntoViewIfNeeded();
    await registro.hover();
    await sub(p, "5. La vendedora cobra el precio completo, y cualquiera puede verlo en el registro público", 2400);
    await shot(p, "05-vendedor-cobrado-registro-publico");
  });

  // Fuera de cámara: otra compra con reclamo ("No llegó"), con cuentas locales de un solo uso.
  const secret = seller.storage!.origins.flatMap((o) => o.localStorage).find((x) => x.name === "pp.billetera.vendedor")!.value;
  const sellerPubkey = Keypair.fromSecret(secret).publicKey();
  const link2 = await api<{ slug: string }>(app, "/api/links", { sellerPubkey, product: "Celular iPhone 12 64 GB", description: "Usado.", priceBs: 2900, deliveryDays: 2, category: "Celular" });
  const buyer2 = Keypair.random();
  const act = await api<{ prepared?: { xdr: string } }>(app, "/api/wallet/activate", { pubkey: buyer2.publicKey() });
  await signRun(app, buyer2, act.prepared);
  for (let i = 1; ; i++) {
    try {
      await signRun(app, buyer2, await api(app, `/api/orders/${link2.slug}/pay`, { buyer: buyer2.publicKey(), recipient: "Luis Rojas", city: "La Paz" }));
      break;
    } catch (e) {
      if (i >= 3) throw e;
    }
  }
  await signRun(app, buyer2, await api(app, `/api/orders/${link2.slug}/action`, { action: "dispute", signer: buyer2.publicKey(), reason: "No llegó", text: "Pasaron los días y no tengo guía." }));

  // 6. El revisor intenta mandar la plata a una tercera cuenta: el contrato lo rechaza.
  await clip(browser, "revisor-desvio", "desktop", null, async (p) => {
    await p.goto("/revisor");
    await p.getByLabel("Clave del revisor").fill(process.env.ARBITRO_PANEL_KEY ?? "");
    await p.getByRole("button", { name: "Entrar" }).click();
    const d = p.getByTestId(`disputa-${link2.slug}`);
    await expect(d).toBeVisible({ timeout: 60_000 });
    await sub(p, "6. Otra compra tiene un reclamo. ¿Y si el revisor quiere quedarse con la plata?", 1800);
    const probar = d.getByRole("button", { name: "Probar: mandar la plata a otra cuenta" });
    await probar.scrollIntoViewIfNeeded();
    await probar.click();
    const r = d.getByTestId("resultado-desvio");
    await expect(r).toContainText("Rechazado por el contrato", { timeout: 60_000 });
    await expect(r).toContainText("Error(Contract, #12)");
    await r.scrollIntoViewIfNeeded();
    await sub(p, "Intenta mandarla a una tercera cuenta: el contrato lo rechaza. Solo puede repartir entre comprador y vendedor.", 2800);
    await shot(p, "06-revisor-desvio-rechazado");
  });

  // Une los clips en un mp4 de 1280x720 (o deja los webm y el comando si no hay ffmpeg).
  fs.rmSync(RAW, { recursive: true, force: true });
  execFileSync("node", [path.join(__dirname, "..", "scripts", "video-join.mjs")], { stdio: "inherit" });
});
