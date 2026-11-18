import { expect, test, type Page } from "@playwright/test";

const MOCK = process.env.E2E_MOCK_URL!;
const FAKE = "⚠️ Este link NO es de Pago Protegido. No pagues.";

async function say(page: Page, text: string) {
  const input = page.getByLabel("Mensaje");
  await input.fill(text);
  await input.press("Enter");
  await expect(page.getByTestId("my-msg").last()).toContainText(text);
}
const lastBot = (page: Page) => page.getByTestId("bot-msg").last();

test("verificador: el comprador reenvía un link auténtico y uno falso (captura docs/verificador.png)", async ({ page, request }) => {
  await page.goto("/");

  // El vendedor crea el link real.
  await say(page, "vendo zapatillas nike 40 a 450 bs entrega 3 días");
  const link = page.locator('[data-testid="bot-msg"] a[href*="/p/zapatillas-nike-40-"]').last();
  await expect(link).toBeVisible();
  const href = (await link.getAttribute("href"))!;
  const slug = href.split("/p/")[1];
  await expect(page.getByTestId("bot-msg").filter({ hasText: "Tu link de pago protegido" }).last()).toContainText(
    "Ojo: el QR de pago nunca está a nombre de una persona.",
  );

  // El comprador, que no tiene tienda, reenvía el link auténtico al bot.
  await page.locator("#as-buyer").click();
  await page.getByRole("button", { name: /Reenviar el último link/ }).click();
  await expect(page.getByTestId("my-msg").last()).toContainText(href);
  await expect(lastBot(page)).toContainText(`✅ Auténtico: Tienda Demo, Zapatillas nike 40, Bs 450,00, pedido ${slug.slice(-6)}. Estado: Esperando pago`);

  // Y luego un mensaje con un link de dominio parecido.
  await page.getByRole("button", { name: /dominio parecido/ }).click();
  await expect(page.getByTestId("my-msg").last()).toContainText(`https://pago-protegido.co/p/${slug}`);
  await expect(lastBot(page)).toContainText(FAKE);
  await expect(lastBot(page)).toContainText("pago-protegido.co imita nuestro nombre");
  await expect(lastBot(page)).toContainText(`Los links de pago reales empiezan con ${MOCK}/p/`);
  expect(await page.locator("body").innerText()).not.toMatch(/cripto/i);
  await page.screenshot({ path: "docs/verificador.png" });

  // Acortador y "reportar".
  await page.getByRole("button", { name: /link acortado/ }).click();
  await expect(lastBot(page)).toContainText(FAKE);
  await expect(lastBot(page)).toContainText("Es un link acortado (bit.ly)");
  await say(page, `reportar https://pago-protegido.co/p/${slug}`);
  await expect(lastBot(page)).toContainText("¡Gracias por avisar!");

  // El verificador no cambió nada en la app.
  const view = await (await request.get(`${MOCK}/api/orders/${slug}`)).json();
  expect(view.order.status).toBe("esperando_pago");
});

test("el comprador recibe el aviso anti-presión al pagar", async ({ page, request }) => {
  await page.goto("/");
  await say(page, "vendo polera alpaca a 120 bs entrega 2 días");
  const link = page.locator('[data-testid="bot-msg"] a[href*="/p/polera-alpaca-"]').first();
  await expect(link).toBeVisible();
  const slug = (await link.getAttribute("href"))!.split("/p/")[1];
  await request.post(`${MOCK}/__mock/advance`, { data: { slug, action: "pagar" } });
  await page.locator("#as-buyer").click();
  await expect(page.getByTestId("bot-msg").filter({ hasText: `${slug.slice(-6)}: tu pago de Bs 120,00` })).toContainText(
    "Si te lo piden, es la señal número 1 de estafa.",
    { timeout: 15_000 },
  );
});
