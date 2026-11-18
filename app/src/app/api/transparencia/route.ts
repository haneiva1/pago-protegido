import { sellers } from "@/lib/server/db";
import { handle } from "@/lib/server/http";
import { computeMetrics, ingestEvents } from "@/lib/server/metrics";
export const dynamic = "force-dynamic";

/** Métricas on-chain en JSON (mismas cifras que /transparencia): pruebas del equipo y, aparte, el piloto. */
export const GET = () =>
  handle(async () => {
    await ingestEvents().catch(() => null);
    const pilotSet = sellers.pilotPubkeys();
    const piloto = computeMetrics((s) => pilotSet.has(s));
    return { ...computeMetrics((s) => !pilotSet.has(s)), piloto: { compras_protegidas: piloto.compras_protegidas, volumen_unidades: piloto.volumen_unidades } };
  });
