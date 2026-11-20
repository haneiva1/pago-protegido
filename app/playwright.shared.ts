import { defineConfig } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";

/**
 * Config compartida del e2e y del video de la demo: app (build propio, billetera local, base aparte)
 * + simulador del bot de WhatsApp (pago-protegido/bot) contra esa misma app, todo en TESTNET.
 */
export function makeConfig(o: {
  testDir: string;
  port: number;
  simPort: number;
  db: string;
  sellerWa: string;
  timeoutMin: number;
  slowMo?: number;
}) {
  // Claves de .env.local (las genera `npm run setup`): panel del árbitro y bot.
  if (existsSync(".env.local")) {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && (m[1] === "ARBITRO_PANEL_KEY" || m[1] === "PP_BOT_KEY") && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
  const APP_URL = `http://localhost:${o.port}`;
  process.env.E2E_SIM_URL = `http://localhost:${o.simPort}`;
  process.env.E2E_DB ||= o.db;
  process.env.E2E_SELLER_WA ||= o.sellerWa;
  process.env.E2E_BUYER_WA ||= "59176543210";

  return defineConfig({
    testDir: o.testDir,
    // Corre contra Stellar TESTNET: cada transacción tarda entre 4 y 13 s.
    timeout: o.timeoutMin * 60_000,
    expect: { timeout: 30_000 },
    workers: 1,
    fullyParallel: false,
    retries: 0,
    reporter: [["list"]],
    outputDir: "test-results",
    use: {
      baseURL: APP_URL,
      locale: "es-BO",
      timezoneId: "America/La_Paz",
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      trace: "retain-on-failure",
      screenshot: "only-on-failure",
      launchOptions: o.slowMo ? { slowMo: o.slowMo } : undefined,
    },
    webServer: [
      {
        // Build propio (.next-e2e) con la billetera local y base de datos aparte.
        command: `npm run build && npx next start -p ${o.port}`,
        env: { NEXT_DIST_DIR: ".next-e2e", NEXT_PUBLIC_WALLET: "local", PP_DB_PATH: o.db, PP_MODE: process.env.PP_MODE || "guardian", PP_DEMO: "1", PP_PROBAR: "1" },
        url: `${APP_URL}/api/info`,
        timeout: 10 * 60_000,
        reuseExistingServer: !process.env.CI,
        stdout: "pipe",
        stderr: "pipe",
      },
      {
        // Bot: simulador web + poller contra la app real (testnet). Sin estado en disco.
        command: "npm --prefix ../bot run sim",
        env: {
          PP_APP_URL: APP_URL,
          PP_PUBLIC_URL: APP_URL,
          PP_BOT_KEY: process.env.PP_BOT_KEY ?? "",
          SIM_PORT: String(o.simPort),
          SIM_SELLER_PHONE: process.env.E2E_SELLER_WA!,
          SIM_BUYER_PHONE: process.env.E2E_BUYER_WA!,
          POLL_INTERVAL_MS: "2000",
          BOT_STATE_FILE: "",
        },
        url: `http://localhost:${o.simPort}/`,
        timeout: 2 * 60_000,
        reuseExistingServer: !process.env.CI,
        stdout: "pipe",
        stderr: "pipe",
      },
    ],
  });
}
