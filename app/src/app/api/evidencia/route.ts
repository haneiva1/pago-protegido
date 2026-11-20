import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { MAX_FOTO_BYTES, MAX_VIDEO_BYTES, tipoEvidencia, type TipoEvidencia } from "@/lib/evidencia";
import { orders } from "@/lib/server/db";
import { carpetaEvidencia } from "./carpeta";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ESTADOS_CON_EVIDENCIA = new Set(["pagado", "enviado", "en_disputa"]);
const err = (error: string, status: number) => Response.json({ error }, { status });
const muyGrande = (t: TipoEvidencia | null) => err(`El archivo es muy grande (máximo ${t && !t.video ? 8 : 40} MB)`, 413);
const NO_ES_EVIDENCIA = "Sube una foto (JPG, PNG o WebP) o un video (MP4, MOV o WebM)";

/**
 * POST /api/evidencia?pedido=<slug>: guarda una foto o un video (cuerpo crudo) con su SHA-256 como nombre y devuelve
 * un link que lleva la huella. Si el navegador manda x-sha256, tiene que coincidir con lo que llegó.
 * Ruta aislada (M5): solo acepta archivos de pedidos en curso, por sus primeros bytes, y con tope de tamaño.
 * El cuerpo se lee por partes a un .tmp, calculando la huella en el camino: nunca se junta entero en memoria y se
 * corta apenas pasa el tope, aunque el Content-Length diga otra cosa.
 */
export async function POST(req: Request) {
  const pedido = new URL(req.url).searchParams.get("pedido") ?? "";
  const o = pedido ? orders.get(pedido) : undefined;
  if (!o) return err("No encontramos ese pedido", 404);
  if (!ESTADOS_CON_EVIDENCIA.has(o.status)) return err("Este pedido ya no recibe evidencia", 409);

  const cabecera = req.headers.get("content-length");
  if (cabecera == null || !req.body) return err("Falta el tamaño del archivo (Content-Length). Vuelve a subirlo.", 411);
  if (!/^\d+$/.test(cabecera.trim())) return err("El tamaño del archivo no es válido", 400);
  if (Number(cabecera) > MAX_VIDEO_BYTES) return muyGrande(null);

  const dir = carpetaEvidencia();
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `subida-${process.pid}-${randomBytes(8).toString("hex")}.tmp`);
  try {
    const r = await recibir(req.body, tmp);
    if (r instanceof Response) return r;
    const { sha256, bytes, t } = r;

    const delNavegador = (req.headers.get("x-sha256") ?? "").toLowerCase();
    if (delNavegador && delNavegador !== sha256) return err("La huella no coincide: el archivo cambió en el camino. Vuelve a subirlo.", 400);

    const nombre = `${sha256}.${t.ext}`;
    const destino = path.join(dir, nombre);
    if (!fs.existsSync(destino)) fs.renameSync(tmp, destino);

    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
    const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(host);
    const proto = req.headers.get("x-forwarded-proto") ?? (local ? "http" : "https");
    return Response.json({ sha256, url: `${proto}://${host}/api/evidencia/${nombre}`, bytes, tipo: t.mime });
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/** Lee el cuerpo a `tmp` por partes: decide el tipo con los primeros bytes, corta en su tope y saca la huella. */
async function recibir(body: ReadableStream<Uint8Array>, tmp: string): Promise<Response | { sha256: string; bytes: number; t: TipoEvidencia }> {
  const reader = body.getReader();
  const fh = await fs.promises.open(tmp, "wx");
  const hash = createHash("sha256");
  let cabeza = new Uint8Array(0);
  let t: TipoEvidencia | null = null;
  let bytes = 0;
  let terminado = false;
  try {
    for (;;) {
      let parte: ReadableStreamReadResult<Uint8Array>;
      try {
        parte = await reader.read();
      } catch {
        terminado = true;
        return err("El archivo llegó cortado. Vuelve a subirlo.", 400);
      }
      if (parte.done) {
        terminado = true;
        break;
      }
      const chunk = parte.value;
      bytes += chunk.length;
      if (!t && cabeza.length < 12) {
        const junto = new Uint8Array(Math.min(12, cabeza.length + chunk.length));
        junto.set(cabeza);
        junto.set(chunk.subarray(0, junto.length - cabeza.length), cabeza.length);
        cabeza = junto;
        if (cabeza.length === 12 && !(t = tipoEvidencia(cabeza))) return err(NO_ES_EVIDENCIA, 415);
      }
      if (bytes > (t && !t.video ? MAX_FOTO_BYTES : MAX_VIDEO_BYTES)) return muyGrande(t);
      hash.update(chunk);
      await fh.write(chunk);
    }
  } finally {
    await fh.close();
    if (!terminado) await reader.cancel().catch(() => {});
  }
  t ??= tipoEvidencia(cabeza);
  if (!t) return err(NO_ES_EVIDENCIA, 415);
  return { sha256: hash.digest("hex"), bytes, t };
}
