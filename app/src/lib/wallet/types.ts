/** Rol de la billetera en este navegador. Cada rol tiene su propia llave. */
export type WalletRole = "vendedor" | "comprador";

/** Transacción armada por el servidor para que la firme la billetera del usuario. */
export interface PreparedTx {
  xdr: string;
  hash: string;
  action: string;
  step: string;
  label: string;
}

export interface SubmitResult {
  hash: string;
  next?: PreparedTx;
}

/**
 * Billetera del usuario (SPEC §5). La llave nunca sale del dispositivo:
 * el servidor arma la transacción, la billetera la firma y el servidor la envuelve
 * en un fee bump de la plataforma.
 * - LocalWallet: keypair en localStorage (MVP y e2e). NEXT_PUBLIC_WALLET=local
 * - PollarWallet: login con Google o email y billetera embebida. NEXT_PUBLIC_WALLET=pollar
 */
export interface WalletProvider {
  readonly kind: "local" | "pollar";
  readonly role: WalletRole;
  /** Dirección pública (G…) o null si todavía no hay billetera. */
  publicKey(): string | null;
  /** Crea la billetera (local) o inicia sesión (Pollar). Devuelve la dirección. */
  connect(): Promise<string>;
  /** Firma una transacción (XDR base64) y devuelve el XDR firmado. */
  signTransaction(xdr: string): Promise<string>;
  /** Firma un mensaje (SEP-53) y devuelve la firma en base64: prueba que la cuenta es tuya (lib/api-firmada.ts). */
  signMessage(mensaje: string): Promise<string>;
  /** Borra la billetera de este dispositivo / cierra sesión. */
  disconnect(): Promise<void>;
}
