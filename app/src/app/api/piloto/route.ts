import { body, handle } from "@/lib/server/http";
import { joinPilot } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

/** Lista de espera del piloto (/piloto). */
export const POST = (req: Request) => handle(async () => joinPilot(await body(req)));
