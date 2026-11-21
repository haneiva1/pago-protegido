import { randomBytes } from "node:crypto";
import { verificarSep53 } from "@/lib/sep53";
import { desafios } from "./db";
import { checkBot } from "./http";
import { AppError, isPubkey } from "./orders";

/**
 * "Esta cuenta es tuya", estilo SEP-10 con la firma de SEP-53:
 * 1. POST /api/firma/desafio { cuenta, metodo, ruta } → el servidor guarda un nonce de un solo uso que vence en 2 minutos
 *    (15 para subir evidencia).
 * 2. El navegador firma el `mensaje` con la cuenta de ese rol (billetera local o Pollar), con lib/api-firmada.ts.
 * 3. La llamada lleva el header `x-trato-firma: <cuenta>.<nonce>.<firma base64>`; el servidor saca el nonce de la
 *    tabla (queda quemado aunque la firma falle), revisa cuenta, método, ruta y vencimiento, y verifica la firma.
 * 401: falta la firma, es inválida, venció o ya se usó. 403: la firma es buena pero de otra cuenta (lo decide la ruta).
 * El bot no firma: entra con su clave de servidor (x-bot-key) en las rutas que usa.
 */
export const HEADER_FIRMA = "x-trato-firma";
export const DESAFIO_TTL_MS = 2 * 60_000;
/**
 * Subir evidencia (POST /api/evidencia): un video de 40 MB por datos móviles tarda minutos, y si un proxy junta el
 * cuerpo antes de pasarlo (el túnel de Cloudflare de la demo), la ruta revisa la firma recién al final de la subida.
 */
export const DESAFIO_SUBIDA_TTL_MS = 15 * 60_000;
const ttlDe = (alcance: string) => (alcance === "POST /api/evidencia" ? DESAFIO_SUBIDA_TTL_MS : DESAFIO_TTL_MS);
const METODOS = ["GET", "POST", "PATCH"];
const RUTA = /^\/api\/[A-Za-z0-9/_-]{1,200}$/;

export const alcanceDe = (req: Request) => `${req.method.toUpperCase()} ${new URL(req.url).pathname}`;

export function mensajeDesafio(d: { cuenta: string; alcance: string; nonce: string; vence: number }): string {
  return [
    "Trato: confirmo que esta cuenta es mía.",
    `Cuenta: ${d.cuenta}`,
    `Acción: ${d.alcance}`,
    `Código: ${d.nonce}`,
    `Vence: ${new Date(d.vence).toISOString()}`,
  ].join("\n");
}

/** POST /api/firma/desafio. */
export function emitirDesafio(input: Record<string, unknown>) {
  const cuenta = input.cuenta;
  if (!isPubkey(cuenta)) throw new AppError("Cuenta inválida");
  const metodo = String(input.metodo ?? "").toUpperCase();
  const ruta = typeof input.ruta === "string" ? input.ruta : "";
  if (!METODOS.includes(metodo) || !RUTA.test(ruta)) throw new AppError("Acción inválida");
  const nonce = randomBytes(24).toString("hex");
  const alcance = `${metodo} ${ruta}`;
  const vence = Date.now() + ttlDe(alcance);
  const mensaje = mensajeDesafio({ cuenta, alcance, nonce, vence });
  desafios.add({ nonce, cuenta, alcance, mensaje, vence });
  return { nonce, mensaje, vence };
}

/** La cuenta que firmó esta llamada, o 401. Quema el nonce. */
export function cuentaFirmante(req: Request): string {
  const h = req.headers.get(HEADER_FIRMA);
  if (!h) throw new AppError("Falta la firma de tu cuenta", 401);
  const [cuenta, nonce, firma, ...resto] = h.trim().split(".");
  if (resto.length || !isPubkey(cuenta) || !/^[0-9a-f]{48}$/.test(nonce ?? "") || !firma) throw new AppError("Firma inválida", 401);
  const d = desafios.take(nonce);
  if (!d || d.vence < Date.now()) throw new AppError("La firma venció o ya se usó: vuelve a intentarlo", 401);
  if (d.cuenta !== cuenta || d.alcance !== alcanceDe(req) || !verificarSep53(cuenta, d.mensaje, firma)) {
    throw new AppError("Firma inválida", 401);
  }
  return cuenta;
}

/** Firma válida y de `esperada`: 401 sin firma válida, 403 si firmó otra cuenta. */
export function firmaDe(req: Request, esperada: string | null | undefined, msg403: string): string {
  const cuenta = cuentaFirmante(req);
  if (!esperada || cuenta !== esperada) throw new AppError(msg403, 403);
  return cuenta;
}

/** Si el cuerpo dice una cuenta, tiene que ser la que firmó (403 si no). Devuelve la que firmó. */
export function mismaCuenta(cuenta: string, declarada: unknown, msg403: string): string {
  if (declarada !== undefined && declarada !== null && declarada !== "" && declarada !== cuenta) throw new AppError(msg403, 403);
  return cuenta;
}

/** Rutas que también usa el bot: con x-bot-key entra el bot (clave de servidor, 401 si no coincide). */
export function esBot(req: Request): boolean {
  if (!req.headers.has("x-bot-key")) return false;
  checkBot(req);
  return true;
}
