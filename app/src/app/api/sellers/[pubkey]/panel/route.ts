import { handle } from "@/lib/server/http";
import { sellerPanel } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

/** Panel del vendedor: pedidos con los datos de entrega de sus compradores, saldo y KPIs. */
export const GET = (_req: Request, ctx: { params: Promise<{ pubkey: string }> }) =>
  handle(async () => sellerPanel((await ctx.params).pubkey));
