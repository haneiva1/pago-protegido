// lib/server/stellar.ts sin red: lo mismo que el real, salvo las llamadas a Horizon, RPC y friendbot.
export * from "../../../src/lib/server/stellar.ts?real";

/** `cuentas`: si es un Set, solo existen esas cuentas (si no, todas). `saldo`: lo que tiene cada cuenta. */
export const red = { conTrustline: true, rampas: [], cuentas: null, saldo: 1234n };

export async function horizonAccount(pubkey) {
  return !red.cuentas || red.cuentas.has(pubkey) ? { id: pubkey, balances: [] } : null;
}
/** `sinTrustline`: cuentas que no aceptan la moneda (la cuenta la pone horizonAccount en `id`). */
export function hasTrustline(acc) {
  return red.conTrustline && !red.sinTrustline?.has(acc?.id);
}
export async function ensureFunded() {}
export async function mintLabusd(to, units) {
  red.rampas.push({ to, units });
  return { hash: `rampa-${red.rampas.length}`, ledger: 1 };
}
export async function tokenBalance() {
  return red.saldo;
}

/** Lo que "entró en la red": cada transacción que la app mandó con fee bump. */
red.enviadas = [];
export async function feeBumpAndSend(inner) {
  const hash = Buffer.from(inner.hash()).toString("hex");
  red.enviadas.push(hash);
  return { hash, ledger: 1 };
}
