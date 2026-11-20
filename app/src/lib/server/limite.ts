import { AppError } from "./orders";

/**
 * Límite por IP de las rutas públicas sensibles: ventana fija de 1 minuto, en memoria (un solo proceso).
 * IP: el header de PP_IP_HEADER si está configurado (p. ej. cf-connecting-ip); si no, la última entrada de
 * x-forwarded-for, que es la que agrega el proxy del deploy (Next.js solo la pone si falta). Sin proxy, un cliente
 * podría inventarse ese header: el deploy público tiene que ir detrás de uno.
 * Las cifras son altas a propósito: en Bolivia muchos celulares salen a internet por la misma IP (CGNAT).
 */
export const LIMITES = {
  desafio: 120,
  pago: 12,
  activar: 12,
  verificar: 30,
  piloto: 10,
  enviar: 60,
  plazo: 30,
} as const;
export type Cubo = keyof typeof LIMITES;
const VENTANA_MS = 60_000;

const g = globalThis as unknown as { __ppLimites?: Map<string, { n: number; desde: number }> };
const cubos = (g.__ppLimites ??= new Map());

export function ipDe(req: Request): string {
  const propio = process.env.PP_IP_HEADER?.trim().toLowerCase();
  const v = propio ? req.headers.get(propio)?.trim() : undefined;
  if (v) return v;
  const xff = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return xff.at(-1) ?? "sin-ip";
}

export function limitar(req: Request, cubo: Cubo, ahora = Date.now()): void {
  const max = LIMITES[cubo] * Math.max(1, Number(process.env.PP_LIMITE_FACTOR) || 1);
  const k = `${cubo}|${ipDe(req)}`;
  let c = cubos.get(k);
  if (!c || ahora - c.desde >= VENTANA_MS) {
    if (cubos.size > 20_000) for (const [key, val] of cubos) if (ahora - val.desde >= VENTANA_MS) cubos.delete(key);
    c = { n: 0, desde: ahora };
    cubos.set(k, c);
  }
  if (++c.n > max) throw new AppError("Demasiados intentos seguidos desde tu conexión. Espera un minuto y vuelve a intentarlo.", 429);
}

/** Solo para tests. */
export function reiniciarLimites() {
  cubos.clear();
}
