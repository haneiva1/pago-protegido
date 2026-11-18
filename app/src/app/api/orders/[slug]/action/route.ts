import { body, handle } from "@/lib/server/http";
import { prepareAction } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

export const POST = (req: Request, ctx: { params: Promise<{ slug: string }> }) =>
  handle(async () => prepareAction((await ctx.params).slug, await body(req)));
