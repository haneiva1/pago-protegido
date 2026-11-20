import { body, handle } from "@/lib/server/http";
import { startPayment } from "@/lib/server/orders";
import { desdeProbar, limitar } from "@/lib/server/probar";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = (req: Request, ctx: { params: Promise<{ slug: string }> }) =>
  handle(async () => {
    // /probar: límite por IP para no gastar la rampa de prueba (cada pago emite dólares de prueba).
    if (desdeProbar(req)) limitar(req, "rampa");
    return startPayment((await ctx.params).slug, await body(req));
  });
