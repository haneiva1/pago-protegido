import { handle } from "@/lib/server/http";
import { sellerView } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

export const GET = (_req: Request, ctx: { params: Promise<{ pubkey: string }> }) =>
  handle(async () => sellerView((await ctx.params).pubkey));
