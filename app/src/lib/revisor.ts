/**
 * Lógica pura del panel del revisor (M10): qué regla de la política de reclamos aplica a cada reclamo, los plazos y
 * la evidencia de cada parte. Solo importa lib/comprador.ts (también pura, por el umbral del video), con la extensión
 * para que `node --test` la resuelva. La prueban los tests unitarios.
 */

import { VIDEO_OBLIGATORIO_DESDE_BS_CENTS } from "./comprador.ts";

const HORA = 3600_000;

/** Plazos de la política de reclamos, contados desde que se abre el reclamo. */
export const PLAZOS_RECLAMO = { vendedorResponde: 48 * HORA, compradorAgrega: 48 * HORA, revisorDecide: 72 * HORA };

/** Criterios de la política (/como-funciona#reclamos), en el orden en que se aplican. */
export const CRITERIOS = [
  "Sin prueba de envío, gana el comprador",
  "Entrega no registrada o dirección distinta a la del link, gana el comprador",
  "Entrega registrada y sin video de desempaque, gana el vendedor",
  "Peso que no coincide, gana el comprador",
  "Distinto o dañado: primero vuelve el producto y después el reembolso",
] as const;

export const REPARTO_PARCIAL = "Reparto parcial solo con acuerdo de las partes o daño parcial probado.";

const CON_VIDEO = ["Llegó vacío o con otro producto", "Dañado o distinto a lo descrito"];

export interface ReclamoRevisor {
  status: string;
  /** Precio del producto: desde Bs 300 el video del desempaque es obligatorio. */
  price_bs_cents?: number | null;
  dispute_reason?: string | null;
  dispute_by?: string | null;
  dispute_video?: string | null;
  disputed_at?: number | null;
  seller_reply?: string | null;
  shipped_at?: number | null;
  ship_company?: string | null;
  ship_tracking?: string | null;
  ship_weight?: string | null;
  ship_city?: string | null;
  dest_city?: string | null;
}

export interface Regla {
  /** Índice en CRITERIOS (0–4), o null si aplica la regla de plazos (el vendedor no respondió). */
  criterio: number | null;
  titulo: string;
  /** Por qué aplica, con los datos del pedido. */
  detalle: string;
  /** A quién favorece la política, o null si el revisor tiene que comprobar algo antes. */
  gana: "comprador" | "vendedor" | null;
}

/** La regla que aplica según el motivo, lo registrado y los plazos. No decide: el revisor elige el reparto. */
export function reglaDelReclamo(d: ReclamoRevisor, ahora: number): Regla {
  const motivo = d.dispute_reason ?? "";
  const enviado = Boolean(d.shipped_at || d.ship_company);
  const guia = [d.ship_company, d.ship_tracking && `guía ${d.ship_tracking}`].filter(Boolean).join(", ");

  if (d.dispute_by !== "vendedor" && !d.seller_reply && d.disputed_at && ahora > d.disputed_at + PLAZOS_RECLAMO.vendedorResponde) {
    return {
      criterio: null,
      titulo: "El vendedor no respondió en 48 h",
      detalle: "La política dice que, si el vendedor no responde, el comprador recupera todo su pago.",
      gana: "comprador",
    };
  }
  if (!enviado || motivo === "No envió") {
    return enviado
      ? {
          criterio: 1,
          titulo: CRITERIOS[1],
          detalle: `El reclamo es "No envió", pero hay un envío registrado (${guia}). Comprueba con la empresa si la guía existe y fue entregada; si no, gana el comprador.`,
          gana: null,
        }
      : { criterio: 0, titulo: CRITERIOS[0], detalle: "El vendedor no registró ningún envío para este pedido.", gana: "comprador" };
  }
  if (d.ship_city && d.dest_city && d.ship_city !== d.dest_city) {
    return {
      criterio: 1,
      titulo: CRITERIOS[1],
      detalle: `El link pedía el envío a ${d.dest_city} y el vendedor lo registró a ${d.ship_city}.`,
      gana: "comprador",
    };
  }
  if (CON_VIDEO.includes(motivo)) {
    if (!d.dispute_video) {
      // Bajo el umbral la app le dijo al comprador que el video era opcional: no se le puede dar por perdido.
      if (d.price_bs_cents != null && d.price_bs_cents < VIDEO_OBLIGATORIO_DESDE_BS_CENTS) {
        return {
          criterio: 2,
          titulo: `Entrega registrada y sin video, pero bajo Bs ${VIDEO_OBLIGATORIO_DESDE_BS_CENTS / 100} el video no era obligatorio`,
          detalle: `El envío está registrado (${guia}) y no hay video del desempaque. Bajo Bs ${VIDEO_OBLIGATORIO_DESDE_BS_CENTS / 100} el video es opcional: decide con la foto del paquete cerrado, el peso${d.ship_weight ? ` (${d.ship_weight} kg)` : ""} y la respuesta del vendedor.`,
          gana: null,
        };
      }
      return {
        criterio: 2,
        titulo: CRITERIOS[2],
        detalle: `El envío está registrado (${guia}) y el comprador no subió el video continuo del desempaque.`,
        gana: "vendedor",
      };
    }
    return {
      criterio: 3,
      titulo: `${CRITERIOS[3]}. ${CRITERIOS[4]}`,
      detalle: `Hay video del desempaque. Compara lo que muestra con el peso declarado${d.ship_weight ? ` (${d.ship_weight} kg)` : ""}: si no coincide, gana el comprador. Si llegó distinto o dañado, primero vuelve el producto y después el reembolso.`,
      gana: null,
    };
  }
  // "No llegó" y "Presión para confirmar": el envío está registrado; falta saber si se entregó.
  return {
    criterio: 1,
    titulo: CRITERIOS[1],
    detalle: `${motivo === "Presión para confirmar" ? "El comprador dice que le pidieron confirmar antes de tener el producto. " : ""}Comprueba con la empresa el estado de la guía (${guia}): si la entrega no está registrada, gana el comprador.`,
    gana: null,
  };
}

