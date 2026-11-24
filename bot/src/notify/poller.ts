// Avisos: consulta la app cada tanto, detecta cambios de estado de los pedidos y avisa por el transporte.
// El estado de cada pedido vive en GET /api/orders/:slug; los cambios, en GET /api/bot/changes (propuesto).
// Sin ese endpoint (plan B), revisa uno por uno los pedidos que el bot conoce.

import { MissingEndpoint, type AppClient } from "../app/client.ts";
import type { ChangesFeed, Order, OrderStatus, OrderView } from "../app/types.ts";
import { RESUMEN_AVISO, notice, type OutMsg } from "../engine/messages.ts";
import { normPhone, orderCode } from "../engine/parse.ts";
import type { AvisoMeta } from "./outbox.ts";

export interface TrackedOrder {
  status: OrderStatus;
  sellerPhone?: string;
  buyerPhone?: string | null;
  deadline?: number | null;
  /** Cuándo se marcó enviado: los recordatorios cuentan desde ahí. */
  shippedAt?: number | null;
  /** El comprador ya usó "Necesito más tiempo". */
  extended?: boolean;
  /** Hitos de recordatorio ya enviados (en horas: 48, 24, 2). */
  reminders?: number[];
  /** Aviso anti-presión ya enviado al comprador, al pagar y al enviar. */
  warned?: { pagado?: boolean; enviado?: boolean };
  /** `updated_at` de la última vez que se leyó el pedido. */
  updatedAt?: number;
  /** Devolución completa: desde cuándo el aviso de la devolución espera a que se confirme el reintegro. */
  reintegroDesde?: number;
}

export interface PollerState {
  /** Último `now` devuelto por /api/bot/changes. */
  cursor: number;
  orders: Record<string, TrackedOrder>;
}

export type NoticeKind =
  | "pagado"
  | "enviado_vendedor"
  | "te_llego"
  | "liberado"
  | "reclamo"
  | "resuelto"
  | "devuelto"
  | "mas_tiempo"
  | "recordatorio"
  | "anti_presion";

/** Recordatorios al comprador: cuántas horas antes de la liberación automática. */
export const REMINDER_HOURS = [48, 24, 2];

export interface Sent {
  to: string;
  kind: NoticeKind;
  papel: AvisoMeta["papel"];
  slug: string;
  msg: OutMsg;
}

const FINAL: OrderStatus[] = ["liberado", "resuelto", "devuelto"];

/**
 * Devolución completa (PP_DEVOLUCION_COMPLETA=1 en la app): el aviso de una devolución espera a que el reintegro se
 * confirme, como mucho este tiempo, para que el comprador reciba un solo mensaje con todo lo que pagó. Después de eso,
 * va el aviso de siempre. Sin reintegro en la vista (interruptor apagado), no se espera nada.
 */
export const REINTEGRO_ESPERA_MS = 10 * 60_000;

/** Qué avisar, y a quién, cuando un pedido llega a su estado actual. Pura. */
export function noticesFor(view: OrderView, appUrl: string, sellerPhone: string, buyerPhone: string | null): Omit<Sent, "slug">[] {
  const d = { appUrl, view };
  const out: Omit<Sent, "slug">[] = [];
  switch (view.order.status) {
    case "pagado":
      out.push({ to: sellerPhone, kind: "pagado", papel: "vendedor", msg: notice.paid(d) });
      break;
    case "enviado":
      out.push({ to: sellerPhone, kind: "enviado_vendedor", papel: "vendedor", msg: notice.shippedSeller(d) });
      if (buyerPhone) out.push({ to: buyerPhone, kind: "te_llego", papel: "comprador", msg: notice.arrived(d) });
      break;
    case "liberado":
      out.push({ to: sellerPhone, kind: "liberado", papel: "vendedor", msg: notice.released(d) });
      break;
    case "en_disputa":
      out.push({ to: sellerPhone, kind: "reclamo", papel: "vendedor", msg: notice.dispute(d) });
      if (buyerPhone) out.push({ to: buyerPhone, kind: "reclamo", papel: "comprador", msg: notice.disputeBuyer(d) });
      break;
    case "resuelto":
      out.push({ to: sellerPhone, kind: "resuelto", papel: "vendedor", msg: notice.resolved(d, "vendedor") });
      if (buyerPhone) out.push({ to: buyerPhone, kind: "resuelto", papel: "comprador", msg: notice.resolved(d, "comprador") });
      break;
    case "devuelto":
      out.push({ to: sellerPhone, kind: "devuelto", papel: "vendedor", msg: notice.refunded(d, "vendedor") });
      if (buyerPhone) out.push({ to: buyerPhone, kind: "devuelto", papel: "comprador", msg: notice.refunded(d, "comprador") });
      break;
  }
  return out;
}

