import { esBot, firmaDe } from "@/lib/server/firma";
import { handle } from "@/lib/server/http";
import { sellerPanel } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

/** Panel del vendedor: pedidos con los datos de entrega de sus compradores, saldo y KPIs. Firma de la tienda o x-bot-key. */
export const GET = (req: Request, ctx: { params: Promise<{ pubkey: string }> }) =>
  handle(async () => {
    const { pubkey } = await ctx.params;
    if (!esBot(req)) firmaDe(req, pubkey, "Solo la tienda puede ver su panel");
    return sellerPanel(pubkey);
  });
