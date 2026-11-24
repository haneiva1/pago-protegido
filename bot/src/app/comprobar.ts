// Antes de atender WhatsApp real: la app responde, es de la red que dice la configuración y acepta la clave del bot.
// Un bot de testnet apuntado a mainnet (o al revés) diría "USD de prueba" de plata real.

import type { Red } from "../engine/messages.ts";
import { AppError, MissingEndpoint, type AppClient } from "./client.ts";

export async function comprobarApp(client: AppClient, red: Red, opts: { intentos?: number; esperaMs?: number } = {}): Promise<void> {
  const intentos = opts.intentos ?? 10;
  for (let i = 1; ; i++) {
    try {
      const real: Red = (await client.info()).red ?? "testnet";
      if (real !== red) throw new Distinta(`la app de PP_APP_URL corre en ${real} y el bot tiene STELLAR_NETWORK=${red}`);
      await client.changes(Date.now());
      return;
    } catch (e) {
      if (e instanceof Distinta) throw e;
      if (e instanceof AppError && e.status === 401) throw new Error("la app no acepta PP_BOT_KEY: tiene que ser la misma en la app y en el bot");
      if (e instanceof MissingEndpoint) throw new Error(`PP_APP_URL no es la app de Trato: no tiene ${e.path}`);
      if (i >= intentos) throw new Error(`la app de PP_APP_URL no responde (${e instanceof Error ? e.message : e})`);
      console.error(`[app] no responde (intento ${i} de ${intentos}):`, e instanceof Error ? e.message : e);
      await new Promise((r) => setTimeout(r, opts.esperaMs ?? 3_000));
    }
  }
}

class Distinta extends Error {}
