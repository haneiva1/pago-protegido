/**
 * /probar: el vendedor y el comprador corren las páginas reales (/vender, /panel y /p/<slug>) dentro de dos marcos de
 * celular (iframes del mismo origen). Sin dependencias ni alias `@/`: lo usan el navegador, el servidor y los tests.
 */
export type RolProbar = "vendedor" | "comprador";

export const PROBAR_PATH = "/probar";
/** Header que agrega `api()` cuando la llamada sale de /probar. El servidor solo le hace caso con PP_PROBAR=1. */
export const PROBAR_HEADER = "x-pp-probar";
/** Cuentas de prueba de /probar: separadas de las del resto de la app (`pp.billetera.<rol>`). */
export const probarStorageKey = (role: RolProbar) => `pp.probar.${role}`;
/** Marca de sesión de /probar (sessionStorage): ya se pidió permiso al servidor para esta prueba. */
export const PROBAR_SESION = "pp.probar.sesion";

/** ¿Esta página es /probar o corre dentro de uno de sus marcos? */
export function enProbar(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.location.pathname === PROBAR_PATH) return true;
    return window.self !== window.top && window.top?.location.pathname === PROBAR_PATH;
  } catch {
    // Marco dentro de otro sitio: no hay acceso a `top`, así que no es /probar.
    return false;
  }
}

/** Script que corre antes de pintar el layout: dentro de un marco de /probar esconde el encabezado y el pie. */
export const SCRIPT_MARCO = `try{if(window.self!==window.top&&window.top.location.pathname===${JSON.stringify(PROBAR_PATH)})document.documentElement.setAttribute("data-marco","probar")}catch(e){}`;

// ---------- Registro en vivo ----------

export interface TxProbar {
  kind: string;
  actor: string;
  hash: string | null;
  created_at: number;
}

export type PasoId = "link" | "pago" | "envio" | "cobro";

export const PASOS: { id: PasoId; titulo: string }[] = [
  { id: "link", titulo: "Crear el link" },
  { id: "pago", titulo: "Pagar" },
  { id: "envio", titulo: "Registrar el envío" },
  { id: "cobro", titulo: "Pagar al vendedor" },
];

/** A qué paso del registro va cada movimiento y cómo se cuenta (los textos del servidor le hablan al comprador). */
const MOVIMIENTOS: Record<string, { paso: PasoId | "otro"; texto: string }> = {
  "trustline:vendedor": { paso: "link", texto: "Se activó la cuenta de cobro del vendedor" },
  "trustline:comprador": { paso: "pago", texto: "Se activó la cuenta del comprador" },
  rampa: { paso: "pago", texto: "Pago simulado del banco: la plata llegó a la cuenta del comprador" },
  escrow: { paso: "pago", texto: "Se creó el contrato de este pedido" },
  fondeo: { paso: "pago", texto: "El comprador guardó el pago en el contrato" },
  envio: { paso: "envio", texto: "El vendedor registró el envío" },
  aprobacion: { paso: "cobro", texto: "El comprador confirmó que recibió" },
  liberacion: { paso: "cobro", texto: "Se pagó al vendedor" },
  extension: { paso: "otro", texto: "El comprador pidió más tiempo para revisar" },
  disputa: { paso: "otro", texto: "Se abrió un reclamo: la plata quedó congelada" },
  resolucion: { paso: "otro", texto: "El revisor repartió entre comprador y vendedor" },
  devolucion: { paso: "otro", texto: "El vendedor no despachó a tiempo: la plata volvió al comprador" },
};

export interface FilaRegistro {
  kind: string;
  paso: PasoId | "otro";
  texto: string;
  hash: string | null;
  at: number;
}

/** Ordena los movimientos del pedido (y las activaciones de cuenta) en los 4 pasos del registro. */
export function filasRegistro(txs: TxProbar[], vendedor: string): FilaRegistro[] {
  return txs
    .map((t) => {
      const clave = t.kind === "trustline" ? `trustline:${t.actor === vendedor ? "vendedor" : "comprador"}` : t.kind;
      const m = MOVIMIENTOS[clave] ?? { paso: "otro" as const, texto: "Otro movimiento del pedido" };
      return { kind: t.kind, paso: m.paso, texto: m.texto, hash: t.hash, at: t.created_at };
    })
    .sort((a, b) => a.at - b.at);
}

