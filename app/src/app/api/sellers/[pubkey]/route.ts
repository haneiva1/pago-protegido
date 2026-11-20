import { handle } from "@/lib/server/http";
import { sellerPublic } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

/** Datos públicos de la tienda. Los pedidos y los datos de entrega están en /panel. */
export const GET = (_req: Request, ctx: { params: Promise<{ pubkey: string }> }) =>
  handle(async () => sellerPublic((await ctx.params).pubkey));
