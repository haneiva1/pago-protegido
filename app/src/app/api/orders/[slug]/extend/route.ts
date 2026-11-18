import { handle } from "@/lib/server/http";
import { extendDeadline } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

/** "Necesito más tiempo" (pp_guardian v2, extend). Responde 501 hasta que se integren los contratos v2. */
export const POST = (_req: Request, ctx: { params: Promise<{ slug: string }> }) =>
  handle(async () => extendDeadline((await ctx.params).slug));