/** Estado del pedido → qué hacer ahora (la guía de arriba de /probar). */
export function siguientePaso(p: { tienda: boolean; status: string | null }): string {
  if (!p.tienda) return "Crea la tienda en el celular del vendedor: nombre, ciudad y WhatsApp.";
  switch (p.status) {
    case null:
      return "Crea un link en el panel del vendedor: producto y precio.";
    case "esperando_pago":
      return "El link llegó al celular del comprador: paga con el QR simulado.";
    case "pagado":
      return "La plata espera entre los dos. Intenta desviarla y después registra el envío desde el celular del vendedor: tiene 2 minutos.";
    case "enviado":
      return "Envío registrado. En 1 minuto el comprador puede confirmar que recibió y pagar al vendedor.";
    case "liberado":
      return "Listo: el vendedor cobró. La plata salió por una de sus dos salidas.";
    case "devuelto":
      return "El vendedor no registró el envío a tiempo y la plata volvió sola al comprador: la otra salida.";
    case "en_disputa":
      return "Hay un reclamo abierto: la plata queda congelada hasta que decida el revisor.";
    case "resuelto":
      return "El revisor repartió la plata entre el comprador y el vendedor.";
    default:
      return "Sigue el pedido en los dos celulares.";
  }
}

/** En qué celular está la acción según el estado (null cuando no toca ninguno). */
export function turnoDe(p: { tienda: boolean; status: string | null }): RolProbar | null {
  if (!p.tienda || p.status === null) return "vendedor";
  if (p.status === "esperando_pago" || p.status === "enviado") return "comprador";
  if (p.status === "pagado") return "vendedor";
  return null;
}

// ---------- La historia en 5 etapas (la guía de /probar) ----------

export type EtapaId = "link" | "pago" | "desvio" | "envio" | "cobro";
export type EstadoEtapa = "hecha" | "ahora" | "pendiente" | "omitida";

export const ETAPAS: { id: EtapaId; titulo: string; corto: string }[] = [
  { id: "link", titulo: "La tienda crea el link", corto: "Link" },
  { id: "pago", titulo: "El comprador paga", corto: "Pago" },
  { id: "desvio", titulo: "Alguien intenta desviar la plata", corto: "Desvío" },
  { id: "envio", titulo: "La tienda despacha", corto: "Envío" },
  { id: "cobro", titulo: "El comprador recibe y la tienda cobra", corto: "Cobro" },
];

const PLATA_YA_ENTRO = new Set(["pagado", "enviado", "liberado", "en_disputa", "resuelto", "devuelto"]);

/** Estado de cada etapa de la historia: el desvío se puede saltar (queda "omitida") y la devolución salta el envío. */
export function etapas(p: { pedido: boolean; status: string | null; desvios: number; envio: boolean }): Record<EtapaId, EstadoEtapa> {
  const link = p.pedido;
  const pago = link && p.status !== null && PLATA_YA_ENTRO.has(p.status);
  const envio = pago && (p.envio || p.status === "enviado" || p.status === "liberado");
  const cobro = p.status === "liberado";
  const terminado = cobro || p.status === "devuelto" || p.status === "resuelto";
  const r: Record<EtapaId, EstadoEtapa> = {
    link: link ? "hecha" : "ahora",
    pago: pago ? "hecha" : link ? "ahora" : "pendiente",
    desvio: p.desvios > 0 ? "hecha" : envio || terminado ? "omitida" : pago ? "ahora" : "pendiente",
    envio: envio ? "hecha" : p.status === "devuelto" ? "omitida" : pago ? "ahora" : "pendiente",
    cobro: cobro ? "hecha" : terminado ? "omitida" : envio ? "ahora" : "pendiente",
  };
  // Una sola etapa "ahora": la primera que no esté hecha ni omitida.
  let vista = false;
  for (const e of ETAPAS) {
    if (r[e.id] === "ahora") {
      if (vista) r[e.id] = "pendiente";
      vista = true;
    }
  }
  return r;
}

