import { handle } from "@/lib/server/http";
import { computeMetrics, ingestEvents } from "@/lib/server/metrics";
export const dynamic = "force-dynamic";

/** Métricas on-chain en JSON (mismas cifras que /transparencia). */
export const GET = () =>
  handle(async () => {
    await ingestEvents().catch(() => null);
    return computeMetrics();
  });