export interface PollerDeps {
  client: AppClient;
  appUrl: string;
  /** `meta` es para el transporte que puede tener que guardar el aviso (notify/outbox.ts). */
  send: (to: string, m: OutMsg, meta: AvisoMeta) => Promise<void>;
  now?: () => number;
  /** Cuántas horas antes de la liberación automática se recuerda al comprador. Por defecto 48, 24 y 2. */
  reminderHours?: number | number[];
  /** Cuánto dura una "hora" de los recordatorios: 3.600.000 ms, o 60.000 en modo demo (DEMO_MINUTES=1). */
  reminderUnitMs?: number;
  state?: PollerState;
  save?: (s: PollerState) => void;
}

export class Poller {
  readonly state: PollerState;
  private readonly now: () => number;
  private readonly appUrl: string;
  private timer?: NodeJS.Timeout;
  private running = false;
  private cola: Promise<unknown> = Promise.resolve();

  constructor(private readonly d: PollerDeps) {
    this.now = d.now ?? Date.now;
    this.appUrl = d.appUrl.replace(/\/+$/, "");
    this.state = d.state ?? { cursor: this.now(), orders: {} };
  }

  /** El bot avisa de los pedidos que crea o lista, para el plan B y para saber su estado anterior. */
  track(order: Pick<Order, "slug" | "status">, sellerPhone?: string) {
    if (!this.state.orders[order.slug]) this.state.orders[order.slug] = { status: order.status, sellerPhone };
  }

  /** Pedidos a revisar, con el WhatsApp del comprador cuando la app lo comparte (solo por /api/bot/changes). */
  private async changed(): Promise<{ slug: string; buyerWhatsapp?: string | null }[]> {
    try {
      const feed = await this.d.client.changes(this.state.cursor);
      this.state.cursor = feed.now;
      const isNew = (c: ChangesFeed["changes"][number]) => {
        const t = this.state.orders[c.slug];
        return !t || t.status !== c.status || (t.updatedAt ?? 0) < c.updated_at;
      };
      const bySlug = new Map(feed.changes.filter(isNew).map((c) => [c.slug, { slug: c.slug, buyerWhatsapp: c.buyer_whatsapp }]));
      return [...bySlug.values()];
    } catch (e) {
      if (!(e instanceof MissingEndpoint)) throw e;
      return Object.entries(this.state.orders)
        .filter(([, o]) => !FINAL.includes(o.status))
        .map(([slug]) => ({ slug }));
    }
  }

  /** Cuántas compras dejaron este WhatsApp para los avisos. */
  comprasDe(phone: string): number {
    const p = normPhone(phone);
    return Object.values(this.state.orders).filter((o) => o.buyerPhone === p).length;
  }

  /** Una vuelta: detecta cambios, avisa y manda recordatorios. Devuelve lo enviado. De a una: dos a la vez avisarían doble. */
  tick(): Promise<Sent[]> {
    const r = this.cola.then(() => this.vuelta());
    this.cola = r.catch(() => undefined);
    return r;
  }

