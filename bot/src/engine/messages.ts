// Todos los textos del bot: cortos, amables y en español boliviano. Nunca dicen "cripto":
// la moneda es "USD de prueba". Funciones puras.

import { STATUS_LABEL, type Order, type OrderStatus, type OrderView, type SellerData } from "../app/types.ts";
import { shortCode } from "./parse.ts";

export interface Button {
  /** Lo que el bot recibe como texto cuando la persona toca el botón. */
  id: string;
  /** Máximo 20 caracteres (límite de WhatsApp). */
  title: string;
}

export interface OutMsg {
  text: string;
  /** Hasta 3 botones de respuesta rápida. */
  buttons?: Button[];
}

const nf2 = new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "Bs 450,00" (igual que la app). */
export const fmtBs = (cents: number) => `Bs ${nf2.format(cents / 100)}`;

/** "38,46" a partir de unidades base de 7 decimales. */
export function fmtUsd(units: string | bigint): string {
  const u = BigInt(units);
  return nf2.format(Number(u / 10_000_000n) + Number(u % 10_000_000n) / 1e7);
}

export function fmtDate(ms: number): string {
  return new Intl.DateTimeFormat("es-BO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/La_Paz",
  }).format(new Date(ms));
}

const STATUS_ICON: Record<OrderStatus, string> = {
  esperando_pago: "⏳",
  pagado: "💸",
  enviado: "📦",
  liberado: "✅",
  en_disputa: "⚠️",
  resuelto: "⚖️",
};

export const BTN = {
  vender: { id: "vender", title: "🛍️ Vender" },
  ventas: { id: "mis ventas", title: "🧾 Mis ventas" },
  saldo: { id: "saldo", title: "💰 Saldo" },
  otro: { id: "vender", title: "🛍️ Vender otro" },
} satisfies Record<string, Button>;

export const linkUrl = (appUrl: string, slug: string) => `${appUrl}/p/${slug}`;
export const shipUrl = (appUrl: string, slug: string, evidence: string) =>
  `${appUrl}/panel?enviar=${encodeURIComponent(slug)}&evidencia=${encodeURIComponent(evidence)}`;
export const registerUrl = (appUrl: string, phone: string) => `${appUrl}/vender?wa=${encodeURIComponent(phone)}`;

const HOW_TO = [
  "Escríbeme nomás:",
  "• *vendo zapatillas nike 40 a 450 bs entrega 3 días*",
  "• *mis ventas*",
  "• *estado <código>*",
  "• *enviado <código> <guía>*",
  "• *saldo*",
].join("\n");

