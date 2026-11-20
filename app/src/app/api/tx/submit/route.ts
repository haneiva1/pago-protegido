import { body, handle } from "@/lib/server/http";
import { limitar } from "@/lib/server/limite";
import { submitSigned } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

export const POST = (req: Request) =>
  handle(async () => {
    limitar(req, "enviar");
    return submitSigned((await body(req)).signedXdr);
  });
