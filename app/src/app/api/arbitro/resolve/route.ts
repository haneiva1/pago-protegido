import { body, checkArbitro, handle } from "@/lib/server/http";
import { resolveDispute } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

export const POST = (req: Request) =>
  handle(async () => {
    checkArbitro(req);
    const b = await body(req);
    return resolveDispute(b.slug, b.buyerBps, b.reason);
  });
