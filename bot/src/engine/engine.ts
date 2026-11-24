// Motor de conversación: funciones puras. Recibe la sesión y el texto, devuelve la nueva sesión,
// las respuestas inmediatas y, si hace falta la app, un comando para que lo ejecute el runtime (bot.ts).

import { msg, type OutMsg } from "./messages.ts";
import { findLinks, parseLink } from "./links.ts";
import type { Proteccion } from "../app/types.ts";
import { clean, fold, inferCategory, normCodes, parseSell, type SellDraft } from "./parse.ts";

export type Step = "idle" | "ask_product" | "ask_price" | "ask_days" | "ask_evidence";

export interface Session {
  step: Step;
  draft: SellDraft;
  /** Pedido elegido en "enviado <código>" mientras se pide la guía. */
  code?: string;
  product?: string;
  updatedAt: number;
}

export type Command =
  | { kind: "createLink"; product: string; priceBs: number; days: number; category: "Celular" | "Otro" }
  /** [La paga mi cliente] / [Yo la regalo]: `code` es el slug del botón o lo que escribió; sin él, el último link sin pagar. */
  | { kind: "proteccion"; who: Proteccion; code?: string }
  | { kind: "myOrders" }
  | { kind: "status"; code: string }
  | { kind: "shipped"; code: string; evidence?: string }
  | { kind: "balance" }
  | { kind: "profile" }
  | { kind: "link"; pubkey: string };

export interface StepResult {
  session: Session;
  replies: OutMsg[];
  command?: Command;
}

export type Intent =
  | { kind: "help" }
  | { kind: "thanks" }
  | { kind: "cancel" }
  | { kind: "sell" }
  | { kind: "myOrders" }
  | { kind: "status"; code?: string }
  | { kind: "shipped"; code?: string; evidence?: string }
  | { kind: "balance" }
  | { kind: "profile" }
  | { kind: "link"; pubkey: string }
  | { kind: "proteccion"; who: Proteccion; code?: string }
  | { kind: "verify"; arg: string }
  | { kind: "report"; arg: string }
  | { kind: "buyerHelp"; action: BuyerAction; slug?: string }
  /** "novedades" o "avisos PP-…": pide los avisos guardados (y abre la ventana de 24 horas de WhatsApp). */
  | { kind: "novedades" }
  | { kind: "none" };

export type BuyerAction = "problema" | "tiempo" | "ok";

/** Comandos que atiende el bot a cualquier número, tenga tienda o no (compradores incluidos). */
export type PublicCommand =
  /** Sin links: hay que pedirlos. */
  | { kind: "verify"; links: string[] }
  | { kind: "report"; link?: string; note: string }
  | { kind: "buyerHelp"; action: BuyerAction; slug?: string }
  | { kind: "novedades" };

/** Una conversación guiada se olvida a los 30 minutos sin respuesta. */
export const SESSION_TTL_MS = 30 * 60_000;

export const newSession = (now: number): Session => ({ step: "idle", draft: {}, updatedAt: now });

