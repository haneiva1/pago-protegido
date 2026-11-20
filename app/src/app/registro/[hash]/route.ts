import { explorer } from "@/lib/format";

// /registro/<hash>: lleva al registro público de una transacción. Lo usan los avisos del bot (devolución completa),
// que no nombran la red en el texto. Solo acepta un hash de transacción (64 hex); cualquier otra cosa es 404.
export const GET = async (_req: Request, ctx: { params: Promise<{ hash: string }> }) => {
  const { hash } = await ctx.params;
  if (!/^[0-9a-f]{64}$/.test(hash)) return new Response("No encontramos esa transacción", { status: 404 });
  return Response.redirect(explorer.tx(hash), 307);
};
