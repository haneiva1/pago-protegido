// Liviano: sin el SDK de la red, para que la página del comprador lo importe sin cargar `@/lib/wallet` al abrir.
import { api } from "@/lib/api";
import { PROBAR_HEADER, enProbar } from "@/lib/probar";
import type { WalletProvider } from "@/lib/wallet/types";

/** La API respondió con error en una llamada firmada (`status` 401: firma; 403: otra cuenta). */
export class ApiFirmadaError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Valor del header `x-trato-firma` para una llamada (lib/server/firma.ts): pide un desafío de un solo uso para esta
 * ruta y lo firma con la cuenta de ese rol (SEP-53: billetera local o Pollar). Sirve una sola vez.
 */
export async function headerFirma(wallet: WalletProvider, method: "GET" | "POST" | "PATCH", path: string): Promise<string> {
  const cuenta = wallet.publicKey();
  if (!cuenta) throw new ApiFirmadaError("Primero entra con tu cuenta en este dispositivo", 401);
  const d = await api<{ nonce: string; mensaje: string }>("/api/firma/desafio", { cuenta, metodo: method, ruta: path.split("?")[0] });
  return `${cuenta}.${d.nonce}.${await wallet.signMessage(d.mensaje)}`;
}

/**
 * Llamada a la API que prueba que la cuenta es tuya: lleva el header de `headerFirma`, con un desafío nuevo en cada
 * llamada.
 */
export async function apiFirmada<T = unknown>(
  wallet: WalletProvider,
  path: string,
  body?: unknown,
  method: "GET" | "POST" | "PATCH" = body === undefined ? "GET" : "POST",
): Promise<T> {
  const firma = await headerFirma(wallet, method, path);
  const res = await fetch(path, {
    method,
    // Desde /probar va su header, como en `api`: plazos de demo y su límite por IP.
    headers: { "content-type": "application/json", ...(enProbar() ? { [PROBAR_HEADER]: "1" } : {}), "x-trato-firma": firma },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({ error: `Error ${res.status}` }));
  if (!res.ok) throw new ApiFirmadaError(json.error ?? `Error ${res.status}`, res.status);
  return json as T;
}
