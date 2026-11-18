import { body, checkArbitro, handle } from "@/lib/server/http";
import { quoteDispute } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

export const POST = (req: Request) =>
  handle(async () => {
    checkArbitro(req);
    const b = await body(req);
    return quoteDispute(b.slug, b.buyerBps);
  });
