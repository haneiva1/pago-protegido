import { makeConfig } from "./playwright.shared";

// e2e contra TESTNET: app en el 3100 (data/e2e.db) + simulador del bot en el 3130.
export default makeConfig({
  testDir: "./e2e",
  port: Number(process.env.E2E_PORT || 3100),
  simPort: Number(process.env.E2E_SIM_PORT || 3130),
  db: "data/e2e.db",
  sellerWa: "59171112222",
  timeoutMin: 12,
});