/** Intención del mensaje. Los comandos con argumento conservan mayúsculas (guías, claves). */
export function detectIntent(text: string): Intent {
  // "pp 4821" / "pp4821" → "PP-4821": el código del pedido queda en una sola palabra.
  const raw = normCodes(text.trim());
  const t = clean(raw);
  const words = raw.split(/\s+/);
  const lowWords = fold(raw).split(/\s+/);

  const link = /^vincular\s+(G[A-Z2-7]{55})$/i.exec(raw);
  if (link) return { kind: "link", pubkey: link[1].toUpperCase() };

  const verify = /^(?:verificar|verifica|verifique|verificame|verificalo|chequear|chequea|comprobar|es real)\b[\s:]*([\s\S]*)$/.exec(fold(raw));
  if (verify) return { kind: "verify", arg: raw.slice(raw.length - verify[1].length).trim() };
  const report = /^(?:reportar|reporta|reporto|reportalo|denunciar|denuncio)\b[\s:]*([\s\S]*)$/.exec(fold(raw));
  if (report) return { kind: "report", arg: raw.slice(raw.length - report[1].length).trim() };

  // Botones del recordatorio (llevan el slug) o el mismo texto escrito a mano.
  const help = /^(problema|tiempo|todo bien)\s+([a-z0-9-]{8,40})$/.exec(t);
  if (help) return { kind: "buyerHelp", action: help[1] === "problema" ? "problema" : help[1] === "tiempo" ? "tiempo" : "ok", slug: help[2] };
  if (/^(tengo un problema|necesito mas tiempo|todavia no (me )?llego)$/.test(t)) {
    return { kind: "buyerHelp", action: t.startsWith("tengo") ? "problema" : "tiempo" };
  }
  if (/^(si )?todo bien$/.test(t)) return { kind: "buyerHelp", action: "ok" };

  // Quién paga la protección: botones del link recién creado (llevan el slug) o el texto escrito.
  const prot = /^(regalo|cliente)\s+([a-z0-9-]{8,40})$/.exec(t);
  if (prot) return { kind: "proteccion", who: prot[1] === "regalo" ? "vendedor" : "comprador", code: prot[2] };
  const protText = /^(?:(yo )?la regalo|la regalo yo|regalo la proteccion|(?:la )?paga (?:mi |el )?cliente|la paga el comprador)(?:\s+(pp-\d{4,5}|pp-(?=[a-z]{0,7}[2-9])[2-9a-hjkmnp-z]{8}|[0-9a-f]{6}))?$/.exec(t);
  if (protText) return { kind: "proteccion", who: /regalo/.test(t) ? "vendedor" : "comprador", code: protText[2] };

  // "novedades", el botón de la plantilla ("Ver el aviso") y el texto del botón de la web ("avisos PP-7KM4Q9TX").
  if (/^(ver |mis |quiero |dame )?(los |el |mis )?(novedad(es)?|avisos?)( (de|del)( mi)?( pedido| compra)?)?( pp-[a-z0-9]{4,8})?$/.test(t)) return { kind: "novedades" };

  if (/^(cancelar|cancela|cancelalo|salir|olvidalo|olvida|nada|ya no|stop)$/.test(t)) return { kind: "cancel" };

  if (/^(enviado|envie|ya envie|despachado|despache|ya despache|mande|ya mande|marcar enviado)\b/.test(t)) {
    const skip = /^(ya|marcar)$/.test(lowWords[0]) ? 2 : 1;
    const code = words[skip]?.replace(/[.,;:]+$/, "");
    const evidence = words.slice(skip + 1).join(" ").trim();
    return { kind: "shipped", code: code || undefined, evidence: evidence || undefined };
  }

  // "mi perfil": link del perfil público de la tienda (/tienda/<slug>). Antes de "ver <código>".
  if (/^(ver |quiero |pasame |mandame |dame )?(mi )?perfil( publico)?( de (la |mi )?tienda)?$|\bmi perfil\b|^(link|enlace) de mi (perfil|tienda)$/.test(t)) return { kind: "profile" };

  const status = /^(estado|ver|pedido|seguimiento|como va)(?:\s+(?:del?\s+)?(?:pedido\s+)?(\S+))?$/.exec(t);
  if (status) return { kind: "status", code: status[2] };

  if (/\b(vender|vendo|vendemos|venta|nuevo link|crear (un )?link|link de pago|cobrar|cobro)\b/.test(t)) return { kind: "sell" };
  if (/^(mis )?(ventas|pedidos|ordenes|links)$|\bmis (ventas|pedidos|links)\b/.test(t)) return { kind: "myOrders" };
  if (/\b(saldo|cuanto tengo|mi plata|balance|cuanta plata|cuanto gane)\b/.test(t)) return { kind: "balance" };
  if (/^(hola+|holi|ola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|ayuda|menu|inicio|que tal|hey|info|start|empezar)\b/.test(t)) return { kind: "help" };
  if (/^(gracias|muchas gracias|grax|ok|okey|listo|genial|chau|chao|perfecto|ya|dale)\b/.test(t)) return { kind: "thanks" };
  return { kind: "none" };
}

const done = (session: Session, replies: OutMsg[], command?: Command): StepResult => ({ session, replies, command });

/** Pide lo que falte del borrador; si está completo, devuelve el comando para crear el link. */
export function continueSell(draft: SellDraft, now: number): StepResult {
  const at = (step: Step, reply: OutMsg) => done({ step, draft, updatedAt: now }, [reply]);
  if (!draft.product) return at("ask_product", msg.askProduct());
  if (draft.usd) return at("ask_price", msg.askPriceInBs());
  if (draft.priceBs == null) return at("ask_price", msg.askPrice(draft.product));
  if (draft.priceBs < 1 || draft.priceBs > 100_000) return at("ask_price", msg.priceOutOfRange());
  if (draft.days == null) return at("ask_days", msg.askDays());
  if (!Number.isInteger(draft.days) || draft.days < 1 || draft.days > 15) return at("ask_days", msg.daysOutOfRange());
  return done(newSession(now), [], { kind: "createLink", product: draft.product, priceBs: draft.priceBs, days: draft.days, category: inferCategory(draft.product) });
}

/** Completa el borrador con lo que trae el mensaje. Lo nuevo reemplaza lo viejo. */
function merge(draft: SellDraft, got: SellDraft, keepProduct: boolean): SellDraft {
  const next: SellDraft = { ...draft };
  if (got.product && !keepProduct) next.product = got.product;
  if (got.priceBs != null) {
    next.priceBs = got.priceBs;
    delete next.usd;
  } else if (got.usd) {
    next.usd = true;
    delete next.priceBs;
  }
  if (got.days != null) next.days = got.days;
  return next;
}

