/**
 * Límite por IP de /probar, en memoria y con ventana deslizante. Cuida la rampa de prueba (cada compra emite dólares
 * de prueba con la cuenta del laboratorio) y el RPC (cada desvío es una simulación). Se reinicia con el proceso: para
 * una demo pública alcanza y no agrega dependencias. Sin alias `@/`: lo prueban los tests unitarios.
 */
export type LimiteTipo = "inicio" | "rampa" | "desvio";

export const LIMITES: Record<LimiteTipo, { max: number; ventanaMs: number }> = {
  /** Pruebas nuevas (dos cuentas nuevas y una compra) por hora. */
  inicio: { max: 6, ventanaMs: 3600_000 },
  /** Pagos simulados desde /probar por hora (incluye reintentos). */
  rampa: { max: 8, ventanaMs: 3600_000 },
  /** Intentos de desvío (simulaciones) por hora. */
  desvio: { max: 30, ventanaMs: 3600_000 },
};

const MAX_CLAVES = 10_000;

export class Limitador {
  private golpes = new Map<string, number[]>();
  private limites: Record<LimiteTipo, { max: number; ventanaMs: number }>;
  constructor(limites: Record<LimiteTipo, { max: number; ventanaMs: number }> = LIMITES) {
    this.limites = limites;
  }

  /** Cuenta un intento. Si se pasó del límite, devuelve en cuántos ms se libera un lugar; si no, null. */
  intentar(tipo: LimiteTipo, ip: string, ahora = Date.now()): number | null {
    const { max, ventanaMs } = this.limites[tipo];
    const clave = `${tipo}:${ip}`;
    const vivos = (this.golpes.get(clave) ?? []).filter((t) => ahora - t < ventanaMs);
    if (vivos.length >= max) {
      this.golpes.set(clave, vivos);
      return vivos[0] + ventanaMs - ahora;
    }
    vivos.push(ahora);
    this.golpes.delete(clave); // al final del Map: así el más viejo es el primero en salir
    this.golpes.set(clave, vivos);
    if (this.golpes.size > MAX_CLAVES) this.golpes.delete(this.golpes.keys().next().value!);
    return null;
  }
}

/**
 * IP de quien llama. Detrás de Caddy (deploy) llega en X-Forwarded-For: Caddy la reemplaza por la IP real salvo que
 * se configuren proxies de confianza. Sin proxy (localhost) todas las llamadas comparten "local".
 */
export function ipDe(headers: { get(name: string): string | null }): string {
  const xff = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return xff || headers.get("x-real-ip")?.trim() || "local";
}

export function minutosDe(ms: number): number {
  return Math.max(1, Math.ceil(ms / 60_000));
}
