import { enProbar } from "@/lib/probar";
import { ES_MAINNET } from "@/lib/red";
import { LocalWallet } from "./local";
import { PollarWallet, pollarConfigured } from "./pollar";
import type { PreparedTx, SubmitResult, WalletProvider, WalletRole } from "./types";

export type { PreparedTx, SubmitResult, WalletProvider, WalletRole };

/**
 * NEXT_PUBLIC_WALLET=local|pollar. Pollar requiere su publishable key; si falta, se usa la local.
 * En mainnet siempre es la local: Pollar Live exige billeteras de Turnkey y KYC (docs/MAINNET.md).
 * En /probar siempre es la local: cada rol con su cuenta de prueba, creada al vuelo en este navegador.
 */
export const WALLET_KIND: "local" | "pollar" =
  !ES_MAINNET && process.env.NEXT_PUBLIC_WALLET === "pollar" && pollarConfigured() && !enProbar() ? "pollar" : "local";

const cache = new Map<WalletRole, WalletProvider>();

export function getWallet(role: WalletRole): WalletProvider {
  let w = cache.get(role);
  if (!w) {
    // El comprador nunca ve un login: usa la llave local invisible. Pollar (Google/correo) es solo para el vendedor.
    w = WALLET_KIND === "pollar" && role === "vendedor" ? new PollarWallet(role) : new LocalWallet(role);
    cache.set(role, w);
  }
  return w;
}

export { api, ApiError } from "@/lib/api";
import { api } from "@/lib/api";

/**
 * Firma con la billetera lo que armó el servidor y lo envía; el servidor agrega el fee bump.
 * Si la acción tiene más pasos (p. ej. aprobar y liberar), los encadena.
 */
export async function signAndSubmit(
  wallet: WalletProvider,
  prepared: PreparedTx,
  onStep?: (label: string, hash?: string) => void,
): Promise<SubmitResult[]> {
  const done: SubmitResult[] = [];
  let cur: PreparedTx | undefined = prepared;
  while (cur) {
    onStep?.(cur.label);
    const signedXdr = await wallet.signTransaction(cur.xdr);
    const res: SubmitResult = await api<SubmitResult>("/api/tx/submit", { signedXdr });
    onStep?.(cur.label, res.hash);
    done.push(res);
    cur = res.next;
  }
  return done;
}

/** Cuenta nueva (friendbot en testnet; la plataforma en mainnet) + trustline a la moneda, firmada por el usuario. */
export async function activateWallet(wallet: WalletProvider, onStep?: (label: string, hash?: string) => void) {
  const pubkey = await wallet.connect();
  const r = await api<{ ready: boolean; prepared?: PreparedTx }>("/api/wallet/activate", { pubkey });
  if (r.prepared) await signAndSubmit(wallet, r.prepared, onStep);
  return pubkey;
}
