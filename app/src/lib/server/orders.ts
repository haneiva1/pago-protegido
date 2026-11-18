import { FeeBumpTransaction, StrKey, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { randomBytes } from "node:crypto";
import { bsToUnits, fmtBs, fmtUsd, releaseBreakdown, splitPreview } from "@/lib/format";
import { NETWORK_PASSPHRASE, cfg } from "./config";
import { type OrderRow, kv, orders, pending, sellers, txs } from "./db";
import { escrowService, type EscrowCtx, type EscrowProps, type UserAction } from "./escrow";
import { factoryId } from "./escrow/tw";
import {
  ChainError,
  ensureFunded,
  feeBumpAndSend,
  hasTrustline,
  horizonAccount,
  mintLabusd,
  prepareTrustline,
  tokenBalance,
  withLock,
} from "./stellar";

export class AppError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface PreparedDto {
  xdr: string;
  hash: string;
  action: string;
  step: string;
  label: string;
}

const STEP_LABEL: Record<string, string> = {
  trustline: "Activar USD de prueba en tu billetera",
  fund: "Pagar al contrato protegido",
  ship: "Marcar como enviado",
  approve: "Confirmar que recibiste",
  release: "Liberar el pago al vendedor",
  confirm: "Confirmar y liberar el pago",
  dispute: "Abrir un reclamo",
};

export const isPubkey = (s: unknown): s is string => typeof s === "string" && StrKey.isValidEd25519PublicKey(s);

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function isUrl(v: string): boolean {
  return v === "" || /^https?:\/\/\S+$/i.test(v);
}

function register(
  tx: Transaction,
  p: { order_slug: string | null; action: string; step: string; signer: string; params?: object },
): PreparedDto {
  const hash = Buffer.from(tx.hash()).toString("hex");
  pending.add({ hash, order_slug: p.order_slug, action: p.action, step: p.step, signer: p.signer, params: JSON.stringify(p.params ?? {}) });
  return { xdr: tx.toXDR(), hash, action: p.action, step: p.step, label: STEP_LABEL[p.step] ?? p.step };
}

function mustOrder(slug: string): OrderRow {
  const o = orders.get(slug);
  if (!o) throw new AppError("No encontramos ese link de pago", 404);
  return o;
}

const windowSecs = (o: OrderRow) => (o.delivery_days + cfg().extraWindowDays) * 86400;

function ctxOf(o: OrderRow): EscrowCtx {
  if (!o.escrow_id || !o.escrow_json || !o.buyer_pubkey) throw new AppError("El pedido todavía no tiene contrato de pago", 409);
  return {
    escrowId: o.escrow_id,
    props: JSON.parse(o.escrow_json) as EscrowProps,
    buyer: o.buyer_pubkey,
    seller: o.seller_pubkey,
    windowSecs: windowSecs(o),
  };
}

// ---------- Vendedores y links ----------

export function saveSeller(input: { pubkey?: unknown; storeName?: unknown; whatsapp?: unknown }) {
  if (!isPubkey(input.pubkey)) throw new AppError("Billetera inválida");
  const store_name = clean(input.storeName, 60);
  const whatsapp = clean(input.whatsapp, 20).replace(/[^\d+]/g, "");
  if (store_name.length < 2) throw new AppError("Escribe el nombre de tu tienda");
  if (whatsapp.replace(/\D/g, "").length < 7) throw new AppError("Escribe un WhatsApp válido");
  sellers.upsert({ pubkey: input.pubkey, store_name, whatsapp });
  return sellers.get(input.pubkey)!;
}

function slugify(product: string): string {
  const base = product
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .split("-")
    .filter(Boolean)
    .slice(0, 4)
    .join("-")
    .slice(0, 32);
  return `${base || "pedido"}-${randomBytes(3).toString("hex")}`;
}

export function createLink(input: Record<string, unknown>) {
  const seller = isPubkey(input.sellerPubkey) ? sellers.get(input.sellerPubkey) : undefined;
  if (!seller) throw new AppError("Primero crea tu tienda", 403);
  const product = clean(input.product, 80);
  const description = clean(input.description, 280);
  const photo_url = clean(input.photoUrl, 500);
  const priceBs = Number(String(input.priceBs ?? "").replace(",", "."));
  const days = Number(input.deliveryDays);
  if (product.length < 2) throw new AppError("Escribe el producto");
  if (!isUrl(photo_url)) throw new AppError("La foto tiene que ser un link (https://…)");
  if (!Number.isFinite(priceBs) || priceBs < 1 || priceBs > 100000) throw new AppError("El precio tiene que estar entre Bs 1 y Bs 100.000");
  if (!Number.isInteger(days) || days < 1 || days > 15) throw new AppError("Los días de entrega van de 1 a 15");
  const fx = cfg().fx;
  const price_bs_cents = Math.round(priceBs * 100);
  const slug = slugify(product);
  orders.insert({
    slug,
    seller_pubkey: seller.pubkey,
    product,
    description,
    photo_url,
    price_bs_cents,
    amount_units: bsToUnits(price_bs_cents, fx).toString(),
    fx,
    delivery_days: days,
  });
  return orders.get(slug)!;
}

// ---------- Billetera ----------

/** Cuenta nueva: friendbot y, si falta, la trustline a LABUSD (la firma el navegador). */
export async function activateWallet(pubkey: unknown) {
  if (!isPubkey(pubkey)) throw new AppError("Billetera inválida");
  await ensureFunded(pubkey);
  if (hasTrustline(await horizonAccount(pubkey))) return { ready: true as const };
  const tx = await prepareTrustline(pubkey);
  return { ready: false as const, prepared: register(tx, { order_slug: null, action: "trustline", step: "trustline", signer: pubkey }) };
}

// ---------- Pago ----------

function buildProps(o: OrderRow, buyer: string): EscrowProps {
  return {
    engagement_id: `pp-${o.slug}`,
    title: o.product.slice(0, 80),
    roles: escrowService().roles(buyer, o.seller_pubkey),
    description: `Pago Protegido: ${o.product}`.slice(0, 200),
    amount: o.amount_units,
    platform_fee: cfg().platformFeeBps,
    milestones: [{ description: "Entrega del producto", status: "pendiente", evidence: "", approved: false }],
    flags: { disputed: false, released: false, resolved: false },
    trustline: { address: cfg().labusdSac },
    receiver_memo: 0,
  };
}

/**
 * "Simular pago del banco": rampa simulada (lab emite LABUSD al comprador por el equivalente en Bs),
 * deploy del escrow de esta compra (plataforma) y fondeo armado para que lo firme el comprador.
 */
export async function startPayment(slug: string, buyer: unknown): Promise<PreparedDto> {
  if (!isPubkey(buyer)) throw new AppError("Billetera inválida");
  return withLock(`order:${slug}`, async () => {
    let o = mustOrder(slug);
    if (o.status !== "esperando_pago") throw new AppError("Este link ya fue pagado", 409);
    if (o.buyer_pubkey && o.buyer_pubkey !== buyer) throw new AppError("Otra persona ya está pagando este link", 409);
    if (buyer === o.seller_pubkey) throw new AppError("No puedes pagar tu propio link");
    if (!hasTrustline(await horizonAccount(buyer))) throw new AppError("Primero activa tu billetera", 409);
    if (!o.buyer_pubkey) orders.update(slug, { buyer_pubkey: buyer });
    const svc = escrowService();
    const amount = BigInt(o.amount_units);

    if (!o.ramp_hash) {
      const sent = await mintLabusd(buyer, amount);
      orders.update(slug, { ramp_hash: sent.hash });
      txs.add({
        order_slug: slug,
        actor: "rampa",
        kind: "rampa",
        label: `Rampa simulada: el banco pagó ${fmtBs(o.price_bs_cents)} y llegaron ${fmtUsd(amount)} USD de prueba a tu billetera`,
        hash: sent.hash,
      });
    }

    o = mustOrder(slug);
    if (!o.escrow_id) {
      const props = buildProps(o, buyer);
      const { escrowId, hash } = await svc.createEscrow(props);
      orders.update(slug, { escrow_id: escrowId, escrow_json: JSON.stringify(props), mode: svc.mode });
      txs.add({ order_slug: slug, actor: "plataforma", kind: "escrow", label: "Se creó el contrato protegido de este pedido (Trustless Work)", hash });
      o = mustOrder(slug);
    }

    const tx = await svc.prepareStep("fund", "fund", ctxOf(o), buyer, {});
    return register(tx, { order_slug: slug, action: "fund", step: "fund", signer: buyer });
  });
}

// ---------- Acciones del comprador y del vendedor ----------

export async function prepareAction(slug: string, body: Record<string, unknown>): Promise<PreparedDto> {
  const action = body.action as UserAction;
  const signer = body.signer;
  if (!isPubkey(signer)) throw new AppError("Billetera inválida");
  const o = mustOrder(slug);
  const svc = escrowService();
  const ctx = ctxOf(o);
  const params: Record<string, string> = {};

  if (action === "ship") {
    if (signer !== o.seller_pubkey) throw new AppError("Solo el vendedor puede marcar el envío", 403);
    if (o.status !== "pagado") throw new AppError("Solo puedes marcar como enviado un pedido pagado", 409);
    params.evidence = clean(body.evidence, 200);
    if (params.evidence.length < 3) throw new AppError("Escribe el código de encomienda o pega el link de la foto");
  } else if (action === "confirm") {
    if (signer !== o.buyer_pubkey) throw new AppError("Solo el comprador puede confirmar", 403);
    if (o.status !== "pagado" && o.status !== "enviado") throw new AppError("Este pedido ya no se puede confirmar", 409);
  } else if (action === "dispute") {
    if (signer !== o.buyer_pubkey && signer !== o.seller_pubkey) throw new AppError("Solo el comprador o el vendedor pueden reclamar", 403);
    if (o.status !== "pagado" && o.status !== "enviado") throw new AppError("Este pedido ya no admite reclamos", 409);
    params.reason = clean(body.reason, 80);
    params.text = clean(body.text, 600);
    params.photo = clean(body.photo, 500);
    if (!params.reason) throw new AppError("Elige un motivo");
    if (!isUrl(params.photo)) throw new AppError("La foto tiene que ser un link (https://…)");
  } else {
    throw new AppError("Acción desconocida");
  }

  let steps = svc.steps(action);
  if (action === "confirm" && steps[0] === "approve") {
    // Si ya se aprobó (p. ej. falló la liberación), se retoma desde "release".
    const st = await svc.readState(ctx.escrowId).catch(() => null);
    if (st?.milestone?.approved) steps = steps.slice(1);
  }
  const tx = await svc.prepareStep(action, steps[0], ctx, signer, params);
  return register(tx, { order_slug: slug, action, step: steps[0], signer, params });
}

/**
 * El navegador devuelve la transacción firmada. Solo se aceptan transacciones que el servidor armó
 * (tabla `pending`, por hash): así la plataforma no patrocina comisiones de transacciones ajenas.
 */
export async function submitSigned(signedXdr: unknown): Promise<{ hash: string; next?: PreparedDto }> {
  if (typeof signedXdr !== "string") throw new AppError("Falta la transacción firmada");
  let inner: Transaction;
  try {
    const t = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
    if (t instanceof FeeBumpTransaction) throw new Error("fee bump");
    inner = t;
  } catch {
    throw new AppError("Transacción inválida");
  }
  const hashHex = Buffer.from(inner.hash()).toString("hex");
  const p = pending.take(hashHex);
  if (!p) throw new AppError("Transacción desconocida o ya enviada", 409);
  if (inner.source !== p.signer || inner.signatures.length === 0) throw new AppError("Falta la firma de tu billetera", 400);

  const sent = await feeBumpAndSend(inner);
  const params = JSON.parse(p.params) as Record<string, string>;

  if (p.action === "trustline") {
    txs.add({ order_slug: null, actor: p.signer, kind: "trustline", label: "Billetera activada para USD de prueba", hash: sent.hash });
    return { hash: sent.hash };
  }

  const slug = p.order_slug!;
  const o = mustOrder(slug);
  const now = Date.now();
  const role = p.signer === o.seller_pubkey ? "vendedor" : "comprador";
  switch (p.step) {
    case "fund":
      orders.update(slug, { status: "pagado", funded_at: now, deadline: now + windowSecs(o) * 1000 });
      txs.add({ order_slug: slug, actor: "comprador", kind: "fondeo", label: `Pagaste ${fmtUsd(o.amount_units)} USD de prueba: quedaron guardados en el contrato`, hash: sent.hash });
      break;
    case "ship":
      orders.update(slug, { status: "enviado", shipped_evidence: params.evidence, shipped_at: now });
      txs.add({ order_slug: slug, actor: "vendedor", kind: "envio", label: `El vendedor marcó el pedido como enviado: ${params.evidence}`, hash: sent.hash });
      break;
    case "approve":
      txs.add({ order_slug: slug, actor: "comprador", kind: "aprobacion", label: "El comprador confirmó que recibió el pedido", hash: sent.hash });
      break;
    case "release":
    case "confirm":
      orders.update(slug, { status: "liberado", released_at: now });
      txs.add({ order_slug: slug, actor: "comprador", kind: "liberacion", label: "Se liberó el pago al vendedor", hash: sent.hash });
      break;
    case "dispute":
      orders.update(slug, {
        status: "en_disputa",
        dispute_by: role,
        dispute_reason: params.reason,
        dispute_text: params.text,
        dispute_photo: params.photo,
        disputed_at: now,
      });
      txs.add({ order_slug: slug, actor: role, kind: "disputa", label: `Se abrió un reclamo (${params.reason}): la plata queda congelada hasta que decida el árbitro`, hash: sent.hash });
      break;
  }

  const svc = escrowService();
  const steps = svc.steps(p.action as UserAction);
  const idx = steps.indexOf(p.step);
  if (idx >= 0 && idx < steps.length - 1) {
    const step = steps[idx + 1];
    const tx = await svc.prepareStep(p.action as UserAction, step, ctxOf(mustOrder(slug)), p.signer, params);
    return { hash: sent.hash, next: register(tx, { order_slug: slug, action: p.action, step, signer: p.signer, params }) };
  }
  return { hash: sent.hash };
}

export function sellerReply(slug: string, body: Record<string, unknown>) {
  const o = mustOrder(slug);
  if (body.pubkey !== o.seller_pubkey) throw new AppError("Solo el vendedor puede responder", 403);
  if (o.status !== "en_disputa") throw new AppError("El pedido no está en disputa", 409);
  const text = clean(body.text, 600);
  if (text.length < 3) throw new AppError("Escribe tu versión");
  orders.update(slug, { seller_reply: text });
  return { ok: true };
}

export async function autoRelease(slug: string) {
  return withLock(`order:${slug}`, async () => {
    const o = mustOrder(slug);
    if (o.status !== "enviado") throw new AppError("Solo se libera por plazo un pedido enviado", 409);
    if (!o.deadline || Date.now() < o.deadline) throw new AppError("Todavía no venció el plazo", 409);
    const { hash } = await escrowService().autoRelease(ctxOf(o));
    orders.update(slug, { status: "liberado", released_at: Date.now() });
    txs.add({ order_slug: slug, actor: "plataforma", kind: "liberacion", label: "Venció el plazo: se liberó el pago al vendedor", hash });
    return { hash };
  });
}

// ---------- Árbitro ----------

export async function resolveDispute(slug: unknown, buyerBps: unknown) {
  if (typeof slug !== "string") throw new AppError("Falta el pedido");
  const bps = Number(buyerBps);
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) throw new AppError("El porcentaje va de 0 a 100");
  return withLock(`order:${slug}`, async () => {
    const o = mustOrder(slug);
    if (o.status !== "en_disputa") throw new AppError("El pedido no está en disputa", 409);
    const { hash } = await escrowService().resolve(ctxOf(o), bps);
    orders.update(slug, { status: "resuelto", buyer_bps: bps, resolved_at: Date.now() });
    const pct = (bps / 100).toLocaleString("es-BO");
    const pctSeller = ((10000 - bps) / 100).toLocaleString("es-BO");
    txs.add({ order_slug: slug, actor: "arbitro", kind: "resolucion", label: `El árbitro repartió: ${pct}% para el comprador y ${pctSeller}% para el vendedor`, hash });
    return { hash };
  });
}

