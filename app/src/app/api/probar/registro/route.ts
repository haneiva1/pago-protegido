import { handle } from "@/lib/server/http";
import { registroProbar } from "@/lib/server/probar";
export const dynamic = "force-dynamic";

export const GET = (req: Request) => handle(() => registroProbar(new URL(req.url).searchParams.get("vendedor")));
