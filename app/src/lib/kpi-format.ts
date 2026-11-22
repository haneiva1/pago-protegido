import type { Desenlace, Kpis } from "@/lib/types";

/** Formatos de los KPIs (métricas, panel, perfil público y tarjeta del vendedor). Sin dependencias de servidor. */

const TZ = "America/La_Paz";

export const nf = (n: number, d = 0) => n.toLocaleString("es-BO", { minimumFractionDigits: d, maximumFractionDigits: d });

export function fmtDuracion(s: number | null): string {
  if (s == null) return "—";
  if (s < 3600) return `${nf(Math.max(1, Math.round(s / 60)))} min`;
  if (s < 86400 * 2) return `${nf(s / 3600, 1)} h`;
  return `${nf(s / 86400, 1)} días`;
}

/**
 * Proporción redondeada hacia abajo (nunca exagera). Si son todas, dice "Todas" en lugar del porcentaje:
 * la lista de palabras prohibidas de las pantallas incluye "100%".
 */
export function fmtProporcion(n: number, d: number): string {
  if (!d) return "—";
  if (n >= d) return "Todas";
  return `${Math.floor((n / d) * 100)}%`;
}

export const plural = (n: number, uno: string, varios: string) => `${nf(n)} ${n === 1 ? uno : varios}`;

export const fmtHora = (ms: number | null) =>
  ms
    ? new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: TZ }).format(new Date(ms))
    : "sin datos todavía";

export const fmtFecha = (v: string | number) =>
  new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(v));

export const fmtMesAnio = (v: string | number) => new Intl.DateTimeFormat("es-BO", { month: "long", year: "numeric", timeZone: TZ }).format(new Date(v));

/** "2026-11-18" → "18 nov". */
export const fmtDiaCorto = (dia: string) =>
  new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "short", timeZone: TZ }).format(new Date(`${dia}T12:00:00-04:00`));

/** Desde cuándo vende: la primera compra protegida en el registro público; si no hay, la fecha de la tienda. */
export function desdeTexto(k: Kpis, tiendaDesde: number): string {
  return k.desde ? `Vende con Trato desde ${fmtMesAnio(k.desde)}` : `Tienda creada en ${fmtMesAnio(tiendaDesde)} · todavía sin ventas protegidas`;
}

export const DESENLACE_LABEL: Record<Desenlace, string> = {
  confirmada: "Pagada al vendedor: el comprador confirmó",
  plazo: "Pagada al vendedor por plazo vencido",
  resuelta: "Reclamo resuelto por el revisor",
  devuelta: "Devuelta al comprador: no se despachó a tiempo",
  en_reclamo: "Reclamo en revisión",
  en_curso: "En curso: el pago está bloqueado",
};
