import type { TxProbar } from "@/lib/probar";

/** Lo que el servidor le cuenta a /probar: plazos de demo, la tienda, su último pedido y cada movimiento con su hash. */

export interface Plazos {
  despachoSegundos: number;
  confirmarSegundos: number;
  demoTimers: boolean;
}

export interface PedidoProbar {
  slug: string;
  code: string | null;
  product: string;
  status: string;
  total: string;
  escrow_id: string | null;
  created_at: number;
  demo: boolean;
}

export interface Registro {
  tienda: { nombre: string; pubkey: string } | null;
  pedido: PedidoProbar | null;
  movimientos: TxProbar[];
}

export interface Desvio {
  rejected: boolean;
  by: "contrato" | "servidor";
  detail: string;
  call?: string;
  code?: number;
  raw?: string;
  escrowId: string | null;
  at: number;
}
