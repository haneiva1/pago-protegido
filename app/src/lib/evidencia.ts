/**
 * Evidencia con huella (M5). Lógica pura, compartida por la ruta /api/evidencia y los tests unitarios: el tipo
 * se decide por los primeros bytes del archivo (no por lo que diga el navegador) y el nombre es su SHA-256.
 */

export const MAX_FOTO_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 40 * 1024 * 1024;

/** Cupo por pedido (la ruta no pide firma todavía): archivos distintos y bytes en total. */
export const MAX_ARCHIVOS_POR_PEDIDO = 8;
export const MAX_BYTES_POR_PEDIDO = 150 * 1024 * 1024;
/** Subidas por IP en una ventana de un minuto. */
export const SUBIDAS_POR_MINUTO = 20;

/**
 * Límite en memoria por clave con ventana fija: devuelve una función que dice si la clave todavía puede pasar.
 * Las ventanas vencidas se limpian cuando el mapa crece, para que no acumule IPs para siempre.
 */
export function limitePorVentana(max: number, ventanaMs: number, ahora: () => number = Date.now) {
  const vistas = new Map<string, { desde: number; n: number }>();
  return (clave: string): boolean => {
    const t = ahora();
    if (vistas.size > 10_000) for (const [k, v] of vistas) if (t - v.desde >= ventanaMs) vistas.delete(k);
    const v = vistas.get(clave);
    if (!v || t - v.desde >= ventanaMs) {
      vistas.set(clave, { desde: t, n: 1 });
      return true;
    }
    return ++v.n <= max;
  };
}

/** La IP del cliente: la última entrada de x-forwarded-for, la que agrega nuestro proxy (las primeras las puede inventar). */
export function ipDeReenvio(xff: string | null): string {
  return (xff ?? "").split(",").map((s) => s.trim()).filter(Boolean).at(-1) ?? "sin-ip";
}

export interface TipoEvidencia {
  ext: "jpg" | "png" | "webp" | "mp4" | "mov" | "webm";
  mime: string;
  video: boolean;
}

const MIME: Record<TipoEvidencia["ext"], string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

const tipo = (ext: TipoEvidencia["ext"]): TipoEvidencia => ({ ext, mime: MIME[ext], video: ext === "mp4" || ext === "mov" || ext === "webm" });
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

/**
 * Marcas (major brand del ftyp, bytes 8 a 12) que son video. Las fotos HEIC/HEIF/AVIF también empiezan con ftyp
 * (heic, mif1, avif…): no son video y no se aceptan.
 */
const MARCAS_VIDEO = new Set(["isom", "iso2", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "M4V ", "M4A ", "3gp4", "3gp5", "3gp6", "3g2a", "qt  "]);
const esFtyp = (b: Uint8Array) => b.length >= 12 && ascii(b, 4, 8) === "ftyp";

/** Fotos JPEG, PNG o WebP y videos MP4, MOV o WebM. Cualquier otra cosa: null. */
export function tipoEvidencia(b: Uint8Array): TipoEvidencia | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return tipo("jpg");
  if (b[0] === 0x89 && ascii(b, 1, 4) === "PNG") return tipo("png");
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return tipo("webp");
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return tipo("webm");
  if (esFtyp(b)) {
    const marca = ascii(b, 8, 12);
    if (!MARCAS_VIDEO.has(marca)) return null;
    return marca === "qt  " ? tipo("mov") : tipo("mp4");
  }
  return null;
}

/** El texto del 415 para lo que `tipoEvidencia` no acepta: una foto con ftyp (HEIC/HEIF/AVIF del celular) se pide en JPG. */
export function rechazoDeTipo(b: Uint8Array): string {
  return esFtyp(b) ? "Sube la foto en JPG" : "Sube una foto (JPG, PNG o WebP) o un video (MP4, MOV o WebM)";
}

/** Nombre de archivo de una evidencia: <sha256>.<ext>. Nada más se sirve ni se guarda. */
export const NOMBRE_EVIDENCIA = /^([0-9a-f]{64})\.(jpg|png|webp|mp4|mov|webm)$/;

export function mimeDeNombre(nombre: string): string | null {
  const m = NOMBRE_EVIDENCIA.exec(nombre);
  return m ? MIME[m[2] as TipoEvidencia["ext"]] : null;
}

/** La huella que lleva el link de una evidencia (o null si el link no es de /api/evidencia). */
export function huellaDeLink(url: string): string | null {
  const m = /\/api\/evidencia\/([0-9a-f]{64})\.(?:jpg|png|webp|mp4|mov|webm)(?:[?#].*)?$/.exec(url);
  return m ? m[1] : null;
}

/**
 * La huella de un link de evidencia de esta app: ruta relativa /api/evidencia/… o el mismo host. Un link de otro host
 * con la misma ruta puede apuntar a cualquier archivo (la foto de otra venta, por ejemplo): es un link externo, null.
 */
export function huellaPropia(url: string, host: string | null | undefined): string | null {
  const h = huellaDeLink(url);
  if (!h) return null;
  if (url.startsWith("/api/evidencia/")) return h;
  if (!host) return null;
  try {
    const u = new URL(url);
    return (u.protocol === "https:" || u.protocol === "http:") && u.host.toLowerCase() === host.toLowerCase() && u.pathname.startsWith("/api/evidencia/")
      ? h
      : null;
  } catch {
    return null;
  }
}
