import { enProbar, probarStorageKey } from "@/lib/probar";
import type { WalletRole } from "./types";

/**
 * Dónde guarda la cuenta local cada rol (localStorage). Sin dependencias: sirve para saber si hay cuenta sin cargar el SDK.
 * En /probar y en sus marcos, cada rol usa una cuenta de prueba aparte, para no mezclarla con la de la app.
 */
export const storageKey = (role: WalletRole) => (enProbar() ? probarStorageKey(role) : `pp.billetera.${role}`);

/** ¿Este navegador ya tiene la cuenta de este rol? */
export function hayCuentaGuardada(role: WalletRole): boolean {
  try {
    return typeof window !== "undefined" && Boolean(window.localStorage.getItem(storageKey(role)));
  } catch {
    return false;
  }
}
