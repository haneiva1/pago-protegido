import { Keypair, hash } from "@stellar/stellar-sdk";

/**
 * SEP-53: firma de un mensaje con la cuenta Stellar. Se firma sha256("Stellar Signed Message:\n" + mensaje),
 * así que la firma no sirve como transacción. Pollar (`stellar.sep53.signMessage`) y Freighter firman lo mismo.
 * Sin dependencias de Node: lo usan el navegador (billetera local) y el servidor.
 */
export const PREFIJO_SEP53 = "Stellar Signed Message:\n";

export function hashSep53(mensaje: string): Uint8Array {
  return Uint8Array.from(hash(new TextEncoder().encode(PREFIJO_SEP53 + mensaje)));
}

/** Firma SEP-53 en base64. */
export function firmarSep53(kp: Keypair, mensaje: string): string {
  return btoa(String.fromCharCode(...kp.sign(hashSep53(mensaje))));
}

export function verificarSep53(cuenta: string, mensaje: string, firmaBase64: string): boolean {
  try {
    const firma = Uint8Array.from(atob(firmaBase64), (c) => c.charCodeAt(0));
    if (firma.length !== 64) return false;
    return Keypair.fromPublicKey(cuenta).verify(hashSep53(mensaje), firma);
  } catch {
    return false;
  }
}
