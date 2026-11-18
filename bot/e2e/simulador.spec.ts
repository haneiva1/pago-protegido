import { expect, test, type Page } from "@playwright/test";

const MOCK = process.env.E2E_MOCK_URL!;

async function say(page: Page, text: string) {
  const input = page.getByLabel("Mensaje");
  await input.fill(text);
  await input.press("Enter");
  await expect(page.getByTestId("my-msg").last()).toContainText(text);
}
const lastBot = (page: Page) => page.getByTestId("bot-msg").last();

test("vender zapatillas 450 → devuelve un link de pago, y avisa cuando pagan", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByText("Pago Protegido", { exact: true })).toBeVisible();

  await say(page, "vender zapatillas 450");
  await expect(lastBot(page)).toContainText("¿En cuántos días entregas?");
  await page.getByRole("button", { name: "3 días" }).last().click();

  const link = page.locator('[data-testid="bot-msg"] a[href*="/p/zapatillas-"]').first();
  await expect(link).toBeVisible();
  const href = (await link.getAttribute("href"))!;
  expect(href).toMatch(new RegExp(`^${MOCK}/p/zapatillas-[0-9a-f]{6}$`));
  await expect(page.getByTestId("bot-msg").filter({ hasText: "Tu link de pago protegido" })).toContainText("Bs 450,00 (≈ 38,46 USD de prueba) · entrega en 3 días");

  // El link existe de verdad en la API (POST /api/links) y es el pedido.
  const slug = href.split("/p/")[1];
  const view = await (await request.get(`${MOCK}/api/orders/${slug}`)).json();
  expect(view.order).toMatchObject({ product: "Zapatillas", price_bs_cents: 45000, delivery_days: 3, status: "esperando_pago" });

  // El comprador paga en la web: el poller lo ve en /api/bot/changes y avisa al vendedor.
  expect((await request.post(`${MOCK}/__mock/advance`, { data: { slug, action: "pagar" } })).ok()).toBe(true);
  await expect(lastBot(page)).toContainText("el pago está GUARDADO", { timeout: 15_000 });
  await expect(lastBot(page)).toContainText(`enviado ${slug.slice(-6)}`);

  expect(await page.locator("body").innerText()).not.toMatch(/cripto/i);
  await page.screenshot({ path: "docs/simulador.png" });
});

test("frase completa en un mensaje y el comprador recibe '¿te llegó?'", async ({ page, request }) => {
  await page.goto("/");
  await say(page, "hola");
  await expect(lastBot(page)).toContainText("Soy el asistente de *Pago Protegido*".replace(/\*/g, ""));
  await expect(page.getByRole("button", { name: "🛍️ Vender" }).last()).toBeVisible();

  await say(page, "vendo zapatillas nike 40 a Bs 1.200 entrega 3 días");
  const link = page.locator('[data-testid="bot-msg"] a[href*="/p/zapatillas-nike-40-"]').first();
  await expect(link).toBeVisible();
  const slug = (await link.getAttribute("href"))!.split("/p/")[1];
  await expect(page.getByTestId("bot-msg").filter({ hasText: slug }).first()).toContainText("Bs 1.200,00");

  await request.post(`${MOCK}/__mock/advance`, { data: { slug, action: "pagar" } });
  await request.post(`${MOCK}/__mock/advance`, { data: { slug, action: "enviar", evidence: "OLV-555" } });
  await expect(page.locator("#as-buyer .badge")).toBeVisible({ timeout: 15_000 });
  await page.locator("#as-buyer").click();
  await expect(lastBot(page)).toContainText("¿Te llegó?");
  await expect(lastBot(page)).toContainText("OLV-555");
});
