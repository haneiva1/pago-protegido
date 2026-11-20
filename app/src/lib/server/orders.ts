import { FeeBumpTransaction, StrKey, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { createHash, randomBytes, randomInt } from "node:crypto";
import {
  CATEGORIAS,
  CIUDADES,
  EMPRESAS,
  MOTIVOS,
  MOTIVOS_CON_VIDEO,
  MOTIVO_PRESION,
  STATUS_LABEL,
  type OrderStatus,
  fmtBs,
  fmtBsUnits,
  linkAmounts,
  releaseBreakdown,
  splitFromGross,
  splitPreview,
} from "@/lib/format";
import { parseFlete } from "@/lib/comprador";
import { NETWORK_PASSPHRASE, cfg } from "./config";
import { type OrderRow, evidence, kv, orders, pending, pilot, sellers, txs } from "./db";
import { linkAmounts as amountsFor } from "@/lib/format";
import { escrowService, type EscrowCtx, type EscrowProps, type OnchainState, type UserAction, type Verification } from "./escrow";
import { factoryId } from "./escrow/tw";
import { sellerKpis } from "./kpis";
import { ingestEvents } from "./metrics";
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
  /** H-2: resultado de la verificación del escrow (solo en el fondeo). */
  verification?: Verification;
}

const STEP_LABEL: Record<string, string> = {
  trustline: "Activar tu cuenta de cobro",
  fund: "Guardar el pago en el contrato",
  ship: "Registrar el envío",
  approve: "Confirmar que recibiste",
  release: "Pagar al vendedor",
  confirm: "Pagar al vendedor",
  dispute: "Abrir un reclamo",
  extend: "Pedir más tiempo para revisar",
};

/** Teléfono a solo dígitos; 8 dígitos (celular boliviano) → con 591 adelante. */
export function normPhone(p: unknown): string {
  const d = String(p ?? "").replace(/\D/g, "");
  return d.length === 8 ? `591${d}` : d;
}

