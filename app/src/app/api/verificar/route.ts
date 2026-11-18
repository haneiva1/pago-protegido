import { handle } from "@/lib/server/http";
import { verifyCode } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

/** /verificar?codigo=PP-4821 → tienda, producto, monto y estado. */
export const GET = (req: Request) => handle(() => verifyCode(new URL(req.url).searchParams.get("codigo")));
