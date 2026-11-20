import { rmSync } from "node:fs";
import { makeConfig } from "./playwright.shared";

// e2e de la devolución completa (H-4) con el interruptor ENCENDIDO: PP_DEVOLUCION_COMPLETA=1 solo en este servidor.
// Va aparte porque espera el plazo de despacho de demo (2 min) y el reintegro en testnet:
//   npx playwright test -c playwright.devolucion.config.ts
// Puertos y base propios: nunca reutiliza el servidor del e2e principal, que corre con el interruptor apagado.
const DB = "data/e2e-devolucion.db";
if (!process.env.TEST_WORKER_INDEX) for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) rmSync(f, { force: true });

const config = makeConfig({
  testDir: "./e2e-devolucion",
  port: Number(process.env.E2E_DEVOLUCION_PORT || 3140),
  simPort: Number(process.env.E2E_DEVOLUCION_SIM_PORT || 3170),
  db: DB,
  sellerWa: "59171113333",
  timeoutMin: 12,
});
const [app] = [config.webServer ?? []].flat();
app.env = { ...app.env, PP_DEVOLUCION_COMPLETA: "1" };

export default config;
