import type { OrderRow, SellerRow, TxRow } from "@/lib/server/db";
import type { OnchainState, Verification } from "@/lib/server/escrow/types";

export type { OrderRow, SellerRow, TxRow, OnchainState, Verification };

export type PublicOrder = Omit<OrderRow, "escrow_json" | "verify_json"> & { verification: Verification | null };

export interface MoneyView {
  breakdown?: { seller: string; platform: string; tw: string };
  split?: { buyer: string; seller: string; platform: string; tw: string };
}

export interface OrderView extends MoneyView {
  order: PublicOrder;
  seller: { store_name: string; whatsapp: string; pubkey: string; completedSales: number };
  txs: TxRow[];
  platformFeeBps: number;
  mode: "direct" | "guardian";
  onchain: OnchainState | null;
}

export type SellerOrder = PublicOrder & MoneyView & { txs: TxRow[] };

export interface SellerData {
  seller: SellerRow & { completedSales: number };
  orders: SellerOrder[];
  balance: string;
}

export interface DisputeItem extends PublicOrder {
  seller?: SellerRow;
  txs: TxRow[];
  onchain: OnchainState | null;
}

export interface ArbitroData {
  open: DisputeItem[];
  resolved: (SellerOrder & MoneyView)[];
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
}
