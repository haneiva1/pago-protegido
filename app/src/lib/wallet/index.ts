import { LocalWallet } from "./local";
import { PollarWallet, pollarConfigured } from "./pollar";
import type { PreparedTx, SubmitResult, WalletProvider, WalletRole } from "./types";

export type { PreparedTx, SubmitResult, WalletProvider, WalletRole };

/** NEXT_PUBLIC_WALLET=local|pollar. Pollar requiere su publishable key; si falta, se usa la local. */
export const WALLET_KIND: "local" | "pollar" =
  process.env.NEXT_PUBLIC_WALLET === "pollar" && pollarConfigured() ? "pollar" : "local";

const cache = new Map<WalletRole, WalletProvider>();

export function getWallet(role: WalletRole): WalletProvider {
  let w = cache.get(role);
  if (!w) {
    w = WALLET_KIND === "pollar" ? new PollarWallet(role) : new LocalWallet(role);
    cache.set(role, w);
  }
  return w;
}

export async function api<T = unknown>(path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({ error: `Error ${res.status}` }));
  if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
  return json as T;
}

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

/** Cuenta nueva en testnet (friendbot) + trustline a la moneda de prueba, firmada por el usuario. */
export async function activateWallet(wallet: WalletProvider, onStep?: (label: string, hash?: string) => void) {
  const pubkey = await wallet.connect();
  const r = await api<{ ready: boolean; prepared?: PreparedTx }>("/api/wallet/activate", { pubkey });
  if (r.prepared) await signAndSubmit(wallet, r.prepared, onStep);
  return pubkey;
}
