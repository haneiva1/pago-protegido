// Todos los textos del bot: cortos, amables y en español boliviano. Nunca dicen "cripto":
// la moneda es "USD de prueba". Funciones puras.

import { STATUS_LABEL, type Order, type OrderStatus, type OrderView, type SellerData } from "../app/types.ts";
import type { FakeReason } from "./links.ts";
import { orderCode } from "./parse.ts";

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

/** Centavos de Bs a partir de unidades base (7 decimales) y el tipo de cambio del pedido. */
export function unitsToBsCents(units: string | bigint, fx: number): number {
  return Math.round((Number(BigInt(units)) * fx) / 100_000);
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
  devuelto: "↩️",
};

export const BTN = {
  vender: { id: "vender", title: "🛍️ Vender" },
  ventas: { id: "mis ventas", title: "🧾 Mis ventas" },
  saldo: { id: "saldo", title: "💰 Saldo" },
  otro: { id: "vender", title: "🛍️ Vender otro" },
} satisfies Record<string, Button>;

/** Botones para elegir quién paga la protección de un link recién creado (llevan el slug). */
export const protButtons = (slug: string): Button[] => [
  { id: `cliente ${slug}`, title: "La paga mi cliente" },
  { id: `regalo ${slug}`, title: "Yo la regalo" },
];

export const linkUrl = (appUrl: string, slug: string) => `${appUrl}/p/${slug}`;
export const profileUrl = (appUrl: string, slug: string) => `${appUrl}/tienda/${slug}`;
export const shipUrl = (appUrl: string, slug: string, evidence: string) =>
  `${appUrl}/panel?enviar=${encodeURIComponent(slug)}&evidencia=${encodeURIComponent(evidence)}`;
export const registerUrl = (appUrl: string, phone: string) => `${appUrl}/vender?wa=${encodeURIComponent(phone)}`;

// ---------- Anti-fraude: textos fijos ----------

/** Al vendedor, en el registro. */
export const SELLER_NO_LINK = "Para cobrar no tienes que abrir ningún link: el pago te llega solo. Un mensaje que diga 'entra aquí para cobrar' es falso.";
/** Al vendedor, cada vez que recibe un link de pago. */
export const QR_WARNING = "Ojo: el QR de pago nunca está a nombre de una persona.";
/** Al comprador, al pagar y otra vez cuando el vendedor marca enviado. */
export const ANTI_PRESSURE =
  "Tu plata está bloqueada en un contrato público. Nadie necesita que confirmes para enviar: ni el vendedor, ni la flota, ni el courier. Si te lo piden, es la señal número 1 de estafa. Puedes verificar cualquier link reenviándolo a este número.";
/** Respuesta del verificador a todo lo que no sea un link auténtico. */
export const VERIFY_FAKE = "⚠️ Este link NO es de Trato. No pagues.";

/** Estado para quien no es el vendedor (comprador que verifica un link). */
export const STATUS_PUBLIC: Record<OrderStatus, string> = {
  esperando_pago: "Esperando pago",
  pagado: "Pagado",
  enviado: "Enviado",
  liberado: "Liberado",
  en_disputa: "En disputa",
  resuelto: "Resuelto",
  devuelto: "Devuelto al comprador",
};

const FAKE_WHY: Record<FakeReason, (host: string) => string> = {
  shortener: (h) => `Es un link acortado (${h}): esconde a dónde te lleva.`,
  lookalike: (h) => `${h} imita nuestro nombre, pero no es nuestro dominio.`,
  hidden: () => "El link esconde su verdadero destino.",
  other: (h) => `${h} no es nuestro dominio.`,
  bad_path: () => "No es un link de pago.",
  bad_slug: () => "Ese link de pago no es válido.",
  not_found: () => "Ese pedido no existe.",
  invalid: () => "No pude leerlo como link.",
};

/** "unas 20 h" o, si falta menos de una hora (o en modo demo), "unos 48 min". */
export function timeLeft(ms: number): string {
  if (ms < 3_600_000) return `unos ${Math.max(1, Math.round(ms / 60_000))} min`;
  return `unas ${Math.max(1, Math.round(ms / 3_600_000))} h`;
}

