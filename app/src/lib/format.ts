// Utilidades compartidas entre servidor y navegador (sin dependencias de Node).

export const UNITS = 10_000_000n; // LABUSD tiene 7 decimales
export const TW_FEE_BPS = 30n; // 0,3 % fijo en el contrato de Trustless Work
export const EXPLORER = "https://stellar.expert/explorer/testnet";

export const explorer = {
  tx: (hash: string) => `${EXPLORER}/tx/${hash}`,
  contract: (id: string) => `${EXPLORER}/contract/${id}`,
  account: (id: string) => `${EXPLORER}/account/${id}`,
};

const nf2 = new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function unitsToNumber(units: string | bigint): number {
  const u = BigInt(units);
  return Number(u / UNITS) + Number(u % UNITS) / 1e7;
}

/** "38,46" (USD de prueba, 2 decimales para mostrar) */
export function fmtUsd(units: string | bigint): string {
  return nf2.format(unitsToNumber(units));
}

/** "Bs 450,00" */
export function fmtBs(cents: number): string {
  return `Bs ${nf2.format(cents / 100)}`;
}

/** Monto de la operación de pago clásica: "38.4615385" */
export function unitsToAmountString(units: bigint): string {
  return `${units / UNITS}.${(units % UNITS).toString().padStart(7, "0")}`;
}

export function bsToUnits(priceBsCents: number, fx: number): bigint {
  return BigInt(Math.round((priceBsCents / 100 / fx) * 1e7));
}

/** Reparto del caso feliz, igual que FeeCalculator del contrato (división entera). */
export function releaseBreakdown(amount: bigint, platformBps: number) {
  const tw = (amount * TW_FEE_BPS) / 10000n;
  const platform = (amount * BigInt(platformBps)) / 10000n;
  return { tw, platform, seller: amount - tw - platform };
}

/** Vista previa del reparto del árbitro, igual que calculate_and_distribute_fees. */
export function splitPreview(balance: bigint, buyerBps: number, platformBps: number) {
  // Igual que pp_arbiter (D-8): seller = floor(saldo × (10000 − bps) / 10000); el resto, al comprador.
  const sellerGross = (balance * BigInt(10000 - buyerBps)) / 10000n;
  const buyerGross = balance - sellerGross;
  return splitFromGross(balance, buyerGross, sellerGross, platformBps);
}

/** Netos de cada parte a partir de los brutos del reparto (comisiones por destinatario, como TW). */
export function splitFromGross(balance: bigint, buyerGross: bigint, sellerGross: bigint, platformBps: number) {
  const twTotal = (balance * TW_FEE_BPS) / 10000n;
  const pfTotal = (balance * BigInt(platformBps)) / 10000n;
  const part = (gross: bigint) => {
    if (balance === 0n || gross === 0n) return { gross, tw: 0n, platform: 0n, net: 0n };
    const tw = (gross * twTotal) / balance;
    const platform = (gross * pfTotal) / balance;
    return { gross, tw, platform, net: gross - tw - platform };
  };
  return { buyer: part(buyerGross), seller: part(sellerGross) };
}

export type OrderStatus = "esperando_pago" | "pagado" | "enviado" | "liberado" | "en_disputa" | "resuelto" | "devuelto";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  esperando_pago: "Esperando pago",
  pagado: "Pagado (despacha)",
  enviado: "Enviado",
  liberado: "Liberado",
  en_disputa: "En disputa",
  resuelto: "Resuelto",
  devuelto: "Devuelto (no se despachó)",
};

export function fmtDate(ms: number | null | undefined): string {
  if (!ms) return "";
  return new Intl.DateTimeFormat("es-BO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/La_Paz",
  }).format(new Date(ms));
}

/**
 * Pesos con coma en pantalla: "1.2 kg" → "1,2 kg" (también dentro de un texto más largo o de la evidencia compacta
 * "empresa|guía|1.2kg|…"). Un número o null se devuelven como texto.
 */
export function fmtKg(v: string | number | null | undefined): string {
  if (v == null) return "";
  return String(v).replace(/(\d)\.(\d+)(\s?kg\b)/gi, "$1,$2$3");
}

export function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}

// ---------- Ronda 6: producto v2 ----------

/** "Bs 456,75" a partir de unidades de 7 decimales y el tipo de cambio del pedido. */
export function fmtBsUnits(units: string | bigint, fx: number): string {
  return `Bs ${nf2.format(unitsToNumber(units) * fx)}`;
}

export const CIUDADES = ["La Paz", "El Alto", "Cochabamba", "Santa Cruz", "Oruro", "Potosí", "Sucre", "Tarija", "Trinidad", "Cobija", "Otra"] as const;
export const CATEGORIAS = ["Celular", "Electrónica", "Ropa y calzado", "Otro"] as const;
export const EMPRESAS = [
  "Trans Copacabana (encomiendas)",
  "Bolívar (encomiendas)",
  "El Dorado (encomiendas)",
  "Correos de Bolivia",
  "Courier privado",
  "Otra flota",
  "Entrega en persona",
] as const;
/** Motivos de reclamo (política de reclamos) + presión para confirmar. */
export const MOTIVOS = ["No envió", "No llegó", "Llegó vacío o con otro producto", "Dañado o distinto a lo descrito", "Presión para confirmar"] as const;
export const MOTIVO_PRESION = "Presión para confirmar";
/** Motivos (c) y (d): exigen video continuo del desempaque desde Bs 300. */
export const MOTIVOS_CON_VIDEO = ["Llegó vacío o con otro producto", "Dañado o distinto a lo descrito"];

export type FeePayer = "comprador" | "vendedor";
export const PROTECCION = { pct: 1.5, minBs: 5, maxBs: 50 };
export const DOLLAR_NOTE = "Se guarda en dólares digitales (en producción, USDC, 1 a 1 con el dólar; en esta práctica, dólares de prueba).";

/**
 * Montos de un link según quién paga la protección.
 * - "vendedor" (la regala): el comprador paga el precio; el escrow descuenta 2% de plataforma y 0,3% de TW.
 * - "comprador" (por defecto): el comprador paga precio + protección (1,5%, mín. Bs 5, máx. Bs 50). El escrow usa
 *   un platform_fee propio para que, después del 0,3% de TW y de la plataforma, el vendedor reciba el precio completo.
 */
export function linkAmounts(priceBsCents: number, fx: number, feePayer: FeePayer) {
  const price = bsToUnits(priceBsCents, fx);
  if (feePayer === "vendedor") return { price, amount: price, platformBps: 200, protectionBsCents: 0 };
  const protBs = Math.min(PROTECCION.maxBs, Math.max(PROTECCION.minBs, (priceBsCents / 100) * (PROTECCION.pct / 100)));
  const protectionBsCents = Math.round(protBs * 100);
  let amount = price + bsToUnits(protectionBsCents, fx);
  let tw = (amount * TW_FEE_BPS) / 10000n;
  if (amount - tw - price < 0n) {
    amount = (price * 10000n) / 9970n + 1n; // la protección no alcanza a cubrir el 0,3% de TW
    tw = (amount * TW_FEE_BPS) / 10000n;
  }
  const platformBps = Number(((amount - tw - price) * 10000n) / amount); // floor: el vendedor nunca recibe menos que el precio
  return { price, amount, platformBps, protectionBsCents };
}

/** Porcentaje para pantallas: sin "100 %" (lista de palabras prohibidas); en los extremos se dice con palabras. */
export function fmtPct(x: number): string {
  return x >= 100 ? "todo" : x <= 0 ? "nada" : `${x.toLocaleString("es-BO")}%`;
}
