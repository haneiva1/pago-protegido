import { cuentaFirmante, mismaCuenta } from "@/lib/server/firma";
import { body, handle } from "@/lib/server/http";
import { saveSeller } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

/** Crear o editar la tienda: solo con la firma de esa cuenta (si no, cualquiera reescribía nombre y WhatsApp). */
export const POST = (req: Request) =>
  handle(async () => {
    const cuenta = cuentaFirmante(req);
    const b = await body(req);
    return saveSeller({ ...b, pubkey: mismaCuenta(cuenta, b.pubkey, "Solo puedes editar tu propia tienda") });
  });
