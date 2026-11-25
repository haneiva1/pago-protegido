import { expect, test, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Devolución completa (H-4) con PP_DEVOLUCION_COMPLETA=1, contra Stellar TESTNET (playwright.devolucion.config.ts):
// el vendedor no despacha a tiempo, el contrato devuelve el pago menos las comisiones y Trato le transfiere la
// diferencia al comprador, una sola vez. Lo ven la página del pedido, el bot y el registro público.

const DIR = path.join(__dirname, "capturas");
fs.mkdirSync(DIR, { recursive: true });
const CHAIN = { timeout: 240_000 };
const TX_LINK = 'a[href*="stellar.expert/explorer/testnet/tx/"]';
const HORIZON = "https://horizon-testnet.stellar.org";
// Las mismas palabras prohibidas que el e2e principal revisa en las pantallas del comprador.
const PROHIBIDAS = [
  /\bseguro\b/i, /garant[ií]a/i, /garantizad/i, /100\s?%/, /custodia/i, /plataforma de pagos/i, /pasarela/i, /arbitraje/i, /árbitro/i,
  /cripto/i, /\btoken/i, /stablecoin/i, /\bwallet\b/i, /\bllaves?\b/i, /blockchain/i, /stellar/i,
];

const unidades = (amount: string) => {
  const [ent, dec = ""] = amount.split(".");
  return BigInt(ent) * 10_000_000n + BigInt(dec.padEnd(7, "0"));
};

async function capturar(page: Page, nombre: string) {
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
  const text = await page.locator("body").innerText();
  for (const re of PROHIBIDAS) expect(text, `palabra prohibida ${re} en ${page.url()}`).not.toMatch(re);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(DIR, `${nombre}.png`), fullPage: true });
}

async function nuevoVendedor(browser: Browser, tienda: string, whatsapp: string, ciudad: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/vender");
  await page.getByLabel("Nombre de la tienda").fill(tienda);
  await page.getByLabel("Tu ciudad").selectOption(ciudad);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Número de WhatsApp").fill(whatsapp);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Crear mi cuenta de cobro y continuar" }).click();
  await page.waitForURL("**/panel**", CHAIN);
  await expect(page.getByTestId("tienda")).toHaveText(tienda);
  return page;
}

/** Link con el plazo corto de demo: el plazo de despacho vence a los 2 minutos del pago. */
async function crearLinkDemo(page: Page, producto: string, precio: number) {
  await page.goto("/panel?demo=1");
  await page.getByLabel(/Plazo corto de demo/).check();
  await page.getByLabel("Producto").fill(producto);
  await page.getByLabel("Precio en Bs").fill(String(precio));
  await page.getByTestId("cambiar-opciones").click();
  await page.getByLabel("Días para despachar", { exact: true }).selectOption("1");
  await page.getByLabel(/^Categoría/).selectOption("Electrónica");
  await page.getByLabel(/^Descripción corta/).fill("Nuevos, en caja.");
  await page.getByRole("button", { name: "Crear link" }).click();
  const url = (await page.getByTestId("link-url").textContent())!.trim();
  expect(url).toMatch(/\/p\/[a-z0-9-]+$/);
  return { url, slug: url.split("/p/")[1] };
}

async function pagar(browser: Browser, url: string, whatsapp: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto(url);
  await page.getByLabel("Quién recibe").fill("Ana Pérez");
  await page.getByLabel("Ciudad de destino").selectOption("Sucre");
  await page.getByTestId("mas-datos-entrega").locator("summary").click();
  await page.getByLabel(/Tu WhatsApp para avisarte/).fill(whatsapp);
  await page.getByRole("button", { name: /Pagar Bs .* con QR/ }).click();
  const simular = page.getByRole("button", { name: "Simular pago del banco (modo práctica)" });
  const ok = page.getByTestId("estado-pedido");
  const err = page.getByTestId("error");
  for (let intento = 1; ; intento++) {
    await simular.click();
    await expect(ok.or(err).first()).toBeVisible(CHAIN);
    if (await ok.isVisible()) break;
    const msg = await err.first().innerText();
    console.log(`[e2e] pago, intento ${intento} falló en la red: ${msg}`);
    if (intento >= 3) throw new Error(`El pago falló 3 veces: ${msg}`);
  }
  await expect(ok).toContainText("Tu pago está guardado", CHAIN);
  return page;
}

const botSays = (chat: Page, text: string) => chat.getByTestId("bot-msg").filter({ hasText: text }).last();

