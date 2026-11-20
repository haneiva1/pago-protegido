// Formas de la API de la app web (pago-protegido/app v2), copiadas de src/lib/server/db.ts y orders.ts.
// Ver APP-ENDPOINTS.md: §1–§8 ya existen en la app.

export type OrderStatus = "esperando_pago" | "pagado" | "enviado" | "liberado" | "en_disputa" | "resuelto" | "devuelto";

/** Quién paga la protección del link (APP-ENDPOINTS.md §6). */
export type Proteccion = "comprador" | "vendedor";

/** Categorías de la app. "Celular" hace que la app pida el IMEI al despachar. */
export type Categoria = "Celular" | "Electrónica" | "Ropa y calzado" | "Otro";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  esperando_pago: "Esperando pago",
  pagado: "Pagado (despacha)",
  enviado: "Enviado",
  liberado: "Liberado",
  en_disputa: "En disputa",
  resuelto: "Resuelto",
  devuelto: "Devuelto (no se despachó)",
};

/** Fila `sellers` (GET /api/sellers/:pubkey → `seller`). */
export interface Seller {
  pubkey: string;
  store_name: string;
  whatsapp: string;
  created_at: number;
  completedSales?: number;
  /** Perfil público /tienda/<slug> (la app lo asigna al crear la tienda). */
  slug?: string | null;
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
  /** Código corto y legible que genera la app ("PP-4821"). Los pedidos viejos pueden no tenerlo. */
  code?: string | null;
  category?: string | null;
  /** Quién paga la protección (por defecto, el comprador). */
  proteccion?: Proteccion | null;
  /** Protección en centavos de Bs. Si la paga el comprador, la suma al precio. */
  proteccion_bs_cents?: number | null;
  /** `platform_fee` del escrow de este pedido (bps): con la protección del comprador, el vendedor recibe el precio. */
  platform_bps?: number | null;
  funded_at: number | null;
  /** Hasta cuándo puede despachar el vendedor (ms, hora del contrato). Existe desde que se paga. */
  ship_deadline?: number | null;
  /**
   * Liberación automática (ms): `release_at` del contrato v2, el fin de la revisión contado DESDE EL ENVÍO.
   * Es null antes de que se marque enviado.
   */
  deadline: number | null;
  /** 1 si el comprador ya usó "Necesito más tiempo" (una sola vez; suma otra ventana de revisión). */
  extended?: number | boolean | null;
  shipped_evidence: string | null;
  shipped_at: number | null;
  dispute_by: string | null;
  dispute_reason: string | null;
  buyer_bps: number | null;
  released_at: number | null;
  resolved_at: number | null;
  /** Devolución automática por no despachar a tiempo (estado `devuelto`). */
  refunded_at?: number | null;
  created_at: number;
  updated_at: number;
}

export interface Money {
  breakdown?: { seller: string; platform: string; tw: string };
  split?: { buyer: string; seller: string; platform: string; tw: string };
  /** Devolución completa: solo con PP_DEVOLUCION_COMPLETA=1 en la app (ver Reintegro). */
  reintegro?: Reintegro;
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
  /** Por defecto "comprador". */
  proteccion?: Proteccion;
  category?: Categoria;
}

/** GET /api/bot/changes?since= */
export interface ChangesFeed {
  now: number;
  changes: {
    slug: string;
    status: OrderStatus;
    updated_at: number;
    /** WhatsApp del comprador si aceptó avisos (APP-ENDPOINTS.md §4). Nunca va en la vista pública del pedido. */
    buyer_whatsapp: string | null;
    code?: string | null;
    deadline?: number | null;
    ship_deadline?: number | null;
    shipped_at?: number | null;
    extended?: number | boolean | null;
  }[];
}

/**
 * Devolución completa (H-4, PP_DEVOLUCION_COMPLETA=1 en la app): después de una devolución total, Trato le transfiere al
 * comprador las comisiones que descontó el contrato. Montos en unidades de 7 decimales.
 */
export interface Reintegro {
  estado: "pendiente" | "enviado" | "confirmado" | "revisar";
  pagado: string;
  recibido: string;
  monto: string;
  /** Transacción de la devolución (refund_unshipped o resolve). */
  devolucion_hash: string;
  /** Transacción del reintegro, cuando ya está confirmada. */
  hash: string | null;
}
