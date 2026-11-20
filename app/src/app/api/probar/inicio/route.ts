import { handle } from "@/lib/server/http";
import { inicioProbar } from "@/lib/server/probar";
export const dynamic = "force-dynamic";

export const POST = (req: Request) => handle(() => inicioProbar(req));
