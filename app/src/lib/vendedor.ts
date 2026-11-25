/**
 * Lógica pura del panel del vendedor: la prueban los tests unitarios con `node --test` (app/test/*.test.mjs). Solo
 * importa lib/format.ts (también pura, por las comisiones), con la extensión para que `node --test` la resuelva.
 */

import { releaseBreakdown } from "./format.ts";

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

/** La línea de resumen del formulario: lo que va con valores por defecto y se cambia con "Cambiar". */
export function resumenLink(f: LinkRapido): string {
  const flete = {
    "": "flete a acordar",
    incluido: "flete incluido",
    por_pagar: "flete por pagar al recoger",
    aparte: f.fleteBs.trim() ? `flete aparte, Bs ${f.fleteBs.trim()}` : "flete aparte",
  }[f.flete];
  return [
    `Despachas en ${f.deliveryDays} ${f.deliveryDays === "1" ? "día" : "días"}`,
    flete,
    f.feePayer === "comprador" ? "tu cliente paga la protección" : "tú pagas la protección",
    ...(f.category && f.category !== "Otro" ? [f.category] : []),
  ].join(" · ");
}

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

// ---------- Ventas en curso ----------

export interface PedidoEnCurso {
  status: string;
  price_bs_cents: number;
  fee_payer?: string | null;
  platform_bps?: number | null;
}

/** Comisión de plataforma cuando el pedido no la tiene guardada: el 2% de siempre (PLATFORM_FEE_BPS por defecto). */
const PLATFORM_BPS_POR_DEFECTO = 200;

/**
 * Lo que le llega al vendedor si el cliente confirma. Si el comprador paga la protección, el precio completo; si la
 * regala el vendedor, el precio menos la plataforma (2%) y el 0,3% del contrato, como releaseBreakdown.
 */
export function netoDelVendedor(o: PedidoEnCurso): number {
  if (o.fee_payer !== "vendedor") return o.price_bs_cents;
  return Number(releaseBreakdown(BigInt(o.price_bs_cents), o.platform_bps ?? PLATFORM_BPS_POR_DEFECTO).seller);
}

/**
 * "Ventas en curso" del panel: lo pagado y lo enviado, por lo que le llega al vendedor. Los pedidos en reclamo van
 * aparte: pueden terminar en 0, así que solo se dice hasta cuánto.
 */
export function ventasEnCurso(pedidos: PedidoEnCurso[]): {
  enCurso: { cantidad: number; netoBsCents: number };
  enReclamo: { cantidad: number; hastaBsCents: number };
} {
  const out = { enCurso: { cantidad: 0, netoBsCents: 0 }, enReclamo: { cantidad: 0, hastaBsCents: 0 } };
  for (const o of pedidos) {
    if (o.status === "pagado" || o.status === "enviado") {
      out.enCurso.cantidad++;
      out.enCurso.netoBsCents += netoDelVendedor(o);
    } else if (o.status === "en_disputa") {
      out.enReclamo.cantidad++;
      out.enReclamo.hastaBsCents += netoDelVendedor(o);
    }
  }
  return out;
}

// ---------- Registrar el envío (lo usa el formulario del panel y el chat de /probar con datos precargados) ----------

import type { PreparedTx } from "./wallet/types.ts";

export interface DatosEnvio {
  slug: string;
  /** Cuenta del vendedor (firma la transacción). */
  signer: string;
  empresa: string;
  guia?: string;
  /** Peso declarado en kg, como texto ("1,2"). */
  pesoKg: string;
  ciudad: string;
  imei?: string;
  /** Huellas de las fotos (EvidenciaInput); vacías si no hay. */
  fotoPaquete?: string;
  fotoGuia?: string;
  onProgress?: (label: string, hash?: string) => void;
}

/** Arma y firma `mark_shipped` igual que el formulario: una sola implementación para el panel y para la demo. */
export async function registrarEnvio(d: DatosEnvio): Promise<void> {
  const { api, getWallet, signAndSubmit } = await import("@/lib/wallet");
  const body = {
    action: "ship",
    signer: d.signer,
    company: d.empresa,
    tracking: d.guia ?? "",
    weight: d.pesoKg,
    city: d.ciudad,
    imei: d.imei ?? "",
    photo: d.fotoPaquete ?? "",
    ...(d.fotoGuia ? { photoGuia: d.fotoGuia } : {}),
  };
  const prepared = await api<PreparedTx>(`/api/orders/${d.slug}/action`, body);
  await signAndSubmit(getWallet("vendedor"), prepared, d.onProgress);
}
