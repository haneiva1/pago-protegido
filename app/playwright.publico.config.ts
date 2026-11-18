import { defineConfig } from "@playwright/test";
import { rmSync } from "node:fs";

// e2e de SOLO LECTURA contra TESTNET: /metricas, /tienda/<slug> y la tarjeta del vendedor con los eventos reales de los
// contratos v2, sin claves del servidor ni transacciones (no necesita .env.local). Base nueva en cada corrida.
// El flujo con pagos (y los KPIs de una venta recién hecha) está en pago-protegido.spec.ts: `npm run test:e2e`.
if (!process.env.TEST_WORKER_INDEX) for (const f of ["data/publico.db", "data/publico.db-wal", "data/publico.db-shm"]) rmSync(f, { force: true });

const PORT = Number(process.env.E2E_PUBLICO_PORT || 3140);

export default defineConfig({
  testDir: "./e2e",
  testMatch: "publico.spec.ts",
  timeout: 5 * 60_000,
  expect: { timeout: 60_000 },
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
    command: `npm run build && npx next start -p ${PORT}`,
    env: { NEXT_DIST_DIR: ".next-publico", NEXT_PUBLIC_WALLET: "local", PP_DB_PATH: "data/publico.db", PP_MODE: "guardian", PP_DEMO: "1" },
    url: `http://localhost:${PORT}/metricas`,
    timeout: 10 * 60_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
  },
});
