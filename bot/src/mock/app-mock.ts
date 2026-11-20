// App de mentira: imita la API real de pago-protegido/app v2 (mismas formas, APP-ENDPOINTS.md §1–§8).
// Sirve para los tests y para la demo del simulador sin la app ni testnet.

import { randomBytes, randomInt } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Order, OrderView, Proteccion, Seller, SellerData } from "../app/types.ts";
import { normPhone } from "../engine/parse.ts";

export const DEMO_SELLER: Seller = {
  pubkey: "GBTIENDADEMOPAGOPROTEGIDOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  store_name: "Tienda Demo",
  whatsapp: "59171234567",
  created_at: Date.UTC(2026, 10, 1),
  slug: "tienda-demo-1a2b",
};
export const DEMO_BUYER_PHONE = "59176543210";

export interface MockOptions {
  port?: number;
  /** false = la app todavía no tiene /api/bot/* (plan B del bot). */
  botEndpoints?: boolean;
  botKey?: string;
  fx?: number;
  now?: () => number;
  /** Plazo de despacho desde el pago (`ship_secs`). Por defecto, los días de entrega, como la app v2. */
  shipMs?: (deliveryDays: number) => number;
  /** Plazo de revisión desde el envío (`inspect_secs`). Por defecto (días de entrega + 3) días, como la app v2. */
  inspectMs?: (deliveryDays: number) => number;
}

export type DemoAction = "pagar" | "enviar" | "recordar" | "extender" | "devolver" | "confirmar" | "reclamar" | "resolver";

/** Protección que paga el comprador: 1,5% con mínimo Bs 5 y máximo Bs 50 (format.ts de la app). */
function proteccionBsCents(priceCents: number): number {
  return Math.round(Math.min(5000, Math.max(500, priceCents * 0.015)));
}

const PLATFORM_BPS = 200;

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

/** Igual que releaseBreakdown de la app: TW 0,3 % y plataforma (`platform_bps` del pedido), división entera. */
function money(o: Order) {
  const amount = BigInt(o.amount_units);
  const bps = BigInt(o.platform_bps ?? PLATFORM_BPS);
  if (o.status === "liberado") {
    const tw = (amount * 30n) / 10000n;
    const platform = (amount * bps) / 10000n;
    return { breakdown: { seller: (amount - tw - platform).toString(), platform: platform.toString(), tw: tw.toString() } };
  }
  if (o.status === "devuelto") {
    const net = amount - (amount * 30n) / 10000n - (amount * bps) / 10000n;
    return { split: { buyer: net.toString(), seller: "0", platform: "0", tw: "0" } };
  }
  if (o.status === "resuelto" && o.buyer_bps != null) {
    const sellerGross = (amount * BigInt(10000 - o.buyer_bps)) / 10000n;
    const net = (g: bigint) => g - (g * 30n) / 10000n - (g * bps) / 10000n;
    return { split: { buyer: net(amount - sellerGross).toString(), seller: net(sellerGross).toString(), platform: "0", tw: "0" } };
  }
  return {};
}

