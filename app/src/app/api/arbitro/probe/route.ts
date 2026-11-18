import { body, checkArbitro, handle } from "@/lib/server/http";
import { probeForeign } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

export const POST = (req: Request) =>
  handle(async () => {
    checkArbitro(req);
    return probeForeign((await body(req)).slug);
  });
