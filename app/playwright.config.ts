import { rmSync } from "node:fs";
import { makeConfig } from "./playwright.shared";

// e2e contra TESTNET: app en el 3100 + simulador del bot en el 3130. Base nueva en cada corrida (data/e2e.db),
// modo demo (PP_DEMO=1: "Pagar al vendedor" se habilita 1 minuto después del envío).
// Solo en el proceso principal: Playwright vuelve a evaluar la config en cada worker.
if (!process.env.TEST_WORKER_INDEX) for (const f of ["data/e2e.db", "data/e2e.db-wal", "data/e2e.db-shm"]) rmSync(f, { force: true });

export default makeConfig({
  testDir: "./e2e",
  port: Number(process.env.E2E_PORT || 3100),
  simPort: Number(process.env.E2E_SIM_PORT || 3130),
  db: "data/e2e.db",
  sellerWa: "59171112222",
  timeoutMin: 12,
});
