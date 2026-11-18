import type { EvidenceRow, OrderRow, SellerRow, TxRow } from "@/lib/server/db";
import type { OnchainState, Verification } from "@/lib/server/escrow/types";

export type { EvidenceRow, OrderRow, SellerRow, TxRow, OnchainState, Verification };

export type PublicOrder = Omit<OrderRow, "escrow_json" | "verify_json" | "buyer_whatsapp" | "recipient_name" | "dest_city" | "pref_agency"> & {
  verification: Verification | null;
};

/** Lo que ve el vendedor y el revisor: con los datos de entrega. */
export type SellerOrderFields = { recipient_name: string | null; dest_city: string | null; pref_agency: string | null };

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
}

export interface OrderView extends MoneyView {
  order: PublicOrder;
  seller: SellerCard;
  confirmDelay: string;
  demoTimers: boolean;
  capabilities: { extend: boolean; clockFromShipping: boolean };
  txs: TxRow[];
  platformFeeBps: number;
  mode: "direct" | "guardian";
  onchain: OnchainState | null;
}

export type SellerOrder = PublicOrder & SellerOrderFields & MoneyView & { txs: TxRow[] };

export interface SellerData {
  seller: SellerRow & { completedSales: number };
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
  capabilities: { extend: boolean; clockFromShipping: boolean };
  demoTimers: boolean;
}
