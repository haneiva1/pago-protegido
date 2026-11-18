import { defineConfig } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";

// La clave del panel del árbitro sale de .env.local (la genera `npm run setup`).
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && m[1] === "ARBITRO_PANEL_KEY" && !process.env.ARBITRO_PANEL_KEY) process.env.ARBITRO_PANEL_KEY = m[2];
  }
}

const PORT = Number(process.env.E2E_PORT || 3100);

export default defineConfig({
  testDir: "./e2e",
  // Corre contra Stellar TESTNET: cada transacción tarda entre 4 y 13 s.
  timeout: 12 * 60_000,
  expect: { timeout: 30_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "es-BO",
    timezoneId: "America/La_Paz",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    // Build propio (.next-e2e) con la billetera local, base de datos aparte (data/e2e.db).
    command: `npm run build && npx next start -p ${PORT}`,
    env: { NEXT_DIST_DIR: ".next-e2e", NEXT_PUBLIC_WALLET: "local", PP_DB_PATH: "data/e2e.db", PP_MODE: process.env.PP_MODE || "guardian" },
    url: `http://localhost:${PORT}/api/info`,
    timeout: 10 * 60_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
  },
});
