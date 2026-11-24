import Database from "better-sqlite3";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { OrderStatus } from "@/lib/format";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sellers (
  pubkey TEXT PRIMARY KEY,
  store_name TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
-- Un link de pago es de un solo uso: el mismo registro es el pedido.
CREATE TABLE IF NOT EXISTS orders (
  slug TEXT PRIMARY KEY,
  seller_pubkey TEXT NOT NULL REFERENCES sellers(pubkey),
  product TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  photo_url TEXT NOT NULL DEFAULT '',
  price_bs_cents INTEGER NOT NULL,
  amount_units TEXT NOT NULL,
  fx REAL NOT NULL,
  delivery_days INTEGER NOT NULL,
  status TEXT NOT NULL,
  mode TEXT,
  buyer_pubkey TEXT,
  escrow_id TEXT,
  escrow_json TEXT,
  ramp_hash TEXT,
  funded_at INTEGER,
  deadline INTEGER,
  shipped_evidence TEXT,
  shipped_at INTEGER,
  dispute_by TEXT,
  dispute_reason TEXT,
  dispute_text TEXT,
  dispute_photo TEXT,
  disputed_at INTEGER,
  seller_reply TEXT,
  window_secs INTEGER,
  verify_json TEXT,
  buyer_whatsapp TEXT,
  buyer_bps INTEGER,
  resolved_at INTEGER,
  released_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS orders_seller ON orders(seller_pubkey);
CREATE INDEX IF NOT EXISTS orders_status ON orders(status);
CREATE TABLE IF NOT EXISTS txs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_slug TEXT,
  actor TEXT NOT NULL,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS txs_order ON txs(order_slug);
-- Transacciones armadas por el servidor que esperan la firma del navegador.
CREATE TABLE IF NOT EXISTS pending (
  hash TEXT PRIMARY KEY,
  order_slug TEXT,
  action TEXT NOT NULL,
  step TEXT NOT NULL,
  signer TEXT NOT NULL,
  params TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
-- Eventos on-chain de pp_guardian y pp_arbiter (métricas de /transparencia, docs/METRICAS.md).
CREATE TABLE IF NOT EXISTS pp_events (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  escrow TEXT,
  ledger INTEGER NOT NULL,
  closed_at TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS pp_events_escrow ON pp_events(escrow);
-- H-9: resultado del indexador verificado por escrow (docs/METRICAS.md §Reglas del indexador).
-- reglas es la huella de los valores esperados: si cambian, el escrow se vuelve a verificar.
CREATE TABLE IF NOT EXISTS escrow_verificado (
  escrow TEXT PRIMARY KEY,
  reglas TEXT NOT NULL,
  ok INTEGER NOT NULL,
  fallas TEXT NOT NULL,
  wasm_hash TEXT,
  verificado_at INTEGER NOT NULL
);
-- Historial de versiones de la evidencia (envío, reclamo, respuesta), con hora.
CREATE TABLE IF NOT EXISTS evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_slug TEXT NOT NULL,
  actor TEXT NOT NULL,
  kind TEXT NOT NULL,
  summary TEXT NOT NULL,
  data_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS evidence_order ON evidence(order_slug);
-- Archivos subidos a /api/evidencia, por pedido: el cupo por pedido se cuenta acá (un archivo repetido no suma).
CREATE TABLE IF NOT EXISTS evidencias (
  sha256 TEXT NOT NULL,
  order_slug TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (order_slug, sha256)
);
-- Lista de espera del piloto (/piloto).
CREATE TABLE IF NOT EXISTS pilot_waitlist (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  store TEXT NOT NULL,
  city TEXT NOT NULL,
  sells TEXT NOT NULL,
  ships_to TEXT NOT NULL,
  avg_ticket TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  consent INTEGER NOT NULL,
  seller_pubkey TEXT,
  created_at INTEGER NOT NULL
);
-- Desafíos de un solo uso para probar que una cuenta es tuya (lib/server/firma.ts): se borran al usarlos.
CREATE TABLE IF NOT EXISTS firma_desafios (
  nonce TEXT PRIMARY KEY,
  cuenta TEXT NOT NULL,
  alcance TEXT NOT NULL,
  mensaje TEXT NOT NULL,
  vence INTEGER NOT NULL
);
`;

// Columnas agregadas después de la primera versión (migración en caliente de bases existentes).
const MIGRATIONS: Record<string, [string, string][]> = {
  sellers: [
    ["city", "TEXT"],
    ["pilot", "INTEGER NOT NULL DEFAULT 0"],
    ["pressure_reports", "INTEGER NOT NULL DEFAULT 0"],
    // Perfil público /tienda/<slug>: se asigna una vez y no cambia aunque cambie el nombre de la tienda.
    ["slug", "TEXT"],
  ],
  orders: [
    ["window_secs", "INTEGER"],
    ["verify_json", "TEXT"],
    ["buyer_whatsapp", "TEXT"],
    ["code", "TEXT"],
    ["category", "TEXT"],
    ["fee_payer", "TEXT"],
    ["price_units", "TEXT"],
    ["platform_bps", "INTEGER"],
    ["recipient_name", "TEXT"],
    ["dest_city", "TEXT"],
    ["pref_agency", "TEXT"],
    ["delivery_hash", "TEXT"],
    ["ship_company", "TEXT"],
    ["ship_tracking", "TEXT"],
    ["ship_weight", "TEXT"],
    ["ship_photo", "TEXT"],
    ["ship_city", "TEXT"],
    ["ship_imei", "TEXT"],
    ["confirm_after", "INTEGER"],
    ["dispute_video", "TEXT"],
    // Último tramo (M7): teléfono de quien recoge (privado, como los datos de entrega) y flete acordado.
    ["pickup_phone", "TEXT"],
    ["flete", "TEXT"],
    ["resolution_reason", "TEXT"],
    // Contratos v2: plazo de despacho y ventana de revisión (desde el envío), extend y devolución.
    ["ship_secs", "INTEGER"],
    ["inspect_secs", "INTEGER"],
    ["ship_deadline", "INTEGER"],
    ["extended", "INTEGER NOT NULL DEFAULT 0"],
    ["refunded_at", "INTEGER"],
    // Hasta cuándo queda fijado el comprador que empezó a pagar y todavía no firmó el fondeo (lib/server/orders.ts).
    ["buyer_lease_until", "INTEGER"],
  ],
  // Indexador: una falta de dato deja la compra pendiente (con intentos y espera creciente), no descartada; y los
  // hechos leídos quedan guardados para reevaluar sin releer la red si cambian las reglas.
  escrow_verificado: [
    ["estado", "TEXT"],
    ["hechos_json", "TEXT"],
    ["intentos", "INTEGER NOT NULL DEFAULT 0"],
    ["proximo_at", "INTEGER"],
    ["error", "TEXT"],
  ],
};

export interface SellerRow {
  pubkey: string;
  store_name: string;
  whatsapp: string;
  created_at: number;
  city: string | null;
  pilot: number;
  pressure_reports: number;
  slug: string | null;
}

export interface OrderRow {
  slug: string;
  seller_pubkey: string;
  product: string;
  description: string;
  photo_url: string;
  /** Precio del producto en centavos de Bs (lo que pide el vendedor). */
  price_bs_cents: number;
  /** Total que entra al contrato (unidades de 7 decimales): precio + protección si la paga el comprador. */
  amount_units: string;
  fx: number;
  delivery_days: number;
  status: OrderStatus;
  mode: string | null;
  buyer_pubkey: string | null;
  escrow_id: string | null;
  escrow_json: string | null;
  ramp_hash: string | null;
  funded_at: number | null;
  /** Fin de la revisión (`release_at` de pp_guardian v2): existe recién cuando se registra el envío. */
  deadline: number | null;
  shipped_evidence: string | null;
  shipped_at: number | null;
  dispute_by: string | null;
  dispute_reason: string | null;
  dispute_text: string | null;
  dispute_photo: string | null;
  disputed_at: number | null;
  seller_reply: string | null;
  window_secs: number | null;
  verify_json: string | null;
  /** Solo servidor: nunca va en vistas públicas (APP-ENDPOINTS §4). */
  buyer_whatsapp: string | null;
  /** Código corto y legible del pedido (PP-4821). */
  code: string | null;
  category: string | null;
  fee_payer: "comprador" | "vendedor" | null;
  /** Precio del producto en unidades (lo que recibe el vendedor si el comprador paga la protección). */
  price_units: string | null;
  /** platform_fee del escrow de este pedido (bps). */
  platform_bps: number | null;
  /** Datos de entrega: solo servidor y panel del vendedor. */
  recipient_name: string | null;
  dest_city: string | null;
  pref_agency: string | null;
  delivery_hash: string | null;
  /** Teléfono de quien recoge: solo servidor y panel del vendedor. */
  pickup_phone?: string | null;
  /** Flete acordado: "incluido", "por_pagar" o "aparte:<Bs>" (no cambia el monto protegido). */
  flete?: string | null;
  ship_company: string | null;
  ship_tracking: string | null;
  ship_weight: string | null;
  ship_photo: string | null;
  ship_city: string | null;
  ship_imei: string | null;
  confirm_after: number | null;
  /** v2: plazo de despacho y ventana de revisión firmados por el comprador en `fund` (segundos). */
  ship_secs: number | null;
  inspect_secs: number | null;
  /** v2: hasta cuándo puede registrar el envío el vendedor (hora del ledger, ms). */
  ship_deadline: number | null;
  /** v2: el comprador ya usó "Necesito más tiempo" (extend, una sola vez). */
  extended: number;
  /** v2: devolución por falta de despacho (refund_unshipped). */
  refunded_at: number | null;
  /** Mientras está esperando pago: hasta cuándo queda fijado `buyer_pubkey` si no firma el fondeo (ms). */
  buyer_lease_until: number | null;
  dispute_video: string | null;
  resolution_reason: string | null;
  buyer_bps: number | null;
  resolved_at: number | null;
  released_at: number | null;
  created_at: number;
  updated_at: number;
}

/** Feed del bot (APP-ENDPOINTS §2), con los tiempos de v2. */
export interface BotChange {
  slug: string;
  status: string;
  updated_at: number;
  buyer_whatsapp: string | null;
  code: string | null;
  deadline: number | null;
  ship_deadline: number | null;
  shipped_at: number | null;
  extended: number;
}

export interface TxRow {
  id: number;
  order_slug: string | null;
  actor: string;
  kind: string;
  label: string;
  hash: string;
  created_at: number;
}

export interface PendingRow {
  hash: string;
  order_slug: string | null;
  action: string;
  step: string;
  signer: string;
  params: string;
  created_at: number;
}

export interface EvidenceRow {
  id: number;
  order_slug: string;
  actor: string;
  kind: string;
  summary: string;
  data_json: string;
  created_at: number;
}

export interface PilotRow {
  id: string;
  name: string;
  store: string;
  city: string;
  sells: string;
  ships_to: string;
  avg_ticket: string;
  whatsapp: string;
  consent: number;
  seller_pubkey: string | null;
  created_at: number;
}

const g = globalThis as unknown as { __ppDb?: Database.Database };

export function db(): Database.Database {
  if (g.__ppDb) return g.__ppDb;
  const file = process.env.PP_DB_PATH
    ? path.resolve(process.env.PP_DB_PATH)
    : path.join(process.cwd(), "data", "pp.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const d = new Database(file);
  d.pragma("journal_mode = WAL");
  d.pragma("busy_timeout = 5000");
  d.exec(SCHEMA);
  for (const [table, cols] of Object.entries(MIGRATIONS)) {
    const have = (d.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
    for (const [c, t] of cols) if (!have.includes(c)) d.exec(`ALTER TABLE ${table} ADD COLUMN ${c} ${t}`);
  }
  d.exec(`CREATE UNIQUE INDEX IF NOT EXISTS orders_code ON orders(code)`);
  d.exec(`CREATE UNIQUE INDEX IF NOT EXISTS sellers_slug ON sellers(slug)`);
  g.__ppDb = d;
  return d;
}

const now = () => Date.now();

export const sellers = {
  upsert(s: { pubkey: string; store_name: string; whatsapp: string; city: string | null; pilot: boolean }) {
    db()
      .prepare(
        `INSERT INTO sellers (pubkey, store_name, whatsapp, city, pilot, created_at) VALUES (@pubkey, @store_name, @whatsapp, @city, @pilot, @created_at)
         ON CONFLICT(pubkey) DO UPDATE SET store_name = excluded.store_name, whatsapp = excluded.whatsapp,
           city = COALESCE(excluded.city, sellers.city), pilot = MAX(sellers.pilot, excluded.pilot)`,
      )
      .run({ ...s, pilot: s.pilot ? 1 : 0, created_at: now() });
  },
  get(pubkey: string): SellerRow | undefined {
    return db().prepare(`SELECT * FROM sellers WHERE pubkey = ?`).get(pubkey) as SellerRow | undefined;
  },
  /** Todas las tiendas, la más reciente primero (para buscar por WhatsApp). */
  allNewestFirst(): SellerRow[] {
    return db().prepare(`SELECT * FROM sellers ORDER BY created_at DESC`).all() as SellerRow[];
  },
  pilotPubkeys(): Set<string> {
    return new Set((db().prepare(`SELECT pubkey FROM sellers WHERE pilot = 1`).all() as { pubkey: string }[]).map((r) => r.pubkey));
  },
  bySlug(slug: string): SellerRow | undefined {
    return db().prepare(`SELECT * FROM sellers WHERE slug = ?`).get(slug) as SellerRow | undefined;
  },
  /** Slug del perfil público: nombre de la tienda + 4 hex al azar (único). Se asigna una sola vez. */
  ensureSlug(pubkey: string): string | null {
    const s = sellers.get(pubkey);
    if (!s) return null;
    if (s.slug) return s.slug;
    const base =
      s.store_name
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .split("-")
        .filter(Boolean)
        .slice(0, 4)
        .join("-")
        .slice(0, 28) || "tienda";
    for (let i = 0; i < 20; i++) {
      try {
        db().prepare(`UPDATE sellers SET slug = ? WHERE pubkey = ? AND slug IS NULL`).run(`${base}-${randomBytes(2).toString("hex")}`, pubkey);
        break;
      } catch {
        // Choque con el slug de otra tienda (índice único): se prueba otro sufijo.
      }
    }
    return sellers.get(pubkey)?.slug ?? null;
  },
  flagPressure(pubkey: string) {
    db().prepare(`UPDATE sellers SET pressure_reports = pressure_reports + 1 WHERE pubkey = ?`).run(pubkey);
  },
  completedSales(pubkey: string): number {
    const r = db()
      .prepare(`SELECT COUNT(*) AS n FROM orders WHERE seller_pubkey = ? AND status = 'liberado'`)
      .get(pubkey) as { n: number };
    return r.n;
  },
  /** Reclamos del vendedor y cómo terminaron (tarjeta del vendedor en la página de pago). */
  claimStats(pubkey: string) {
    const rows = db()
      .prepare(`SELECT status, buyer_bps FROM orders WHERE seller_pubkey = ? AND dispute_by IS NOT NULL`)
      .all(pubkey) as { status: string; buyer_bps: number | null }[];
    const resolved = rows.filter((r) => r.status === "resuelto" && r.buyer_bps != null);
    return {
      total: rows.length,
      pendientes: rows.filter((r) => r.status === "en_disputa").length,
      a_favor_comprador: resolved.filter((r) => r.buyer_bps === 10000).length,
      a_favor_vendedor: resolved.filter((r) => r.buyer_bps === 0).length,
      repartidos: resolved.filter((r) => r.buyer_bps! > 0 && r.buyer_bps! < 10000).length,
    };
  },
};

type NewOrder = Pick<
  OrderRow,
  | "slug"
  | "seller_pubkey"
  | "product"
  | "description"
  | "photo_url"
  | "price_bs_cents"
  | "amount_units"
  | "fx"
  | "delivery_days"
  | "window_secs"
  | "code"
  | "category"
  | "fee_payer"
  | "price_units"
  | "platform_bps"
  | "ship_secs"
  | "inspect_secs"
>;

export const orders = {
  insert(o: NewOrder) {
    const t = now();
    db()
      .prepare(
        `INSERT INTO orders (slug, seller_pubkey, product, description, photo_url, price_bs_cents, amount_units, fx, delivery_days, window_secs,
           code, category, fee_payer, price_units, platform_bps, status, created_at, updated_at)
         VALUES (@slug, @seller_pubkey, @product, @description, @photo_url, @price_bs_cents, @amount_units, @fx, @delivery_days, @window_secs,
           @code, @category, @fee_payer, @price_units, @platform_bps, 'esperando_pago', @t, @t)`,
      )
      .run({ ...o, t });
  },
  get(slug: string): OrderRow | undefined {
    return db().prepare(`SELECT * FROM orders WHERE slug = ?`).get(slug) as OrderRow | undefined;
  },
  byCode(code: string): OrderRow | undefined {
    return db().prepare(`SELECT * FROM orders WHERE code = ?`).get(code) as OrderRow | undefined;
  },
  bySeller(pubkey: string): OrderRow[] {
    return db().prepare(`SELECT * FROM orders WHERE seller_pubkey = ? ORDER BY created_at DESC`).all(pubkey) as OrderRow[];
  },
  byStatus(status: OrderStatus): OrderRow[] {
    return db().prepare(`SELECT * FROM orders WHERE status = ? ORDER BY updated_at ASC`).all(status) as OrderRow[];
  },
  /** Feed del bot (APP-ENDPOINTS §2). */
  changesSince(since: number): BotChange[] {
    return db()
      .prepare(
        `SELECT slug, status, updated_at, buyer_whatsapp, code, deadline, ship_deadline, shipped_at, extended FROM orders WHERE updated_at >= ? ORDER BY updated_at ASC LIMIT 500`,
      )
      .all(since) as BotChange[];
  },
  /** v2: pedidos pagados (o en reclamo) sin envío registrado y con el plazo de despacho vencido. */
  /**
   * Intentos de pago con contrato creado cuya reserva venció hace menos de `ventanaMs`, más los de antes de que
   * existiera la reserva (`buyer_lease_until` NULL). Los más recientes primero.
   */
  intentosVencidos(now: number, ventanaMs: number): OrderRow[] {
    return db()
      .prepare(
        `SELECT * FROM orders WHERE status = 'esperando_pago' AND buyer_pubkey IS NOT NULL AND escrow_id IS NOT NULL
         AND (buyer_lease_until IS NULL OR (buyer_lease_until <= ? AND buyer_lease_until > ?))
         ORDER BY buyer_lease_until DESC`,
      )
      .all(now, now - ventanaMs) as OrderRow[];
  },
  /** Pedidos enviados con la revisión vencida: el barrido los libera al vendedor (pp_guardian.auto_release). */
  overdueShipped(now: number): OrderRow[] {
    return db()
      .prepare(`SELECT * FROM orders WHERE status = 'enviado' AND deadline IS NOT NULL AND deadline <= ? AND escrow_id IS NOT NULL ORDER BY deadline`)
      .all(now) as OrderRow[];
  },
  overdueUnshipped(now: number): OrderRow[] {
    return db()
      .prepare(
        `SELECT * FROM orders WHERE status IN ('pagado', 'en_disputa') AND shipped_at IS NULL AND ship_deadline IS NOT NULL AND ship_deadline <= ? AND escrow_id IS NOT NULL`,
      )
      .all(now) as OrderRow[];
  },
  recentResolved(limit = 10): OrderRow[] {
    return db()
      .prepare(`SELECT * FROM orders WHERE status = 'resuelto' ORDER BY resolved_at DESC LIMIT ?`)
      .all(limit) as OrderRow[];
  },
  update(slug: string, patch: Partial<OrderRow>) {
    const keys = Object.keys(patch).filter((k) => k !== "slug");
    if (!keys.length) return;
    const sets = keys.map((k) => `${k} = @${k}`).join(", ");
    db()
      .prepare(`UPDATE orders SET ${sets}, updated_at = @__t WHERE slug = @__slug`)
      .run({ ...patch, __t: now(), __slug: slug });
  },
};

export const txs = {
  add(t: Omit<TxRow, "id" | "created_at">) {
    db()
      .prepare(
        `INSERT INTO txs (order_slug, actor, kind, label, hash, created_at) VALUES (@order_slug, @actor, @kind, @label, @hash, @created_at)`,
      )
      .run({ ...t, created_at: now() });
  },
  forOrder(slug: string): TxRow[] {
    return db().prepare(`SELECT * FROM txs WHERE order_slug = ? ORDER BY id ASC`).all(slug) as TxRow[];
  },
  /** Registro de un intento de pago que venció sin fondeo (rampa y contrato de ese comprador). */
  dropAttempt(slug: string) {
    db().prepare(`DELETE FROM txs WHERE order_slug = ? AND kind IN ('rampa', 'escrow')`).run(slug);
  },
  /** Activación de una cuenta (trustline a la moneda de prueba): no pertenece a ningún pedido. */
  activation(pubkey: string): TxRow | undefined {
    return db().prepare(`SELECT * FROM txs WHERE order_slug IS NULL AND kind = 'trustline' AND actor = ? ORDER BY id DESC LIMIT 1`).get(pubkey) as
      | TxRow
      | undefined;
  },
};

export const evidence = {
  add(e: { order_slug: string; actor: string; kind: string; summary: string; data: object }) {
    db()
      .prepare(`INSERT INTO evidence (order_slug, actor, kind, summary, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(e.order_slug, e.actor, e.kind, e.summary, JSON.stringify(e.data), now());
  },
  forOrder(slug: string): EvidenceRow[] {
    return db().prepare(`SELECT * FROM evidence WHERE order_slug = ? ORDER BY id ASC`).all(slug) as EvidenceRow[];
  },
  /** Códigos (o slugs) de otros pedidos cuya evidencia menciona este texto, p. ej. la huella de una foto. */
  otherOrdersMentioning(text: string, exceptSlug: string): string[] {
    const rows = db()
      .prepare(
        `SELECT DISTINCT e.order_slug AS slug, o.code AS code FROM evidence e LEFT JOIN orders o ON o.slug = e.order_slug
         WHERE e.order_slug != ? AND instr(e.data_json, ?) > 0 LIMIT 5`,
      )
      .all(exceptSlug, text) as { slug: string; code: string | null }[];
    return rows.map((r) => r.code ?? r.slug);
  },
};

/** Archivos de evidencia guardados en disco, por pedido (tabla `evidencias`, cupo de /api/evidencia). */
export const evidencias = {
  tiene(order_slug: string, sha256: string): boolean {
    return Boolean(db().prepare(`SELECT 1 FROM evidencias WHERE order_slug = ? AND sha256 = ?`).get(order_slug, sha256));
  },
  uso(order_slug: string): { archivos: number; bytes: number } {
    return db()
      .prepare(`SELECT COUNT(*) AS archivos, COALESCE(SUM(bytes), 0) AS bytes FROM evidencias WHERE order_slug = ?`)
      .get(order_slug) as { archivos: number; bytes: number };
  },
  add(e: { sha256: string; order_slug: string; bytes: number }) {
    db()
      .prepare(`INSERT OR IGNORE INTO evidencias (sha256, order_slug, bytes, created_at) VALUES (?, ?, ?, ?)`)
      .run(e.sha256, e.order_slug, e.bytes, now());
  },
};

export const pilot = {
  add(p: Omit<PilotRow, "seller_pubkey" | "created_at">) {
    db()
      .prepare(
        `INSERT INTO pilot_waitlist (id, name, store, city, sells, ships_to, avg_ticket, whatsapp, consent, created_at)
         VALUES (@id, @name, @store, @city, @sells, @ships_to, @avg_ticket, @whatsapp, @consent, @created_at)`,
      )
      .run({ ...p, created_at: now() });
  },
  get(id: string): PilotRow | undefined {
    return db().prepare(`SELECT * FROM pilot_waitlist WHERE id = ?`).get(id) as PilotRow | undefined;
  },
  linkSeller(id: string, pubkey: string) {
    db().prepare(`UPDATE pilot_waitlist SET seller_pubkey = ? WHERE id = ?`).run(pubkey, id);
  },
  /** Cuántas tiendas se inscribieron: una por WhatsApp (los últimos 8 dígitos), aunque hayan llenado el formulario dos veces. */
  tiendas(): number {
    const sql = `SELECT COUNT(DISTINCT substr(replace(replace(whatsapp, ' ', ''), '+', ''), -8)) AS n FROM pilot_waitlist`;
    return (db().prepare(sql).get() as { n: number }).n;
  },
  all(): PilotRow[] {
    return db().prepare(`SELECT * FROM pilot_waitlist ORDER BY created_at ASC`).all() as PilotRow[];
  },
};

export const pending = {
  add(p: Omit<PendingRow, "created_at">) {
    db()
      .prepare(
        `INSERT OR REPLACE INTO pending (hash, order_slug, action, step, signer, params, created_at)
         VALUES (@hash, @order_slug, @action, @step, @signer, @params, @created_at)`,
      )
      .run({ ...p, created_at: now() });
  },
  /** Borra las transacciones de un intento de pago que venció (ya no se aceptan en /api/tx/submit). */
  dropForOrder(slug: string, step: string) {
    db().prepare(`DELETE FROM pending WHERE order_slug = ? AND step = ?`).run(slug, step);
  },
  take(hash: string): PendingRow | undefined {
    const d = db();
    const row = d.prepare(`SELECT * FROM pending WHERE hash = ?`).get(hash) as PendingRow | undefined;
    if (row) d.prepare(`DELETE FROM pending WHERE hash = ?`).run(hash);
    return row;
  },
};

export interface DesafioRow {
  nonce: string;
  cuenta: string;
  /** "MÉTODO /ruta" para la que vale la firma. */
  alcance: string;
  /** Texto exacto que firma la cuenta (SEP-53). */
  mensaje: string;
  vence: number;
}

export const desafios = {
  add(d: DesafioRow) {
    const t = now();
    db().prepare(`DELETE FROM firma_desafios WHERE vence < ?`).run(t);
    db().prepare(`INSERT INTO firma_desafios (nonce, cuenta, alcance, mensaje, vence) VALUES (@nonce, @cuenta, @alcance, @mensaje, @vence)`).run(d);
  },
  /** Lo saca de la tabla en la misma sentencia: un nonce sirve una sola vez, aunque lleguen dos pedidos juntos. */
  take(nonce: string): DesafioRow | undefined {
    return db().prepare(`DELETE FROM firma_desafios WHERE nonce = ? RETURNING *`).get(nonce) as DesafioRow | undefined;
  },
};

export const kv = {
  get(k: string): string | undefined {
    const r = db().prepare(`SELECT v FROM kv WHERE k = ?`).get(k) as { v: string } | undefined;
    return r?.v;
  },
  set(k: string, v: string) {
    db().prepare(`INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)`).run(k, v);
  },
};
