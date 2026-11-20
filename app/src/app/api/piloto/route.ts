import { body, handle } from "@/lib/server/http";
import { limitar } from "@/lib/server/limite";
import { joinPilot } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

/** Lista de espera del piloto (/piloto). */
export const POST = (req: Request) =>
  handle(async () => {
    limitar(req, "piloto");
    return joinPilot(await body(req));
  });
