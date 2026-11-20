import { handle } from "@/lib/server/http";
import { limitar } from "@/lib/server/limite";
import { refundUnshipped } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

/** Devolución por falta de despacho (v2). Sin firmas: el contrato valida el plazo y que no haya envío. */
export const POST = (req: Request, ctx: { params: Promise<{ slug: string }> }) =>
  handle(async () => {
    limitar(req, "plazo");
    return refundUnshipped((await ctx.params).slug);
  });
