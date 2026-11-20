/**
 * /probar: la tienda y quien compra corren las páginas reales (/vender, /panel y /p/<slug>) dentro de dos marcos de
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
  "trustline:vendedor": { paso: "link", texto: "Se activó la cuenta de cobro de la tienda" },
  "trustline:comprador": { paso: "pago", texto: "Se activó la cuenta de quien compra" },
  rampa: { paso: "pago", texto: "Pago simulado del banco: la plata llegó a la cuenta de quien compra" },
  escrow: { paso: "pago", texto: "Se creó el contrato de este pedido" },
  fondeo: { paso: "pago", texto: "Quien compra guardó el pago en el contrato" },
  envio: { paso: "envio", texto: "La tienda registró el envío" },
  aprobacion: { paso: "cobro", texto: "Quien compra confirmó que recibió" },
  liberacion: { paso: "cobro", texto: "Se pagó a la tienda" },
  extension: { paso: "otro", texto: "Quien compra pidió más tiempo para revisar" },
  disputa: { paso: "otro", texto: "Se abrió un reclamo: la plata quedó congelada" },
  resolucion: { paso: "otro", texto: "El revisor repartió entre comprador y vendedor" },
  devolucion: { paso: "otro", texto: "La tienda no despachó a tiempo: la plata volvió a quien compra" },
};

export interface FilaRegistro {
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
      return { paso: m.paso, texto: m.texto, hash: t.hash, at: t.created_at };
    })
    .sort((a, b) => a.at - b.at);
}

/** Estado del pedido → qué hacer ahora (la guía de arriba de /probar). */
export function siguientePaso(p: { tienda: boolean; status: string | null }): string {
  if (!p.tienda) return "Crea la tienda en el celular de la izquierda: nombre, ciudad y WhatsApp.";
  switch (p.status) {
    case null:
      return "Crea un link en el panel de la tienda: producto y precio.";
    case "esperando_pago":
      return "El link llegó al celular de quien compra: paga con el QR simulado.";
    case "pagado":
      return "La plata quedó guardada en el contrato. Intenta desviarla, y después registra el envío desde la tienda (tienes 2 minutos).";
    case "enviado":
      return "Envío registrado. En 1 minuto, quien compra puede confirmar y pagar a la tienda.";
    case "liberado":
      return "Listo: la tienda cobró. La plata salió por una de sus dos salidas.";
    case "devuelto":
      return "La tienda no registró el envío a tiempo y la plata volvió sola a quien compra: la otra salida.";
    case "en_disputa":
      return "Hay un reclamo abierto: la plata queda congelada hasta que decida el revisor.";
    case "resuelto":
      return "El revisor repartió la plata entre quien compra y la tienda.";
    default:
      return "Sigue el pedido en los dos celulares.";
  }
}

/** ¿Hay plata guardada en el contrato? Solo entonces tiene sentido intentar desviarla. */
export const hayPlataGuardada = (status: string | null) => status === "pagado" || status === "enviado" || status === "en_disputa";

/** Saca el error del contrato del texto crudo del host, p. ej. "Error(Contract, #12)". */
export function errorDelContrato(raw: string | undefined, code?: number): string | null {
  const m = raw?.match(/Error\(Contract, #\d+\)/);
  if (m) return m[0];
  return typeof code === "number" ? `Error(Contract, #${code})` : null;
}