test("devolución completa: sin despacho, el comprador recupera todo lo que pagó (contrato + reintegro de Trato), una sola vez", async ({ browser, request }) => {
  const BUYER_WA = process.env.E2E_BUYER_WA!;
  const seller = await nuevoVendedor(browser, "Tienda Sin Despacho", "59170003333", "Oruro");
  const { url, slug } = await crearLinkDemo(seller, "Audífonos Bluetooth", 300);
  const buyer = await pagar(browser, url, BUYER_WA);

  // Nadie toca nada: al vencer el plazo de despacho, la app devuelve el pago (refund_unshipped) y Trato transfiere el
  // reintegro. La página del comprador se actualiza sola.
  await expect(buyer.getByTestId("estado-pedido")).toContainText("Te devolvimos tu pago", { timeout: 6 * 60_000 });
  const rei = buyer.getByTestId("reintegro");
  await expect(rei).toContainText("Te devolvimos todo lo que pagaste", CHAIN);
  await expect(rei).toContainText("Trato te transfirió las comisiones");
  await expect(rei.locator(TX_LINK)).toHaveCount(2);
  await expect(buyer.getByText(/Trato te devolvió las comisiones \(Bs .*\): recibiste todo lo que pagaste/)).toBeVisible();
  await capturar(buyer, "comprador-devolucion-completa");

  // Montos: lo que devolvió el contrato más el reintegro es exactamente lo que pagó.
  const v = await (await request.get(`/api/orders/${slug}`)).json();
  const r = v.reintegro;
  expect(r.estado).toBe("confirmado");
  expect(r.pagado).toBe(v.order.amount_units);
  expect(r.recibido).toBe(v.split.buyer);
  expect(BigInt(r.recibido) + BigInt(r.monto)).toBe(BigInt(r.pagado));
  expect(BigInt(r.monto)).toBe(BigInt(v.split.platform) + BigInt(v.split.tw));
  const hrefs = await rei.locator(TX_LINK).evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
  expect(hrefs).toEqual([expect.stringContaining(r.devolucion_hash), expect.stringContaining(r.hash)]);
  expect(v.txs.find((t: { kind: string }) => t.kind === "devolucion").hash).toBe(r.devolucion_hash);

  // Registro público (Horizon): el reintegro es UN pago de LABUSD de la plataforma al comprador, con fee bump.
  const tx = await (await request.get(`${HORIZON}/transactions/${r.hash}`)).json();
  expect(tx.successful).toBe(true);
  expect(tx.inner_transaction).toBeTruthy();
  expect(tx.fee_account).toBe(tx.source_account);
  const ops = (await (await request.get(`${HORIZON}/transactions/${r.hash}/operations`)).json())._embedded.records;
  expect(ops).toHaveLength(1);
  expect(ops[0]).toMatchObject({ type: "payment", asset_code: "LABUSD", to: v.order.buyer_pubkey, transaction_successful: true });
  expect(unidades(ops[0].amount)).toBe(BigInt(r.monto));

  // Una sola vez: después de más barridos (cada 15 s), sigue habiendo un solo pago de la plataforma al comprador.
  await buyer.waitForTimeout(40_000);
  const v2 = await (await request.get(`/api/orders/${slug}?onchain=1`)).json();
  expect(v2.txs.filter((t: { kind: string }) => t.kind === "reintegro")).toHaveLength(1);
  expect(v2.reintegro).toEqual(r);
  const pagos = (await (await request.get(`${HORIZON}/accounts/${v.order.buyer_pubkey}/payments?limit=200`)).json())._embedded.records;
  expect(pagos.filter((p: { type: string; from?: string }) => p.type === "payment" && p.from === ops[0].from)).toHaveLength(1);

  // Bot: un solo aviso al comprador, con "Te devolvimos todo lo que pagaste" y el link a las dos transacciones.
  const chat = await (await browser.newContext()).newPage();
  await chat.goto(process.env.E2E_SIM_URL!);
  await chat.locator("#as-buyer").click();
  const aviso = botSays(chat, "Te devolvimos todo lo que pagaste");
  await expect(aviso).toBeVisible({ timeout: 90_000 });
  await expect(aviso).not.toContainText("menos las comisiones");
  await expect(chat.getByTestId("bot-msg").filter({ hasText: "el vendedor no marcó el envío" })).toHaveCount(1);
  for (const h of [r.devolucion_hash, r.hash]) {
    const a = aviso.locator(`a[href$="/registro/${h}"]`);
    await expect(a).toHaveCount(1);
    const res = await request.get((await a.getAttribute("href"))!, { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers().location).toBe(`https://stellar.expert/explorer/testnet/tx/${h}`);
  }
  await chat.screenshot({ path: path.join(DIR, "bot-comprador-devolucion-completa.png"), fullPage: true });
});
