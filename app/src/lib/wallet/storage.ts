import { enProbar, probarStorageKey } from "@/lib/probar";
import type { WalletRole } from "./types";

/**
 * Un link que se empezó a pagar dentro de /probar y se abre suelto, en el mismo celular: el comprador sigue con la cuenta
 * con la que empezó. Solo el rol comprador, y solo mientras dura esa página (cuentaDeEsteNavegador en lib/wallet).
 */
let compradorDeProbar = false;
export const usarCompradorDeProbar = (si: boolean) => {
  compradorDeProbar = si;
};

/**
 * Dónde guarda la cuenta local cada rol (localStorage). Sin dependencias: sirve para saber si hay cuenta sin cargar el SDK.
 * En /probar y en sus marcos, cada rol usa una cuenta de prueba aparte, para no mezclarla con la de la app.
 */
export const storageKey = (role: WalletRole) =>
  enProbar() || (role === "comprador" && compradorDeProbar) ? probarStorageKey(role) : `pp.billetera.${role}`;

/** ¿Este navegador ya tiene la cuenta de este rol? */
export function hayCuentaGuardada(role: WalletRole): boolean {
  try {
    return typeof window !== "undefined" && Boolean(window.localStorage.getItem(storageKey(role)));
  } catch {
    return false;
  }
}

/** ¿Este navegador tiene alguna cuenta de comprador, de la app o de /probar? */
export function hayAlgunComprador(): boolean {
  try {
    return hayCuentaGuardada("comprador") || Boolean(window.localStorage.getItem(probarStorageKey("comprador")));
  } catch {
    return false;
  }
}
