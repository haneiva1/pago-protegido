/**
 * Lógica pura de la página del comprador (sin imports en tiempo de ejecución): la prueban los tests unitarios
 * con `node --test` (app/test/*.test.mjs).
 */

const TZ = "America/La_Paz";

/** "vie, 21 nov": la fecha límite de despacho, como se dice en el chat. */
export function fmtDia(ms: number): string {
  return new Intl.DateTimeFormat("es-BO", { weekday: "short", day: "numeric", month: "short", timeZone: TZ }).format(new Date(ms));
}

/** "3 días", "1 día", "2 minutos" (plazos de demo). */
export function fmtPlazo(secs: number): string {
  if (secs >= 86400) {
    const d = Math.round(secs / 86400);
    return `${d} ${d === 1 ? "día" : "días"}`;
  }
  const m = Math.max(1, Math.round(secs / 60));
  return `${m} ${m === 1 ? "minuto" : "minutos"}`;
}

/** Plazos v2 del pedido (DECISIONES 77): despacho desde el pago y revisión desde el envío. */
export function plazosDelPedido(o: { ship_secs?: number | null; inspect_secs?: number | null; window_secs?: number | null; delivery_days: number }) {
  return {
    despacho: o.ship_secs ?? o.window_secs ?? o.delivery_days * 86400,
    revision: o.inspect_secs ?? o.window_secs ?? (o.delivery_days + 3) * 86400,
  };
}

// ---------- Acceso a la compra (M6) ----------

export type AppInterna = "Facebook" | "Messenger" | "Instagram" | "TikTok";

/**
 * Navegador interno de una app (abre los links con datos aparte). Ahí la cuenta del comprador queda atada a esa app:
 * si después abre el link en Chrome o Safari, no puede confirmar ni reclamar. Messenger va antes que Facebook.
 */
export function navegadorInterno(ua: string): AppInterna | null {
  if (/\bInstagram\b/i.test(ua)) return "Instagram";
  if (/FBAN\/Messenger|FB_IAB\/(MESSENGER|Orca-Android)|\bMessengerForiOS\b|\bMessengerLite/i.test(ua)) return "Messenger";
  if (/FBAN|FBAV|FB_IAB|FBIOS|\bFBSS\b/.test(ua)) return "Facebook";
  if (/musical_ly|BytedanceWebview|\bTikTok\b|\btrill_\d|\bByteLocale\b/i.test(ua)) return "TikTok";
  return null;
}

export type Plataforma = "android" | "ios" | "otro";

export function plataforma(ua: string): Plataforma {
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  return "otro";
}

/** Link que en Android abre la misma página en Chrome (sale del navegador interno de la app). */
export function linkAbrirEnChrome(url: string): string | null {
  const m = /^(https?):\/\/(.+)$/i.exec(url);
  if (!m) return null;
  return `intent://${m[2]}#Intent;scheme=${m[1].toLowerCase()};package=com.android.chrome;end`;
}
