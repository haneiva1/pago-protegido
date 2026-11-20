import { cuentaFirmante, esBot } from "@/lib/server/firma";
import { body, handle } from "@/lib/server/http";
import { patchLink } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

/** APP-ENDPOINTS §6 (bot): cambia quién paga la protección mientras el link no se empezó a pagar. Firma de la tienda o x-bot-key. */
export const PATCH = (req: Request, ctx: { params: Promise<{ slug: string }> }) =>
  handle(async () => {
    const { slug } = await ctx.params;
    if (esBot(req)) return patchLink(slug, await body(req));
    const cuenta = cuentaFirmante(req);
    return patchLink(slug, { ...(await body(req)), sellerPubkey: cuenta });
  });
