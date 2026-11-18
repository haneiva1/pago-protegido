import { handle } from "@/lib/server/http";
import { refundUnshipped } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

/** Devolución por falta de despacho (v2). Sin firmas: el contrato valida el plazo y que no haya envío. */
export const POST = (_req: Request, ctx: { params: Promise<{ slug: string }> }) =>
  handle(async () => refundUnshipped((await ctx.params).slug));