export const msg = {
  help(store?: string): OutMsg {
    return {
      text: `¡Hola${store ? ` ${store}` : ""}! 👋 Soy el asistente de *Pago Protegido*.\nCreo tus links de pago y te aviso de cada pedido. Tu cliente paga por adelantado y su plata queda protegida hasta que recibe.\n\n${HOW_TO}`,
      buttons: [BTN.vender, BTN.ventas, BTN.saldo],
    };
  },

  notRegistered(appUrl: string, phone: string): OutMsg {
    return {
      text: `¡Hola! 👋 Este número todavía no tiene tienda en *Pago Protegido*.\nCréala en 1 minuto (nombre, WhatsApp y listo):\n👉 ${registerUrl(appUrl, phone)}\n\nCuando termines, escríbeme *hola*.`,
    };
  },

  unknown(): OutMsg {
    return { text: "Uy, no te entendí 🙈. Escribe *ayuda* para ver lo que puedo hacer.", buttons: [BTN.vender, BTN.ventas, BTN.saldo] };
  },

  thanks(): OutMsg {
    return { text: "¡De nada! 🙌 Aquí estoy para lo que necesites." };
  },

  cancelled(): OutMsg {
    return { text: "Ya, lo dejamos ahí 👍. Cuando quieras, escribe *vender*.", buttons: [BTN.vender, BTN.ventas] };
  },

  askProduct(): OutMsg {
    return { text: "¡Ya! 🛍️ ¿Qué vas a vender?\nEj.: *Zapatillas Nike talla 40*" };
  },

  askPrice(product: string, again = false): OutMsg {
    return { text: `${again ? "No entendí el precio 🙈. " : ""}¿A cuánto vendes *${product}*? Escribe el precio en bolivianos.\nEj.: *450* o *Bs 1.200*` };
  },

  askPriceInBs(): OutMsg {
    return { text: "Por ahora los links van en bolivianos 🇧🇴. ¿Cuánto es en Bs?\nEj.: *Bs 450*" };
  },

  priceOutOfRange(): OutMsg {
    return { text: "El precio tiene que estar entre Bs 1 y Bs 100.000. ¿Cuánto cuesta?" };
  },

  askDays(again = false): OutMsg {
    return {
      text: `${again ? "No entendí los días 🙈. " : ""}¿En cuántos días entregas? (de 1 a 15)`,
      buttons: [
        { id: "1 día", title: "1 día" },
        { id: "3 días", title: "3 días" },
        { id: "7 días", title: "7 días" },
      ],
    };
  },

  daysOutOfRange(): OutMsg {
    return { ...msg.askDays(), text: "Los días de entrega van de 1 a 15. ¿En cuántos días entregas?" };
  },

  linkCreated(appUrl: string, o: Order): OutMsg[] {
    const url = linkUrl(appUrl, o.slug);
    const days = o.delivery_days === 1 ? "1 día" : `${o.delivery_days} días`;
    return [
      {
        text: `¡Listo! ✅ Tu link de pago protegido:\n*${o.product}* · ${fmtBs(o.price_bs_cents)} (≈ ${fmtUsd(o.amount_units)} USD de prueba) · entrega en ${days}\n👉 ${url}\n\nCódigo: *${shortCode(o.slug)}*. Es para un solo cliente. Te aviso apenas pague.`,
        buttons: [BTN.otro, BTN.ventas],
      },
      { text: "Reenvíale esto a tu cliente 👇" },
      {
        text: `¡Hola! 👋 Te paso el link de pago protegido para *${o.product}* (${fmtBs(o.price_bs_cents)}).\n\nTu plata queda guardada en un contrato y solo me llega cuando confirmas que recibiste. Si hay un problema, decide un árbitro.\n\n👉 ${url}`,
      },
    ];
  },

  orders(appUrl: string, d: SellerData, max = 5): OutMsg {
    if (!d.orders.length) return { text: "Todavía no tienes ventas. Escribe *vender* para crear tu primer link 🛍️", buttons: [BTN.vender] };
    const list = [...d.orders].sort((a, b) => b.created_at - a.created_at).slice(0, max);
    const lines = list.map(
      (o, i) => `${i + 1}. ${STATUS_ICON[o.status]} *${o.product}* · ${fmtBs(o.price_bs_cents)} · ${STATUS_LABEL[o.status]} · código *${shortCode(o.slug)}*`,
    );
    const more = d.orders.length > max ? `\n…y ${d.orders.length - max} más en tu panel: ${appUrl}/panel` : "";
    return {
      text: `🧾 Tus últimas ventas:\n${lines.join("\n")}${more}\n\nVentas completadas: ${d.seller.completedSales}. Para ver una: *estado <código>*`,
      buttons: [BTN.vender, BTN.saldo],
    };
  },

  orderNotFound(code: string): OutMsg {
    return { text: `No encontré el pedido *${code}* 🤔. Mira tus códigos en *mis ventas*.`, buttons: [BTN.ventas] };
  },

  askCode(cmd: "estado" | "enviado"): OutMsg {
    return {
      text: cmd === "estado" ? "¿De qué pedido? Escribe *estado <código>*. Los códigos están en *mis ventas*." : "¿Qué pedido enviaste? Escribe *enviado <código> <guía>*. Ej.: *enviado a1b2c3 OLV-12345*",
      buttons: [BTN.ventas],
    };
  },

  status(appUrl: string, v: OrderView): OutMsg {
    const o = v.order;
    const url = linkUrl(appUrl, o.slug);
    const code = shortCode(o.slug);
    const head = `${STATUS_ICON[o.status]} *${o.product}* (${code})\nEstado: *${STATUS_LABEL[o.status]}* · ${fmtBs(o.price_bs_cents)}`;
    let next = "";
    switch (o.status) {
      case "esperando_pago":
        next = `Tu cliente todavía no pagó. Su link: ${url}`;
        break;
      case "pagado":
        next = `La plata está protegida en el contrato. Despacha y luego escríbeme:\n*enviado ${code} <código de encomienda>*`;
        break;
      case "enviado":
        next = `Enviado con: ${o.shipped_evidence ?? "-"}. Se libera cuando tu cliente confirme${o.deadline ? ` o, si no dice nada, el ${fmtDate(o.deadline)}` : ""}.`;
        break;
      case "liberado":
        next = v.breakdown ? `Recibiste *${fmtUsd(v.breakdown.seller)} USD de prueba* en tu billetera 🙌` : "El pago ya se liberó a tu billetera 🙌";
        break;
      case "en_disputa":
        next = `Hay un reclamo${o.dispute_reason ? `: “${o.dispute_reason}”` : ""}. La plata queda congelada hasta que decida el árbitro. Cuenta tu versión en ${appUrl}/panel`;
        break;
      case "resuelto": {
        const b = (o.buyer_bps ?? 0) / 100;
        next = `El árbitro repartió ${b}% para el comprador y ${100 - b}% para ti${v.split ? ` (*${fmtUsd(v.split.seller)} USD de prueba*)` : ""}.`;
        break;
      }
    }
    return { text: `${head}\n${next}` };
  },

  askEvidence(product: string): OutMsg {
    return { text: `📦 ¿Con qué código de encomienda o guía mandaste *${product}*? También sirve el link de una foto del envío.` };
  },

  cannotShip(o: Order): OutMsg {
    const why: Partial<Record<OrderStatus, string>> = {
      esperando_pago: "todavía no te pagaron. Espera mi aviso de pago antes de despachar",
      enviado: "ya figura como enviado",
    };
    return { text: `No se puede marcar *${o.product}* como enviado: ${why[o.status] ?? `está en “${STATUS_LABEL[o.status]}”`}.` };
  },

  shipLink(appUrl: string, o: Order, evidence: string): OutMsg {
    return {
      text: `📦 Para marcar *${o.product}* como enviado con *${evidence}*, confírmalo con tu billetera aquí:\n👉 ${shipUrl(appUrl, o.slug, evidence)}\n\n🔐 Yo no puedo firmar por ti: la llave de tu billetera solo vive en tu celular.`,
    };
  },

  balance(appUrl: string, d: SellerData): OutMsg {
    const inEscrow = d.orders.filter((o) => o.status === "pagado" || o.status === "enviado");
    const cents = inEscrow.reduce((s, o) => s + o.price_bs_cents, 0);
    const protectedLine = inEscrow.length ? `\nAdemás tienes *${fmtBs(cents)}* protegidos en ${inEscrow.length} pedido${inEscrow.length > 1 ? "s" : ""} en camino.` : "";
    return {
      text: `💰 Tu saldo: *${fmtUsd(d.balance)} USD de prueba*.${protectedLine}\nVentas completadas: ${d.seller.completedSales}.\n\nDetalle en tu panel: ${appUrl}/panel`,
      buttons: [BTN.vender, BTN.ventas],
    };
  },

  appError(message: string): OutMsg {
    return { text: `Uy, no pude hacerlo 😕: ${message}\nIntenta de nuevo en un ratito.` };
  },

  linked(store: string): OutMsg {
    return { text: `¡Listo! 🔗 Este número quedó vinculado a *${store}*.`, buttons: [BTN.vender, BTN.ventas, BTN.saldo] };
  },
};

