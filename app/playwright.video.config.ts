import { rmSync } from "node:fs";
import { makeConfig } from "./playwright.shared";

// Video de la demo (npm run demo:video): base nueva en cada corrida para que los paneles se vean limpios.
// Solo en el proceso principal: Playwright vuelve a evaluar la config en cada worker.
if (!process.env.TEST_WORKER_INDEX) for (const f of ["data/video.db", "data/video.db-wal", "data/video.db-shm"]) rmSync(f, { force: true });

export default makeConfig({
  testDir: "./demo-video",
  port: 3200,
  simPort: 3230,
  db: "data/video.db",
  sellerWa: "59171234567",
  timeoutMin: 25,
  slowMo: 120,
});
