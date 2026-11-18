import { body, handle } from "@/lib/server/http";
import { submitSigned } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

export const POST = (req: Request) => handle(async () => submitSigned((await body(req)).signedXdr));
