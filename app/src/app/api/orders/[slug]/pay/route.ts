import { body, handle } from "@/lib/server/http";
import { startPayment } from "@/lib/server/orders";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = (req: Request, ctx: { params: Promise<{ slug: string }> }) =>
  handle(async () => {
    const b = await body(req);
    return startPayment((await ctx.params).slug, b.buyer, b.whatsapp);
  });
