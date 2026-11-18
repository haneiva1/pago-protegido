import { body, handle } from "@/lib/server/http";
import { patchLink } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

/** APP-ENDPOINTS §6 (bot): cambia quién paga la protección mientras el link no se empezó a pagar. */
export const PATCH = (req: Request, ctx: { params: Promise<{ slug: string }> }) =>
  handle(async () => patchLink((await ctx.params).slug, await body(req)));
