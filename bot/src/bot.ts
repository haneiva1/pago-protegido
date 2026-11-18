// Runtime del bot: une el motor puro (engine/) con la app (app/client.ts).
// Lo usan los dos transportes: WhatsApp Cloud API y el simulador web.

import { AppError, MissingEndpoint, type AppClient } from "./app/client.ts";
import type { Order, Seller, SellerData } from "./app/types.ts";
import { askEvidenceSession, detectIntent, routePublic, step, type Command, type PublicCommand, type Session } from "./engine/engine.ts";
import { SLUG_RE, checkLink, hostOf } from "./engine/links.ts";
import { linkUrl, msg, registerUrl, type OutMsg } from "./engine/messages.ts";
import { matchOrder, normPhone } from "./engine/parse.ts";
import { ReportStore } from "./reports.ts";

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
  /**
   * Dominios (host con puerto) de los links auténticos. Por defecto, el de `appUrl`.
   * main.ts pasa los de PP_APP_URL y PP_PUBLIC_URL.
   */
  canonicalHosts?: string[];
  /** Dónde se guardan los "reportar <link>". Por defecto, en memoria. */
  reports?: ReportStore;
  /** Tiendas que ya recibieron el aviso de registro ("para cobrar no tienes que abrir ningún link"). */
  greeted?: Set<string>;
  onGreeted?: (phone: string) => void;
}

export class Bot {
  readonly sessions = new Map<string, Session>();
  readonly phoneLinks: Map<string, string>;
  readonly reports: ReportStore;
  readonly greeted: Set<string>;
  readonly canonicalHosts: string[];
  private readonly appUrl: string;
  private readonly now: () => number;

  constructor(private readonly d: BotDeps) {
    this.appUrl = d.appUrl.replace(/\/+$/, "");
    this.now = d.now ?? Date.now;
    this.phoneLinks = d.phoneLinks ?? new Map();
    this.reports = d.reports ?? new ReportStore();
    this.greeted = d.greeted ?? new Set();
    this.canonicalHosts = [...new Set((d.canonicalHosts ?? [this.appUrl]).map(hostOf))];
  }

  /** Procesa un mensaje entrante y devuelve las respuestas, en orden. */
  async handle(fromRaw: string, text: string): Promise<OutMsg[]> {
    const phone = normPhone(fromRaw);
    try {
      const intent = detectIntent(text);
      if (intent.kind === "link") return [await this.link(phone, intent.pubkey)];

      // Verificador, reportes y botones del comprador: para cualquier número, tenga tienda o no.
      const pub = routePublic(text, this.sessions.get(phone), this.now());
      if (pub) return await this.runPublic(pub, phone);

      const seller = await this.findSeller(phone);
      if (!seller) return [msg.notRegistered(this.appUrl, phone)];

      // Aviso de registro, una sola vez por tienda: nadie cobra abriendo un link.
      const welcome: OutMsg[] = [];
      if (!this.greeted.has(phone)) {
        this.greeted.add(phone);
        this.d.onGreeted?.(phone);
        welcome.push(msg.sellerWelcome(seller.store_name));
      }

      const r = step(this.sessions.get(phone), text, this.now(), { store: seller.store_name });
      this.sessions.set(phone, r.session);
      if (!r.command) return [...welcome, ...r.replies];
      return [...welcome, ...r.replies, ...(await this.run(r.command, seller, phone))];
    } catch (e) {
      const m = e instanceof AppError ? e.message : e instanceof MissingEndpoint ? e.message : "la app no responde";
      if (!(e instanceof AppError)) console.error("[bot]", e);
      return [msg.appError(m)];
    }
  }

  private async runPublic(c: PublicCommand, phone: string): Promise<OutMsg[]> {
    switch (c.kind) {
      case "verify":
        if (!c.links.length) return [msg.verifyAsk()];
        return Promise.all(c.links.map((l) => this.verify(l)));
      case "report": {
        if (!c.link) return [msg.reportAsk()];
        const check = checkLink(c.link, this.canonicalHosts);
        this.reports.add({
          at: new Date(this.now()).toISOString(),
          from: phone,
          link: c.link.slice(0, 500),
          host: check.host,
          verdict: check.ok ? "autentico" : check.reason,
          note: c.note,
        });
        return [msg.reportThanks(check.host)];
      }
      case "buyerHelp":
        return [msg.buyerHelp(c.action, c.slug && SLUG_RE.test(c.slug) ? linkUrl(this.appUrl, c.slug) : null)];
    }
  }

  /** Auténtico solo si el dominio es exactamente el canónico, la ruta es /p/<slug> y la app tiene ese pedido. */
  private async verify(link: string): Promise<OutMsg> {
    const check = checkLink(link, this.canonicalHosts);
    if (!check.ok) return msg.verifyFake(link, check.host, check.reason, this.appUrl);
    try {
      return msg.verifyOk(await this.d.client.order(check.slug));
    } catch (e) {
      if (e instanceof AppError && e.status === 404) return msg.verifyFake(link, check.host, "not_found", this.appUrl);
      console.error("[verificador]", e instanceof Error ? e.message : e);
      return msg.verifyUnavailable();
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
    if (!this.greeted.has(phone)) {
      this.greeted.add(phone); // msg.linked ya trae el aviso de registro
      this.d.onGreeted?.(phone);
    }
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
        // La protección la paga el cliente por defecto; el vendedor la puede regalar con el botón (PATCH).
        const order = await client.createLink({
          sellerPubkey: seller.pubkey,
          product: c.product,
          priceBs: c.priceBs,
          deliveryDays: c.days,
          proteccion: "comprador",
          category: c.category,
        });
        this.d.onOrderSeen?.(order, phone);
        return msg.linkCreated(this.appUrl, order, seller.store_name);
      }
      case "proteccion": {
        const orders = (await this.data(seller)).orders;
        const o = c.code
          ? matchOrder(orders, c.code)
          : [...orders].filter((x) => x.status === "esperando_pago").sort((a, b) => b.created_at - a.created_at)[0];
        if (!o) return [c.code ? msg.orderNotFound(c.code) : msg.proteccionNoOrder()];
        return [msg.proteccionSet(await client.setProteccion(o.slug, seller.pubkey, c.who))];
      }
      case "myOrders": {
        const d = await this.data(seller);
        for (const o of d.orders) this.d.onOrderSeen?.(o, phone);
        return [msg.orders(this.appUrl, d)];
      }
      case "profile":
        return [msg.profile(this.appUrl, seller)];
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
        // Vencido el plazo de despacho, el contrato ya no acepta el envío: la plata vuelve al comprador.
        if (o.ship_deadline && this.now() >= o.ship_deadline) return [msg.shipLate(o)];
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