export interface PlazoReclamo {
  clave: "vendedor" | "comprador" | "revisor";
  texto: string;
  hasta: number;
  hecho: boolean;
  vencido: boolean;
}

/** Los tres plazos de la política, desde que se abrió el reclamo. */
export function plazosDelReclamo(d: ReclamoRevisor & { dispute_photo?: string | null }, ahora: number): PlazoReclamo[] {
  if (!d.disputed_at) return [];
  const p = (clave: PlazoReclamo["clave"], texto: string, ms: number, hecho: boolean): PlazoReclamo => {
    const hasta = d.disputed_at! + ms;
    return { clave, texto, hasta, hecho, vencido: !hecho && ahora > hasta };
  };
  const contraparte = d.dispute_by === "vendedor" ? "El comprador responde" : "El vendedor responde";
  return [
    p("vendedor", contraparte, PLAZOS_RECLAMO.vendedorResponde, d.dispute_by === "vendedor" ? false : Boolean(d.seller_reply)),
    p("comprador", "El comprador agrega evidencia", PLAZOS_RECLAMO.compradorAgrega, Boolean(d.dispute_photo || d.dispute_video)),
    p("revisor", "Decides", PLAZOS_RECLAMO.revisorDecide, d.status === "resuelto"),
  ];
}

// ---------- Evidencia de cada parte ----------

export interface EvidenciaRow {
  id: number;
  actor: string;
  kind: string;
  data_json: string;
  created_at: number;
}

export interface Archivo {
  parte: "comprador" | "vendedor";
  etiqueta: string;
  url: string;
  tipo: "foto" | "video";
}

/** Fotos y videos que registró cada parte (envío, reclamo), sin repetir links. */
export function evidenciaDeLasPartes(rows: EvidenciaRow[]): { comprador: Archivo[]; vendedor: Archivo[] } {
  const out: { comprador: Archivo[]; vendedor: Archivo[] } = { comprador: [], vendedor: [] };
  const vistos = new Set<string>();
  const add = (parte: Archivo["parte"], etiqueta: string, url: unknown, tipo: Archivo["tipo"]) => {
    if (typeof url !== "string" || !url || vistos.has(url)) return;
    vistos.add(url);
    out[parte].push({ parte, etiqueta, url, tipo });
  };
  for (const r of rows) {
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(r.data_json) as Record<string, unknown>;
    } catch {
      continue;
    }
    const parte = r.actor === "vendedor" ? "vendedor" : "comprador";
    if (r.kind === "envio") {
      add("vendedor", "Foto de la guía", data.photoGuia, "foto");
      add("vendedor", "Foto del paquete", data.photo, "foto");
    } else if (r.kind === "reclamo") {
      add(parte, parte === "comprador" ? "Foto del paquete" : "Foto", data.photo, "foto");
      add(parte, "Video del desempaque", data.video, "video");
    }
  }
  return out;
}
