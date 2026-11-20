import type { EvidenceRow, OrderRow, SellerRow, TxRow } from "@/lib/server/db";
import type { OnchainState, Verification } from "@/lib/server/escrow/types";

export type { EvidenceRow, OrderRow, SellerRow, TxRow, OnchainState, Verification };

// ---------- KPIs del registro público (/metricas, panel del vendedor y /tienda/<slug>) ----------

export type Grupo = "equipo" | "piloto";
export type KpiClave = "compras" | "sin-reclamo" | "cobro" | "reclamos" | "devoluciones" | "mas-tiempo" | "despacho";
export type Desenlace = "confirmada" | "plazo" | "resuelta" | "devuelta" | "en_reclamo" | "en_curso";

/** Una compra según sus eventos on-chain (pp_funded, pp_shipped, pp_extended, pp_disputed y el primer evento terminal). */
export interface CompraOnchain {
  escrow: string;
  seller: string;
  amount: string;
  funded_at: string;
  tx_fondeo: string;
  shipped_at: string | null;
  tx_envio: string | null;
  extended_at: string | null;
  tx_extension: string | null;
  disputed_at: string | null;
  tx_reclamo: string | null;
  reclamo_por: "comprador" | "vendedor" | null;
  closed_at: string | null;
  tx_cierre: string | null;
  buyer_bps: number | null;
  desenlace: Desenlace;
}

export interface Kpis {
  compras: number;
  monto_unidades: string;
  monto_bs: number;
  en_curso: number;
  cerradas: number;
  /** Confirmadas por el comprador o liberadas por plazo vencido. */
  pagadas_al_vendedor: number;
  /** Solo pp_confirmed, sin reclamo (el "% confirmadas sin reclamo" de /metricas). */
  confirmadas_sin_reclamo: number;
  plazo_sin_reclamo: number;
  /** Pagadas al vendedor sin reclamo (el "% sin reclamo" del vendedor). */
  ventas_sin_reclamo: number;
  cobro_mediana_s: number | null;
  cobro_muestras: number;
  despacho_promedio_s: number | null;
  despacho_muestras: number;
  reclamos: { total: number; en_revision: number; resueltos: number; a_favor_comprador: number; a_favor_vendedor: number; repartidos: number };
  devoluciones_sin_despacho: number;
  mas_tiempo: number;
  reclamos_perdidos: number;
  /** Primera compra protegida (hora del ledger). */
  desde: string | null;
}

export interface DiaSerie {
  dia: string;
  compras: number;
  monto_bs: number;
}

export interface GrupoMetricas {
  kpis: Kpis;
  diario: DiaSerie[];
}

export interface MetricasSnapshot {
  equipo: GrupoMetricas;
  piloto: GrupoMetricas;
  /** Última lectura exitosa de la red (ms). Si el RPC falla, no se mueve. */
  actualizado: number | null;
  calculado: number;
  error: string | null;
  eventos: number;
  hasta_ledger: number;
  contratos: { guardian: string; arbiter: string };
  fx: number;
}

export interface PerfilTienda {
  slug: string;
  store_name: string;
  city: string | null;
  pilot: boolean;
  tienda_desde: number;
  cuenta: string;
  kpis: Kpis;
  verificacion: "pendiente";
  registro: CompraOnchain[];
  actualizado: number | null;
  error: string | null;
  fx: number;
}

export type PublicOrder = Omit<OrderRow, "escrow_json" | "verify_json" | "buyer_whatsapp" | "recipient_name" | "dest_city" | "pref_agency" | "pickup_phone"> & {
  verification: Verification | null;
};

/** Lo que ve el vendedor y el revisor: con los datos de entrega. */
export type SellerOrderFields = { recipient_name: string | null; dest_city: string | null; pref_agency: string | null; pickup_phone?: string | null };

export interface MoneyView {
  breakdown?: { seller: string; platform: string; tw: string };
  split?: { buyer: string; seller: string; platform: string; tw: string };
}

export interface SellerCard {
  store_name: string;
  whatsapp: string;
  pubkey: string;
  city: string | null;
  since: number;
  completedSales: number;
  claims: { total: number; pendientes: number; a_favor_comprador: number; a_favor_vendedor: number; repartidos: number };
  verification: "pendiente";
  slug: string | null;
  /** Los mismos números del perfil público, calculados con el registro público. */
  kpis: Kpis;
}

export interface OrderView extends MoneyView {
  order: PublicOrder;
  seller: SellerCard;
  confirmDelay: string;
  demoTimers: boolean;
  capabilities: { extend: boolean; clockFromShipping: boolean; refundUnshipped?: boolean; proteccionPatch?: boolean };
  txs: TxRow[];
  platformFeeBps: number;
  mode: "direct" | "guardian";
  onchain: OnchainState | null;
}

export type SellerOrder = PublicOrder & SellerOrderFields & MoneyView & { txs: TxRow[] };

export interface SellerData {
  seller: SellerRow & { completedSales: number };
  /** KPIs propios del vendedor, calculados con el registro público. */
  kpis: Kpis;
  orders: SellerOrder[];
  balance: string;
  fx: number;
}

export interface DisputeItem extends PublicOrder, SellerOrderFields {
  seller?: SellerRow;
  txs: TxRow[];
  evidence: EvidenceRow[];
  onchain: OnchainState | null;
}

export interface ArbitroData {
  open: DisputeItem[];
  resolved: (PublicOrder & MoneyView & { txs: TxRow[]; evidence: EvidenceRow[] })[];
  platformFeeBps: number;
  mode: "direct" | "guardian";
}

export interface InfoData {
  mode: "direct" | "guardian";
  fx: number;
  platformFeeBps: number;
  wasmHash: string;
  factory: string | null;
  contracts: { label: string; id: string; kind: "contract" | "account" }[];
  capabilities: { extend: boolean; clockFromShipping: boolean; refundUnshipped?: boolean; proteccionPatch?: boolean };
  demoTimers: boolean;
}