export async function startMockApp(opts: MockOptions = {}) {
  const now = opts.now ?? Date.now;
  const fx = opts.fx ?? 11.7;
  const shipMs = opts.shipMs ?? ((d: number) => d * 86_400_000);
  const inspectMs = opts.inspectMs ?? ((d: number) => (d + 3) * 86_400_000);
  const newCode = () => {
    for (;;) {
      // Como la app: PP- y 8 caracteres con letra y número.
      const abc = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
      const c = `PP-${Array.from({ length: 8 }, (_, i) => (i === 0 ? abc[randomInt(8)] : abc[randomInt(abc.length)])).join("")}`;
      if (!/[A-Z]/.test(c.slice(3))) continue;
      if (![...orders.values()].some((o) => o.code === c)) return c;
    }
  };
  const units = (cents: number) => BigInt(Math.round((cents / 100 / fx) * 1e7));
  /**
   * Como linkAmounts de la app: total que entra al contrato (precio + protección si la paga el comprador) y el
   * `platform_fee` del pedido, para que con la protección del comprador el vendedor reciba al menos el precio.
   */
  const amountsFor = (cents: number, proteccion: Proteccion) => {
    const price = units(cents);
    if (proteccion === "vendedor") return { amount_units: price.toString(), platform_bps: PLATFORM_BPS, proteccion_bs_cents: 0 };
    const prot = proteccionBsCents(cents);
    const amount = price + units(prot);
    const tw = (amount * 30n) / 10000n;
    return { amount_units: amount.toString(), platform_bps: Number(((amount - tw - price) * 10000n) / amount), proteccion_bs_cents: prot };
  };
  const sellers = new Map<string, Seller>([[DEMO_SELLER.pubkey, { ...DEMO_SELLER }]]);
  /** El WhatsApp del comprador se guarda aparte: la vista pública del pedido no lo muestra. */
  const orders = new Map<string, Order & { buyer_whatsapp: string | null }>();
  const pub = ({ buyer_whatsapp: _b, ...o }: Order & { buyer_whatsapp?: string | null }): Order => o;
  const calls: string[] = [];

  const completed = (pk: string) => [...orders.values()].filter((o) => o.seller_pubkey === pk && o.status === "liberado").length;
  const view = (o: Order): OrderView => {
    const s = sellers.get(o.seller_pubkey)!;
    return { order: pub(o), seller: { store_name: s.store_name, whatsapp: s.whatsapp, pubkey: s.pubkey, completedSales: completed(s.pubkey) }, platformFeeBps: o.platform_bps ?? PLATFORM_BPS, mode: "guardian", ...money(o) };
  };
  const sellerData = (s: Seller): SellerData => {
    const list = [...orders.values()].filter((o) => o.seller_pubkey === s.pubkey).sort((a, b) => b.created_at - a.created_at);
    const balance = list.reduce((sum, o) => sum + BigInt((money(o) as { breakdown?: { seller: string } }).breakdown?.seller ?? "0"), 0n);
    return { seller: { ...s, completedSales: completed(s.pubkey) }, orders: list.map((o) => ({ ...pub(o), ...money(o) })), balance: balance.toString() };
  };

  function createLink(b: Record<string, unknown>): Order {
    const seller = typeof b.sellerPubkey === "string" ? sellers.get(b.sellerPubkey) : undefined;
    if (!seller) throw Object.assign(new Error("Primero crea tu tienda"), { status: 403 });
    const product = String(b.product ?? "").trim().slice(0, 80);
    const priceBs = Number(String(b.priceBs ?? "").replace(",", "."));
    const days = Number(b.deliveryDays);
    if (product.length < 2) throw Object.assign(new Error("Escribe el producto"), { status: 400 });
    if (!Number.isFinite(priceBs) || priceBs < 1 || priceBs > 100000) throw Object.assign(new Error("El precio tiene que estar entre Bs 1 y Bs 100.000"), { status: 400 });
    if (!Number.isInteger(days) || days < 1 || days > 15) throw Object.assign(new Error("Los días de entrega van de 1 a 15"), { status: 400 });
    const cents = Math.round(priceBs * 100);
    const proteccion: Proteccion = b.proteccion === "vendedor" ? "vendedor" : "comprador";
    const category = ["Celular", "Electrónica", "Ropa y calzado", "Otro"].includes(String(b.category)) ? String(b.category) : "Otro";
    const t = now();
    const o: Order & { buyer_whatsapp: string | null } = {
      slug: slugify(product), seller_pubkey: seller.pubkey, product, description: "", photo_url: "", price_bs_cents: cents,
      ...amountsFor(cents, proteccion), fx, delivery_days: days, status: "esperando_pago",
      buyer_pubkey: null, code: newCode(), category, proteccion,
      funded_at: null, ship_deadline: null, deadline: null, extended: 0, shipped_evidence: null, shipped_at: null, dispute_by: null, dispute_reason: null,
      buyer_bps: null, released_at: null, resolved_at: null, refunded_at: null, created_at: t, updated_at: t, buyer_whatsapp: null,
    };
    orders.set(o.slug, o);
    return pub(o);
  }

  /** PATCH /api/links/:slug: quién paga la protección, solo mientras nadie pagó. */
  function setProteccion(slug: string, b: Record<string, unknown>): Order {
    const o = orders.get(slug);
    if (!o) throw Object.assign(new Error("No encontramos ese link de pago"), { status: 404 });
    if (b.sellerPubkey !== o.seller_pubkey) throw Object.assign(new Error("Solo el vendedor puede cambiar su link"), { status: 403 });
    if (o.status !== "esperando_pago" || o.buyer_pubkey) throw Object.assign(new Error("Ya no se puede cambiar quién paga la protección: el link ya se está pagando"), { status: 409 });
    const proteccion: Proteccion = b.proteccion === "vendedor" ? "vendedor" : "comprador";
    Object.assign(o, { proteccion, ...amountsFor(o.price_bs_cents, proteccion), updated_at: now() });
    return pub(o);
  }

  /** Simula lo que pasa en la web (comprador, firma del vendedor, revisor, contrato) sobre un pedido. */
  function advance(slug: string, action: DemoAction, extra: { evidence?: string; buyerPhone?: string | null; deadline?: number } = {}): Order {
    const o = orders.get(slug);
    if (!o) throw Object.assign(new Error("No encontramos ese link de pago"), { status: 404 });
    const t = now();
    const need = (ok: boolean, what: string) => {
      if (!ok) throw Object.assign(new Error(`El pedido está en "${o.status}": ${what}`), { status: 409 });
    };
    switch (action) {
      case "pagar":
        need(o.status === "esperando_pago", "ya fue pagado");
        // v2: al pagar solo corre el plazo de despacho; la revisión arranca al marcar enviado.
        Object.assign(o, { status: "pagado", buyer_pubkey: "GCOMPRADORDEMO", funded_at: t, ship_deadline: t + shipMs(o.delivery_days), deadline: null, buyer_whatsapp: extra.buyerPhone === undefined ? DEMO_BUYER_PHONE : extra.buyerPhone });
        break;
      case "enviar":
        need(o.status === "pagado", "solo se envía un pedido pagado");
        need(!o.ship_deadline || t < o.ship_deadline, "venció el plazo de despacho");
        Object.assign(o, { status: "enviado", shipped_evidence: extra.evidence ?? "OLV-482913", shipped_at: t, deadline: t + inspectMs(o.delivery_days) });
        break;
      case "extender":
        need(o.status === "enviado" && !o.extended && (o.deadline ?? 0) > t, "\"Necesito más tiempo\" se usa una sola vez, antes de la hora de liberación");
        Object.assign(o, { extended: 1, deadline: (o.deadline ?? t) + inspectMs(o.delivery_days) });
        break;
      case "devolver":
        // El vendedor no marcó enviado a tiempo: disputa de la plataforma + pp_arbiter.refund_unshipped.
        need(o.status === "pagado", "solo se devuelve un pedido pagado y sin enviar");
        Object.assign(o, { status: "devuelto", refunded_at: t, ship_deadline: Math.min(o.ship_deadline ?? t, t) });
        break;
      case "recordar":
        need(o.status === "enviado", "el recordatorio es para pedidos enviados");
        o.deadline = extra.deadline ?? t + 2 * 3_600_000;
        break;
      case "confirmar":
        need(o.status === "pagado" || o.status === "enviado", "no se puede confirmar");
        Object.assign(o, { status: "liberado", released_at: t });
        break;
      case "reclamar":
        need(o.status === "pagado" || o.status === "enviado", "no admite reclamos");
        Object.assign(o, { status: "en_disputa", dispute_by: "comprador", dispute_reason: "No llegó" });
        break;
      case "resolver":
        need(o.status === "en_disputa", "no está en disputa");
        Object.assign(o, { status: "resuelto", buyer_bps: 7000, resolved_at: t });
        break;
      default:
        throw Object.assign(new Error(`Acción desconocida: ${action}`), { status: 400 });
    }
    o.updated_at = t;
    return pub(o);
  }

  const latestOf = (phone: string) =>
    [...orders.values()]
      .filter((o) => normPhone(sellers.get(o.seller_pubkey)?.whatsapp ?? "") === normPhone(phone))
      .sort((a, b) => b.created_at - a.created_at)[0];

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const p = url.pathname;
    calls.push(`${req.method} ${p}${url.search}`);
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const html = (status: number, body: string) => {
      res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font-family:sans-serif;padding:24px">${body}</body>`);
    };
    const read = async () => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<string, unknown>;
      } catch {
        return {};
      }
    };
    try {
      let m: RegExpExecArray | null;
      if (p.startsWith("/api/bot/")) {
        if (opts.botEndpoints === false) return html(404, "<h1>404</h1>"); // como Next.js sin la ruta
        if (opts.botKey && req.headers["x-bot-key"] !== opts.botKey) return json(401, { error: "Clave del bot incorrecta" });
        if (p === "/api/bot/sellers" && req.method === "GET") {
          const phone = normPhone(url.searchParams.get("phone") ?? "");
          const s = [...sellers.values()].find((x) => normPhone(x.whatsapp) === phone);
          return s ? json(200, { seller: { ...s, completedSales: completed(s.pubkey) } }) : json(404, { error: "Tienda no encontrada" });
        }
        if (p === "/api/bot/changes" && req.method === "GET") {
          const since = Number(url.searchParams.get("since") ?? 0);
          const t = now();
          const changes = [...orders.values()]
            .filter((o) => o.updated_at >= since)
            .sort((a, b) => a.updated_at - b.updated_at)
            .map((o) => ({
              slug: o.slug,
              status: o.status,
              updated_at: o.updated_at,
              buyer_whatsapp: o.buyer_whatsapp,
              code: o.code ?? null,
              deadline: o.deadline,
              ship_deadline: o.ship_deadline ?? null,
              shipped_at: o.shipped_at,
              extended: o.extended ?? 0,
            }));
          return json(200, { now: t, changes });
        }
      }
      if (p === "/api/links" && req.method === "POST") return json(200, createLink(await read()));
      if ((m = /^\/api\/links\/([^/]+)$/.exec(p)) && req.method === "PATCH") return json(200, setProteccion(decodeURIComponent(m[1]), await read()));
      if (p === "/api/info" && req.method === "GET") {
        return json(200, { mode: "guardian", fx, capabilities: { extend: true, clockFromShipping: true, refundUnshipped: true, proteccionPatch: true } });
      }
      if ((m = /^\/api\/sellers\/([^/]+)\/panel$/.exec(p)) && req.method === "GET") {
        const s = sellers.get(decodeURIComponent(m[1]));
        return s ? json(200, sellerData(s)) : json(404, { error: "Tienda no encontrada" });
      }
      if ((m = /^\/api\/orders\/([^/]+)$/.exec(p)) && req.method === "GET") {
        const o = orders.get(decodeURIComponent(m[1]));
        return o ? json(200, view(o)) : json(404, { error: "No encontramos ese link de pago" });
      }
      if (p === "/__mock/advance" && req.method === "POST") {
        const b = await read();
        const slug = typeof b.slug === "string" ? b.slug : latestOf(String(b.phone ?? DEMO_SELLER.whatsapp))?.slug;
        if (!slug) return json(404, { error: "Primero crea un link en el chat" });
        return json(200, advance(slug, b.action as DemoAction, b as { evidence?: string }));
      }
      if ((m = /^\/p\/([^/]+)$/.exec(p))) {
        const o = orders.get(m[1]);
        return o ? html(200, `<h1>${o.product}</h1><p>Bs ${(o.price_bs_cents / 100).toFixed(2)} · ${o.status}</p><p><em>App de mentira del simulador.</em></p>`) : html(404, "<h1>Link no encontrado</h1>");
      }
      if (p === "/vender" || p === "/panel") return html(200, `<h1>${p === "/vender" ? "Crea tu tienda" : "Panel del vendedor"}</h1><p><em>App de mentira del simulador.</em> ${url.search}</p>`);
      return html(404, "<h1>404</h1>");
    } catch (e) {
      const status = (e as { status?: number }).status ?? 500;
      return json(status, { error: e instanceof Error ? e.message : String(e) });
    }
  });

  await new Promise<void>((r) => server.listen(opts.port ?? 0, "127.0.0.1", r));
  const url = `http://localhost:${(server.address() as AddressInfo).port}`;
  return {
    url,
    server,
    sellers,
    orders,
    calls,
    createLink,
    setProteccion,
    advance,
    latestOf,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

export type MockApp = Awaited<ReturnType<typeof startMockApp>>;
