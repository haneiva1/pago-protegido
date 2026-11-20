import { cuentaFirmante, esBot, mismaCuenta } from "@/lib/server/firma";
import { body, handle } from "@/lib/server/http";
import { createLink } from "@/lib/server/orders";
import { desdeProbar } from "@/lib/server/probar";
export const dynamic = "force-dynamic";

/** Crear un link: firma de la tienda, o el bot con su clave (crea links para la tienda de ese WhatsApp). */
export const POST = (req: Request) =>
  handle(async () => {
    if (esBot(req)) return createLink(await body(req));
    const cuenta = cuentaFirmante(req);
    const b = await body(req);
    // Desde /probar (PP_PROBAR=1) el link siempre usa los plazos de demo: el panel solo los ofrece con ?demo=1.
    return createLink({ ...b, ...(desdeProbar(req) ? { demoWindow: true } : {}), sellerPubkey: mismaCuenta(cuenta, b.sellerPubkey, "Solo puedes crear links de tu propia tienda") });
  });
