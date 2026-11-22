/**
 * /probar como chat: los guiones de la tienda y del comprador, puros y testeables (node --test). Los textos siguen
 * a los del bot real (bot/src/engine/messages.ts) para que la demo diga lo mismo que el producto. Sin alias `@/`.
 */

import { fmtDate } from "./format.ts";

export type Autor = "bot" | "yo" | "desconocido";

export interface Boton {
  id: string;
  texto: string;
  /** La única acción posible en este momento: grande y en Yungas. */
  principal?: boolean;
  deshabilitado?: boolean;
}

export interface Tarjeta {
  titulo: string;
  descripcion: string;
  url: string;
  /** Imagen de vista previa (la misma que ve WhatsApp al pegar el link). */
  imagen: string;
}

export interface Mensaje {
  id: string;
  de: Autor;
  texto?: string;
  tarjeta?: Tarjeta;
  botones?: Boton[];
  /** Algo en curso dentro de la burbuja (p. ej. "Creando tu cuenta…"): se muestra con avance. */
  enCurso?: boolean;
  at: number;
  /** Nota centrada del sistema, como los avisos grises del chat. */
  sistema?: boolean;
  /** Mensaje de un número desconocido (el estafador): lleva el aviso de WhatsApp de "no está en tus contactos". */
  desconocidoDe?: string;
}

/** Lo que vende la demo: igual que en el e2e de /probar. */
export const DEMO = {
  tienda: "Tienda Sofi",
  ciudad: "Santa Cruz",
  whatsapp: "59171234567",
  whatsappBonito: "591 71234567",
  producto: "Zapatillas Nike talla 40",
  precioBs: "450",
  dias: 3,
  categoria: "Otro",
  vendo: "Vendo Zapatillas Nike talla 40 a Bs 450",
};

/** Cuenta inventada del "banco" del estafador: nunca recibe nada, el contrato lo rechaza. */
export const ESTAFADOR = { numero: "+591 69 012 345", cuenta: "GB7K…ESTA" };

const TZ = "America/La_Paz";
export const horaChat = (ms: number) => new Date(ms).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });

/** Cuándo vence algo: "de las 01:19" o "a las 01:19" si es dentro de 12 horas; si no, "del 25 nov, 01:17" o "el 25 nov, 01:17". */
export function cuandoChat(ms: number, ahora: number, forma: "antes" | "a" = "a"): string {
  const pronto = ms - ahora < 12 * 3600_000;
  if (forma === "antes") return pronto ? `de las ${horaChat(ms)}` : `del ${fmtDate(ms)}`;
  return pronto ? `a las ${horaChat(ms)}` : `el ${fmtDate(ms)}`;
}

