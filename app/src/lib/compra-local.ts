/**
 * El pago a medias vive en este navegador: quien empezó a pagar y volvió (recargó, pasó por su banco, cerró la pestaña)
 * sigue en el QR con los datos que ya dejó. No guarda nada que firme ni mueva plata: solo los datos de entrega y la
 * cuenta pública con la que empezó. La lógica pura la prueban los tests unitarios (app/test/compra-local.test.mjs).
 */

export interface DatosEntrega {
  recipient: string;
  city: string;
  agency: string;
  whatsapp?: string;
  /** Teléfono de quien recoge (las empresas lo piden para entregar). */
  pickupPhone?: string;
  /** "incluido" | "por_pagar" | "aparte" (con fleteBs). */
  flete?: string;
  fleteBs?: string;
}

export interface CompraLocal {
  datos: DatosEntrega;
  /** Cuenta pública con la que se empezó a pagar (null si todavía no tocó pagar). */
  cuenta: string | null;
  t: number;
}

/** Pasado un día, un pago a medias ya no se retoma solo: se vuelve a mostrar el link con los datos precargados. */
export const VIGENCIA_MS = 24 * 3_600_000;

export function leerCompraDeTexto(texto: string | null, ahora: number): CompraLocal | null {
  try {
    const c = JSON.parse(texto ?? "") as CompraLocal;
    if (!c?.datos?.recipient || !c.datos.city || typeof c.t !== "number" || ahora - c.t > VIGENCIA_MS) return null;
    return { datos: { ...c.datos, agency: c.datos.agency ?? "" }, cuenta: c.cuenta ?? null, t: c.t };
  } catch {
    return null;
  }
}

/** libre: se puede pagar · mio: lo empezó este navegador · cargando: todavía no se sabe · ajeno: lo empezó otro navegador. */
export type Intento = "libre" | "mio" | "cargando" | "ajeno";

/**
 * De quién es el pago que está en curso. Mientras no se sabe qué cuenta hay en este navegador (`yo` undefined) nunca es
 * "ajeno": antes, al volver al link, quien ya había empezado veía que lo pagaba otra persona.
 */
export function intentoDePago(x: { comprador: string | null | undefined; yo: string | null | undefined; guardada?: string | null; hasta?: number | null; ahora: number }): Intento {
  if (!x.comprador) return "libre";
  if (x.comprador === x.yo || x.comprador === x.guardada) return "mio";
  if (x.yo === undefined) return "cargando";
  if (x.hasta != null && x.hasta <= x.ahora) return "libre";
  return "ajeno";
}

const clave = (slug: string) => `trato.compra.${slug}`;
const CLAVE_ENTREGA = "trato.entrega";

const lee = (k: string): string | null => {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
};
const guarda = (k: string, v: string | null) => {
  try {
    if (v === null) window.localStorage.removeItem(k);
    else window.localStorage.setItem(k, v);
  } catch {
    /* sin almacenamiento: se sigue igual, solo que no se recuerda */
  }
};

export const leerCompra = (slug: string) => leerCompraDeTexto(lee(clave(slug)), Date.now());

export function guardarCompra(slug: string, datos: DatosEntrega, cuenta: string | null) {
  guarda(clave(slug), JSON.stringify({ datos, cuenta, t: Date.now() } satisfies CompraLocal));
  guarda(CLAVE_ENTREGA, JSON.stringify({ recipient: datos.recipient, city: datos.city }));
}

export const borrarCompra = (slug: string) => guarda(clave(slug), null);

/** Nombre y ciudad de la última compra en este celular, para no volver a escribirlos. */
export function leerEntrega(): { recipient: string; city: string } | null {
  try {
    const e = JSON.parse(lee(CLAVE_ENTREGA) ?? "") as { recipient?: string; city?: string };
    return e?.recipient && e.city ? { recipient: e.recipient, city: e.city } : null;
  } catch {
    return null;
  }
}
