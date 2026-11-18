import { Keypair } from "@stellar/stellar-sdk";
import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Video de la demo (npm run demo:video): recorrido completo en TESTNET, grabado por escenas (clips),
// con subtítulos en español inyectados en la página. Al final, scripts/video-join.mjs une los clips
// en pago-protegido/demo/video/pago-protegido-demo.mp4 (1280x720, ~1:52): acorta las esperas a testnet
// y agrega las placas inicial y final.

const VIDEO_DIR = path.resolve(__dirname, "..", "..", "demo", "video");
const CLIPS = path.join(VIDEO_DIR, "clips");
const RAW = path.join(CLIPS, "raw");
const DESKTOP = { width: 1280, height: 720 };
const MOBILE = { width: 390, height: 844 };
const CHAIN = { timeout: 240_000 };
const SIM = process.env.E2E_SIM_URL!;

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

async function sub(page: Page, text: string, ms = 2200) {
  await page.evaluate((t) => (window as unknown as { __ppSub: (t: string) => void }).__ppSub(t), text);
  if (ms) await page.waitForTimeout(ms);
}
async function typeIn(l: Locator, text: string) {
  await l.click();
  await l.pressSequentially(text, { delay: 40 });
}
async function glide(page: Page, px: number) {
  for (let i = 0; i < px / 120; i++) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(80);
  }
}

