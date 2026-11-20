import type { WalletRole } from "./types";

/** Dónde guarda la cuenta local cada rol (localStorage). Sin dependencias: sirve para saber si hay cuenta sin cargar el SDK. */
export const storageKey = (role: WalletRole) => `pp.billetera.${role}`;

/** ¿Este navegador ya tiene la cuenta de este rol? */
export function hayCuentaGuardada(role: WalletRole): boolean {
  try {
    return typeof window !== "undefined" && Boolean(window.localStorage.getItem(storageKey(role)));
  } catch {
    return false;
  }
}
