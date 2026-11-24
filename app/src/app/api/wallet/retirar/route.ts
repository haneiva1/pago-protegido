import { cuentaFirmante } from "@/lib/server/firma";
import { body, handle } from "@/lib/server/http";
import { limitar } from "@/lib/server/limite";
import { prepararRetiro } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

/** Solo mainnet: arma el retiro de USDC de la cuenta que firma. La transacción la firma después el navegador. */
export const POST = (req: Request) =>
  handle(async () => {
    limitar(req, "pago");
    const cuenta = cuentaFirmante(req);
    return prepararRetiro(cuenta, await body(req));
  });
