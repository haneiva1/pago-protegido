import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// "¿Y si algo sale mal?" bajo la demo de /probar (PP_PROBAR=1, TESTNET). Los tres casos animados llevan su transacción
// real del README; el caso en vivo prepara solo un pedido con plata adentro (cuentas de prueba aparte de la demo), manda la
// orden de pagarle a otra cuenta y la red la rechaza. Capturas en e2e/capturas/90-casos-….

const DIR = path.join(__dirname, "capturas");
fs.mkdirSync(DIR, { recursive: true });
const PROHIBIDAS = [/garant[ií]a/i, /\bsegur[oa]\b/i, /seguridad/i, /custodia/i, /arbitraje/i, /árbitro/i, /100\s?%/, /cripto/i, /\btoken/i, /\bwallet\b/i, /\bllaves?\b/i, /blockchain/i, /stellar/i];
const TX_README = {
  "llega-mal": "68ba9ed24755a4c401a28bfa122b5a48fee7929a1d9ae9256bb7f4e1b2ff889d",
  "no-envia": "fdff2f9bb7ce10a0cf02f2d2dbbf299c38681bdea4db872bc98caec2713de0ee",
  "no-confirma": "4a6feb28078c8404d88947730aadea7c32c42d2a400ee1fb21e2cd937633644a",
};
const FINAL = {
  "llega-mal": "Siempre entre los dos. Nunca a un tercero.",
  "no-envia": "La plata vuelve sola al comprador.",
  "no-confirma": "Se le paga sola a la tienda.",
};

async function revisarPalabras(page: Page) {
  const t = await page.getByTestId("casos").innerText();
  for (const re of PROHIBIDAS) expect(t, `palabra prohibida ${re}`).not.toMatch(re);
}

async function capturaCasos(page: Page, nombre: string) {
  const casos = page.getByTestId("casos");
  await casos.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(300);
  await casos.screenshot({ path: path.join(DIR, `${nombre}.png`) });
}

test("/probar · casos animados: cada uno termina en su frase y enlaza su transacción real del README", async ({ browser }) => {
  for (const vp of [
    { width: 1440, height: 900, sufijo: "escritorio" },
    { width: 390, height: 844, sufijo: "celular" },
  ]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    // Sin pagos en esta prueba: el caso en vivo no puede preparar su pedido (la activación de cuentas queda cortada).
    await page.route("**/api/wallet/activate", (r) => r.fulfill({ status: 503, body: JSON.stringify({ error: "sin red en esta prueba" }) }));
    await page.goto("/probar");
    const casos = page.getByTestId("casos");
    await casos.scrollIntoViewIfNeeded();
    await expect(casos.getByRole("heading", { level: 2 })).toHaveText("¿Y si algo sale mal?");
    await expect(casos.getByRole("tab")).toHaveCount(4);
    await expect(page.getByTestId("tab-caso-intento")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("intento-explica")).toContainText("solo puede pagarle a la tienda o devolvérsela al comprador");
    await expect(page.getByTestId("intento-explica")).toContainText("incluso Trato");

    for (const id of ["llega-mal", "no-envia", "no-confirma"] as const) {
      await page.getByTestId(`tab-caso-${id}`).click();
      await expect(page.getByTestId(`tab-caso-${id}`)).toHaveAttribute("aria-selected", "true");
      // Cada animación termina en 15 s o menos.
      await expect(page.getByTestId("caso-texto")).toHaveText(FINAL[id], { timeout: 15_000 });
      await expect(page.getByTestId("caso-link")).toHaveAttribute("href", `https://stellar.expert/explorer/testnet/tx/${TX_README[id]}`);
      await revisarPalabras(page);
      if (id === "llega-mal") await capturaCasos(page, `90-casos-llega-mal-${vp.sufijo}`);
      // "Ver de nuevo" la reinicia.
      await page.getByTestId("caso-otra-vez").click();
      await expect(page.getByTestId("caso-texto")).not.toHaveText(FINAL[id]);
    }
    await ctx.close();
  }
});

test("/probar · caso en vivo: prepara un pedido con plata adentro, manda la orden a otra cuenta y la red la rechaza", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto("/probar");
  const casos = page.getByTestId("casos");
  await casos.scrollIntoViewIfNeeded();
  const boton = page.getByTestId("intentar-llevarsela");
  await expect(boton).toBeVisible();
  // Sin pedido de la demo principal: lo prepara en segundo plano (tienda, link y pago reales en la red de prueba).
  await expect(page.getByTestId("intento-preparando")).toBeVisible({ timeout: 30_000 });
  await expect(boton).toBeEnabled({ timeout: 5 * 60_000 });
  await expect(page.getByTestId("intento-escena")).toContainText(/\d+,\d{2}/);

  await boton.click();
  await expect(page.getByTestId("intento-sello")).toHaveText("Rechazado por la red", { timeout: 60_000 });
  await expect(page.getByTestId("intento-codigo")).toContainText(/Error\(Contract, #\d+\)/);
  await expect(page.getByTestId("intento-link-contrato")).toHaveAttribute("href", /stellar\.expert\/explorer\/testnet\/contract\/C[A-Z2-7]{55}$/);
  await expect(page.getByTestId("intento-link-pago")).toHaveAttribute("href", /stellar\.expert\/explorer\/testnet\/tx\/[0-9a-f]{64}$/);
  await revisarPalabras(page);
  await page.waitForTimeout(900);
  await capturaCasos(page, "90-casos-en-vivo-escritorio");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await capturaCasos(page, "90-casos-en-vivo-celular");

  // Se puede volver a intentar: el mismo rechazo, otra vez.
  await page.setViewportSize({ width: 1440, height: 900 });
  await boton.click();
  await expect(page.getByTestId("intento-sello")).toHaveText("Rechazado por la red", { timeout: 60_000 });
  await ctx.close();
});
