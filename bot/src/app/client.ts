// Cliente de la app web. Usa las rutas reales de pago-protegido/app y las propuestas en APP-ENDPOINTS.md.

import type { ChangesFeed, CreateLinkInput, Order, OrderView, Proteccion, Seller, SellerData } from "./types.ts";

/** La app respondió con un error legible ({ error }). */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** La ruta todavía no existe en la app (404 sin JSON de Next.js): hay que usar el plan B. */
export class MissingEndpoint extends Error {
  constructor(readonly path: string) {
    super(`La app todavía no tiene ${path} (ver APP-ENDPOINTS.md)`);
  }
}

export interface AppClient {
  /** §1: vendedor por número de WhatsApp, o null si no tiene tienda. */
  sellerByPhone(phone: string): Promise<Seller | null>;
  /** GET /api/sellers/:pubkey/panel con x-bot-key (tienda, pedidos y saldo). null si no existe. */
  sellerData(pubkey: string): Promise<SellerData | null>;
  /** Existe: POST /api/links. */
  createLink(input: CreateLinkInput): Promise<Order>;
  /** §6: PATCH /api/links/:slug { sellerPubkey, proteccion }, solo con el pedido en "esperando_pago" y sin comprador. */
  setProteccion(slug: string, sellerPubkey: string, proteccion: Proteccion): Promise<Order>;
  /** Existe: GET /api/orders/:slug. */
  order(slug: string): Promise<OrderView>;
  /** §2: pedidos que cambiaron desde `since` (ms). */
  changes(since: number): Promise<ChangesFeed>;
}

export class HttpAppClient implements AppClient {
  constructor(
    readonly baseUrl: string,
    private readonly botKey = "",
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (init.body) headers["content-type"] = "application/json";
    if (this.botKey) headers["x-bot-key"] = this.botKey;
    const res = await this.fetchFn(`${this.baseUrl}${path}`, { ...init, headers, signal: AbortSignal.timeout(20_000) });
    const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
    const data = isJson ? await res.json().catch(() => null) : null;
    if (res.ok && isJson) return data as T;
    if (res.status === 404 && !isJson) throw new MissingEndpoint(path.split("?")[0]);
    const message = (data as { error?: string } | null)?.error ?? `HTTP ${res.status}`;
    throw new AppError(message, res.status);
  }

  async sellerByPhone(phone: string): Promise<Seller | null> {
    try {
      const r = await this.call<{ seller: Seller }>(`/api/bot/sellers?phone=${encodeURIComponent(phone)}`);
      return r.seller;
    } catch (e) {
      if (e instanceof AppError && e.status === 404) return null;
      throw e;
    }
  }

  async sellerData(pubkey: string): Promise<SellerData | null> {
    try {
      return await this.call<SellerData>(`/api/sellers/${encodeURIComponent(pubkey)}/panel`);
    } catch (e) {
      if (e instanceof AppError && e.status === 404) return null;
      throw e;
    }
  }

  createLink(input: CreateLinkInput): Promise<Order> {
    return this.call<Order>("/api/links", { method: "POST", body: JSON.stringify(input) });
  }

  async setProteccion(slug: string, sellerPubkey: string, proteccion: Proteccion): Promise<Order> {
    const r = await this.call<Order | { order: Order }>(`/api/links/${encodeURIComponent(slug)}`, {
      method: "PATCH",
      body: JSON.stringify({ sellerPubkey, proteccion }),
    });
    return "order" in r && r.order && typeof r.order === "object" ? r.order : (r as Order);
  }

  order(slug: string): Promise<OrderView> {
    return this.call<OrderView>(`/api/orders/${encodeURIComponent(slug)}`);
  }

  changes(since: number): Promise<ChangesFeed> {
    return this.call<ChangesFeed>(`/api/bot/changes?since=${since}`);
  }
}
