import { defineConfig } from "@playwright/test";

// e2e del simulador contra la app de mentira (src/mock), cada uno en su proceso y hablando por HTTP,
// igual que en producción. Puertos aparte para no chocar con `npm run sim` (3030/3031).
const SIM = Number(process.env.E2E_SIM_PORT ?? 3130);
const MOCK = Number(process.env.E2E_MOCK_PORT ?? 3131);
process.env.E2E_MOCK_URL = `http://localhost:${MOCK}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    baseURL: `http://localhost:${SIM}`,
    locale: "es-BO",
    timezoneId: "America/La_Paz",
    colorScheme: "light",
    viewport: { width: 1000, height: 960 },
    deviceScaleFactor: 2,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npx tsx src/mock/main.ts",
      port: MOCK,
      env: { MOCK_PORT: String(MOCK), PP_BOT_KEY: "clave-e2e" },
      reuseExistingServer: false,
    },
    {
      command: "npx tsx src/main.ts --sim",
      port: SIM,
      env: {
        SIM_PORT: String(SIM),
        PP_APP_URL: `http://localhost:${MOCK}`,
        PP_BOT_KEY: "clave-e2e",
        POLL_INTERVAL_MS: "400",
        BOT_STATE_FILE: "",
        REPORTS_FILE: "",
      },
      reuseExistingServer: false,
    },
  ],
});
