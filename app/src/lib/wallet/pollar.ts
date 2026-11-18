import type { WalletProvider, WalletRole } from "./types";

/** ¿Está configurado Pollar en este build? (NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY) */
export function pollarConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY);
}

/**
 * Punto de integración de Pollar (login con Google o email, billetera embebida, patrocinio).
 * Pendiente de la guía oficial (docs-pp/POLLAR.md). Mientras tanto la app usa LocalWallet.
 */
export class PollarWallet implements WalletProvider {
  readonly kind = "pollar" as const;
  constructor(readonly role: WalletRole) {}
  publicKey(): string | null {
    return null;
  }
  async connect(): Promise<string> {
    throw new Error("La billetera Pollar todavía no está integrada en esta versión");
  }
  async signTransaction(): Promise<string> {
    throw new Error("La billetera Pollar todavía no está integrada en esta versión");
  }
  async disconnect(): Promise<void> {}
}
