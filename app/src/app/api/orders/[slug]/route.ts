import { handle } from "@/lib/server/http";
import { orderView } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

export const GET = (req: Request, ctx: { params: Promise<{ slug: string }> }) =>
  handle(async () => orderView((await ctx.params).slug, new URL(req.url).searchParams.has("onchain")));
