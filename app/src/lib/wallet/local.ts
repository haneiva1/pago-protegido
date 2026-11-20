import { Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import { firmarSep53 } from "@/lib/sep53";
import type { WalletProvider, WalletRole } from "./types";

const storageKey = (role: WalletRole) => `pp.billetera.${role}`;

/**
 * Billetera local: un keypair generado en el navegador y guardado en localStorage.
 * La llave secreta nunca se envía al servidor; solo viaja el XDR firmado.
 */
export class LocalWallet implements WalletProvider {
  readonly kind = "local" as const;
  constructor(readonly role: WalletRole) {}

  private secret(): string | null {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(storageKey(this.role));
  }

  publicKey(): string | null {
    const s = this.secret();
    return s ? Keypair.fromSecret(s).publicKey() : null;
  }

  async connect(): Promise<string> {
    const existing = this.publicKey();
    if (existing) return existing;
    const kp = Keypair.random();
    window.localStorage.setItem(storageKey(this.role), kp.secret());
    return kp.publicKey();
  }

  async signTransaction(xdr: string): Promise<string> {
    const s = this.secret();
    if (!s) throw new Error("No hay billetera en este dispositivo");
    const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET);
    // Las invocaciones usan al usuario como cuenta de origen, así que su firma de la
    // transacción cubre también la autorización de Soroban (credenciales de cuenta de origen).
    tx.sign(Keypair.fromSecret(s));
    return tx.toXDR();
  }

  async signMessage(mensaje: string): Promise<string> {
    const s = this.secret();
    if (!s) throw new Error("No hay una cuenta en este dispositivo");
    return firmarSep53(Keypair.fromSecret(s), mensaje);
  }

  async disconnect(): Promise<void> {
    window.localStorage.removeItem(storageKey(this.role));
  }
}