  private async vuelta(): Promise<Sent[]> {
    const sent: Sent[] = [];
    const deliver = async (slug: string, n: Omit<Sent, "slug">, view: OrderView) => {
      try {
        const vence = n.kind === "recordatorio" ? (view.order.deadline ?? undefined) : undefined;
        await this.d.send(n.to, n.msg, { slug, kind: n.kind, papel: n.papel, code: orderCode(view.order), resumen: RESUMEN_AVISO[n.kind], ...(vence ? { vence } : {}) });
        sent.push({ ...n, slug });
      } catch (e) {
        console.error(`[avisos] no pude avisar a ${n.to} (${n.kind}):`, e instanceof Error ? e.message : e);
      }
    };

    // Más los avisos de devolución que esperan el reintegro: se revisan en cada vuelta, aunque el feed no los traiga.
    const toCheck = new Map<string, { slug: string; buyerWhatsapp?: string | null }>();
    for (const [slug, t] of Object.entries(this.state.orders)) if (t.reintegroDesde != null) toCheck.set(slug, { slug });
    for (const c of await this.changed()) toCheck.set(c.slug, c);

    for (const { slug, buyerWhatsapp } of toCheck.values()) {
      const view = await this.d.client.order(slug).catch(() => null);
      if (!view) continue;
      const prevT = this.state.orders[slug];
      const prev = prevT?.status ?? "esperando_pago";
      const o = view.order;
      const extended = Boolean(o.extended);
      const sellerPhone = normPhone(view.seller.whatsapp);
      const buyerPhone = buyerWhatsapp ? normPhone(buyerWhatsapp) : (this.state.orders[slug]?.buyerPhone ?? null);
      // Devolución completa: el aviso de la devolución espera a que se confirme el reintegro (REINTEGRO_ESPERA_MS).
      if (view.reintegro && view.reintegro.estado !== "confirmado" && prev !== o.status && (o.status === "devuelto" || o.status === "resuelto")) {
        const desde = prevT?.reintegroDesde ?? this.now();
        if (this.now() - desde < REINTEGRO_ESPERA_MS) {
          this.state.orders[slug] = { ...prevT, status: prev, sellerPhone, buyerPhone, reintegroDesde: desde };
          continue;
        }
      }
      const t = (this.state.orders[slug] = {
        ...this.state.orders[slug],
        status: o.status,
        sellerPhone,
        buyerPhone,
        deadline: o.deadline,
        shippedAt: o.shipped_at,
        extended,
        updatedAt: o.updated_at,
        reintegroDesde: undefined,
      });
      const changedStatus = prev !== o.status;
      if (changedStatus) for (const n of noticesFor(view, this.appUrl, sellerPhone, buyerPhone)) await deliver(slug, n, view);

      // La hora de liberación cambió (envío o "Necesito más tiempo"): los recordatorios se vuelven a programar con la nueva.
      if (prevT && prevT.deadline != null && o.deadline != null && prevT.deadline !== o.deadline) t.reminders = [];
      if (o.status === "enviado" && extended && prevT && !prevT.extended && !changedStatus) {
        await deliver(slug, { to: sellerPhone, kind: "mas_tiempo", papel: "vendedor", msg: notice.extended({ appUrl: this.appUrl, view }) }, view);
      }

      // Anti-presión al comprador: al pagar y otra vez al enviar (dentro de "¿Te llegó?"). También si deja su
      // WhatsApp después de que el bot vio el cambio de estado.
      if (buyerPhone && (o.status === "pagado" || o.status === "enviado")) {
        const warned = (t.warned ??= {});
        if (!warned[o.status]) {
          warned[o.status] = true;
          const inArrived = o.status === "enviado" && changedStatus; // notice.arrived ya lo trae
          if (!inArrived) await deliver(slug, { to: buyerPhone, kind: "anti_presion", papel: "comprador", msg: notice.antiPressure({ appUrl: this.appUrl, view }) }, view);
        }
      }
    }

    // Recordatorios al comprador antes de la liberación automática: 48 h, 24 h y 2 h (o minutos en modo demo).
    // Cuentan desde que el pedido se marcó enviado: un hito que cae antes del envío no se manda.
    const now = this.now();
    const unit = this.d.reminderUnitMs ?? 3_600_000;
    const marks = [this.d.reminderHours ?? REMINDER_HOURS].flat().sort((a, b) => b - a);
    for (const [slug, t] of Object.entries(this.state.orders)) {
      if (t.status !== "enviado" || !t.buyerPhone || !t.deadline || t.deadline <= now) continue;
      const done = new Set(t.reminders ?? []);
      const due = marks.filter((h) => !done.has(h) && t.deadline! - h * unit > (t.shippedAt ?? 0) && t.deadline! - now <= h * unit);
      if (!due.length) continue;
      const view = await this.d.client.order(slug).catch(() => null);
      if (!view || view.order.status !== "enviado") continue;
      t.reminders = [...done, ...due];
      // Si se juntan varios hitos (el bot estuvo apagado), va solo el más urgente.
      await deliver(slug, { to: t.buyerPhone, kind: "recordatorio", papel: "comprador", msg: notice.reminder({ appUrl: this.appUrl, view }, now) }, view);
    }

    this.d.save?.(this.state);
    return sent;
  }

  start(intervalMs: number) {
    this.timer = setInterval(async () => {
      if (this.running) return;
      this.running = true;
      try {
        await this.tick();
      } catch (e) {
        console.error("[avisos]", e instanceof Error ? e.message : e);
      } finally {
        this.running = false;
      }
    }, intervalMs);
  }

  stop() {
    clearInterval(this.timer);
  }
}
