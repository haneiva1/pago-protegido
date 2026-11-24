import { handle } from "@/lib/server/http";
import { limitar } from "@/lib/server/limite";
import { saldoDe } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

/** Solo mainnet: saldo en USDC de una cuenta (es público en la red). La página del pago espera a que llegue. */
export const GET = (req: Request) =>
  handle(async () => {
    limitar(req, "enviar");
    return saldoDe(new URL(req.url).searchParams.get("cuenta"));
  });
