import { body, handle } from "@/lib/server/http";
import { createLink } from "@/lib/server/orders";
import { desdeProbar } from "@/lib/server/probar";
export const dynamic = "force-dynamic";

// Desde /probar (PP_PROBAR=1) el link siempre usa los plazos de demo: el panel solo los ofrece con ?demo=1.
export const POST = (req: Request) =>
  handle(async () => {
    const b = await body(req);
    return createLink(desdeProbar(req) ? { ...b, demoWindow: true } : b);
  });