export function cuentaAtras(hastaMs: number, ahoraMs: number): string {
  const s = Math.max(0, Math.ceil((hastaMs - ahoraMs) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const FRASE_ESPERA = "La plata espera entre los dos hasta que confirmes que te llegó";

/** Aviso del bot real al pagar (anti-presión), sin la frase del número porque aquí no hay a quién reenviar. */
export const ANTI_PRESION =
  "Nadie necesita que confirmes para enviar: ni el vendedor, ni la flota, ni el courier. Si te lo piden, es la señal número 1 de estafa.";
export const SIN_LINK_PARA_COBRAR = "Para cobrar no tienes que abrir ningún link: el pago te llega solo. Un mensaje que diga 'entra aquí para cobrar' es falso.";
export const QR_AVISO = "Ojo: el QR de pago nunca está a nombre de una persona.";

export interface PedidoChat {
  slug: string;
  code: string | null;
  product: string;
  /** Lo que paga el comprador ("Bs 456,75"). */
  total: string;
  /** El precio de la tienda ("Bs 450,00"). */
  precio: string;
  status: string;
  created_at: number;
  paid_at?: number | null;
  shipped_at?: number | null;
  released_at?: number | null;
  ship_deadline?: number | null;
  deadline?: number | null;
  confirm_after?: number | null;
  /** "Trans Copacabana (encomiendas) · guía SRV-2026-118734 · 1,2 kg" */
  envio?: string | null;
  /** Lo que recibió la tienda al liberar ("Bs 450,04"). */
  recibido?: string | null;
  url: string;
  imagen: string;
}

export function tarjetaDe(p: PedidoChat, host: string): Tarjeta {
  return {
    titulo: `${p.product} · ${p.precio}`,
    descripcion: `${FRASE_ESPERA}.`,
    url: p.url,
    imagen: p.imagen,
  };
}

// ---------- Tienda ----------

export interface EstadoVendedor {
  t0: number;
  ahora: number;
  alta: { nombre?: string; ciudad?: string; whatsapp?: string; creando?: boolean };
  tienda: string | null;
  creandoLink: boolean;
  pedido: PedidoChat | null;
  reenviado: boolean;
  enviando: boolean;
  host: string;
}

const seg = (t0: number, n: number) => t0 + n * 1000;

export function mensajesVendedor(e: EstadoVendedor): Mensaje[] {
  const m: Mensaje[] = [];
  const t0 = e.t0;
  m.push({ id: "sis", de: "bot", sistema: true, at: t0, texto: "Simulación: este chat muestra cómo se usa Trato dentro de WhatsApp. No se mueve dinero real." });
  if (!e.tienda) {
    m.push({
      id: "hola",
      de: "bot",
      at: t0,
      texto: "¡Hola! 👋 Soy Trato. Con un mensaje creas un link de pago protegido: tu cliente paga por adelantado y la plata espera entre los dos hasta que confirma que le llegó.\n\n¿Cómo se llama tu tienda?",
      botones: e.alta.nombre ? undefined : [{ id: "nombre", texto: DEMO.tienda, principal: true }],
    });
    if (e.alta.nombre) {
      m.push({ id: "yo-nombre", de: "yo", at: seg(t0, 2), texto: e.alta.nombre });
      m.push({ id: "ciudad", de: "bot", at: seg(t0, 3), texto: "¿En qué ciudad estás?", botones: e.alta.ciudad ? undefined : [{ id: "ciudad", texto: DEMO.ciudad, principal: true }] });
    }
    if (e.alta.ciudad) {
      m.push({ id: "yo-ciudad", de: "yo", at: seg(t0, 5), texto: e.alta.ciudad });
      m.push({
        id: "wa",
        de: "bot",
        at: seg(t0, 6),
        texto: "¿Cuál es tu número de WhatsApp? Es el que verán tus clientes.",
        botones: e.alta.whatsapp ? undefined : [{ id: "whatsapp", texto: DEMO.whatsappBonito, principal: true }],
      });
    }
    if (e.alta.whatsapp) {
      m.push({ id: "yo-wa", de: "yo", at: seg(t0, 8), texto: e.alta.whatsapp });
      m.push({ id: "creando", de: "bot", at: seg(t0, 9), enCurso: true, texto: "Creando tu cuenta de cobro en la red de prueba. Suele tardar unos 10 segundos." });
    }
    return m;
  }
  const tA = e.pedido ? e.pedido.created_at - 20_000 : seg(t0, 20);
  m.push({ id: "listo-tienda", de: "bot", at: tA, texto: `¡Listo! 🔗 Este número quedó vinculado a *${e.tienda}*.\n\n🔒 ${SIN_LINK_PARA_COBRAR}` });
  m.push({
    id: "que-vendes",
    de: "bot",
    at: tA + 1000,
    texto: "¿Qué vendes? Dime el producto y el precio, y te armo el link.",
    botones: e.pedido || e.creandoLink ? undefined : [{ id: "vender", texto: DEMO.vendo, principal: true }],
  });
  if (e.creandoLink && !e.pedido) {
    m.push({ id: "yo-vendo", de: "yo", at: e.ahora, texto: DEMO.vendo });
    m.push({ id: "creando-link", de: "bot", at: e.ahora, enCurso: true, texto: "Creando tu link de pago protegido…" });
    return m;
  }
  const p = e.pedido;
  if (!p) return m;
  m.push({ id: "yo-vendo", de: "yo", at: p.created_at - 3000, texto: DEMO.vendo });
  m.push({
    id: "link",
    de: "bot",
    at: p.created_at,
    texto: `¡Listo! ✅ Tu link de pago protegido:\n*${p.product}* · ${p.precio} · entrega en ${DEMO.dias} días\n\nCódigo: *${p.code ?? ""}*. Es para un solo cliente. Te aviso apenas pague.\n\n⚠️ ${QR_AVISO}`,
    tarjeta: tarjetaDe(p, e.host),
    botones: e.reenviado ? undefined : [{ id: "reenviar", texto: "Reenviar a mi cliente", principal: true }],
  });
  if (!e.reenviado) return m;
  m.push({ id: "yo-reenvio", de: "yo", at: p.created_at + 4000, texto: `¡Hola! 👋 Te paso el link de pago protegido de ${e.tienda} para *${p.product}* (${p.precio}).\n\n${FRASE_ESPERA}.`, tarjeta: tarjetaDe(p, e.host) });
  if (p.status === "esperando_pago") {
    m.push({ id: "esperando", de: "bot", at: p.created_at + 5000, texto: "Tu cliente ya tiene el link. Te aviso apenas pague." });
    return m;
  }
  const tPago = p.paid_at ?? p.created_at + 30_000;
  const despacha = p.ship_deadline ? ` antes ${cuandoChat(p.ship_deadline, e.ahora, "antes")}` : "";
  m.push({
    id: "pagado",
    de: "bot",
    at: tPago,
    texto: `💸 ${p.code ?? ""}: tu cliente pagó ${p.total} por *${p.product}* y el pago está GUARDADO en el contrato, todavía no en tu cuenta.\n\nDespacha${despacha} y marca enviado. Si no se marca enviado a tiempo, la plata vuelve sola a tu cliente.`,
    botones: p.status === "pagado" && !e.enviando ? [{ id: "enviado", texto: "Ya lo envié", principal: true }] : undefined,
  });
  if (p.status === "pagado") {
    if (e.enviando) m.push({ id: "enviando", de: "bot", at: e.ahora, enCurso: true, texto: "Registrando el envío en el contrato. Unos 10 segundos." });
    return m;
  }
  if (p.status === "devuelto") {
    m.push({ id: "devuelto", de: "bot", at: p.released_at ?? e.ahora, texto: `↩️ ${p.code ?? ""}: no se marcó enviado a tiempo. La plata volvió sola a tu cliente.` });
    return m;
  }
  const tEnvio = p.shipped_at ?? tPago + 30_000;
  m.push({ id: "yo-enviado", de: "yo", at: tEnvio - 2000, texto: `Ya lo envié${p.envio ? `: ${p.envio}` : ""}` });
  m.push({
    id: "enviado",
    de: "bot",
    at: tEnvio,
    texto: `📦 ${p.code ?? ""}: listo, *${p.product}* figura como enviado.${p.deadline ? ` Si tu cliente no dice nada, se te paga ${cuandoChat(p.deadline, e.ahora)}.` : ""} Te aviso cuando se libere tu plata.`,
  });
  if (p.status === "enviado") return m;
  if (p.status === "liberado") {
    m.push({
      id: "liberado",
      de: "bot",
      at: p.released_at ?? e.ahora,
      texto: `✅ ${p.code ?? ""}: tu cliente confirmó que le llegó.${p.recibido ? ` Te llegaron *${p.recibido}* a tu cuenta 🙌` : " La plata ya está en tu cuenta 🙌"}`,
    });
  } else if (p.status === "en_disputa") {
    m.push({ id: "disputa", de: "bot", at: e.ahora, texto: `⚠️ ${p.code ?? ""}: tu cliente abrió un reclamo. El pago queda congelado y decide un revisor.` });
  } else if (p.status === "resuelto") {
    m.push({ id: "resuelto", de: "bot", at: p.released_at ?? e.ahora, texto: `⚖️ ${p.code ?? ""}: el revisor repartió la plata entre tu cliente y tú.` });
  }
  return m;
}

// ---------- Comprador ----------

export interface Estafa {
  at: number;
  rechazado: boolean;
  /** "Error(Contract, #12)" cuando lo rechazó el contrato. */
  error: string | null;
  detalle: string;
  enCurso?: boolean;
}

export interface EstadoComprador {
  ahora: number;
  tienda: string;
  pedido: PedidoChat | null;
  reenviado: boolean;
  estafa: Estafa | null;
  confirmando: boolean;
  host: string;
}

export function mensajesComprador(e: EstadoComprador): Mensaje[] {
  const m: Mensaje[] = [];
  const p = e.pedido;
  if (!p || !e.reenviado) return m;
  m.push({ id: "sis", de: "bot", sistema: true, at: p.created_at, texto: "Simulación: este chat muestra cómo se usa Trato dentro de WhatsApp. No se mueve dinero real." });
  m.push({
    id: "link",
    de: "bot",
    at: p.created_at + 4000,
    texto: `${e.tienda} te envió un link de pago protegido para *${p.product}* (${p.precio}).\n\n${FRASE_ESPERA}.`,
    tarjeta: tarjetaDe(p, e.host),
    botones: p.status === "esperando_pago" ? [{ id: "pagar", texto: `Abrir y pagar ${p.total}`, principal: true }] : undefined,
  });
  if (p.status === "esperando_pago") return m;
  const tPago = p.paid_at ?? p.created_at + 30_000;
  m.push({ id: "yo-pague", de: "yo", at: tPago - 1000, texto: `Pagué ${p.total} con QR ✅` });
  m.push({
    id: "pagado",
    de: "bot",
    at: tPago,
    texto: `🔒 ${p.code ?? ""}: tu pago de ${p.total} quedó guardado en el contrato de este pedido. Solo tiene dos salidas: a ${e.tienda} cuando confirmes que te llegó, o de vuelta a ti si no despacha a tiempo.\n\n${ANTI_PRESION}`,
  });
  if (e.estafa) {
    const x = e.estafa;
    m.push({
      id: "estafa",
      de: "desconocido",
      at: x.at,
      desconocidoDe: ESTAFADOR.numero,
      texto: `Hola, soy del banco 🏦 Para liberar tu compra ${p.code ?? ""} necesitamos que autorices el pago a la cuenta ${ESTAFADOR.cuenta}. Es urgente.`,
    });
    m.push({
      id: "bloqueo",
      de: "bot",
      at: x.at + 1500,
      enCurso: x.enCurso,
      texto: x.enCurso
        ? "Revisando ese pedido en el contrato…"
        : x.rechazado
          ? `🚫 Bloqueado. Alguien pidió mandar tu plata a otra cuenta y el contrato lo rechazó${x.error ? `: ${x.error}` : ""}. La plata solo puede ir a ${e.tienda} o volver a ti. Nadie más, ni nosotros.`
          : `La simulación no falló: hay que revisar los roles de este contrato. ${x.detalle}`,
    });
  }
  if (p.status === "pagado") return m;
  if (p.status === "devuelto") {
    m.push({ id: "devuelto", de: "bot", at: p.released_at ?? e.ahora, texto: `↩️ ${p.code ?? ""}: ${e.tienda} no despachó a tiempo. Tu plata volvió sola a tu cuenta.` });
    return m;
  }
  const tEnvio = p.shipped_at ?? tPago + 30_000;
  const puede = p.confirm_after != null && e.ahora >= p.confirm_after;
  const falta = p.confirm_after != null && !puede ? `\n\nPuedes pagarle en ${cuentaAtras(p.confirm_after, e.ahora)}, para que alcances a recibir y revisar.` : "";
  m.push({
    id: "enviado",
    de: "bot",
    at: tEnvio,
    texto: `📦 ${p.code ?? ""}: ¡Hola! ${e.tienda} ya envió tu *${p.product}*${p.envio ? ` (${p.envio})` : ""}.\n\n¿Te llegó? Revísalo antes de pagar.${p.status === "enviado" ? falta : ""}`,
    botones:
      p.status === "enviado" && !e.confirmando
        ? [
            { id: "me-llego", texto: "Sí, me llegó", principal: true, deshabilitado: !puede },
            { id: "problema", texto: "Tengo un problema" },
          ]
        : undefined,
  });
  if (p.status === "enviado") {
    if (e.confirmando) {
      m.push({ id: "yo-me-llego", de: "yo", at: e.ahora, texto: "Sí, me llegó y está bien" });
      m.push({ id: "pagando", de: "bot", at: e.ahora, enCurso: true, texto: `Pagando a ${e.tienda} desde el contrato. Unos 10 segundos.` });
    }
    return m;
  }
  if (p.status === "liberado") {
    m.push({ id: "yo-me-llego", de: "yo", at: (p.released_at ?? e.ahora) - 8000, texto: "Sí, me llegó y está bien" });
    m.push({ id: "liberado", de: "bot", at: p.released_at ?? e.ahora, texto: `✅ ${p.code ?? ""}: pagaste al vendedor. ${e.tienda} recibió ${p.recibido ?? "su plata"}. ¡Gracias por comprar con Trato!` });
  } else if (p.status === "en_disputa") {
    m.push({ id: "disputa", de: "bot", at: e.ahora, texto: `⚠️ ${p.code ?? ""}: abriste un reclamo. La plata queda congelada hasta que decida un revisor.` });
  } else if (p.status === "resuelto") {
    m.push({ id: "resuelto", de: "bot", at: p.released_at ?? e.ahora, texto: `⚖️ ${p.code ?? ""}: el revisor repartió la plata entre ${e.tienda} y tú.` });
  }
  return m;
}

/** Título enorme de cada paso (lo usa /probar arriba de los celulares). */
export function tituloPaso(p: { tienda: boolean; status: string | null; estafa: boolean }): { n: number; titulo: string; quien: "vendedor" | "comprador" | null } {
  if (!p.tienda || p.status === null) return { n: 1, titulo: "La tienda vende por WhatsApp", quien: "vendedor" };
  switch (p.status) {
    case "esperando_pago":
      return { n: 2, titulo: "El comprador paga desde el link que le llegó por WhatsApp", quien: "comprador" };
    case "pagado":
      return p.estafa ? { n: 4, titulo: "La tienda despacha", quien: "vendedor" } : { n: 3, titulo: "La plata espera entre los dos. Un estafador lo intenta", quien: null };
    case "enviado":
      return { n: 5, titulo: "El comprador recibe y paga a la tienda", quien: "comprador" };
    case "liberado":
      return { n: 6, titulo: "La tienda cobró", quien: null };
    case "devuelto":
      return { n: 6, titulo: "No se despachó a tiempo: la plata volvió al comprador", quien: null };
    case "en_disputa":
      return { n: 6, titulo: "Hay un reclamo: decide un revisor", quien: null };
    default:
      return { n: 6, titulo: "El pedido terminó", quien: null };
  }
}
