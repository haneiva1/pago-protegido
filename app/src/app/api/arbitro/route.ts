import { checkArbitro, handle } from "@/lib/server/http";
import { disputesView } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

export const GET = (req: Request) =>
  handle(async () => {
    checkArbitro(req);
    return disputesView();
  });
