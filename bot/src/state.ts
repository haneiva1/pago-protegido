// Estado del bot en un archivo (BOT_STATE_FILE). Se escribe entero en un temporal y se renombra: un corte a mitad de
// la escritura no lo rompe. Si no se puede leer o escribir, el bot sigue en memoria y lo dice en el registro.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { OutboxState } from "./notify/outbox.ts";
import type { PollerState } from "./notify/poller.ts";

export interface Saved {
  /** A qué instancia de la app pertenece ("testnet|https://…"). */
  instancia?: string;
  poller?: PollerState;
  phoneLinks?: Record<string, string>;
  greeted?: string[];
  outbox?: OutboxState;
}

export function leerEstado(file: string): Saved {
  if (!file || !existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Saved;
  } catch (e) {
    console.error(`[estado] no pude leer ${file}; queda como ${file}.roto y se empieza de cero:`, e instanceof Error ? e.message : e);
    try {
      renameSync(file, `${file}.roto`);
    } catch {
      /* sin permiso para renombrarlo */
    }
    return {};
  }
}

let avisado = false;
export function guardarEstado(file: string, s: Saved): void {
  if (!file) return;
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(`${file}.tmp`, JSON.stringify(s, null, 2));
    renameSync(`${file}.tmp`, file);
    avisado = false;
  } catch (e) {
    if (!avisado) console.error(`[estado] no pude guardar ${file}: al reiniciar se pierden los avisos guardados.`, e instanceof Error ? e.message : e);
    avisado = true;
  }
}

/**
 * Si el estado es de otra instancia de la app (testnet y mainnet, por ejemplo), sus pedidos, tiendas y avisos no
 * valen. Solo quedan las ventanas de 24 horas, que son del número de WhatsApp. Un estado viejo, sin instancia, se acepta.
 */
export function estadoDe(saved: Saved, instancia: string): Saved {
  if (!saved.instancia || saved.instancia === instancia) return saved;
  console.log(`[estado] era de ${saved.instancia}; para ${instancia} se empieza de cero`);
  return { outbox: { ventanas: saved.outbox?.ventanas ?? {}, pendientes: {} } };
}