let clipN = 0;
async function newCtx(browser: Browser, device: "desktop" | "mobile", actor: Actor | null, record: boolean) {
  const size = device === "desktop" ? DESKTOP : MOBILE;
  const ctx = await browser.newContext({
    viewport: size,
    deviceScaleFactor: 1,
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

/** Una escena grabada: contexto nuevo (con la billetera del actor), video propio. */
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

/** Preparación fuera de cámara (mismo contexto y billetera, sin grabar). */
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
    await p.getByRole("button", { name: "Simular pago del banco (testnet)" }).click();
    await expect(ok.or(err).first()).toBeVisible(CHAIN);
    if (await ok.isVisible()) return;
    if (i >= 3) throw new Error(`El pago falló 3 veces: ${await err.first().innerText()}`);
  }
}


test("video de la demo (2–3 min)", async ({ browser }) => {
  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(RAW, { recursive: true });
  const seller: Actor = {};
  const buyer: Actor = {};
  const buyer2: Actor = {};
  const SELLER_WA = process.env.E2E_SELLER_WA!;

  // Fuera de cámara: la vendedora ya tiene su tienda con el mismo WhatsApp que el simulador.
  await offCamera(browser, "desktop", seller, async (p) => {
    await p.goto(`/vender?wa=${SELLER_WA}`);
    await p.getByLabel("Nombre de la tienda").fill("Tienda Sofi");
    await p.getByRole("button", { name: "Continuar" }).click();
    await p.getByRole("button", { name: "Continuar" }).click();
    await p.getByRole("button", { name: "Crear mi billetera y continuar" }).click();
    await p.waitForURL("**/panel**", CHAIN);
  });

  // (a) La vendedora crea el link desde el simulador de WhatsApp.
  let url = "";
  await clip(browser, "chat-vender", "desktop", null, async (p) => {
    await p.goto(SIM);
    await sub(p, "1. La vendedora crea su link de pago desde WhatsApp", 1500);
    await typeIn(p.getByLabel("Mensaje"), "vendo zapatillas nike 40 a 450 bs entrega 3 días");
    await p.getByLabel("Mensaje").press("Enter");
    const link = p.locator('[data-testid="bot-msg"] a[href*="/p/zapatillas-nike-40-"]').first();
    await expect(link).toBeVisible({ timeout: 60_000 });
    url = (await link.getAttribute("href"))!;
    await sub(p, "El asistente crea el pedido en la app y le devuelve el link, listo para compartir", 3500);
  });
  const slug = url.split("/p/")[1];
  const app = new URL(url).origin;

  // (b) El comprador paga en el celular y aparece el sello "Contrato verificado".
  await clip(browser, "comprador-paga", "mobile", buyer, async (p) => {
    await p.goto(url);
    await sub(p, "2. El comprador abre el link en su celular", 2000);
    await glide(p, 720);
    await sub(p, "Antes de pagar ve cómo lo protegemos", 1600);
    await p.getByRole("button", { name: /Pagar protegido/ }).click();
    await sub(p, "Paga con QR (en testnet la rampa del banco está simulada)", 1800);
    await typeIn(p.getByLabel("Tu WhatsApp para avisarte"), "591 76543210");
    await sub(p, "Se crea el contrato de esta compra y la plata queda guardada ahí", 0);
    await payWithRetry(p);
    await sub(p, "Tu plata está protegida: nadie puede tocarla, ni siquiera la plataforma", 2500);
    await p.getByTestId("sello-verificado").first().scrollIntoViewIfNeeded();
    await sub(p, "✔ Contrato verificado: código de Trustless Work y roles del guardián, leídos de la red", 3800);
  });

  // (c) La vendedora recibe el aviso y marca enviado desde el link del asistente.
  let shipHref = "";
  await clip(browser, "chat-te-pagaron", "desktop", null, async (p) => {
    await p.goto(SIM);
    await expect(p.getByTestId("bot-msg").filter({ hasText: "¡Te pagaron!" }).last()).toBeVisible({ timeout: 90_000 });
    await sub(p, "La vendedora recibe el aviso en WhatsApp: ¡Te pagaron!", 2800);
    await typeIn(p.getByLabel("Mensaje"), `enviado ${slug.slice(-6)} SRV-2026-130077`);
    await p.getByLabel("Mensaje").press("Enter");
    const a = p.locator('[data-testid="bot-msg"] a[href*="/panel?enviar="]').last();
    await expect(a).toBeVisible({ timeout: 30_000 });
    shipHref = (await a.getAttribute("href"))!;
    await sub(p, "3. Despacha y el asistente le da el link para marcar enviado", 2800);
  });
  await clip(browser, "vendedora-envia", "desktop", seller, async (p) => {
    await p.goto(shipHref);
    const card = p.getByTestId(`pedido-${slug}`);
    await expect(card.getByLabel("Código de encomienda o link de la foto del envío")).toHaveValue("SRV-2026-130077", { timeout: 60_000 });
    await sub(p, "Firma el envío con su billetera; la comisión de red la paga la plataforma", 2500);
    await card.getByRole("button", { name: "Marcar como enviado" }).click();
    await expect(card.getByTestId("estado")).toHaveText("Enviado", CHAIN);
    await sub(p, "Queda registrado en el contrato, con el código de encomienda", 2500);
  });

  // (d) El comprador confirma y la vendedora cobra al instante.
  await clip(browser, "comprador-confirma", "mobile", buyer, async (p) => {
    await p.goto(url);
    await sub(p, "4. Le llega el pedido y toca «Recibí conforme»", 1800);
    await p.getByRole("button", { name: /Recibí conforme/ }).click();
    await expect(p.getByTestId("estado-pedido")).toContainText("Pago liberado al vendedor", CHAIN);
    await p.getByTestId("desglose").scrollIntoViewIfNeeded();
    await sub(p, "La vendedora cobra al instante: 97,7% para ella, 2% plataforma y 0,3% Trustless Work", 4000);
  });
  await clip(browser, "chat-liberado", "desktop", null, async (p) => {
    await p.goto(SIM);
    await expect(p.getByTestId("bot-msg").filter({ hasText: "Liberado" }).last()).toBeVisible({ timeout: 90_000 });
    await sub(p, "Y el asistente se lo confirma por WhatsApp: ¡Liberado!", 3000);
  });

  // (e) Segunda compra con reclamo y el árbitro 70/30. Preparación fuera de cámara: link, pago y envío.
  const secret = seller.storage!.origins.flatMap((o) => o.localStorage).find((x) => x.name === "pp.billetera.vendedor")!.value;
  const sellerPubkey = Keypair.fromSecret(secret).publicKey();
  const res = await fetch(`${app}/api/links`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sellerPubkey, product: "Audífonos Sony WH-1000", description: "Con estuche.", priceBs: 520, deliveryDays: 5 }),
  });
  const slug2 = ((await res.json()) as { slug: string }).slug;
  const url2 = `${app}/p/${slug2}`;
  await offCamera(browser, "mobile", buyer2, async (p) => {
    await p.goto(url2);
    await p.getByRole("button", { name: /Pagar protegido/ }).click();
    await payWithRetry(p);
  });
  await offCamera(browser, "desktop", seller, async (p) => {
    await p.goto("/panel");
    const card = p.getByTestId(`pedido-${slug2}`);
    await expect(card.getByTestId("estado")).toHaveText("Pagado (despacha)", { timeout: 60_000 });
    await card.getByLabel("Código de encomienda o link de la foto del envío").fill("OLVA-90455");
    await card.getByRole("button", { name: "Marcar como enviado" }).click();
    await expect(card.getByTestId("estado")).toHaveText("Enviado", CHAIN);
  });
  await clip(browser, "reclamo", "mobile", buyer2, async (p) => {
    await p.goto(url2);
    await sub(p, "5. Otra compra: los audífonos llegaron con otro modelo", 2200);
    await p.getByRole("button", { name: "Tengo un problema" }).click();
    await p.getByLabel("Motivo").selectOption("No es lo que pedí");
    await typeIn(p.getByLabel("Cuéntanos más"), "Llegó otro modelo, sin cancelación de ruido.");
    await p.getByRole("button", { name: "Enviar reclamo" }).click();
    await expect(p.getByTestId("estado-pedido")).toContainText("Reclamo abierto", CHAIN);
    await sub(p, "La plata queda congelada en el contrato hasta que decida el árbitro", 3000);
  });
  await clip(browser, "arbitro", "desktop", null, async (p) => {
    await p.goto("/arbitro");
    await p.getByLabel("Clave del árbitro").fill(process.env.ARBITRO_PANEL_KEY ?? "");
    await p.getByRole("button", { name: "Entrar" }).click();
    const d = p.getByTestId(`disputa-${slug2}`);
    await expect(d).toBeVisible({ timeout: 60_000 });
    await sub(p, "El árbitro ve la evidencia de los dos lados y el estado del contrato", 3000);
    await d.getByTestId("slider").scrollIntoViewIfNeeded();
    await d.getByTestId("slider").fill("70");
    await expect(d.getByTestId("fuente-vista-previa")).toContainText("pp_arbiter.quote", { timeout: 60_000 });
    await sub(p, "Reparte 70% para el comprador y 30% para el vendedor (vista previa de pp_arbiter)", 3500);
    await d.getByRole("button", { name: "Probar: mandar la plata a otra cuenta" }).click();
    const r = d.getByTestId("resultado-desvio");
    await expect(r).toContainText("Rechazado por el contrato", { timeout: 60_000 });
    await r.scrollIntoViewIfNeeded();
    await sub(p, "¿Y si intenta mandar la plata a otra cuenta? El contrato lo rechaza: Error(Contract, #12)", 4500);
    await d.getByRole("button", { name: "Resolver" }).click();
    await expect(p.getByText("Resueltas recientemente")).toBeVisible(CHAIN);
    await p.getByText("Resueltas recientemente").scrollIntoViewIfNeeded();
    await sub(p, "Resuelto on-chain: cada parte recibe lo suyo y no existe otro destino posible", 3200);
  });

  // (f) Transparencia.
  await clip(browser, "transparencia", "desktop", null, async (p) => {
    await p.goto("/transparencia");
    await expect(p.getByTestId("compras-protegidas")).toBeVisible({ timeout: 120_000 });
    await sub(p, "6. Transparencia: métricas on-chain de todas las compras, que cualquiera puede verificar", 3000);
    await glide(p, 840);
    await p.waitForTimeout(1500);
    await glide(p, 840);
    await p.waitForTimeout(2500);
  });

  // Une los clips en un mp4 de 1280x720 (o deja los webm y el comando si no hay ffmpeg).
  fs.rmSync(RAW, { recursive: true, force: true });
  execFileSync("node", [path.join(__dirname, "..", "scripts", "video-join.mjs")], { stdio: "inherit" });
});
