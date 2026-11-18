// Runtime del bot: une el motor puro (engine/) con la app (app/client.ts).
// Lo usan los dos transportes: WhatsApp Cloud API y el simulador web.

import { AppError, MissingEndpoint, type AppClient } from "./app/client.ts";
import type { Order, Seller, SellerData } from "./app/types.ts";
import { askEvidenceSession, detectIntent, step, type Command, type Session } from "./engine/engine.ts";
import { msg, registerUrl, type OutMsg } from "./engine/messages.ts";
import { matchOrder, normPhone } from "./engine/parse.ts";

export interface BotDeps {
  client: AppClient;
  /** URL pública de la app web (links de pago, panel, registro). */
  appUrl: string;
  now?: () => number;
  /**
   * Plan B mientras la app no tenga GET /api/bot/sellers (APP-ENDPOINTS.md §1):
   * número → clave pública, cargado con el comando "vincular <clave>".
   */
  phoneLinks?: Map<string, string>;
  onPhoneLinked?: (phone: string, pubkey: string) => void;
  /** Avisa al poller de cada pedido que el bot ve (para el plan B sin /api/bot/changes). */
  onOrderSeen?: (order: Order, sellerPhone: string) => void;
}

export class Bot {
  readonly sessions = new Map<string, Session>();
  readonly phoneLinks: Map<string, string>;
  private readonly appUrl: string;
  private readonly now: () => number;

  constructor(private readonly d: BotDeps) {
    this.appUrl = d.appUrl.replace(/\/+$/, "");
    this.now = d.now ?? Date.now;
    this.phoneLinks = d.phoneLinks ?? new Map();
  }

  /** Procesa un mensaje entrante y devuelve las respuestas, en orden. */
  async handle(fromRaw: string, text: string): Promise<OutMsg[]> {
    const phone = normPhone(fromRaw);
    try {
      const intent = detectIntent(text);
      if (intent.kind === "link") return [await this.link(phone, intent.pubkey)];

      const seller = await this.findSeller(phone);
      if (!seller) return [msg.notRegistered(this.appUrl, phone)];

      const r = step(this.sessions.get(phone), text, this.now(), { store: seller.store_name });
      this.sessions.set(phone, r.session);
      if (!r.command) return r.replies;
      return [...r.replies, ...(await this.run(r.command, seller, phone))];
    } catch (e) {
      const m = e instanceof AppError ? e.message : e instanceof MissingEndpoint ? e.message : "la app no responde";
      if (!(e instanceof AppError)) console.error("[bot]", e);
      return [msg.appError(m)];
    }
  }

  private async findSeller(phone: string): Promise<Seller | null> {
    try {
      const s = await this.d.client.sellerByPhone(phone);
      if (s) return s;
    } catch (e) {
      if (!(e instanceof MissingEndpoint)) throw e;
    }
    const pubkey = this.phoneLinks.get(phone);
    if (!pubkey) return null;
    return (await this.d.client.sellerData(pubkey))?.seller ?? null;
  }

  /** "vincular G…": solo si la tienda registró este mismo WhatsApp en la web. */
  private async link(phone: string, pubkey: string): Promise<OutMsg> {
    const data = await this.d.client.sellerData(pubkey);
    if (!data || normPhone(data.seller.whatsapp) !== phone) {
      return { text: `No encontré una tienda con esa billetera y este WhatsApp 🤔. Créala o revisa tu número aquí:\n👉 ${registerUrl(this.appUrl, phone)}` };
    }
    this.phoneLinks.set(phone, pubkey);
    this.d.onPhoneLinked?.(phone, pubkey);
    return msg.linked(data.seller.store_name);
  }

  private async data(seller: Seller): Promise<SellerData> {
    const d = await this.d.client.sellerData(seller.pubkey);
    if (!d) throw new AppError("no encontré tu tienda", 404);
    return d;
  }

  private async run(c: Command, seller: Seller, phone: string): Promise<OutMsg[]> {
    const { client } = this.d;
    switch (c.kind) {
      case "createLink": {
        const order = await client.createLink({ sellerPubkey: seller.pubkey, product: c.product, priceBs: c.priceBs, deliveryDays: c.days });
        this.d.onOrderSeen?.(order, phone);
        return msg.linkCreated(this.appUrl, order);
      }
      case "myOrders": {
        const d = await this.data(seller);
        for (const o of d.orders) this.d.onOrderSeen?.(o, phone);
        return [msg.orders(this.appUrl, d)];
      }
      case "balance":
        return [msg.balance(this.appUrl, await this.data(seller))];
      case "status": {
        // Solo pedidos de esta tienda: nadie consulta pedidos ajenos por el bot.
        const o = matchOrder((await this.data(seller)).orders, c.code);
        if (!o) return [msg.orderNotFound(c.code)];
        return [msg.status(this.appUrl, await client.order(o.slug))];
      }
      case "shipped": {
        const o = matchOrder((await this.data(seller)).orders, c.code);
        if (!o) return [msg.orderNotFound(c.code)];
        if (o.status !== "pagado") return [msg.cannotShip(o)];
        if (!c.evidence || c.evidence.trim().length < 3) {
          this.sessions.set(phone, askEvidenceSession(o.slug, o.product, this.now()));
          return [msg.askEvidence(o.product)];
        }
        return [msg.shipLink(this.appUrl, o, c.evidence.trim())];
      }
      case "link":
        return [await this.link(phone, c.pubkey)];
    }
  }
}
