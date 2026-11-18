import { body, handle } from "@/lib/server/http";
import { activateWallet } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

export const POST = (req: Request) => handle(async () => activateWallet((await body(req)).pubkey));
