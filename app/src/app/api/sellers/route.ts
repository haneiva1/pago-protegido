import { body, handle } from "@/lib/server/http";
import { saveSeller } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

export const POST = (req: Request) => handle(async () => saveSeller(await body(req)));