/** Número de la etapa en curso (1 a 5) y si ya terminó la historia. */
export function etapaActual(e: Record<EtapaId, EstadoEtapa>): { numero: number; terminada: boolean } {
  const i = ETAPAS.findIndex((x) => e[x.id] === "ahora");
  return i >= 0 ? { numero: i + 1, terminada: false } : { numero: ETAPAS.length, terminada: true };
}

// ---------- Esperas que se explican ----------

/** Los 4 movimientos del pago, en orden: para contar "paso n de 4" mientras el comprador paga. */
export const PASOS_PAGO: { kind: string; haciendo: string }[] = [
  { kind: "trustline", haciendo: "Activando la cuenta del comprador" },
  { kind: "rampa", haciendo: "El banco simulado entrega la plata" },
  { kind: "escrow", haciendo: "Creando el contrato de este pedido" },
  { kind: "fondeo", haciendo: "Guardando la plata en el contrato" },
];

/** Avance del pago a partir del registro: cuántos de los 4 movimientos ya están y qué está pasando ahora. */
export function progresoPago(filas: FilaRegistro[]): { hechos: number; total: number; haciendo: string | null } {
  const hechos = new Set(filas.filter((f) => f.paso === "pago").map((f) => f.kind));
  const n = PASOS_PAGO.filter((p) => hechos.has(p.kind)).length;
  return { hechos: n, total: PASOS_PAGO.length, haciendo: n < PASOS_PAGO.length ? PASOS_PAGO[n].haciendo : null };
}

/** Hora local de Bolivia en 24 h (hh:mm:ss), para el registro en vivo. */
export const horaProbar = (ms: number) =>
  new Date(ms).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "America/La_Paz" });

/** mm:ss de lo que falta (nunca negativo). */
export function cuentaRegresiva(hastaMs: number, ahoraMs: number): string {
  const s = Math.max(0, Math.ceil((hastaMs - ahoraMs) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Duración legible: "48 s", "2 min 14 s". */
export function duracion(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return s % 60 ? `${m} min ${s % 60} s` : `${m} min`;
}

/** Resumen de lo que pasó en la red cuando la historia termina. */
export function resumenRed(filas: FilaRegistro[], creadoMs: number): { transacciones: number; duracionMs: number } {
  const conHash = filas.filter((f) => f.hash);
  const ultimo = conHash.reduce((m, f) => Math.max(m, f.at), creadoMs);
  return { transacciones: conHash.length, duracionMs: ultimo - creadoMs };
}

/** ¿Hay plata guardada en el contrato? Solo entonces tiene sentido intentar desviarla. */
export const hayPlataGuardada = (status: string | null) => status === "pagado" || status === "enviado" || status === "en_disputa";

/** Saca el error del contrato del texto crudo del host, p. ej. "Error(Contract, #12)". */
export function errorDelContrato(raw: string | undefined, code?: number): string | null {
  const m = raw?.match(/Error\(Contract, #\d+\)/);
  if (m) return m[0];
  return typeof code === "number" ? `Error(Contract, #${code})` : null;
}

// ---------- La presentación: un título grande por momento ----------

/** El título grande de cada momento de la historia (la presentación de /probar). */
export function tituloEtapa(p: { pedido: boolean; status: string | null; desvios: number }): string {
  if (!p.pedido || p.status === null) return "La tienda crea el link";
  switch (p.status) {
    case "esperando_pago":
      return "El comprador paga";
    case "pagado":
      return p.desvios > 0 ? "Nadie puede desviarla" : "La plata espera entre los dos";
    case "enviado":
      return "La tienda despachó";
    case "liberado":
      return "La tienda cobró";
    case "devuelto":
      return "La plata volvió al comprador";
    case "en_disputa":
      return "La plata está congelada";
    case "resuelto":
      return "El revisor repartió la plata";
    default:
      return "La historia sigue en los dos celulares";
  }
}