export async function probeForeign(slug: unknown) {
  if (typeof slug !== "string") throw new AppError("Falta el pedido");
  const o = mustOrder(slug);
  if (o.status !== "en_disputa") throw new AppError("El pedido no está en disputa", 409);
  // "Otra cuenta" con trustline a LABUSD (la de la plataforma): así el único freno posible es el de los roles.
  const foreign = cfg().plataforma.publicKey();
  const r = await escrowService().probeForeignDestination(ctxOf(o), foreign);
  return { ...r, foreign };
}

// ---------- Vistas ----------

function publicOrder(o: OrderRow) {
  const { escrow_json: _e, ...rest } = o;
  return rest;
}

function money(o: OrderRow) {
  const amount = BigInt(o.amount_units);
  const bps = cfg().platformFeeBps;
  const out: Record<string, unknown> = {};
  if (o.status === "liberado") {
    const b = releaseBreakdown(amount, bps);
    out.breakdown = { seller: b.seller.toString(), platform: b.platform.toString(), tw: b.tw.toString() };
  }
  if (o.status === "resuelto" && o.buyer_bps != null) {
    const s = splitPreview(amount, o.buyer_bps, bps);
    out.split = {
      buyer: s.buyer.net.toString(),
      seller: s.seller.net.toString(),
      platform: (s.buyer.platform + s.seller.platform).toString(),
      tw: (s.buyer.tw + s.seller.tw).toString(),
    };
  }
  return out;
}

