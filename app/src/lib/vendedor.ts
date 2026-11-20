/**
 * Lógica pura del panel del vendedor (sin imports en tiempo de ejecución): la prueban los tests unitarios
 * con `node --test` (app/test/*.test.mjs).
 */

const TZ = "America/La_Paz";
const HORA = 3600_000;

// ---------- Pendientes de hoy ----------

/** El vendedor responde un reclamo en 48 h (política de reclamos). */
export const RESPONDER_EN_MS = 48 * HORA;

export interface PedidoPendiente {
  slug: string;
  code?: string | null;
  product: string;
  status: string;
  ship_deadline?: number | null;
  disputed_at?: number | null;
  dispute_by?: string | null;
  seller_reply?: string | null;
}

export interface Pendiente {
  slug: string;
  code: string | null;
  product: string;
  tipo: "despachar" | "responder";
  /** Hasta cuándo (ms), o null si no hay plazo conocido. */
  vence: number | null;
  cuando: "vencido" | "hoy" | "despues";
}

const dia = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

/**
 * Lo que el vendedor tiene que hacer: despachar lo pagado y responder los reclamos que abrió el comprador.
 * Primero lo vencido, después lo de hoy (día de Bolivia) y al final lo que vence más adelante.
 */
export function pendientes(pedidos: PedidoPendiente[], ahora: number): Pendiente[] {
  const out: Pendiente[] = [];
  for (const o of pedidos) {
    let tipo: Pendiente["tipo"] | null = null;
    let vence: number | null = null;
    if (o.status === "pagado") {
      tipo = "despachar";
      vence = o.ship_deadline ?? null;
    } else if (o.status === "en_disputa" && o.dispute_by !== "vendedor" && !o.seller_reply) {
      tipo = "responder";
      vence = o.disputed_at ? o.disputed_at + RESPONDER_EN_MS : null;
    }
    if (!tipo) continue;
    const cuando = vence == null ? "despues" : vence < ahora ? "vencido" : dia(vence) === dia(ahora) ? "hoy" : "despues";
    out.push({ slug: o.slug, code: o.code ?? null, product: o.product, tipo, vence, cuando });
  }
  const orden = { vencido: 0, hoy: 1, despues: 2 };
  return out.sort((a, b) => orden[a.cuando] - orden[b.cuando] || (a.vence ?? Infinity) - (b.vence ?? Infinity));
}

// ---------- Link rápido: flete y "Duplicar" ----------

export type TipoFlete = "" | "incluido" | "por_pagar" | "aparte";

/** "aparte:25.5" → { tipo: "aparte", bs: "25,5" }; para volver a llenar el formulario. */
export function fleteAFormulario(flete: string | null | undefined): { tipo: TipoFlete; bs: string } {
  if (flete === "incluido" || flete === "por_pagar") return { tipo: flete, bs: "" };
  const m = /^aparte:(\d+(?:\.\d+)?)$/.exec(flete ?? "");
  return m ? { tipo: "aparte", bs: m[1].replace(".", ",") } : { tipo: "", bs: "" };
}

export interface LinkRapido {
  product: string;
  priceBs: string;
  deliveryDays: string;
  flete: TipoFlete;
  fleteBs: string;
  category: string;
  description: string;
  photoUrl: string;
  feePayer: "comprador" | "vendedor";
}

export const LINK_VACIO: LinkRapido = {
  product: "",
  priceBs: "",
  deliveryDays: "3",
  flete: "",
  fleteBs: "",
  category: "Otro",
  description: "",
  photoUrl: "",
  feePayer: "comprador",
};

/** "Duplicar": el formulario del link rápido con los datos de un link anterior (el precio, sin centavos de más). */
export function duplicarLink(o: {
  product: string;
  price_bs_cents: number;
  delivery_days: number;
  flete?: string | null;
  category?: string | null;
  description?: string | null;
  photo_url?: string | null;
  fee_payer?: string | null;
}): LinkRapido {
  const bs = o.price_bs_cents / 100;
  const f = fleteAFormulario(o.flete);
  return {
    product: o.product,
    priceBs: Number.isInteger(bs) ? String(bs) : bs.toFixed(2).replace(".", ","),
    deliveryDays: String(o.delivery_days),
    flete: f.tipo,
    fleteBs: f.bs,
    category: o.category || "Otro",
    description: o.description ?? "",
    photoUrl: o.photo_url ?? "",
    feePayer: o.fee_payer === "vendedor" ? "vendedor" : "comprador",
  };
}
