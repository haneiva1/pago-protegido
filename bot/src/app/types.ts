// Formas de la API de la app web (pago-protegido/app), copiadas de src/lib/server/db.ts y orders.ts.
// Los campos marcados "propuesto" todavía no existen en la app: ver APP-ENDPOINTS.md.

export type OrderStatus = "esperando_pago" | "pagado" | "enviado" | "liberado" | "en_disputa" | "resuelto";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  esperando_pago: "Esperando pago",
  pagado: "Pagado (despacha)",
  enviado: "Enviado",
  liberado: "Liberado",
  en_disputa: "En disputa",
  resuelto: "Resuelto",
};

/** Fila `sellers` (GET /api/sellers/:pubkey → `seller`). */
export interface Seller {
  pubkey: string;
  store_name: string;
  whatsapp: string;
  created_at: number;
  completedSales?: number;
}

/** Fila `orders` sin `escrow_json` ni `verify_json` (PublicOrder de la app). Un link es el pedido. */
export interface Order {
  slug: string;
  seller_pubkey: string;
  product: string;
  description: string;
  photo_url: string;
  price_bs_cents: number;
  /** USD de prueba en unidades base (7 decimales), como string. */
  amount_units: string;
  fx: number;
  delivery_days: number;
  status: OrderStatus;
  buyer_pubkey: string | null;
  funded_at: number | null;
  /** Liberación automática (ms). */
  deadline: number | null;
  shipped_evidence: string | null;
  shipped_at: number | null;
  dispute_by: string | null;
  dispute_reason: string | null;
  buyer_bps: number | null;
  released_at: number | null;
  resolved_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface Money {
  breakdown?: { seller: string; platform: string; tw: string };
  split?: { buyer: string; seller: string; platform: string; tw: string };
}

/** GET /api/orders/:slug */
export interface OrderView extends Money {
  order: Order;
  seller: { store_name: string; whatsapp: string; pubkey: string; completedSales: number };
  platformFeeBps: number;
  mode: "direct" | "guardian";
}

/** GET /api/sellers/:pubkey */
export interface SellerData {
  seller: Seller & { completedSales: number };
  orders: (Order & Money)[];
  /** Saldo de la billetera en USD de prueba (unidades base). */
  balance: string;
}

/** POST /api/links */
export interface CreateLinkInput {
  sellerPubkey: string;
  product: string;
  description?: string;
  photoUrl?: string;
  priceBs: number;
  deliveryDays: number;
}

/** Propuesto: GET /api/bot/changes?since= */
export interface ChangesFeed {
  now: number;
  changes: {
    slug: string;
    status: OrderStatus;
    updated_at: number;
    /** WhatsApp del comprador si aceptó avisos (APP-ENDPOINTS.md §4). Nunca va en la vista pública del pedido. */
    buyer_whatsapp: string | null;
  }[];
}