export async function orderView(slug: string, withOnchain: boolean) {
  const o = mustOrder(slug);
  const s = sellers.get(o.seller_pubkey)!;
  let onchain = null;
  if (withOnchain && o.escrow_id) onchain = await escrowService().readState(o.escrow_id).catch(() => null);
  return {
    order: publicOrder(o),
    seller: { store_name: s.store_name, whatsapp: s.whatsapp, pubkey: s.pubkey, completedSales: sellers.completedSales(s.pubkey) },
    txs: txs.forOrder(slug),
    platformFeeBps: cfg().platformFeeBps,
    mode: cfg().mode,
    onchain,
    ...money(o),
  };
}

export async function sellerView(pubkey: string) {
  if (!isPubkey(pubkey)) throw new AppError("Billetera inválida");
  const s = sellers.get(pubkey);
  if (!s) throw new AppError("Tienda no encontrada", 404);
  const list = orders.bySeller(pubkey).map((o) => ({ ...publicOrder(o), txs: txs.forOrder(o.slug), ...money(o) }));
  const balance = await tokenBalance(pubkey);
  return { seller: { ...s, completedSales: sellers.completedSales(pubkey) }, orders: list, balance: balance.toString() };
}

export async function disputesView() {
  const open = await Promise.all(
    orders.byStatus("en_disputa").map(async (o) => ({
      ...publicOrder(o),
      seller: sellers.get(o.seller_pubkey),
      txs: txs.forOrder(o.slug),
      onchain: o.escrow_id ? await escrowService().readState(o.escrow_id).catch(() => null) : null,
    })),
  );
  const resolved = orders.recentResolved(10).map((o) => ({ ...publicOrder(o), txs: txs.forOrder(o.slug), ...money(o) }));
  return { open, resolved, platformFeeBps: cfg().platformFeeBps, mode: cfg().mode };
}

export async function info() {
  const c = cfg();
  const svc = escrowService();
  const factory = kv.get(`factory:${c.wasmHash}`) ?? null;
  return {
    mode: svc.mode,
    fx: c.fx,
    platformFeeBps: c.platformFeeBps,
    wasmHash: c.wasmHash,
    factory,
    contracts: svc.contracts(),
  };
}

/** Para scripts: asegura que la fábrica exista (deploy único). */
export async function ensureFactory() {
  return factoryId();
}

export { ChainError };
