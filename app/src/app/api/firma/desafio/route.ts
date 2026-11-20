import { emitirDesafio } from "@/lib/server/firma";
import { body, handle } from "@/lib/server/http";
import { limitar } from "@/lib/server/limite";
export const dynamic = "force-dynamic";

/** Desafío de un solo uso para firmar con la cuenta (lib/server/firma.ts). */
export const POST = (req: Request) =>
  handle(async () => {
    limitar(req, "desafio");
    return emitirDesafio(await body(req));
  });
