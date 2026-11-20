// lib/server/stellar.ts sin red: lo mismo que el real, salvo las llamadas a Horizon, RPC y friendbot.
export * from "../../../src/lib/server/stellar.ts?real";

export const red = { conTrustline: true, rampas: [] };

export async function horizonAccount(pubkey) {
  return { id: pubkey, balances: [] };
}
export function hasTrustline() {
  return red.conTrustline;
}
export async function ensureFunded() {}
export async function mintLabusd(to, units) {
  red.rampas.push({ to, units });
  return { hash: `rampa-${red.rampas.length}`, ledger: 1 };
}
export async function tokenBalance() {
  return 1234n;
}

/** Lo que "entró en la red": cada transacción que la app mandó con fee bump. */
red.enviadas = [];
export async function feeBumpAndSend(inner) {
  const hash = Buffer.from(inner.hash()).toString("hex");
  red.enviadas.push(hash);
  return { hash, ledger: 1 };
}
