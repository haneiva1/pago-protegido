import { cuentaFirmante } from "@/lib/server/firma";
import { body, handle } from "@/lib/server/http";
import { sellerReply } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

/** Versión del vendedor en un reclamo, con la firma de la cuenta de la tienda. */
export const POST = (req: Request, ctx: { params: Promise<{ slug: string }> }) =>
  handle(async () => {
    const cuenta = cuentaFirmante(req);
    return sellerReply((await ctx.params).slug, { ...(await body(req)), pubkey: cuenta });
  });
