/**
 * /probar como chat: los guiones de la tienda y del comprador, puros y testeables (node --test). Mensajes de 1 o 2
 * líneas, con las palabras del bot real (bot/src/engine/messages.ts). Sin alias `@/`.
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
  dominio: string;
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
  /** Algo en curso dentro de la burbuja ("Creando tu cuenta…"): se muestra con avance. */
  enCurso?: boolean;
  at: number;
  /** Nota centrada del sistema. */
  sistema?: boolean;
  /** Mensaje de un número desconocido (el estafador). */
  desconocidoDe?: string;
}

/** Lo que vende la demo: igual que en el e2e de /probar. La tienda se llama "Zapatería". */
export const DEMO = {
  tienda: "Zapatería",
  ciudad: "Santa Cruz",
  /** Número de prueba: la demo lo completa sola, no se muestra. */
  whatsapp: "59171234567",
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

export function cuentaAtras(hastaMs: number, ahoraMs: number): string {
  const s = Math.max(0, Math.ceil((hastaMs - ahoraMs) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Cuándo vence algo: "a las 01:19" si es dentro de 12 horas; si no, "el 25 nov, 01:17". */
export function cuandoChat(ms: number, ahora: number): string {
  return ms - ahora < 12 * 3600_000 ? `a las ${horaChat(ms)}` : `el ${fmtDate(ms)}`;
}

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
  return { titulo: `${p.product} · ${p.precio}`, dominio: host.replace(/^www\./, ""), url: p.url, imagen: p.imagen };
}

/** El envío, corto: "Trans Copacabana · SRV-2026-118734". */
const envioCorto = (envio: string | null | undefined) =>
  envio
    ? envio
        .split(" · ")
        .slice(0, 2)
        .map((s) => s.replace(/ \(encomiendas\)/, "").replace(/^guía /, ""))
        .join(" · ")
    : "";

// ---------- Tienda ----------

export interface EstadoVendedor {
  t0: number;
  ahora: number;
  /** El registro mínimo: "Hola" → "Crear mi cuenta" (hoja con nombre y ciudad) → creando. */
  alta: { hola?: boolean; creando?: boolean };
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
  if (!e.tienda) {
    m.push({
      id: "hola-bot",
      de: "bot",
      at: t0,
      texto: "Hola 👋 Soy Trato. Vende por WhatsApp con pago protegido.",
      botones: e.alta.hola ? undefined : [{ id: "hola", texto: "Hola", principal: true }],
    });
    if (e.alta.hola) {
      m.push({ id: "yo-hola", de: "yo", at: seg(t0, 2), texto: "Hola" });
      m.push({
        id: "crear",
        de: "bot",
        at: seg(t0, 3),
        texto: "Para empezar, crea tu cuenta de cobro.",
        botones: e.alta.creando ? undefined : [{ id: "crear-cuenta", texto: "Crear mi cuenta", principal: true }],
      });
    }
    if (e.alta.creando) m.push({ id: "creando", de: "bot", at: seg(t0, 6), enCurso: true, texto: "Creando tu cuenta. Unos 10 segundos." });
    return m;
  }
  const tA = e.pedido ? e.pedido.created_at - 20_000 : seg(t0, 20);
  m.push({
    id: "que-vendes",
    de: "bot",
    at: tA,
    texto: `Listo, ${e.tienda}. ¿Qué vendes hoy?`,
    botones: e.pedido || e.creandoLink ? undefined : [{ id: "vender", texto: `Vender ${DEMO.producto} a Bs ${DEMO.precioBs}`, principal: true }],
  });
  if (e.creandoLink && !e.pedido) {
    m.push({ id: "yo-vendo", de: "yo", at: e.ahora, texto: DEMO.vendo });
    m.push({ id: "creando-link", de: "bot", at: e.ahora, enCurso: true, texto: "Creando tu link de pago…" });
    return m;
  }
  const p = e.pedido;
  if (!p) return m;
  m.push({ id: "yo-vendo", de: "yo", at: p.created_at - 3000, texto: DEMO.vendo });
  m.push({
    id: "link",
    de: "bot",
    at: p.created_at,
    texto: `Tu link de pago protegido, código ${p.code ?? ""}:`,
    tarjeta: tarjetaDe(p, e.host),
    botones: e.reenviado ? undefined : [{ id: "mandar", texto: "Mandar al cliente", principal: true }],
  });
  if (!e.reenviado) return m;
  m.push({ id: "yo-reenvio", de: "yo", at: p.created_at + 4000, texto: "Te paso el link de pago protegido 👇", tarjeta: tarjetaDe(p, e.host) });
  if (p.status === "esperando_pago") {
    m.push({ id: "esperando", de: "bot", at: p.created_at + 5000, texto: "Enviado. Te aviso apenas pague." });
    return m;
  }
  const tPago = p.paid_at ?? p.created_at + 30_000;
  m.push({
    id: "pagado",
    de: "bot",
    at: tPago,
    texto: `💸 Tu cliente pagó ${p.total}. La plata está guardada, todavía no en tu cuenta.${p.status === "pagado" ? "\nDespacha y toca Ya lo envié." : ""}`,
    botones: p.status === "pagado" && !e.enviando ? [{ id: "enviado", texto: "Ya lo envié", principal: true }] : undefined,
  });
  if (p.status === "pagado") {
    if (e.enviando) m.push({ id: "enviando", de: "bot", at: e.ahora, enCurso: true, texto: "Registrando el envío. Unos 10 segundos." });
    return m;
  }
  if (p.status === "devuelto") {
    m.push({ id: "devuelto", de: "bot", at: p.released_at ?? e.ahora, texto: "↩️ No se despachó a tiempo. La plata volvió sola a tu cliente." });
    return m;
  }
  const tEnvio = p.shipped_at ?? tPago + 30_000;
  m.push({ id: "yo-enviado", de: "yo", at: tEnvio - 2000, texto: `Ya lo envié${p.envio ? `: ${envioCorto(p.envio)}` : ""}` });
  m.push({ id: "enviado", de: "bot", at: tEnvio, texto: "📦 Envío registrado. Te aviso cuando cobres." });
  if (p.status === "enviado") return m;
  if (p.status === "liberado") m.push({ id: "liberado", de: "bot", at: p.released_at ?? e.ahora, texto: `✅ Cobraste ${p.recibido ?? "tu plata"}. Ya está en tu cuenta.` });
  else if (p.status === "en_disputa") m.push({ id: "disputa", de: "bot", at: e.ahora, texto: "⚠️ Tu cliente abrió un reclamo. Decide un revisor." });
  else if (p.status === "resuelto") m.push({ id: "resuelto", de: "bot", at: p.released_at ?? e.ahora, texto: "⚖️ El revisor repartió la plata entre los dos." });
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
  m.push({
    id: "link",
    de: "bot",
    at: p.created_at + 4000,
    texto: `${e.tienda} te mandó un link de pago protegido.`,
    tarjeta: tarjetaDe(p, e.host),
    botones: p.status === "esperando_pago" ? [{ id: "pagar", texto: `Abrir y pagar ${p.total}`, principal: true }] : undefined,
  });
  if (p.status === "esperando_pago") return m;
  const tPago = p.paid_at ?? p.created_at + 30_000;
  m.push({ id: "yo-pague", de: "yo", at: tPago - 1000, texto: `Pagué ${p.total} ✅` });
  m.push({ id: "pagado", de: "bot", at: tPago, texto: "🔒 Tu plata quedó guardada. Solo sale cuando confirmes que te llegó." });
  if (e.estafa) {
    const x = e.estafa;
    m.push({ id: "estafa", de: "desconocido", at: x.at, desconocidoDe: ESTAFADOR.numero, texto: `Soy del banco. Autoriza el pago a esta cuenta: ${ESTAFADOR.cuenta}.` });
    m.push({
      id: "bloqueo",
      de: "bot",
      at: x.at + 1500,
      enCurso: x.enCurso,
      texto: x.enCurso
        ? "Revisando en el contrato…"
        : x.rechazado
          ? `🚫 Bloqueado. La plata solo puede ir a ${e.tienda} o volver a ti.${x.error ? `\n${x.error}` : ""}`
          : `La simulación no falló: hay que revisar los roles de este contrato. ${x.detalle}`,
    });
  }
  if (p.status === "pagado") return m;
  if (p.status === "devuelto") {
    m.push({ id: "devuelto", de: "bot", at: p.released_at ?? e.ahora, texto: `↩️ ${e.tienda} no despachó a tiempo. Tu plata volvió a tu cuenta.` });
    return m;
  }
  const tEnvio = p.shipped_at ?? tPago + 30_000;
  const puede = p.confirm_after != null && e.ahora >= p.confirm_after;
  m.push({
    id: "enviado",
    de: "bot",
    at: tEnvio,
    texto: `📦 ${e.tienda} envió tu pedido${p.envio ? ` (${envioCorto(p.envio)})` : ""}.\n¿Te llegó?`,
    botones:
      p.status === "enviado" && !e.confirmando
        ? [
            { id: "me-llego", texto: puede || p.confirm_after == null ? "Sí, me llegó" : `Sí, me llegó · ${cuentaAtras(p.confirm_after, e.ahora)}`, principal: true, deshabilitado: !puede },
            { id: "problema", texto: "Tengo un problema" },
          ]
        : undefined,
  });
  if (p.status === "enviado") {
    if (e.confirmando) {
      m.push({ id: "yo-me-llego", de: "yo", at: e.ahora, texto: "Sí, me llegó" });
      m.push({ id: "pagando", de: "bot", at: e.ahora, enCurso: true, texto: `Pagando a ${e.tienda}. Unos 10 segundos.` });
    }
    return m;
  }
  if (p.status === "liberado") {
    m.push({ id: "yo-me-llego", de: "yo", at: (p.released_at ?? e.ahora) - 8000, texto: "Sí, me llegó" });
    m.push({ id: "liberado", de: "bot", at: p.released_at ?? e.ahora, texto: `✅ Pagaste a ${e.tienda}. Gracias por comprar con Trato.` });
  } else if (p.status === "en_disputa") m.push({ id: "disputa", de: "bot", at: e.ahora, texto: "⚠️ Abriste un reclamo. Decide un revisor." });
  else if (p.status === "resuelto") m.push({ id: "resuelto", de: "bot", at: p.released_at ?? e.ahora, texto: "⚖️ El revisor repartió la plata entre los dos." });
  return m;
}

// ---------- Los 4 pasos de /probar ----------

export type PasoDemo = 1 | 2 | 3 | 4;
export const PASOS_DEMO: { n: PasoDemo; nombre: string }[] = [
  { n: 1, nombre: "Se registra" },
  { n: 2, nombre: "Vende" },
  { n: 3, nombre: "Le pagan" },
  { n: 4, nombre: "Cobra" },
];

/** Paso actual (1 a 4), título (≤ 6 palabras) y línea (≤ 10 palabras) de cada momento. */
export function pasoDemo(p: { tienda: boolean; status: string | null; estafa: "no" | "en-curso" | "bloqueada" }): {
  n: PasoDemo;
  titulo: string;
  linea: string;
  quien: "vendedor" | "comprador" | null;
  terminado: boolean;
} {
  if (!p.tienda) return { n: 1, titulo: "1. La Zapatería se registra", linea: "Escribe Hola y toca Crear mi cuenta", quien: "vendedor", terminado: false };
  if (p.status === null) return { n: 2, titulo: "2. La Zapatería vende", linea: "Toca Vender y manda el link", quien: "vendedor", terminado: false };
  switch (p.status) {
    case "esperando_pago":
      return { n: 3, titulo: "3. El comprador paga", linea: "Abre el link y paga con un toque", quien: "comprador", terminado: false };
    case "pagado":
      if (p.estafa === "en-curso") return { n: 3, titulo: "Alguien intenta robar la plata", linea: "Mira el chat del comprador", quien: null, terminado: false };
      if (p.estafa === "bloqueada") return { n: 3, titulo: "Bloqueado: solo dos salidas", linea: "La Zapatería despacha y toca Ya lo envié", quien: "vendedor", terminado: false };
      return { n: 3, titulo: "3. La plata quedó guardada", linea: "Toca Alguien intenta robar la plata", quien: null, terminado: false };
    case "enviado":
      return { n: 4, titulo: "4. La Zapatería cobra", linea: "Confirma la entrega y la plata llega", quien: "comprador", terminado: false };
    case "liberado":
      return { n: 4, titulo: "4. La Zapatería cobró", linea: "La plata llegó a su cuenta", quien: null, terminado: true };
    case "devuelto":
      return { n: 4, titulo: "La plata volvió al comprador", linea: "No se despachó a tiempo", quien: null, terminado: true };
    case "en_disputa":
      return { n: 4, titulo: "Hay un reclamo", linea: "Un revisor decide", quien: null, terminado: false };
    default:
      return { n: 4, titulo: "El pedido terminó", linea: "", quien: null, terminado: true };
  }
}
