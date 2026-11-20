import fs from "node:fs";
import path from "node:path";
import { mimeDeNombre } from "@/lib/evidencia";
import { carpetaEvidencia } from "../carpeta";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/evidencia/<sha256>.<ext>: la evidencia tal como se guardó. El nombre es su huella: no cambia nunca. */
export async function GET(_req: Request, ctx: { params: Promise<{ archivo: string }> }) {
  const { archivo } = await ctx.params;
  const mime = mimeDeNombre(archivo);
  if (!mime) return Response.json({ error: "No encontramos esa evidencia" }, { status: 404 });
  const file = path.join(carpetaEvidencia(), archivo);
  if (!fs.existsSync(file)) return Response.json({ error: "No encontramos esa evidencia" }, { status: 404 });
  return new Response(new Uint8Array(fs.readFileSync(file)), {
    headers: {
      "content-type": mime,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; img-src 'self'; media-src 'self'",
    },
  });
}
