import { cuentaFirmante, esBot, mismaCuenta } from "@/lib/server/firma";
import { body, handle } from "@/lib/server/http";
import { createLink } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

/** Crear un link: firma de la tienda, o el bot con su clave (crea links para la tienda de ese WhatsApp). */
export const POST = (req: Request) =>
  handle(async () => {
    if (esBot(req)) return createLink(await body(req));
    const cuenta = cuentaFirmante(req);
    const b = await body(req);
    return createLink({ ...b, sellerPubkey: mismaCuenta(cuenta, b.sellerPubkey, "Solo puedes crear links de tu propia tienda") });
  });
