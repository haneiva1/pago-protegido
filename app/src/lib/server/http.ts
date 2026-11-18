import { cfg } from "./config";
import { AppError } from "./orders";
import { ChainError } from "./stellar";

/** Envuelve una ruta API: JSON de ida y vuelta y errores legibles en español. */
export async function handle(fn: () => Promise<unknown> | unknown): Promise<Response> {
  try {
    return Response.json(await fn());
  } catch (e) {
    const status = e instanceof AppError ? e.status : e instanceof ChainError ? 422 : 500;
    if (status >= 500) console.error("[pp]", e);
    else if (status === 422) console.warn("[pp] error de la red/contrato:", e instanceof Error ? e.message : e);
    const message = e instanceof Error ? e.message : "Error inesperado";
    return Response.json({ error: status >= 500 ? `Error del servidor: ${message}` : message }, { status });
  }
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function checkArbitro(req: Request) {
  const key = req.headers.get("x-arbitro-key") ?? "";
  if (!cfg().arbitroPanelKey || key !== cfg().arbitroPanelKey) throw new AppError("Clave del árbitro incorrecta", 401);
}
