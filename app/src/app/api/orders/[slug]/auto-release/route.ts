import { handle } from "@/lib/server/http";
import { limitar } from "@/lib/server/limite";
import { autoRelease } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

export const POST = (req: Request, ctx: { params: Promise<{ slug: string }> }) =>
  handle(async () => {
    limitar(req, "plazo");
    return autoRelease((await ctx.params).slug);
  });
