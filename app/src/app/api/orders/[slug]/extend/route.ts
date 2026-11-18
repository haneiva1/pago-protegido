import { body, handle } from "@/lib/server/http";
import { prepareExtend } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

/** "Necesito más tiempo" (pp_guardian v2 `extend`, una sola vez): devuelve la transacción que firma el comprador. */
export const POST = (req: Request, ctx: { params: Promise<{ slug: string }> }) =>
  handle(async () => prepareExtend((await ctx.params).slug, await body(req)));
