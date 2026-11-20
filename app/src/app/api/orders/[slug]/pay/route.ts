import { cuentaFirmante, mismaCuenta } from "@/lib/server/firma";
import { body, handle } from "@/lib/server/http";
import { limitar } from "@/lib/server/limite";
import { startPayment } from "@/lib/server/orders";
import { desdeProbar, limitar as limitarProbar } from "@/lib/server/probar";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Empezar a pagar: guarda datos de entrega y WhatsApp, así que pide la firma de la cuenta del comprador. */
export const POST = (req: Request, ctx: { params: Promise<{ slug: string }> }) =>
  handle(async () => {
    limitar(req, "pago");
    // /probar: además, su propio límite por IP para no gastar la rampa de prueba (cada pago emite dólares de prueba).
    if (desdeProbar(req)) limitarProbar(req, "rampa");
    const cuenta = cuentaFirmante(req);
    const b = await body(req);
    return startPayment((await ctx.params).slug, { ...b, buyer: mismaCuenta(cuenta, b.buyer, "Solo puedes pagar con tu propia cuenta") });
  });