// ---------- Avisos del poller ----------

export interface NoticeData {
  appUrl: string;
  view: OrderView;
}

export const notice = {
  /** Al vendedor cuando el comprador paga. */
  paid({ appUrl, view }: NoticeData): OutMsg {
    const o = view.order;
    return {
      text: `💸 ¡Te pagaron! *${o.product}* (${fmtBs(o.price_bs_cents)}). La plata quedó protegida en el contrato.\n\nDespacha y marca enviado: escríbeme *enviado ${shortCode(o.slug)} <código de encomienda>*\nSeguimiento: ${linkUrl(appUrl, o.slug)}`,
    };
  },

  /** Al vendedor cuando su envío quedó registrado on-chain. */
  shippedSeller({ view }: NoticeData): OutMsg {
    return { text: `📦 Listo, *${view.order.product}* figura como enviado. Te aviso cuando se libere tu plata.` };
  },

  /** Al comprador (si tenemos su número) cuando el vendedor despacha. */
  arrived({ appUrl, view }: NoticeData): OutMsg {
    const o = view.order;
    return {
      text: `📦 ¡Hola! ${view.seller.store_name} ya envió tu *${o.product}*${o.shipped_evidence ? ` (guía: ${o.shipped_evidence})` : ""}.\n\n¿Te llegó? Si está todo bien, toca *Recibí conforme* para liberar el pago. Si hay un problema, toca *Tengo un problema*:\n👉 ${linkUrl(appUrl, o.slug)}`,
    };
  },

  /** Al vendedor cuando se libera el pago. */
  released({ view }: NoticeData): OutMsg {
    const o = view.order;
    const amount = view.breakdown ? ` Te llegaron *${fmtUsd(view.breakdown.seller)} USD de prueba*` : " La plata ya está en tu billetera";
    return { text: `✅ ¡Liberado! Tu cliente recibió *${o.product}*.${amount}. ¡Gracias por vender protegido! 🙌`, buttons: [BTN.otro, BTN.saldo] };
  },

  /** Al vendedor cuando se abre un reclamo. */
  dispute({ appUrl, view }: NoticeData): OutMsg {
    const o = view.order;
    const who = o.dispute_by === "vendedor" ? "Abriste un reclamo" : "Tu cliente abrió un reclamo";
    return {
      text: `⚠️ Reclamo abierto en *${o.product}* (${shortCode(o.slug)}). ${who}${o.dispute_reason ? `: “${o.dispute_reason}”` : ""}.\nLa plata queda congelada hasta que decida el árbitro. Cuenta tu versión aquí: ${appUrl}/panel`,
    };
  },

  /** Al vendedor (y al comprador si tenemos su número) cuando el árbitro resuelve. */
  resolved({ appUrl, view }: NoticeData, to: "vendedor" | "comprador"): OutMsg {
    const o = view.order;
    const b = (o.buyer_bps ?? 0) / 100;
    const mine = to === "vendedor" ? `${100 - b}% para ti y ${b}% para el comprador` : `${b}% para ti y ${100 - b}% para el vendedor`;
    return { text: `⚖️ El árbitro resolvió el reclamo de *${o.product}*: ${mine}. El contrato ya hizo los pagos.\n${linkUrl(appUrl, o.slug)}` };
  },

  /** Al comprador antes de la liberación automática. */
  reminder({ appUrl, view }: NoticeData, now: number): OutMsg {
    const o = view.order;
    const hours = Math.max(1, Math.round(((o.deadline ?? now) - now) / 3_600_000));
    return {
      text: `⏰ Recordatorio: el pago de *${o.product}* se libera solo al vendedor en unas ${hours} h (${fmtDate(o.deadline ?? now)}).\n¿Te llegó bien? Si hay un problema, avisa antes aquí: ${linkUrl(appUrl, o.slug)}`,
    };
  },
};
