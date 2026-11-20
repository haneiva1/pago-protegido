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
 * Llamada a la API que prueba que la cuenta es tuya (lib/server/firma.ts):
 * pide un desafío de un solo uso para esta ruta, lo firma con la cuenta de ese rol (SEP-53: billetera local o
 * Pollar) y lo manda en el header `x-trato-firma`. Cada llamada usa un desafío nuevo.
 */
export async function apiFirmada<T = unknown>(
  wallet: WalletProvider,
  path: string,
  body?: unknown,
  method: "GET" | "POST" | "PATCH" = body === undefined ? "GET" : "POST",
): Promise<T> {
  const cuenta = wallet.publicKey();
  if (!cuenta) throw new ApiFirmadaError("Primero entra con tu cuenta en este dispositivo", 401);
  const ruta = path.split("?")[0];
  const d = await api<{ nonce: string; mensaje: string }>("/api/firma/desafio", { cuenta, metodo: method, ruta });
  const firma = await wallet.signMessage(d.mensaje);
  const res = await fetch(path, {
    method,
    // Desde /probar va su header, como en `api`: plazos de demo y su límite por IP.
    headers: { "content-type": "application/json", ...(enProbar() ? { [PROBAR_HEADER]: "1" } : {}), "x-trato-firma": `${cuenta}.${d.nonce}.${firma}` },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({ error: `Error ${res.status}` }));
  if (!res.ok) throw new ApiFirmadaError(json.error ?? `Error ${res.status}`, res.status);
  return json as T;
}
