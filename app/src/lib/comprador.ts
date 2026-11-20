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

/**
 * Texto del registro público (PublicRecord) según el estado y el rol: "bloqueado" solo mientras la plata sigue en el
 * contrato; después, a dónde fue.
 */
export function textoRegistroPublico(status: string | undefined, role: "comprador" | "vendedor" = "comprador"): string {
  const c = role === "comprador";
  switch (status) {
    case "liberado":
      return c ? "✅ Pago liberado al vendedor. El contrato ya le pagó." : "✅ Pago liberado a ti. El contrato ya te pagó.";
    case "devuelto":
      return c ? "↩️ Te devolvimos el pago: el contrato lo mandó de vuelta a tu cuenta." : "↩️ El pago volvió al comprador: no se registró el envío a tiempo.";
    case "resuelto":
      return "⚖️ Reclamo resuelto: el contrato repartió el pago entre comprador y vendedor.";
    case "en_disputa":
      return c
        ? "🔒 Pago congelado por el reclamo en un contrato público: solo puede ir al vendedor o volver a ti."
        : "🔒 Pago congelado por el reclamo en un contrato público: solo puede ir a ti o volver al comprador.";
    default:
      return c
        ? "🔒 Pago bloqueado en un contrato público: solo puede ir al vendedor o volver a ti."
        : "🔒 Pago bloqueado en un contrato público: solo puede ir a ti o volver al comprador.";
  }
}

// ---------- Último tramo: flete (M7) ----------

/** Flete guardado como "incluido", "por_pagar" o "aparte:<Bs>". No cambia el monto protegido: es lo acordado. */
export function parseFlete(tipo: unknown, montoBs?: unknown): string | null {
  if (tipo === "incluido" || tipo === "por_pagar") return tipo;
  if (tipo === "aparte") {
    const n = Number(String(montoBs ?? "").replace(",", "."));
    if (!Number.isFinite(n) || n <= 0 || n > 5000) return null;
    return `aparte:${Math.round(n * 100) / 100}`;
  }
  return null;
}

export function fmtFlete(flete: string | null | undefined): string | null {
  if (!flete) return null;
  if (flete === "incluido") return "Flete incluido en el precio";
  if (flete === "por_pagar") return "Flete por pagar al recoger";
  const m = /^aparte:(\d+(?:\.\d+)?)$/.exec(flete);
  return m ? `Flete aparte: más Bs ${Number(m[1]).toLocaleString("es-BO")}, fuera de este pago` : null;
}

// ---------- Reclamo guiado (M8) ----------

/** Motivos que tienen sentido en cada estado (los mismos textos que valida el servidor en MOTIVOS). */
export function motivosReclamo(status: string): string[] {
  if (status === "pagado") return ["No envió"];
  if (status === "enviado") return ["No llegó", "Llegó vacío o con otro producto", "Dañado o distinto a lo descrito"];
  return [];
}

export const DESCRIPCION_MOTIVO: Record<string, string> = {
  "No envió": "La tienda no despachó el pedido o te dijo que no lo va a enviar.",
  "No llegó": "Lo despachó, pero no llegó a la agencia o no te lo entregan.",
  "Llegó vacío o con otro producto": "Abriste el paquete y no está lo que compraste.",
  "Dañado o distinto a lo descrito": "Llegó roto, usado o distinto a lo que te ofrecieron.",
};

export interface EvidenciaPedida {
  foto: "pedida" | "opcional" | "no";
  video: "obligatorio" | "opcional" | "no";
  pasos: string[];
}

/** Qué evidencia hace falta según el motivo (política de reclamos; el video desde Bs 300 lo exige también el servidor). */
export function evidenciaPedida(motivo: string, precioBsCents: number): EvidenciaPedida {
  if (motivo === "No envió") return { foto: "no", video: "no", pasos: ["No necesitas evidencia: el registro muestra si hubo envío o no."] };
  if (motivo === "No llegó")
    return {
      foto: "opcional",
      video: "no",
      pasos: ["Cuéntanos qué te dijo la agencia y cuándo preguntaste.", "Si tienes foto del aviso o del comprobante de la agencia, súbela."],
    };
  const obligatorio = precioBsCents >= 30000;
  return {
    foto: "pedida",
    video: obligatorio ? "obligatorio" : "opcional",
    pasos: [
      "Foto del paquete cerrado, con la guía a la vista.",
      `Video continuo del desempaque, sin cortes${obligatorio ? " (obligatorio desde Bs 300)" : ""}.`,
    ],
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