/** Un paso de la conversación. Puro: no toca la red ni el reloj (recibe `now`). */
export function step(prev: Session | undefined, text: string, now: number, ctx: { store?: string } = {}): StepResult {
  const s = prev && now - prev.updatedAt <= SESSION_TTL_MS ? prev : newSession(now);
  const intent = detectIntent(text);
  const reset = newSession(now);

  // Comandos globales: funcionan también en medio de una pregunta guiada.
  switch (intent.kind) {
    case "cancel":
      return done(reset, [s.step === "idle" ? msg.thanks() : msg.cancelled()]);
    case "help":
      if (s.step === "idle") return done(reset, [msg.help(ctx.store)]);
      break; // "hola" en medio de una pregunta: seguimos con la pregunta.
    case "link":
      return done(reset, [], { kind: "link", pubkey: intent.pubkey });
    case "proteccion":
      return done(reset, [], { kind: "proteccion", who: intent.who, code: intent.code });
    case "myOrders":
      return done(reset, [], { kind: "myOrders" });
    case "balance":
      return done(reset, [], { kind: "balance" });
    case "profile":
      return done(reset, [], { kind: "profile" });
    case "status":
      return intent.code ? done(reset, [], { kind: "status", code: intent.code }) : done(reset, [msg.askCode("estado")]);
    case "shipped":
      return intent.code ? done(reset, [], { kind: "shipped", code: intent.code, evidence: intent.evidence }) : done(reset, [msg.askCode("enviado")]);
    case "sell":
      return continueSell(parseSell(text, "price"), now);
  }

  switch (s.step) {
    case "ask_product": {
      const got = parseSell(text, "none");
      if (!got.product || intent.kind === "thanks") return done({ ...s, updatedAt: now }, [msg.askProduct()]);
      return continueSell(merge(s.draft, got, false), now);
    }
    case "ask_price": {
      const got = parseSell(text, "price");
      if (got.priceBs == null && !got.usd) return done({ ...s, updatedAt: now }, [msg.askPrice(s.draft.product ?? "tu producto", true)]);
      return continueSell(merge(s.draft, got, true), now);
    }
    case "ask_days": {
      const got = parseSell(text, "days");
      if (got.days == null) return done({ ...s, updatedAt: now }, [msg.askDays(true)]);
      return continueSell(merge(s.draft, got, true), now);
    }
    case "ask_evidence": {
      const evidence = text.trim();
      if (evidence.length < 3) return done({ ...s, updatedAt: now }, [msg.askEvidence(s.product ?? "tu pedido")]);
      return done(reset, [], { kind: "shipped", code: s.code!, evidence });
    }
  }

  if (intent.kind === "thanks") return done(reset, [msg.thanks()]);
  if (intent.kind === "help") return done(reset, [msg.help(ctx.store)]);
  return done(reset, [msg.unknown()]);
}

/** Links del argumento de "verificar"/"reportar": los que tengan forma de link, o la primera palabra si parece un dominio. */
function argLinks(arg: string): string[] {
  const found = findLinks(arg);
  if (found.length) return found;
  const first = arg.split(/\s+/)[0] ?? "";
  return first && parseLink(first) ? [first] : [];
}

/**
 * ¿Es un mensaje para el verificador, los reportes o los botones del comprador? Lo atiende el bot a cualquier
 * número, antes de buscar la tienda. Un link reenviado se verifica solo, salvo que sea la guía de un envío
 * ("enviado <código> <link de la foto>" o la respuesta a "¿con qué guía?"). Pura.
 */
export function routePublic(text: string, session: Session | undefined, now: number): PublicCommand | null {
  const intent = detectIntent(text);
  switch (intent.kind) {
    case "verify":
      return { kind: "verify", links: argLinks(intent.arg).slice(0, 3) };
    case "report":
      return { kind: "report", link: argLinks(intent.arg)[0], note: text.trim().slice(0, 500) };
    case "buyerHelp":
      return { kind: "buyerHelp", action: intent.action, slug: intent.slug };
    case "novedades":
      return { kind: "novedades" };
    case "shipped":
    case "link":
      return null;
  }
  const awaitingEvidence = session?.step === "ask_evidence" && now - session.updatedAt <= SESSION_TTL_MS;
  if (awaitingEvidence) return null;
  const links = findLinks(text);
  return links.length ? { kind: "verify", links: links.slice(0, 3) } : null;
}

/** El runtime pide la guía cuando el vendedor escribió "enviado <código>" sin ella. */
export function askEvidenceSession(code: string, product: string, now: number): Session {
  return { step: "ask_evidence", draft: {}, code, product, updatedAt: now };
}
