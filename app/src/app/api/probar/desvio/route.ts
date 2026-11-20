import { body, handle } from "@/lib/server/http";
import { desvioProbar } from "@/lib/server/probar";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = (req: Request) => handle(async () => desvioProbar(req, (await body(req)).slug));
