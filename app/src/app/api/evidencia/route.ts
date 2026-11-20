import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { MAX_FOTO_BYTES, MAX_VIDEO_BYTES, tipoEvidencia } from "@/lib/evidencia";
import { orders } from "@/lib/server/db";
import { carpetaEvidencia } from "./carpeta";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ESTADOS_CON_EVIDENCIA = new Set(["pagado", "enviado", "en_disputa"]);
const err = (error: string, status: number) => Response.json({ error }, { status });

/**
 * POST /api/evidencia?pedido=<slug>: guarda una foto o un video (cuerpo crudo) con su SHA-256 como nombre y devuelve
 * un link que lleva la huella. Si el navegador manda x-sha256, tiene que coincidir con lo que llegó.
 * Ruta aislada (M5): solo acepta archivos de pedidos en curso, por sus primeros bytes, y con tope de tamaño.
 */
export async function POST(req: Request) {
  const pedido = new URL(req.url).searchParams.get("pedido") ?? "";
  const o = pedido ? orders.get(pedido) : undefined;
  if (!o) return err("No encontramos ese pedido", 404);
  if (!ESTADOS_CON_EVIDENCIA.has(o.status)) return err("Este pedido ya no recibe evidencia", 409);
  const largo = Number(req.headers.get("content-length") ?? 0);
  if (largo > MAX_VIDEO_BYTES) return err("El archivo es muy grande (máximo 40 MB)", 413);

  const bytes = new Uint8Array(await req.arrayBuffer());
  const t = tipoEvidencia(bytes);
  if (!t) return err("Sube una foto (JPG, PNG o WebP) o un video (MP4, MOV o WebM)", 415);
  if (bytes.length > (t.video ? MAX_VIDEO_BYTES : MAX_FOTO_BYTES)) return err(`El archivo es muy grande (máximo ${t.video ? 40 : 8} MB)`, 413);

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const delNavegador = (req.headers.get("x-sha256") ?? "").toLowerCase();
  if (delNavegador && delNavegador !== sha256) return err("La huella no coincide: el archivo cambió en el camino. Vuelve a subirlo.", 400);

  const dir = carpetaEvidencia();
  fs.mkdirSync(dir, { recursive: true });
  const nombre = `${sha256}.${t.ext}`;
  const destino = path.join(dir, nombre);
  if (!fs.existsSync(destino)) {
    const tmp = `${destino}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, bytes);
    fs.renameSync(tmp, destino);
  }

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(host);
  const proto = req.headers.get("x-forwarded-proto") ?? (local ? "http" : "https");
  return Response.json({ sha256, url: `${proto}://${host}/api/evidencia/${nombre}`, bytes: bytes.length, tipo: t.mime });
}