const HOW_TO = [
  "Escríbeme nomás:",
  "• *vendo zapatillas nike 40 a 450 bs entrega 3 días*",
  "• *mis ventas*",
  "• *estado PP-7KM4Q9TX*",
  "• *enviado PP-7KM4Q9TX <guía>*",
  "• *saldo*",
  "• *mi perfil*",
].join("\n");

export const msg = {
  help(store?: string): OutMsg {
    return {
      text: `¡Hola${store ? ` ${store}` : ""}! 👋 Soy el asistente de *Trato*.\nCreo tus links de pago y te aviso de cada pedido. Tu cliente paga por adelantado y su plata queda protegida hasta que recibe.\n\n${HOW_TO}`,
      buttons: [BTN.vender, BTN.ventas, BTN.saldo],
    };
  },

  notRegistered(appUrl: string, phone: string): OutMsg {
    return {
      text: `¡Hola! 👋 Este número todavía no tiene tienda en *Trato*.\nCréala en 1 minuto (nombre, WhatsApp y listo):\n👉 ${registerUrl(appUrl, phone)}\n\nCuando termines, escríbeme *hola*.\n\n🔒 ${SELLER_NO_LINK}\n\n¿Te mandaron un link para pagar? Reenvíamelo y te digo si es de verdad.`,
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

  linkCreated(appUrl: string, o: Order, store?: string): OutMsg[] {
    const url = linkUrl(appUrl, o.slug);
    const days = o.delivery_days === 1 ? "1 día" : `${o.delivery_days} días`;
    const prot = protectionLine(o);
    const head = prot
      ? `*${o.product}* · ${fmtBs(o.price_bs_cents)} · entrega en ${days}\n👉 ${url}\n\n${prot}`
      : `*${o.product}* · ${fmtBs(o.price_bs_cents)} (≈ ${fmtUsd(o.amount_units)} USD de prueba) · entrega en ${days}\n👉 ${url}`;
    return [
      {
        text: `¡Listo! ✅ Tu link de pago protegido:\n${head}\n\nCódigo: *${orderCode(o)}*. Es para un solo cliente. Te aviso apenas pague.\n\n⚠️ ${QR_WARNING}`,
        buttons: o.proteccion ? [...protButtons(o.slug), BTN.otro] : [BTN.otro, BTN.ventas],
      },
      { text: "Reenvíale esto a tu cliente 👇" },
      // El mismo texto que waText("link") de la app (DECISIONES 8): la web y el bot dicen lo mismo.
      {
        text: `¡Hola! 👋 Te paso el link de pago protegido de ${store ?? "mi tienda"} para *${o.product}* (${fmtBs(o.price_bs_cents)}).\n\nTu plata queda guardada en un contrato y solo me llega cuando confirmas que recibiste. Si hay un problema, un tercero revisa el reclamo.\n\n👉 ${url}`,
      },
    ];
  },

  /** Después de [La paga mi cliente] o [Yo la regalo] (PATCH /api/links/:slug). */
  proteccionSet(o: Order): OutMsg {
    return { text: `🛡️ Listo, *${o.product}* (${orderCode(o)}):\n${protectionLine(o) ?? "Quién paga la protección quedó guardado."}`, buttons: [BTN.otro, BTN.ventas] };
  },

  /** "yo la regalo" sin pedido elegido y sin links esperando pago. */
  proteccionNoOrder(): OutMsg {
    return { text: "No tienes links esperando pago 🤔. Quién paga la protección se elige con el link recién creado, antes de que tu cliente pague.", buttons: [BTN.vender] };
  },

  orders(appUrl: string, d: SellerData, max = 5): OutMsg {
    if (!d.orders.length) return { text: "Todavía no tienes ventas. Escribe *vender* para crear tu primer link 🛍️", buttons: [BTN.vender] };
    const list = [...d.orders].sort((a, b) => b.created_at - a.created_at).slice(0, max);
    const lines = list.map(
      (o, i) => `${i + 1}. ${STATUS_ICON[o.status]} *${o.product}* · ${fmtBs(o.price_bs_cents)} · ${STATUS_LABEL[o.status]} · código *${orderCode(o)}*`,
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
      text: cmd === "estado" ? "¿De qué pedido? Escribe *estado <código>*. Ej.: *estado PP-7KM4Q9TX*. Los códigos están en *mis ventas*." : "¿Qué pedido enviaste? Escribe *enviado <código> <guía>*. Ej.: *enviado PP-7KM4Q9TX OLV-12345*",
      buttons: [BTN.ventas],
    };
  },

  status(appUrl: string, v: OrderView): OutMsg {
    const o = v.order;
    const url = linkUrl(appUrl, o.slug);
    const code = orderCode(o);
    const head = `${STATUS_ICON[o.status]} *${o.product}* (${code})\nEstado: *${STATUS_LABEL[o.status]}* · ${fmtBs(o.price_bs_cents)}`;
    let next = "";
    switch (o.status) {
      case "esperando_pago":
        next = `Tu cliente todavía no pagó. Su link: ${url}`;
        break;
      case "pagado":
        next = `La plata está protegida en el contrato. Despacha${o.ship_deadline ? ` antes del ${fmtDate(o.ship_deadline)}` : ""} y luego escríbeme:\n*enviado ${code} <código de encomienda>*${o.ship_deadline ? "\nSi no se marca enviado a tiempo, la plata vuelve sola a tu cliente." : ""}`;
        break;
      case "enviado":
        next = `Enviado con: ${o.shipped_evidence ?? "-"}. Se libera cuando tu cliente confirme${o.deadline ? ` o, si no dice nada, el ${fmtDate(o.deadline)}` : ""}.${o.extended ? " Tu cliente ya pidió más tiempo una vez." : ""}`;
        break;
      case "liberado":
        next = v.breakdown ? `Recibiste *${fmtUsd(v.breakdown.seller)} USD de prueba* en tu billetera 🙌` : "El pago ya se liberó a tu billetera 🙌";
        break;
      case "en_disputa":
        next = `Hay un reclamo${o.dispute_reason ? `: “${o.dispute_reason}”` : ""}. La plata queda congelada hasta que decida el revisor. Cuenta tu versión en ${appUrl}/panel`;
        break;
      case "resuelto": {
        const b = (o.buyer_bps ?? 0) / 100;
        next = `El revisor repartió ${b}% para el comprador y ${100 - b}% para ti${v.split ? ` (*${fmtUsd(v.split.seller)} USD de prueba*)` : ""}.`;
        break;
      }
      case "devuelto":
        next = `No se marcó el envío a tiempo${o.ship_deadline ? ` (hasta el ${fmtDate(o.ship_deadline)})` : ""}: el contrato le devolvió la plata a tu cliente.`;
        break;
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
      devuelto: "venció el plazo de despacho y la plata ya volvió a tu cliente",
    };
    return { text: `No se puede marcar *${o.product}* como enviado: ${why[o.status] ?? `está en “${STATUS_LABEL[o.status]}”`}.` };
  },

  /** Pagado, pero ya pasó `ship_deadline`: el contrato no deja marcar enviado y la plata vuelve al comprador. */
  shipLate(o: Order): OutMsg {
    return { text: `⌛ No se puede marcar *${o.product}* (${orderCode(o)}) como enviado: el plazo para despachar venció el ${fmtDate(o.ship_deadline ?? 0)}. La plata vuelve sola a tu cliente.` };
  },

  shipLink(appUrl: string, o: Order, evidence: string): OutMsg {
    return {
      text: `📦 Para marcar *${o.product}* (${orderCode(o)}) como enviado con *${evidence}*, confírmalo con tu billetera aquí:\n👉 ${shipUrl(appUrl, o.slug, evidence)}\n\n🔐 Yo no puedo firmar por ti: solo tú confirmas, desde tu billetera.`,
    };
  },

  /** "mi perfil": link del perfil público, listo para la bio. Sin teléfono ni dirección. */
  profile(appUrl: string, s: { store_name: string; slug?: string | null }): OutMsg {
    if (!s.slug) return { text: `Tu perfil público todavía no está listo. Ábrelo desde tu panel: ${appUrl}/panel` };
    const url = profileUrl(appUrl, s.slug);
    return {
      text: `🛡️ Tu perfil público de *${s.store_name}*:\n${url}\n\nAhí tus clientes ven tus ventas protegidas, cuántas terminaron sin reclamo y cuánto tardas en despachar, calculado con el registro público de cada compra. No muestra tu teléfono ni tu dirección.\n\nPégalo en la bio de tu Instagram o TikTok:\n*Vendo con Trato ✅ ${url}*`,
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
    return { text: `¡Listo! 🔗 Este número quedó vinculado a *${store}*.\n\n🔒 ${SELLER_NO_LINK}`, buttons: [BTN.vender, BTN.ventas, BTN.saldo] };
  },

  /** La primera vez que una tienda registrada le escribe al bot. */
  sellerWelcome(store: string): OutMsg {
    return { text: `🔒 *${store}*, antes de empezar: ${SELLER_NO_LINK}` };
  },

  // ---------- Verificador y reportes (para cualquiera, tenga tienda o no) ----------

  verifyOk(v: OrderView): OutMsg {
    const o = v.order;
    const after =
      o.status === "esperando_pago"
        ? "Puedes pagar en ese link: tu plata queda bloqueada hasta que confirmes que recibiste."
        : "Este pedido ya fue pagado: si te piden pagarlo otra vez, es estafa.";
    return { text: `✅ Auténtico: ${v.seller.store_name}, ${o.product}, ${fmtBs(o.price_bs_cents)}, pedido ${orderCode(o)}. Estado: ${STATUS_PUBLIC[o.status]}\n\n${after}` };
  },

  verifyFake(link: string, host: string, reason: FakeReason, appUrl: string): OutMsg {
    return {
      text: `${VERIFY_FAKE}\n\n${FAKE_WHY[reason](host)} Los links de pago reales empiezan con ${appUrl}/p/\n\nPara avisarnos, escribe *reportar* y el link:\nreportar ${link.slice(0, 200)}`,
    };
  },

  verifyAsk(): OutMsg {
    return { text: "🔎 Mándame el link para revisarlo. Ej.: *verificar https://…/p/…*\nTambién puedes reenviarme el mensaje tal cual." };
  },

  verifyUnavailable(): OutMsg {
    return { text: "😕 No pude verificar ese link ahora. *No pagues* hasta que te confirme: intenta de nuevo en un ratito." };
  },

  reportThanks(host: string): OutMsg {
    return { text: `🙏 ¡Gracias por avisar! Guardé tu reporte de *${host}* para revisarlo y alertar a más gente.\nRecuerda: nadie de Trato te pide pagar fuera de nuestro link ni confirmar antes de recibir.` };
  },

  reportAsk(): OutMsg {
    return { text: "¿Qué link quieres reportar? Escribe *reportar <link>* o reenvíame el mensaje con el link." };
  },

  /** Botones del recordatorio (o el texto escrito): siempre llevan a la página del pedido. */
  buyerHelp(action: "problema" | "tiempo" | "ok", url: string | null): OutMsg {
    const where = url ? `\n👉 ${url}` : "\nBusca el link de tu pedido en el chat con el vendedor. Si dudas de un link, reenvíamelo y lo verifico.";
    const text = {
      problema: "⚠️ Abre tu pedido y toca *Tengo un problema*: el pago queda congelado y decide un revisor.",
      tiempo:
        "⏳ Si todavía no te llegó, abre tu pedido y toca *Necesito más tiempo*: suma otro plazo de revisión, una sola vez. Si hay un problema, toca *Tengo un problema* antes de la hora límite y el pago no se libera.\nNadie puede alargar el plazo por chat: si alguien te ofrece más tiempo a cambio de que confirmes, es estafa.",
      ok: "✅ ¡Qué bueno! Cuando lo tengas en tus manos y lo hayas revisado, abre tu pedido y toca *Pagar al vendedor*.",
    }[action];
    return { text: text + where };
  },
};

/** Quién paga la protección y cuánto paga el cliente, si la app lo informa (APP-ENDPOINTS.md §6). */
function protectionLine(o: Order): string | null {
  if (!o.proteccion) return null;
  const prot = o.proteccion_bs_cents ?? 0;
  const usd = `≈ ${fmtUsd(o.amount_units)} USD de prueba`;
  if (o.proteccion === "comprador") {
    return `🛡️ Protección: la paga tu cliente${prot ? ` (${fmtBs(prot)})` : ""}. Paga ${fmtBs(o.price_bs_cents + prot)} (${usd}) y tú recibes ${fmtBs(o.price_bs_cents)}.`;
  }
  return `🛡️ Protección: la regalas tú. Tu cliente paga ${fmtBs(o.price_bs_cents)} (${usd}) y al cobrar se descuenta el 2,3%.`;
}

/** Lo que vuelve al comprador en una devolución: el reparto de la app o el monto menos comisiones (TW 0,3% y plataforma). */
function refundBsCents(v: OrderView): number {
  const o = v.order;
  if (v.split) return unitsToBsCents(v.split.buyer, o.fx);
  const amount = BigInt(o.amount_units);
  const net = amount - (amount * 30n) / 10000n - (amount * BigInt(v.platformFeeBps ?? 200)) / 10000n;
  return unitsToBsCents(net, o.fx);
}

// ---------- Avisos del poller ----------

export interface NoticeData {
  appUrl: string;
  view: OrderView;
}

export const notice = {
  /** Al vendedor cuando el comprador paga. */
  paid({ appUrl, view }: NoticeData): OutMsg {
    const o = view.order;
    const code = orderCode(o);
    const by = o.ship_deadline ? ` antes del ${fmtDate(o.ship_deadline)}` : "";
    const refund = o.ship_deadline ? " Si no se marca enviado a tiempo, la plata vuelve sola a tu cliente." : "";
    return {
      text: `💸 ${code}: tu cliente pagó ${fmtBs(o.price_bs_cents)} por *${o.product}* y el pago está GUARDADO, todavía no en tu cuenta.\n\nDespacha${by} y marca enviado: escríbeme *enviado ${code} <código de encomienda>*.${refund}\nCobras cuando tu cliente confirme o, si no dice nada, al terminar su tiempo de revisión, que cuenta desde el envío. Vale tu panel, no una captura.\nSeguimiento: ${linkUrl(appUrl, o.slug)}`,
    };
  },

  /** Al vendedor cuando su envío quedó registrado on-chain. */
  shippedSeller({ view }: NoticeData): OutMsg {
    const o = view.order;
    return {
      text: `📦 ${orderCode(o)}: listo, *${o.product}* figura como enviado.${o.deadline ? ` Si tu cliente no dice nada, se te paga el ${fmtDate(o.deadline)}.` : ""} Te aviso cuando se libere tu plata.`,
    };
  },

  /** Al comprador (si tenemos su número) cuando el vendedor despacha. */
  arrived({ appUrl, view }: NoticeData): OutMsg {
    const o = view.order;
    const when = o.deadline ? `\nSi no haces nada, el pago se libera solo al vendedor el ${fmtDate(o.deadline)}.` : "";
    return {
      text: `📦 ${orderCode(o)}: ¡Hola! ${view.seller.store_name} ya envió tu *${o.product}*${o.shipped_evidence ? ` (guía: ${o.shipped_evidence})` : ""}.\n\n¿Te llegó? Revísalo antes de pagar. Si está todo bien, toca *Pagar al vendedor*. Si hay un problema, toca *Tengo un problema*. ¿Todavía no llega? Toca *Necesito más tiempo* (una sola vez).${when}\n👉 ${linkUrl(appUrl, o.slug)}\n\n🛡️ ${ANTI_PRESSURE}`,
    };
  },

  /** Al vendedor cuando se libera el pago. */
  released({ view }: NoticeData): OutMsg {
    const o = view.order;
    const amount = view.breakdown ? ` Te llegaron *${fmtUsd(view.breakdown.seller)} USD de prueba*` : " La plata ya está en tu billetera";
    return { text: `✅ ${orderCode(o)}: ¡Liberado! Tu cliente recibió *${o.product}*.${amount}. ¡Gracias por vender protegido! 🙌`, buttons: [BTN.otro, BTN.saldo] };
  },

  /** Al vendedor cuando se abre un reclamo. */
  dispute({ appUrl, view }: NoticeData): OutMsg {
    const o = view.order;
    const who = o.dispute_by === "vendedor" ? "Abriste un reclamo" : "Tu cliente abrió un reclamo";
    return {
      text: `⚠️ Reclamo abierto en *${o.product}* (${orderCode(o)}). ${who}${o.dispute_reason ? `: “${o.dispute_reason}”` : ""}.\nLa plata queda congelada hasta que decida el revisor. Cuenta tu versión aquí: ${appUrl}/panel`,
    };
  },

  /** Al comprador cuando hay un reclamo: el pago queda congelado. */
  disputeBuyer({ appUrl, view }: NoticeData): OutMsg {
    const o = view.order;
    return {
      text: `⚠️ ${orderCode(o)}: hay un reclamo en *${o.product}*${o.dispute_reason ? ` (“${o.dispute_reason}”)` : ""} y el pago queda congelado hasta que decida el revisor. Sube tus pruebas aquí:\n👉 ${linkUrl(appUrl, o.slug)}`,
    };
  },

  /** Al comprador (si dejó su WhatsApp) al pagar. Al marcar enviado, el mismo texto va dentro de "¿Te llegó?". */
  antiPressure({ view }: NoticeData): OutMsg {
    const o = view.order;
    const refund = o.status === "pagado" && o.ship_deadline ? `\n\nSi no lo envían hasta el ${fmtDate(o.ship_deadline)}, te lo devolvemos automáticamente.` : "";
    return { text: `🛡️ ${orderCode(o)}: tu pago de ${fmtBs(o.price_bs_cents)} por *${o.product}* está guardado.${refund}\n\n${ANTI_PRESSURE}` };
  },

  /** Al vendedor (y al comprador si tenemos su número) cuando el revisor resuelve. */
  resolved({ appUrl, view }: NoticeData, to: "vendedor" | "comprador"): OutMsg {
    const o = view.order;
    const b = (o.buyer_bps ?? 0) / 100;
    const mine = to === "vendedor" ? `${100 - b}% para ti y ${b}% para el comprador` : `${b}% para ti y ${100 - b}% para el vendedor`;
    return { text: `⚖️ ${orderCode(o)}: el revisor resolvió el reclamo de *${o.product}*: ${mine}. El contrato ya hizo los pagos.\n${linkUrl(appUrl, o.slug)}` };
  },

  /** A los dos cuando no se marcó el envío a tiempo y el contrato devolvió la plata (estado `devuelto`). */
  refunded({ appUrl, view }: NoticeData, to: "vendedor" | "comprador"): OutMsg {
    const o = view.order;
    const bs = fmtBs(refundBsCents(view));
    if (to === "vendedor") {
      return { text: `↩️ ${orderCode(o)}: no se marcó el envío a tiempo. Devolvimos ${bs} al comprador. El pedido de *${o.product}* quedó cerrado.`, buttons: [BTN.otro, BTN.ventas] };
    }
    return { text: `↩️ ${orderCode(o)}: el vendedor no marcó el envío de *${o.product}* a tiempo. Te devolvimos ${bs} (tu pago menos las comisiones).\n${linkUrl(appUrl, o.slug)}` };
  },

  /** Al vendedor cuando el comprador usa "Necesito más tiempo" (una sola vez). */
  extended({ view }: NoticeData): OutMsg {
    const o = view.order;
    return {
      text: `⏳ ${orderCode(o)}: tu cliente pidió más tiempo para revisar *${o.product}*. Se te paga cuando confirme${o.deadline ? ` o, si no dice nada, el ${fmtDate(o.deadline)}` : ""}. Solo se puede pedir una vez.`,
    };
  },

  /**
   * Al comprador antes de la liberación automática (48 h, 24 h y 2 h antes del `deadline`, que cuenta desde el envío).
   * Ofrece "Tengo un problema" y "Necesito más tiempo" (si todavía no lo usó), con el link a la página del pedido.
   */
  reminder({ appUrl, view }: NoticeData, now: number): OutMsg {
    const o = view.order;
    const url = linkUrl(appUrl, o.slug);
    const deadline = o.deadline ?? now;
    const more = o.extended ? "⏳ Ya usaste *Necesito más tiempo* (es una sola vez)." : `⏳ *Necesito más tiempo* (una sola vez) → ${url}`;
    return {
      text: `⏰ ${orderCode(o)}: el pago de *${o.product}* se libera solo al vendedor en ${timeLeft(deadline - now)} (${fmtDate(deadline)}). ¿Ya lo tienes?\n\n⚠️ *Tengo un problema* → ${url}\n${more}\n\nSi todo llegó bien, no tienes que hacer nada.`,
      buttons: [
        { id: `todo bien ${o.slug}`, title: "Sí, todo bien" },
        { id: `problema ${o.slug}`, title: "Tengo un problema" },
        ...(o.extended ? [] : [{ id: `tiempo ${o.slug}`, title: "Necesito más tiempo" }]),
      ],
    };
  },
};
