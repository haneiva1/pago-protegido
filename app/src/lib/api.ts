/**
 * Llamadas JSON a la API de la app. Módulo liviano (sin el SDK de la red) para que las páginas puedan leer datos
 * sin cargar `@/lib/wallet`, que se carga recién cuando hay que firmar.
 */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({ error: `Error ${res.status}` }));
  if (!res.ok) throw new ApiError(json.error ?? `Error ${res.status}`, res.status);
  return json as T;
}
