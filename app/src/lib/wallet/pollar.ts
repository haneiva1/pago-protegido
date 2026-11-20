import type { WalletProvider, WalletRole } from "./types";

/** ¿Está configurado Pollar en este build? (NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY) */
export function pollarConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY);
}

/**
 * Lo que expone usePollar() de @pollar/react, capturado por <PollarBridge/> (components/PollarProviders.tsx).
 * Así la billetera Pollar cumple la misma interfaz WalletProvider que la local.
 */
export interface PollarBridgeState {
  isAuthenticated: boolean;
  address: string | null;
  openLoginModal: () => void;
  logout: () => void;
  signTx: (xdr: string) => Promise<unknown>;
  /** `client.stellar.sep53.signMessage` de @pollar/core. */
  signMessage: (mensaje: string) => Promise<unknown>;
}

let state: PollarBridgeState | null = null;

export function setPollarState(s: PollarBridgeState | null) {
  state = s;
}

function waitFor<T>(get: () => T | null | undefined, timeoutMs: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      const v = get();
      if (v) return resolve(v);
      if (Date.now() - t0 > timeoutMs) return reject(new Error(what));
      setTimeout(tick, 300);
    };
    tick();
  });
}

/**
 * Billetera Pollar: login con Google o email y billetera embebida.
 * - Firma con `getClient().signTx(xdr, { skipSponsorship: true })`: Pollar firma (server-side en una billetera
 *   administrada) y nos devuelve el XDR; el patrocinio lo hace nuestra plataforma con el fee bump, igual que con
 *   la billetera local, así el flujo y la tabla `pending` no cambian.
 * - Pollar maneja una sola billetera por usuario: el rol (vendedor/comprador) no cambia la cuenta.
 */
export class PollarWallet implements WalletProvider {
  readonly kind = "pollar" as const;
  constructor(readonly role: WalletRole) {}

  publicKey(): string | null {
    return state?.address ?? null;
  }

  async connect(): Promise<string> {
    const s = await waitFor(() => state, 15_000, "Pollar no cargó. Recarga la página.");
    if (s.address) return s.address;
    if (!s.isAuthenticated) s.openLoginModal();
    return waitFor(() => state?.address, 5 * 60_000, "No se completó el ingreso con Pollar");
  }

  async signTransaction(xdr: string): Promise<string> {
    if (!state) throw new Error("Primero ingresa con tu cuenta");
    const out = (await state.signTx(xdr)) as { status?: string; signedXdr?: string; code?: string; details?: string } | null;
    if (out?.status === "signed" && out.signedXdr) return out.signedXdr;
    if (out?.status === "cosign_pending") throw new Error("La firma quedó pendiente de aprobación en Pollar");
    throw new Error(`Pollar no firmó la transacción${out?.details ? `: ${out.details}` : out?.code ? ` (${out.code})` : ""}`);
  }

  /** SEP-53 con la cuenta de Pollar (firma en su servidor, sin enviar nada a la red). */
  async signMessage(mensaje: string): Promise<string> {
    if (!state) throw new Error("Primero ingresa con tu cuenta");
    const out = (await state.signMessage(mensaje)) as { status?: string; signature?: string; details?: string } | null;
    if (out?.status === "signed" && out.signature) return out.signature;
    throw new Error(`Pollar no pudo confirmar que la cuenta es tuya${out?.details ? `: ${out.details}` : ""}`);
  }

  async disconnect(): Promise<void> {
    state?.logout();
  }
}
