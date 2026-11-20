import { cuentaFirmante } from "@/lib/server/firma";
import { body, handle } from "@/lib/server/http";
import { buyerContact } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

/** APP-ENDPOINTS §4: POST /api/orders/:slug/buyer-contact { whatsapp }, con la firma de la cuenta del comprador. */
export const POST = (req: Request, ctx: { params: Promise<{ slug: string }> }) =>
  handle(async () => {
    const cuenta = cuentaFirmante(req);
    return buyerContact((await ctx.params).slug, { ...(await body(req)), buyer: cuenta });
  });
