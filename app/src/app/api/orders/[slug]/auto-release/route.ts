import { handle } from "@/lib/server/http";
import { autoRelease } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

export const POST = (_req: Request, ctx: { params: Promise<{ slug: string }> }) =>
  handle(async () => autoRelease((await ctx.params).slug));