export const isPubkey = (s: unknown): s is string => typeof s === "string" && StrKey.isValidEd25519PublicKey(s);

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function isUrl(v: string): boolean {
  return v === "" || /^https?:\/\/\S+$/i.test(v);
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const inList = <T extends readonly string[]>(list: T, v: string): v is T[number] => (list as readonly string[]).includes(v);
const fmtWhen = (ms: number) =>
  new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/La_Paz" }).format(new Date(ms));

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

/**
 * Plazos v2 que el comprador firma en `fund` (DECISIONES 77):
 * - despacho (`ship_secs`): los días de entrega que prometió el vendedor, contados desde el pago;
 * - revisión (`inspect_secs`): días de entrega + 3 días, contados desde que se registra el envío.
 * En links de demo (?demo=1) los dos duran 2 minutos (el mínimo del guardián es 60 s).
 */
const shipSecs = (o: OrderRow) => o.ship_secs ?? o.window_secs ?? o.delivery_days * 86400;
const inspectSecs = (o: OrderRow) => o.inspect_secs ?? o.window_secs ?? (o.delivery_days + cfg().extraWindowDays) * 86400;
export const DEMO_WINDOW_SECS = 120;
/** Margen sobre la hora del ledger antes de actuar por un plazo vencido. */
const CHAIN_MARGIN_MS = 10_000;
/** Modo demo (PP_DEMO=1): "Pagar al vendedor" se habilita 1 minuto después del envío. */
export const demoTimers = () => process.env.PP_DEMO === "1";
/** /probar (PP_PROBAR=1, apagado por defecto): la demo pública con dos celulares. */
export const probarActivo = () => process.env.PP_PROBAR === "1";

/**
 * "Pagar al vendedor" se habilita 2 h después del envío en la misma ciudad y 24 h si es otra ciudad.
 * Con PP_PROBAR=1, los links de demo (plazos de 2 minutos) también usan la espera de demo, aunque falte PP_DEMO.
 */
export function confirmDelay(o: OrderRow): { ms: number; label: string } {
  if (demoTimers() || (probarActivo() && o.window_secs === DEMO_WINDOW_SECS)) return { ms: 60_000, label: "1 minuto (modo demo)" };
  const sellerCity = sellers.get(o.seller_pubkey)?.city;
  const same = Boolean(sellerCity && o.dest_city && sellerCity === o.dest_city && o.dest_city !== "Otra");
  return same ? { ms: 2 * 3600_000, label: "2 horas (misma ciudad)" } : { ms: 24 * 3600_000, label: "24 horas (otra ciudad)" };
}

function ctxOf(o: OrderRow): EscrowCtx {
  if (!o.escrow_id || !o.escrow_json || !o.buyer_pubkey) throw new AppError("El pedido todavía no tiene contrato de pago", 409);
  return {
    escrowId: o.escrow_id,
    props: JSON.parse(o.escrow_json) as EscrowProps,
    buyer: o.buyer_pubkey,
    seller: o.seller_pubkey,
    shipSecs: shipSecs(o),
    inspectSecs: inspectSecs(o),
  };
}

// ---------- Vendedores y links ----------

export function saveSeller(input: { pubkey?: unknown; storeName?: unknown; whatsapp?: unknown; city?: unknown; pilotId?: unknown }) {
  if (!isPubkey(input.pubkey)) throw new AppError("Cuenta inválida");
  const store_name = clean(input.storeName, 60);
  const whatsapp = clean(input.whatsapp, 20).replace(/[^\d+ ]/g, "");
  const city = clean(input.city, 40);
  if (store_name.length < 2) throw new AppError("Escribe el nombre de tu tienda");
  if (whatsapp.replace(/\D/g, "").length < 7) throw new AppError("Escribe un WhatsApp válido");
  if (city && !inList(CIUDADES, city)) throw new AppError("Elige tu ciudad de la lista");
  // Vendedores que vienen de la lista de espera del piloto (/piloto) quedan marcados como piloto.
  const pilotRow = typeof input.pilotId === "string" ? pilot.get(input.pilotId) : undefined;
  sellers.upsert({ pubkey: input.pubkey, store_name, whatsapp, city: city || null, pilot: Boolean(pilotRow) });
  if (pilotRow) pilot.linkSeller(pilotRow.id, input.pubkey);
  sellers.ensureSlug(input.pubkey);
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

/** Código corto y legible del pedido: PP-4821. */
function newCode(): string {
  for (let i = 0; i < 50; i++) {
    const c = `PP-${randomInt(1000, 10000)}`;
    if (!orders.byCode(c)) return c;
  }
  return `PP-${randomInt(10000, 100000)}`;
}

export function createLink(input: Record<string, unknown>) {
  const seller = isPubkey(input.sellerPubkey) ? sellers.get(input.sellerPubkey) : undefined;
  if (!seller) throw new AppError("Primero crea tu tienda", 403);
  const product = clean(input.product, 80);
  const description = clean(input.description, 280);
  const photo_url = clean(input.photoUrl, 500);
  const priceBs = Number(String(input.priceBs ?? "").replace(",", "."));
  const days = Number(input.deliveryDays);
  const category = clean(input.category, 30) || "Otro";
  if (product.length < 2) throw new AppError("Escribe el producto");
  if (!isUrl(photo_url)) throw new AppError("La foto tiene que ser un link (https://…)");
  if (!Number.isFinite(priceBs) || priceBs < 1 || priceBs > 100000) throw new AppError("El precio tiene que estar entre Bs 1 y Bs 100.000");
  if (!Number.isInteger(days) || days < 1 || days > 15) throw new AppError("Los días de entrega van de 1 a 15");
  if (!inList(CATEGORIAS, category)) throw new AppError("Elige la categoría de la lista");
  // `proteccion` (APP-ENDPOINTS §6 del bot) y `feePayer` (panel) son lo mismo.
  const fee_payer = (input.proteccion ?? input.feePayer) === "vendedor" ? "vendedor" : "comprador";
  const fx = cfg().fx;
  const price_bs_cents = Math.round(priceBs * 100);
  const a = linkAmounts(price_bs_cents, fx, fee_payer);
  const slug = slugify(product);
  orders.insert({
    slug,
    seller_pubkey: seller.pubkey,
    product,
    description,
    photo_url,
    price_bs_cents,
    amount_units: a.amount.toString(),
    fx,
    delivery_days: days,
    window_secs: input.demoWindow === true ? DEMO_WINDOW_SECS : null,
    ship_secs: input.demoWindow === true ? DEMO_WINDOW_SECS : days * 86400,
    inspect_secs: input.demoWindow === true ? DEMO_WINDOW_SECS : (days + cfg().extraWindowDays) * 86400,
    code: newCode(),
    category,
    fee_payer,
    price_units: a.price.toString(),
    platform_bps: a.platformBps,
  });
  return publicOrder(orders.get(slug)!);
}

/** APP-ENDPOINTS §6: cambiar quién paga la protección mientras nadie empezó a pagar el link. */
export function patchLink(slug: string, input: Record<string, unknown>) {
  const o = mustOrder(slug);
  if (input.sellerPubkey !== o.seller_pubkey) throw new AppError("Solo el vendedor puede cambiar su link", 403);
  if (o.status !== "esperando_pago" || o.buyer_pubkey || o.escrow_id) throw new AppError("Este link ya se está pagando: no se puede cambiar", 409);
  if (input.proteccion !== "comprador" && input.proteccion !== "vendedor") throw new AppError("proteccion tiene que ser comprador o vendedor");
  const a = amountsFor(o.price_bs_cents, o.fx, input.proteccion);
  orders.update(slug, { fee_payer: input.proteccion, amount_units: a.amount.toString(), price_units: a.price.toString(), platform_bps: a.platformBps });
  return publicOrder(mustOrder(slug));
}

// ---------- Cuenta (billetera local o Pollar) ----------

/** Cuenta nueva: friendbot y, si falta, la trustline a LABUSD (la firma el navegador). */
export async function activateWallet(pubkey: unknown) {
  if (!isPubkey(pubkey)) throw new AppError("Cuenta inválida");
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
    // Los datos de entrega quedan ligados al escrow por su hash (no se publican en claro).
    description: `Trato ${o.code ?? ""}: ${o.product} | entrega ${o.delivery_hash ?? "-"}`.slice(0, 200),
    amount: o.amount_units,
    platform_fee: o.platform_bps ?? cfg().platformFeeBps,
    milestones: [{ description: "Entrega del producto", status: "pendiente", evidence: "", approved: false }],
    flags: { disputed: false, released: false, resolved: false },
    trustline: { address: cfg().labusdSac },
    receiver_memo: 0,
  };
}

/**
 * "Simular pago del banco": datos de entrega, rampa simulada (lab emite el total en USD de prueba),
 * deploy del escrow de esta compra (plataforma) y fondeo armado para que lo firme el comprador.
 */
export async function startPayment(slug: string, body: Record<string, unknown>): Promise<PreparedDto> {
  const buyer = body.buyer;
  if (!isPubkey(buyer)) throw new AppError("Cuenta inválida");
  const buyerWa = body.whatsapp ? normPhone(body.whatsapp) : "";
  if (body.whatsapp && buyerWa.length < 7) throw new AppError("Escribe un WhatsApp válido");
  const recipient = clean(body.recipient, 60);
  const destCity = clean(body.city, 40);
  const agency = clean(body.agency, 80);
  if (recipient.length < 2) throw new AppError("Escribe quién recibe el pedido");
  if (!inList(CIUDADES, destCity)) throw new AppError("Elige la ciudad de destino");
  // Último tramo (M7, opcionales): teléfono de quien recoge y flete acordado.
  const pickupPhone = body.pickupPhone ? normPhone(body.pickupPhone) : "";
  if (body.pickupPhone && pickupPhone.length < 7) throw new AppError("Escribe un teléfono válido para quien recoge");
  const flete = body.flete ? parseFlete(body.flete, body.fleteBs) : null;
  if (body.flete && !flete) throw new AppError("Escribe el monto del flete en Bs");
  return withLock(`order:${slug}`, async () => {
    let o = mustOrder(slug);
    if (o.status !== "esperando_pago") throw new AppError("Este link ya fue pagado", 409);
    if (o.buyer_pubkey && o.buyer_pubkey !== buyer) throw new AppError("Otra persona ya está pagando este link", 409);
    if (buyer === o.seller_pubkey) throw new AppError("No puedes pagar tu propio link");
    if (!hasTrustline(await horizonAccount(buyer))) throw new AppError("Primero activa tu cuenta", 409);
    if (!o.buyer_pubkey) orders.update(slug, { buyer_pubkey: buyer });
    if (buyerWa) orders.update(slug, { buyer_whatsapp: buyerWa });
    if (!o.escrow_id) {
      orders.update(slug, {
        recipient_name: recipient,
        dest_city: destCity,
        pref_agency: agency || null,
        delivery_hash: sha(JSON.stringify({ slug, recipient, city: destCity, agency })).slice(0, 16),
        ...(pickupPhone ? { pickup_phone: pickupPhone } : {}),
        ...(flete ? { flete } : {}),
      });
    }
    const svc = escrowService();
    o = mustOrder(slug);
    const amount = BigInt(o.amount_units);

    if (!o.ramp_hash) {
      const sent = await mintLabusd(buyer, amount);
      orders.update(slug, { ramp_hash: sent.hash });
      txs.add({
        order_slug: slug,
        actor: "rampa",
        kind: "rampa",
        label: `Rampa simulada: el banco pagó ${fmtBsUnits(amount, o.fx)} y llegaron a tu cuenta`,
        hash: sent.hash,
      });
    }

    o = mustOrder(slug);
    if (!o.escrow_id) {
      const props = buildProps(o, buyer);
      const { escrowId, hash } = await svc.createEscrow(props);
      orders.update(slug, { escrow_id: escrowId, escrow_json: JSON.stringify(props), mode: svc.mode });
      txs.add({ order_slug: slug, actor: "plataforma", kind: "escrow", label: "Se creó el contrato protegido de este pedido", hash });
      o = mustOrder(slug);
    }

    // H-2: antes de pedir la firma, verificar por RPC el WASM de la instancia y sus roles.
    const verification = await svc.verify(ctxOf(o));
    orders.update(slug, { verify_json: JSON.stringify(verification) });
    if (!verification.ok) {
      const failed = verification.checks.filter((c) => !c.ok).map((c) => c.label).join("; ");
      throw new AppError(`No se puede pagar: el contrato del pedido no pasó la verificación (${failed})`, 409);
    }

    const tx = await svc.prepareStep("fund", "fund", ctxOf(o), buyer, {});
    return { ...register(tx, { order_slug: slug, action: "fund", step: "fund", signer: buyer }), verification };
  });
}

// ---------- Acciones del comprador y del vendedor ----------

/** Evidencia de envío estructurada. On-chain va compacta: "empresa|guía|peso|hash-foto". */
function shipParams(o: OrderRow, body: Record<string, unknown>): Record<string, string> {
  // Compatibilidad con scripts viejos: { evidence: "OLVA-123" }.
  if (!body.company && typeof body.evidence === "string") {
    body = { company: "Otra flota", tracking: body.evidence, weight: "1", city: o.dest_city ?? "Otra" };
  }
  const company = clean(body.company, 60);
  const tracking = clean(body.tracking, 60);
  const weightNum = Number(String(body.weight ?? "").replace(",", "."));
  const photo = clean(body.photo, 500);
  const city = clean(body.city, 40) || o.dest_city || "";
  const imei = clean(body.imei, 20).replace(/\D/g, "");
  if (!inList(EMPRESAS, company)) throw new AppError("Elige la empresa de envío de la lista");
  if (company !== "Entrega en persona" && tracking.length < 3) throw new AppError("Escribe el número de guía");
  if (!Number.isFinite(weightNum) || weightNum <= 0 || weightNum > 500) throw new AppError("Escribe el peso declarado en kg");
  if (!isUrl(photo)) throw new AppError("La foto tiene que ser un link (https://…)");
  if (!inList(CIUDADES, city)) throw new AppError("Elige la ciudad de destino");
  if (o.category === "Celular" && !/^\d{15}$/.test(imei)) throw new AppError("Para celulares el IMEI es obligatorio (15 dígitos)");
  const weight = String(Math.round(weightNum * 100) / 100);
  const compact = `${company}|${tracking || "-"}|${weight}kg|${photo ? sha(photo).slice(0, 12) : "-"}`;
  return { company, tracking, weight, photo, city, imei, evidence: compact };
}

export async function prepareAction(slug: string, body: Record<string, unknown>): Promise<PreparedDto> {
  const action = body.action as UserAction;
  const signer = body.signer;
  if (!isPubkey(signer)) throw new AppError("Cuenta inválida");
  const o = mustOrder(slug);
  const svc = escrowService();
  const ctx = ctxOf(o);
  let params: Record<string, string> = {};

  if (action === "ship") {
    if (signer !== o.seller_pubkey) throw new AppError("Solo el vendedor puede registrar el envío", 403);
    if (o.status !== "pagado") throw new AppError("Solo puedes marcar como enviado un pedido pagado", 409);
    params = shipParams(o, body);
  } else if (action === "confirm") {
    if (signer !== o.buyer_pubkey) throw new AppError("Solo el comprador puede pagar al vendedor", 403);
    if (o.status !== "enviado") throw new AppError("Primero el vendedor tiene que marcar el pedido como enviado", 409);
    if (!o.confirm_after || Date.now() < o.confirm_after) {
      throw new AppError(`Podrás pagar al vendedor desde el ${fmtWhen(o.confirm_after ?? Date.now())}`, 409);
    }
  } else if (action === "extend") {
    if (signer !== o.buyer_pubkey) throw new AppError("Solo el comprador puede pedir más tiempo", 403);
    checkExtend(o);
  } else if (action === "dispute") {
    const isBuyer = signer === o.buyer_pubkey;
    if (!isBuyer && signer !== o.seller_pubkey) throw new AppError("Solo el comprador o el vendedor pueden reclamar", 403);
    if (o.status !== "pagado" && o.status !== "enviado") throw new AppError("Este pedido ya no admite reclamos", 409);
    params.reason = clean(body.reason, 80);
    params.text = clean(body.text, 600);
    params.photo = clean(body.photo, 500);
    params.video = clean(body.video, 500);
    if (!inList(MOTIVOS, params.reason)) throw new AppError("Elige un motivo de la lista");
    if (params.reason === MOTIVO_PRESION && !isBuyer) throw new AppError("Ese motivo solo lo puede usar el comprador");
    if (!isUrl(params.photo) || !isUrl(params.video)) throw new AppError("La foto y el video tienen que ser links (https://…)");
    if (isBuyer && MOTIVOS_CON_VIDEO.includes(params.reason) && o.price_bs_cents >= 30000 && !params.video) {
      throw new AppError("Para este motivo, desde Bs 300, el video continuo del desempaque es obligatorio");
    }
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

function checkExtend(o: OrderRow) {
  if (!CAPABILITIES_FOR().extend) throw new AppError("“Necesito más tiempo” solo existe con el contrato guardián", 409);
  if (o.status !== "enviado") throw new AppError("Puedes pedir más tiempo cuando el vendedor ya registró el envío", 409);
  if (o.extended) throw new AppError("Ya pediste más tiempo una vez: si algo está mal, abre un reclamo", 409);
  if (!o.deadline || Date.now() >= o.deadline) throw new AppError("La revisión ya terminó", 409);
}

/** "Necesito más tiempo" (pp_guardian v2 `extend`): arma la transacción que firma el comprador. */
export async function prepareExtend(slug: string, body: Record<string, unknown>): Promise<PreparedDto> {
  return prepareAction(slug, { ...body, action: "extend" });
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
  if (inner.source !== p.signer || inner.signatures.length === 0) throw new AppError("Falta la firma de tu cuenta", 400);

  const sent = await feeBumpAndSend(inner);
  const params = JSON.parse(p.params) as Record<string, string>;

  if (p.action === "trustline") {
    txs.add({ order_slug: null, actor: p.signer, kind: "trustline", label: "Cuenta activada", hash: sent.hash });
    return { hash: sent.hash };
  }

  const slug = p.order_slug!;
  const o = mustOrder(slug);
  const now = Date.now();
  const role = p.signer === o.seller_pubkey ? "vendedor" : "comprador";
  switch (p.step) {
    case "fund": {
      // Modo guardián v2: los plazos reales son los que registró pp_guardian (hora del ledger).
      // La revisión (deadline) recién existe cuando se registra el envío.
      const onchain = await escrowService().purchase(o.escrow_id!).catch(() => null);
      orders.update(slug, {
        status: "pagado",
        funded_at: onchain?.fundedAt ?? now,
        ship_deadline: onchain?.shipDeadline ?? now + shipSecs(o) * 1000,
        deadline: null,
      });
      txs.add({ order_slug: slug, actor: "comprador", kind: "fondeo", label: `Pagaste ${fmtBsUnits(o.amount_units, o.fx)}: quedó guardado en el contrato`, hash: sent.hash });
      break;
    }
    case "ship": {
      // v2: release_at = shipped_at + inspect_secs, ambos con la hora del ledger (pp_guardian.mark_shipped).
      const onchain = await escrowService().purchase(o.escrow_id!).catch(() => null);
      orders.update(slug, {
        status: "enviado",
        shipped_evidence: params.evidence,
        shipped_at: onchain?.shippedAt ?? now,
        deadline: onchain?.releaseAt ?? (onchain?.shippedAt ?? now) + inspectSecs(o) * 1000,
        ship_company: params.company,
        ship_tracking: params.tracking || null,
        ship_weight: params.weight,
        ship_photo: params.photo || null,
        ship_city: params.city,
        ship_imei: params.imei || null,
        confirm_after: now + confirmDelay(o).ms,
      });
      const summary = [params.company, params.tracking && `guía ${params.tracking}`, `${params.weight} kg`, `a ${params.city}`, params.imei && `IMEI ${params.imei}`]
        .filter(Boolean)
        .join(" · ");
      evidence.add({ order_slug: slug, actor: "vendedor", kind: "envio", summary, data: params });
      txs.add({ order_slug: slug, actor: "vendedor", kind: "envio", label: `El vendedor registró el envío: ${summary}`, hash: sent.hash });
      break;
    }
    case "extend": {
      const onchain = await escrowService().purchase(o.escrow_id!).catch(() => null);
      const releaseAt = onchain?.releaseAt ?? (o.deadline ?? now) + inspectSecs(o) * 1000;
      orders.update(slug, { extended: 1, deadline: releaseAt });
      txs.add({ order_slug: slug, actor: "comprador", kind: "extension", label: `Pediste más tiempo para revisar: si no reclamas, se paga al vendedor el ${fmtWhen(releaseAt)}`, hash: sent.hash });
      break;
    }
    case "approve":
      txs.add({ order_slug: slug, actor: "comprador", kind: "aprobacion", label: "El comprador confirmó que recibió el pedido", hash: sent.hash });
      break;
    case "release":
    case "confirm":
      orders.update(slug, { status: "liberado", released_at: now });
      txs.add({ order_slug: slug, actor: "comprador", kind: "liberacion", label: "Se pagó al vendedor", hash: sent.hash });
      break;
    case "dispute":
      orders.update(slug, {
        status: "en_disputa",
        dispute_by: role,
        dispute_reason: params.reason,
        dispute_text: params.text,
        dispute_photo: params.photo,
        dispute_video: params.video || null,
        disputed_at: now,
      });
      if (params.reason === MOTIVO_PRESION) sellers.flagPressure(o.seller_pubkey);
      evidence.add({
        order_slug: slug,
        actor: role,
        kind: "reclamo",
        summary: [params.reason, params.text].filter(Boolean).join(": "),
        data: { reason: params.reason, text: params.text, photo: params.photo, video: params.video },
      });
      txs.add({ order_slug: slug, actor: role, kind: "disputa", label: `Se abrió un reclamo (${params.reason}): la plata queda congelada hasta que decida el revisor`, hash: sent.hash });
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

/** APP-ENDPOINTS §4: el comprador deja (o cambia) su WhatsApp. Solo se guarda en el servidor. */
export function buyerContact(slug: string, body: Record<string, unknown>) {
  const o = mustOrder(slug);
  if (!o.buyer_pubkey || body.buyer !== o.buyer_pubkey) throw new AppError("Solo el comprador puede dejar su WhatsApp", 403);
  const wa = normPhone(body.whatsapp);
  if (wa.length < 7) throw new AppError("Escribe un WhatsApp válido");
  orders.update(slug, { buyer_whatsapp: wa });
  return { ok: true };
}

/** APP-ENDPOINTS §1: tienda por WhatsApp (la más reciente si hay varias). */
export function botSellerByPhone(phoneParam: string | null) {
  const phone = normPhone(phoneParam ?? "");
  if (phone.length < 7) throw new AppError("Número inválido");
  const s = sellers.allNewestFirst().find((x) => normPhone(x.whatsapp) === phone);
  if (!s) throw new AppError("Tienda no encontrada", 404);
  return { seller: { ...s, slug: sellers.ensureSlug(s.pubkey), completedSales: sellers.completedSales(s.pubkey) } };
}

/** APP-ENDPOINTS §2: cambios desde `since`; `now` se toma antes de consultar. */
export function botChanges(sinceParam: string | null) {
  const since = Number(sinceParam ?? 0) || 0;
  void sweepOverdue();
  const now = Date.now();
  return { now, changes: orders.changesSince(since) };
}

export function sellerReply(slug: string, body: Record<string, unknown>) {
  const o = mustOrder(slug);
  if (body.pubkey !== o.seller_pubkey) throw new AppError("Solo el vendedor puede responder", 403);
  if (o.status !== "en_disputa") throw new AppError("El pedido no está en disputa", 409);
  const text = clean(body.text, 600);
  if (text.length < 3) throw new AppError("Escribe tu versión");
  orders.update(slug, { seller_reply: text });
  evidence.add({ order_slug: slug, actor: "vendedor", kind: "respuesta", summary: text, data: { text } });
  return { ok: true };
}

export async function autoRelease(slug: string) {
  return withLock(`order:${slug}`, async () => {
    const o = mustOrder(slug);
    if (o.status !== "enviado") throw new AppError("Solo se libera por plazo un pedido enviado", 409);
    if (!o.deadline || Date.now() < o.deadline) throw new AppError("Todavía no venció el plazo", 409);
    // auto_release respeta cualquier disputa (TW-1): el contrato la rechaza (#20) y la app tampoco la intenta.
    const st = await escrowService().readState(o.escrow_id!).catch(() => null);
    if (st?.flags.disputed) throw new AppError("Hay un reclamo abierto: no se paga por plazo, decide el revisor", 409);
    const { hash } = await escrowService().autoRelease(ctxOf(o));
    orders.update(slug, { status: "liberado", released_at: Date.now() });
    txs.add({ order_slug: slug, actor: "plataforma", kind: "liberacion", label: "Venció el plazo: se pagó al vendedor", hash });
    return { hash };
  });
}

/**
 * Devolución automática por falta de despacho (v2): si el vendedor no registró el envío antes de
 * `ship_deadline`, la plataforma abre la disputa en el escrow y `pp_arbiter.refund_unshipped` le devuelve
 * el pago al comprador (con las comisiones de siempre). No necesita reclamo ni firmas de usuarios.
 */
export async function refundUnshipped(slug: string) {
  return withLock(`order:${slug}`, async () => {
    const o = mustOrder(slug);
    if (o.status === "devuelto") return { hash: null, already: true };
    if (o.status !== "pagado" && o.status !== "en_disputa") throw new AppError("Este pedido no se puede devolver por falta de despacho", 409);
    if (o.shipped_at) throw new AppError("El vendedor ya registró el envío", 409);
    if (!o.ship_deadline || Date.now() < o.ship_deadline + CHAIN_MARGIN_MS) throw new AppError("Todavía no venció el plazo de despacho", 409);
    const { disputeHash, hash } = await escrowService().refundUnshipped(ctxOf(o));
    const now = Date.now();
    if (disputeHash) {
      txs.add({ order_slug: slug, actor: "plataforma", kind: "disputa", label: "El vendedor no registró el envío a tiempo: se congeló el pago para devolverlo", hash: disputeHash });
    }
    orders.update(slug, { status: "devuelto", refunded_at: now, resolved_at: now, buyer_bps: 10000, resolution_reason: "No despachó a tiempo" });
    txs.add({ order_slug: slug, actor: "plataforma", kind: "devolucion", label: "Se devolvió el pago al comprador: el vendedor no despachó a tiempo", hash });
    return { hash, already: false };
  });
}

let lastSweep = 0;
let sweeping = false;
/**
 * Barre los pedidos con el despacho vencido y los devuelve. Corre cuando alguien consulta (páginas, panel,
 * feed del bot), como mucho cada 15 s y sin bloquear la respuesta (DECISIONES 79).
 */
export function sweepOverdue(force = false): Promise<void> {
  if (cfg().mode !== "guardian" || sweeping || (!force && Date.now() - lastSweep < 15_000)) return Promise.resolve();
  sweeping = true;
  lastSweep = Date.now();
  return (async () => {
    try {
      for (const o of orders.overdueUnshipped(Date.now() - CHAIN_MARGIN_MS)) {
        await refundUnshipped(o.slug).catch((e) => console.error(`[devolución] ${o.slug}: ${(e as Error).message}`));
      }
    } finally {
      sweeping = false;
    }
  })();
}

// ---------- Revisor ----------

export async function resolveDispute(slug: unknown, buyerBps: unknown, reason: unknown) {
  if (typeof slug !== "string") throw new AppError("Falta el pedido");
  const bps = Number(buyerBps);
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) throw new AppError("El porcentaje va de 0 a 100");
  const why = clean(reason, 80);
  if (!inList(MOTIVOS, why)) throw new AppError("Elige el motivo del fallo");
  return withLock(`order:${slug}`, async () => {
    const o = mustOrder(slug);
    if (o.status !== "en_disputa") throw new AppError("El pedido no está en disputa", 409);
    const { hash } = await escrowService().resolve(ctxOf(o), bps);
    orders.update(slug, { status: "resuelto", buyer_bps: bps, resolved_at: Date.now(), resolution_reason: why });
    const pct = (bps / 100).toLocaleString("es-BO");
    const pctSeller = ((10000 - bps) / 100).toLocaleString("es-BO");
    txs.add({ order_slug: slug, actor: "revisor", kind: "resolucion", label: `El revisor repartió: ${pct}% para el comprador y ${pctSeller}% para el vendedor (${why})`, hash });
    return { hash };
  });
}

/** Vista previa del slider: pp_arbiter.quote (modo guardián), con los netos que pagará TW. */
export async function quoteDispute(slug: unknown, buyerBps: unknown) {
  if (typeof slug !== "string") throw new AppError("Falta el pedido");
  const bps = Number(buyerBps);
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) throw new AppError("El porcentaje va de 0 a 100");
  const o = mustOrder(slug);
  const q = await escrowService().quote(ctxOf(o), bps);
  const s = splitFromGross(BigInt(q.balance), BigInt(q.buyer_amount), BigInt(q.seller_amount), o.platform_bps ?? cfg().platformFeeBps);
  return {
    ...q,
    buyer_net: s.buyer.net.toString(),
    seller_net: s.seller.net.toString(),
    platform: (s.buyer.platform + s.seller.platform).toString(),
    tw: (s.buyer.tw + s.seller.tw).toString(),
    fx: o.fx,
  };
}

/**
 * Intento de desvío simulado. El revisor lo usa con el pedido en disputa; /probar, con cualquier estado en el que la
 * plata siga en el contrato (el escrow rechaza al que no es su revisor antes de mirar si hay disputa: #12 antes que #14).
 */
export async function probeForeign(slug: unknown, estados: readonly OrderStatus[] = ["en_disputa"]) {
  if (typeof slug !== "string") throw new AppError("Falta el pedido");
  const o = mustOrder(slug);
  if (!estados.includes(o.status))
    throw new AppError(estados.length === 1 ? "El pedido no está en disputa" : "Todavía no hay plata guardada en el contrato de este pedido", 409);
  // "Otra cuenta" con trustline a LABUSD (la de la plataforma): así el único freno posible es el de los roles.
  const foreign = cfg().plataforma.publicKey();
  const r = await escrowService().probeForeignDestination(ctxOf(o), foreign);
  return { ...r, foreign };
}

// ---------- Piloto y verificación ----------

export function joinPilot(body: Record<string, unknown>) {
  const f = {
    name: clean(body.name, 60),
    store: clean(body.store, 60),
    city: clean(body.city, 40),
    sells: clean(body.sells, 120),
    ships_to: clean(body.shipsTo, 200),
    avg_ticket: clean(body.avgTicket, 30),
    whatsapp: clean(body.whatsapp, 20).replace(/[^\d+ ]/g, ""),
  };
  if (f.name.length < 2 || f.store.length < 2) throw new AppError("Escribe tu nombre y el de tu tienda");
  if (!inList(CIUDADES, f.city)) throw new AppError("Elige tu ciudad");
  if (f.sells.length < 2 || f.ships_to.length < 2) throw new AppError("Cuéntanos qué vendes y a qué ciudades envías");
  if (f.whatsapp.replace(/\D/g, "").length < 7) throw new AppError("Escribe un WhatsApp válido");
  if (body.consent !== true) throw new AppError("Necesitamos tu consentimiento para escribirte");
  const id = randomBytes(6).toString("hex");
  pilot.add({ id, ...f, consent: 1 });
  return { id, whatsapp: normPhone(f.whatsapp) };
}

/** /verificar: con el código del pedido muestra tienda, producto, monto y estado. */
export function verifyCode(codeParam: string | null) {
  const code = String(codeParam ?? "").trim().toUpperCase().replace(/^PP\s*-?\s*/, "PP-");
  const o = /^PP-\d{4,5}$/.test(code) ? orders.byCode(code) : undefined;
  if (!o) throw new AppError("No encontramos un pedido con ese código. Si alguien te lo envió, no pagues.", 404);
  const s = sellers.get(o.seller_pubkey);
  return {
    code,
    store: s?.store_name ?? "",
    city: s?.city ?? null,
    product: o.product,
    price: fmtBs(o.price_bs_cents),
    total: fmtBsUnits(o.amount_units, o.fx),
    status: o.status,
    statusLabel: STATUS_LABEL[o.status],
    slug: o.slug,
    escrowId: o.escrow_id,
    created_at: o.created_at,
  };
}

// ---------- Vistas ----------

/** Vista pública del pedido: sin WhatsApp ni datos de entrega del comprador. */
function publicOrder(o: OrderRow) {
  const { escrow_json: _e, verify_json, buyer_whatsapp: _w, recipient_name: _r, dest_city: _c, pref_agency: _a, pickup_phone: _p, ...rest } = o;
  const proteccion = o.fee_payer ?? "comprador";
  // Lo que cuesta la protección: la paga el comprador (sobre el precio) o la regala el vendedor (2,3% de la venta).
  const proteccion_bs_cents =
    proteccion === "comprador" ? amountsFor(o.price_bs_cents, o.fx, "comprador").protectionBsCents : Math.round(o.price_bs_cents * 0.023);
  return { ...rest, proteccion, proteccion_bs_cents, verification: verify_json ? (JSON.parse(verify_json) as Verification) : null };
}

/** Lo que ve el vendedor (y el revisor): incluye los datos de entrega. */
function sellerOrder(o: OrderRow) {
  return { ...publicOrder(o), recipient_name: o.recipient_name, dest_city: o.dest_city, pref_agency: o.pref_agency, pickup_phone: o.pickup_phone ?? null };
}

/**
 * H-1: el estado on-chain manda. Si el escrow está liberado se muestra "Liberado" aunque también figure
 * en disputa; si está resuelto, "Resuelto".
 */
function reconcile(o: OrderRow, st: OnchainState | null): OrderRow {
  if (!st || o.status === "devuelto") return o;
  if (st.flags.released && o.status !== "liberado") {
    orders.update(o.slug, { status: "liberado", released_at: o.released_at ?? Date.now() });
  } else if (st.flags.resolved && !st.flags.released && o.status !== "resuelto" && o.status !== "liberado") {
    orders.update(o.slug, { status: "resuelto", resolved_at: o.resolved_at ?? Date.now() });
  } else {
    return o;
  }
  return mustOrder(o.slug);
}

function money(o: OrderRow) {
  const amount = BigInt(o.amount_units);
  const bps = o.platform_bps ?? cfg().platformFeeBps;
  const out: Record<string, unknown> = {};
  if (o.status === "liberado") {
    const b = releaseBreakdown(amount, bps);
    out.breakdown = { seller: b.seller.toString(), platform: b.platform.toString(), tw: b.tw.toString() };
  }
  if ((o.status === "resuelto" || o.status === "devuelto") && o.buyer_bps != null) {
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

/** Tarjeta del vendedor en la página de pago. */
function sellerCard(pubkey: string) {
  const s = sellers.get(pubkey)!;
  return {
    store_name: s.store_name,
    whatsapp: s.whatsapp,
    pubkey: s.pubkey,
    city: s.city,
    since: s.created_at,
    completedSales: sellers.completedSales(s.pubkey),
    claims: sellers.claimStats(s.pubkey),
    verification: "pendiente" as const,
    slug: sellers.ensureSlug(s.pubkey),
    kpis: sellerKpis(s.pubkey),
  };
}

export async function orderView(slug: string, withOnchain: boolean) {
  void sweepOverdue();
  void ingestEvents().catch(() => null); // KPIs de la tarjeta del vendedor (el RPC, como mucho cada 15 s)
  let o = mustOrder(slug);
  let onchain: OnchainState | null = null;
  if (withOnchain && o.escrow_id) onchain = await escrowService().readState(o.escrow_id).catch(() => null);
  o = reconcile(o, onchain);
  return {
    order: publicOrder(o),
    seller: sellerCard(o.seller_pubkey),
    txs: txs.forOrder(slug),
    platformFeeBps: o.platform_bps ?? cfg().platformFeeBps,
    mode: cfg().mode,
    onchain,
    confirmDelay: confirmDelay(o).label,
    demoTimers: demoTimers(),
    capabilities: CAPABILITIES_FOR(),
    ...money(o),
  };
}

export async function sellerView(pubkey: string) {
  if (!isPubkey(pubkey)) throw new AppError("Cuenta inválida");
  const s = sellers.get(pubkey);
  if (!s) throw new AppError("Tienda no encontrada", 404);
  void sweepOverdue();
  const list = orders.bySeller(pubkey).map((o) => ({ ...sellerOrder(o), txs: txs.forOrder(o.slug), ...money(o) }));
  const balance = await tokenBalance(pubkey);
  void ingestEvents().catch(() => null); // KPIs del panel (el RPC, como mucho cada 15 s)
  return {
    seller: { ...s, slug: sellers.ensureSlug(pubkey), completedSales: sellers.completedSales(pubkey) },
    kpis: sellerKpis(pubkey),
    orders: list,
    balance: balance.toString(),
    fx: cfg().fx,
  };
}

export async function disputesView() {
  void sweepOverdue();
  const open = await Promise.all(
    orders.byStatus("en_disputa").map(async (o) => {
      const onchain = o.escrow_id ? await escrowService().readState(o.escrow_id).catch(() => null) : null;
      return {
        ...sellerOrder(reconcile(o, onchain)),
        seller: sellers.get(o.seller_pubkey),
        txs: txs.forOrder(o.slug),
        evidence: evidence.forOrder(o.slug),
        onchain,
      };
    }),
  );
  const stillOpen = open.filter((d) => d.status === "en_disputa");
  const resolved = orders.recentResolved(10).map((o) => ({ ...publicOrder(o), txs: txs.forOrder(o.slug), evidence: evidence.forOrder(o.slug), ...money(o) }));
  return { open: stillOpen, resolved, platformFeeBps: cfg().platformFeeBps, mode: cfg().mode };
}

/** Lo que trae pp_guardian v2: mark_shipped, reloj desde "enviado", extend y devolución por falta de despacho. */
export function CAPABILITIES_FOR() {
  const v2 = cfg().mode === "guardian";
  return { extend: v2, clockFromShipping: v2, refundUnshipped: v2, proteccionPatch: true };
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
    capabilities: CAPABILITIES_FOR(),
    demoTimers: demoTimers(),
  };
}

/** Para scripts: asegura que la fábrica exista (deploy único). */
export async function ensureFactory() {
  return factoryId();
}

export { ChainError };
