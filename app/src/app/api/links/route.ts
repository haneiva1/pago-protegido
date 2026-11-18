import { body, handle } from "@/lib/server/http";
import { createLink } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

export const POST = (req: Request) => handle(async () => createLink(await body(req)));
