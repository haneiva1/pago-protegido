// Avisos: consulta la app cada tanto, detecta cambios de estado de los pedidos y avisa por el transporte.
// El estado de cada pedido vive en GET /api/orders/:slug; los cambios, en GET /api/bot/changes (propuesto).
// Sin ese endpoint (plan B), revisa uno por uno los pedidos que el bot conoce.

import { MissingEndpoint, type AppClient } from "../app/client.ts";
import type { ChangesFeed, Order, OrderStatus, OrderView } from "../app/types.ts";
import { notice, type OutMsg } from "../engine/messages.ts";
import { normPhone } from "../engine/parse.ts";

export interface TrackedOrder {
  status: OrderStatus;
  sellerPhone?: string;
  buyerPhone?: string | null;
  deadline?: number | null;
  reminded?: boolean;
  /** `updated_at` de la última vez que se leyó el pedido. */
  updatedAt?: number;
}

export interface PollerState {
  /** Último `now` devuelto por /api/bot/changes. */
  cursor: number;
  orders: Record<string, TrackedOrder>;
}

export type NoticeKind = "pagado" | "enviado_vendedor" | "te_llego" | "liberado" | "reclamo" | "resuelto" | "recordatorio";

export interface Sent {
  to: string;
  kind: NoticeKind;
  slug: string;
  msg: OutMsg;
}

const FINAL: OrderStatus[] = ["liberado", "resuelto"];

/** Qué avisar, y a quién, cuando un pedido llega a su estado actual. Pura. */
export function noticesFor(view: OrderView, appUrl: string, sellerPhone: string, buyerPhone: string | null): Omit<Sent, "slug">[] {
  const d = { appUrl, view };
  const out: Omit<Sent, "slug">[] = [];
  switch (view.order.status) {
    case "pagado":
      out.push({ to: sellerPhone, kind: "pagado", msg: notice.paid(d) });
      break;
    case "enviado":
      out.push({ to: sellerPhone, kind: "enviado_vendedor", msg: notice.shippedSeller(d) });
      if (buyerPhone) out.push({ to: buyerPhone, kind: "te_llego", msg: notice.arrived(d) });
      break;
    case "liberado":
      out.push({ to: sellerPhone, kind: "liberado", msg: notice.released(d) });
      break;
    case "en_disputa":
      out.push({ to: sellerPhone, kind: "reclamo", msg: notice.dispute(d) });
      break;
    case "resuelto":
      out.push({ to: sellerPhone, kind: "resuelto", msg: notice.resolved(d, "vendedor") });
      if (buyerPhone) out.push({ to: buyerPhone, kind: "resuelto", msg: notice.resolved(d, "comprador") });
      break;
  }
  return out;
}

export interface PollerDeps {
  client: AppClient;
  appUrl: string;
  send: (to: string, m: OutMsg) => Promise<void>;
  now?: () => number;
  /** Cuántas horas antes de la liberación automática se recuerda al comprador. */
  reminderHours?: number;
  state?: PollerState;
  save?: (s: PollerState) => void;
}

export class Poller {
  readonly state: PollerState;
  private readonly now: () => number;
  private readonly appUrl: string;
  private timer?: NodeJS.Timeout;
  private running = false;

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

  /** Una vuelta: detecta cambios, avisa y manda recordatorios. Devuelve lo enviado. */
  async tick(): Promise<Sent[]> {
    const sent: Sent[] = [];
    const deliver = async (slug: string, n: Omit<Sent, "slug">) => {
      try {
        await this.d.send(n.to, n.msg);
        sent.push({ ...n, slug });
      } catch (e) {
        console.error(`[avisos] no pude avisar a ${n.to} (${n.kind}):`, e instanceof Error ? e.message : e);
      }
    };

    for (const { slug, buyerWhatsapp } of await this.changed()) {
      const view = await this.d.client.order(slug).catch(() => null);
      if (!view) continue;
      const prev = this.state.orders[slug]?.status ?? "esperando_pago";
      const o = view.order;
      const sellerPhone = normPhone(view.seller.whatsapp);
      const buyerPhone = buyerWhatsapp ? normPhone(buyerWhatsapp) : (this.state.orders[slug]?.buyerPhone ?? null);
      this.state.orders[slug] = { ...this.state.orders[slug], status: o.status, sellerPhone, buyerPhone, deadline: o.deadline, updatedAt: o.updated_at };
      if (prev === o.status) continue;
      for (const n of noticesFor(view, this.appUrl, sellerPhone, buyerPhone)) await deliver(slug, n);
    }

    // Recordatorio al comprador antes de la liberación automática (solo pedidos enviados).
    const now = this.now();
    const windowMs = (this.d.reminderHours ?? 24) * 3_600_000;
    for (const [slug, t] of Object.entries(this.state.orders)) {
      if (t.status !== "enviado" || !t.buyerPhone || !t.deadline || t.reminded) continue;
      if (t.deadline <= now || t.deadline - now > windowMs) continue;
      const view = await this.d.client.order(slug).catch(() => null);
      if (!view || view.order.status !== "enviado") continue;
      t.reminded = true;
      await deliver(slug, { to: t.buyerPhone, kind: "recordatorio", msg: notice.reminder({ appUrl: this.appUrl, view }, now) });
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
