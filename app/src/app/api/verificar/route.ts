import { handle } from "@/lib/server/http";
import { limitar } from "@/lib/server/limite";
import { verifyCode } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

/** /verificar?codigo=PP-4821 → tienda, producto, monto y estado. */
export const GET = (req: Request) =>
  handle(() => {
    limitar(req, "verificar");
    return verifyCode(new URL(req.url).searchParams.get("codigo"));
  });
