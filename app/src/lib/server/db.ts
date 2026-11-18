import Database from "better-sqlite3";
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
`;

export interface SellerRow {
  pubkey: string;
  store_name: string;
  whatsapp: string;
  created_at: number;
}

export interface OrderRow {
  slug: string;
  seller_pubkey: string;
  product: string;
  description: string;
  photo_url: string;
  price_bs_cents: number;
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
  buyer_bps: number | null;
  resolved_at: number | null;
  released_at: number | null;
  created_at: number;
  updated_at: number;
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
  // Migración de bases creadas antes de la segunda ronda.
  const cols = (d.prepare("PRAGMA table_info(orders)").all() as { name: string }[]).map((c) => c.name);
  for (const [c, t] of [["window_secs", "INTEGER"], ["verify_json", "TEXT"], ["buyer_whatsapp", "TEXT"]]) {
    if (!cols.includes(c)) d.exec(`ALTER TABLE orders ADD COLUMN ${c} ${t}`);
  }
  g.__ppDb = d;
  return d;
}

const now = () => Date.now();

export const sellers = {
  upsert(s: Omit<SellerRow, "created_at">) {
    db()
      .prepare(
        `INSERT INTO sellers (pubkey, store_name, whatsapp, created_at) VALUES (@pubkey, @store_name, @whatsapp, @created_at)
         ON CONFLICT(pubkey) DO UPDATE SET store_name = excluded.store_name, whatsapp = excluded.whatsapp`,
      )
      .run({ ...s, created_at: now() });
  },
  get(pubkey: string): SellerRow | undefined {
    return db().prepare(`SELECT * FROM sellers WHERE pubkey = ?`).get(pubkey) as SellerRow | undefined;
  },
  /** Todas las tiendas, la más reciente primero (para buscar por WhatsApp). */
  allNewestFirst(): SellerRow[] {
    return db().prepare(`SELECT * FROM sellers ORDER BY created_at DESC`).all() as SellerRow[];
  },
  completedSales(pubkey: string): number {
    const r = db()
      .prepare(`SELECT COUNT(*) AS n FROM orders WHERE seller_pubkey = ? AND status = 'liberado'`)
      .get(pubkey) as { n: number };
    return r.n;
  },
};

export const orders = {
  insert(o: Pick<OrderRow, "slug" | "seller_pubkey" | "product" | "description" | "photo_url" | "price_bs_cents" | "amount_units" | "fx" | "delivery_days" | "window_secs">) {
    const t = now();
    db()
      .prepare(
        `INSERT INTO orders (slug, seller_pubkey, product, description, photo_url, price_bs_cents, amount_units, fx, delivery_days, window_secs, status, created_at, updated_at)
         VALUES (@slug, @seller_pubkey, @product, @description, @photo_url, @price_bs_cents, @amount_units, @fx, @delivery_days, @window_secs, 'esperando_pago', @t, @t)`,
      )
      .run({ ...o, t });
  },
  get(slug: string): OrderRow | undefined {
    return db().prepare(`SELECT * FROM orders WHERE slug = ?`).get(slug) as OrderRow | undefined;
  },
  bySeller(pubkey: string): OrderRow[] {
    return db().prepare(`SELECT * FROM orders WHERE seller_pubkey = ? ORDER BY created_at DESC`).all(pubkey) as OrderRow[];
  },
  byStatus(status: OrderStatus): OrderRow[] {
    return db().prepare(`SELECT * FROM orders WHERE status = ? ORDER BY updated_at ASC`).all(status) as OrderRow[];
  },
  /** Feed del bot (APP-ENDPOINTS §2). */
  changesSince(since: number): { slug: string; status: string; updated_at: number; buyer_whatsapp: string | null }[] {
    return db()
      .prepare(`SELECT slug, status, updated_at, buyer_whatsapp FROM orders WHERE updated_at >= ? ORDER BY updated_at ASC LIMIT 500`)
      .all(since) as { slug: string; status: string; updated_at: number; buyer_whatsapp: string | null }[];
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
  take(hash: string): PendingRow | undefined {
    const d = db();
    const row = d.prepare(`SELECT * FROM pending WHERE hash = ?`).get(hash) as PendingRow | undefined;
    if (row) d.prepare(`DELETE FROM pending WHERE hash = ?`).run(hash);
    return row;
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
