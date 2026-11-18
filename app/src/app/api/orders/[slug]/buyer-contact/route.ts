import { body, handle } from "@/lib/server/http";
import { buyerContact } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

/** APP-ENDPOINTS §4: POST /api/orders/:slug/buyer-contact { buyer, whatsapp }. */
export const POST = (req: Request, ctx: { params: Promise<{ slug: string }> }) =>
  handle(async () => buyerContact((await ctx.params).slug, await body(req)));
