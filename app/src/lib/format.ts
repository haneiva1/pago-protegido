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
  const buyerGross = (balance * BigInt(buyerBps)) / 10000n;
  const sellerGross = balance - buyerGross;
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

export type OrderStatus = "esperando_pago" | "pagado" | "enviado" | "liberado" | "en_disputa" | "resuelto";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  esperando_pago: "Esperando pago",
  pagado: "Pagado (despacha)",
  enviado: "Enviado",
  liberado: "Liberado",
  en_disputa: "En disputa",
  resuelto: "Resuelto",
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

export function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}
