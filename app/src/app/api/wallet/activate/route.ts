import { body, handle } from "@/lib/server/http";
import { limitar } from "@/lib/server/limite";
import { activateWallet } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

export const POST = (req: Request) =>
  handle(async () => {
    limitar(req, "activar");
    return activateWallet((await body(req)).pubkey);
  });
