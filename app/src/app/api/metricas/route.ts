import { handle } from "@/lib/server/http";
import { metricasSnapshot } from "@/lib/server/kpis";
export const dynamic = "force-dynamic";

/** Las mismas cifras que /metricas en JSON: pruebas del equipo y piloto por separado, con la hora de la última lectura de la red. */
export const GET = () => handle(() => metricasSnapshot());
