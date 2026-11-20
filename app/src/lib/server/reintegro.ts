// Devolución completa (H-4 de contracts/DECISIONES.md, interruptor PP_DEVOLUCION_COMPLETA).
//
// En una devolución total (refund_unshipped, o el revisor le da todo al comprador), Trustless Work descuenta del pago
// la comisión de Trato y la suya, y el comprador recupera menos de lo que pagó. Con el interruptor encendido, Trato le
// transfiere la diferencia desde la cuenta de la plataforma.
//
// Este módulo no habla con la red: recibe las funciones de red (`RedReintegro`) para poder probarlo sin testnet
// (test/reintegro.test.mjs). La parte que sí habla con la red está en reintegro-red.ts.
//
// Regla de oro: un reintegro por pedido, nunca dos.
// - `reintegros.order_slug` es la clave primaria: un pedido tiene a lo sumo una fila.
// - El sobre (transacción firmada) se guarda ANTES de enviarlo. Si la red falla, el siguiente intento primero averigua
//   qué pasó con ese sobre: si entró, se marca confirmado; si todavía puede entrar, se reenvía el MISMO sobre (mismo
//   número de secuencia: la red no lo aplica dos veces); solo si es seguro que nunca va a entrar se arma otro.
// - Si no se puede saber (pasó demasiado tiempo y el historial de la red podría haberlo olvidado), queda en `revisar`
//   y no se reintenta solo.
import type Database from "better-sqlite3";

/** Comisión fija de Trustless Work (0,3 %), igual que TW_FEE_BPS de lib/format.ts. */
const TW_FEE_BPS = 30n;
/** Tope de cordura: el reintegro nunca pasa del 5 % de lo pagado (hoy es 2,3 %). Si pasa, hay un error de datos. */
export const TOPE_REINTEGRO_BPS = 500n;
/** Margen sobre el vencimiento del sobre: después de esto la red ya no puede incluirlo. */
export const MARGEN_VENCE_MS = 60_000;
/** Si el sobre venció hace más que esto y la red no lo encuentra, no se adivina: se revisa a mano. */
export const VENTANA_HISTORIAL_MS = 12 * 3600_000;

export type EstadoReintegro = "pendiente" | "enviado" | "confirmado" | "revisar";

export interface FilaReintegro {
  order_slug: string;
  buyer: string;
  pagado_units: string;
  recibido_units: string;
  monto_units: string;
  /** Transacción de la devolución (refund_unshipped o resolve). */
  devolucion_hash: string;
  estado: EstadoReintegro;
  /** Sobre (fee bump) del último intento y hasta cuándo la red lo acepta (ms). */
  tx_hash: string | null;
  tx_xdr: string | null;
  tx_vence: number | null;
  intentos: number;
  error: string | null;
  created_at: number;
  updated_at: number;
  confirmado_at: number | null;
}

/**
 * Lo que pagó el comprador, lo que le devolvió el contrato y la diferencia. Igual que
 * `splitPreview(pagado, 10000, platformBps).buyer` de lib/format.ts (y que TW): con todo para el comprador, TW descuenta
 * floor(pagado × 0,3 %) y floor(pagado × comisión de la plataforma).
 */
export function calcularReintegro(pagado: bigint, platformBps: number) {
  if (pagado <= 0n) throw new Error("El monto pagado tiene que ser positivo");
  if (!Number.isInteger(platformBps) || platformBps < 0 || platformBps > 10000) throw new Error("Comisión de la plataforma inválida");
  const tw = (pagado * TW_FEE_BPS) / 10000n;
  const plataforma = (pagado * BigInt(platformBps)) / 10000n;
  const recibido = pagado - tw - plataforma;
  const monto = pagado - recibido;
  if (monto > (pagado * TOPE_REINTEGRO_BPS) / 10000n) throw new Error(`Reintegro fuera de rango (${monto} de ${pagado})`);
  return { pagado, recibido, monto, tw, plataforma };
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS reintegros (
  order_slug TEXT PRIMARY KEY,
  buyer TEXT NOT NULL,
  pagado_units TEXT NOT NULL,
  recibido_units TEXT NOT NULL,
  monto_units TEXT NOT NULL,
  devolucion_hash TEXT NOT NULL,
  estado TEXT NOT NULL,
  tx_hash TEXT,
  tx_xdr TEXT,
  tx_vence INTEGER,
  intentos INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  confirmado_at INTEGER
);
`;

const listas = new WeakSet<Database.Database>();
function tabla(db: Database.Database): Database.Database {
  if (!listas.has(db)) {
    db.exec(SCHEMA);
    listas.add(db);
  }
  return db;
}

export const reintegros = {
  get(db: Database.Database, slug: string): FilaReintegro | undefined {
    return tabla(db).prepare(`SELECT * FROM reintegros WHERE order_slug = ?`).get(slug) as FilaReintegro | undefined;
  },
  /** Los que todavía hay que pagar (o averiguar si se pagaron). */
  pendientes(db: Database.Database): FilaReintegro[] {
    return tabla(db).prepare(`SELECT * FROM reintegros WHERE estado IN ('pendiente', 'enviado') ORDER BY created_at ASC`).all() as FilaReintegro[];
  },
  /**
   * Registra el reintegro de un pedido después de su devolución total. Si ya existe, no hace nada (clave única por
   * pedido) y devuelve false.
   */
  registrar(
    db: Database.Database,
    r: { slug: string; buyer: string; pagado: bigint; platformBps: number; devolucionHash: string },
    now: number,
  ): boolean {
    const c = calcularReintegro(r.pagado, r.platformBps);
    const res = tabla(db)
      .prepare(
        `INSERT INTO reintegros (order_slug, buyer, pagado_units, recibido_units, monto_units, devolucion_hash, estado, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pendiente', ?, ?) ON CONFLICT(order_slug) DO NOTHING`,
      )
      .run(r.slug, r.buyer, c.pagado.toString(), c.recibido.toString(), c.monto.toString(), r.devolucionHash, now, now);
    return res.changes === 1;
  },
};

/** Lo que el reintegro necesita de la red. La implementación real está en reintegro-red.ts. */
export interface RedReintegro {
  /** Qué pasó con una transacción. Lanza si la red no responde: en ese caso no se hace nada. */
  consultar(hash: string): Promise<"confirmada" | "fallida" | "no_encontrada">;
  /** Arma y firma el pago al comprador (con fee bump), sin enviarlo. `vence`: hasta cuándo lo acepta la red (ms). */
  armar(buyer: string, monto: bigint): Promise<{ hash: string; xdr: string; vence: number }>;
  /** Envía un sobre ya firmado y espera la confirmación. Lanza si no se confirma. */
  enviar(xdr: string): Promise<void>;
  /** Serializa con las demás transacciones de la cuenta de la plataforma (número de secuencia). */
  serializar<T>(fn: () => Promise<T>): Promise<T>;
}

export interface ResultadoReintegro {
  fila: FilaReintegro | undefined;
  /** true solo para la llamada que lo confirmó (para registrar la transacción una sola vez). */
  recienConfirmado: boolean;
}

/** Marca confirmado una sola vez (compare-and-set); `alConfirmar` corre en la misma transacción de SQLite. */
function confirmar(db: Database.Database, slug: string, hash: string, now: number, alConfirmar?: (f: FilaReintegro) => void): boolean {
  return db.transaction(() => {
    const res = db
      .prepare(
        `UPDATE reintegros SET estado = 'confirmado', tx_hash = ?, error = NULL, confirmado_at = ?, updated_at = ? WHERE order_slug = ? AND estado != 'confirmado'`,
      )
      .run(hash, now, now, slug);
    if (res.changes !== 1) return false;
    alConfirmar?.(reintegros.get(db, slug)!);
    return true;
  })();
}

function anotarError(db: Database.Database, slug: string, e: unknown, now: number) {
  const msg = e instanceof Error ? e.message : String(e);
  db.prepare(`UPDATE reintegros SET error = ?, updated_at = ? WHERE order_slug = ? AND estado != 'confirmado'`).run(msg.slice(0, 500), now, slug);
}

/**
 * Paga (o termina de pagar) el reintegro de un pedido sin pagar dos veces. Idempotente: se puede llamar cuantas veces
 * se quiera, también después de un error de red o de un reinicio del servidor.
 */
export async function pagarReintegro(
  db: Database.Database,
  slug: string,
  red: RedReintegro,
  opts: { now?: () => number; alConfirmar?: (f: FilaReintegro) => void } = {},
): Promise<ResultadoReintegro> {
  const now = opts.now ?? Date.now;
  const r = reintegros.get(db, slug);
  if (!r || r.estado === "confirmado" || r.estado === "revisar") return { fila: r, recienConfirmado: false };
  const listo = (hash: string): ResultadoReintegro => {
    const recien = confirmar(db, slug, hash, now(), opts.alConfirmar);
    return { fila: reintegros.get(db, slug), recienConfirmado: recien };
  };

  try {
    // 1. Hay un sobre de un intento anterior: primero averiguar qué pasó con él. Nunca se arma otro sin saberlo.
    if (r.tx_hash) {
      const st = await red.consultar(r.tx_hash);
      if (st === "confirmada") return listo(r.tx_hash);
      if (st === "no_encontrada") {
        const vence = r.tx_vence ?? 0;
        if (now() <= vence + MARGEN_VENCE_MS) {
          // Todavía puede entrar: se reenvía el MISMO sobre (la red no aplica dos veces la misma secuencia).
          await red.serializar(() => red.enviar(r.tx_xdr!));
          return listo(r.tx_hash);
        }
        if (now() > vence + VENTANA_HISTORIAL_MS) {
          db.prepare(`UPDATE reintegros SET estado = 'revisar', error = ?, updated_at = ? WHERE order_slug = ? AND estado != 'confirmado'`).run(
            `El sobre ${r.tx_hash} venció hace más de ${VENTANA_HISTORIAL_MS / 3600_000} h y la red no lo encuentra: revisar a mano antes de pagar`,
            now(),
            slug,
          );
          return { fila: reintegros.get(db, slug), recienConfirmado: false };
        }
        // Venció y la red no lo tiene: ya nunca va a entrar. Se puede armar otro.
      }
      // "fallida": falló al aplicarse y no movió plata. Se puede armar otro.
    }

    // 2. Armar, GUARDAR el sobre y recién enviarlo, todo en orden con las demás transacciones de la plataforma.
    return await red.serializar(async () => {
      const sobre = await red.armar(r.buyer, BigInt(r.monto_units));
      // Compare-and-set sobre el sobre anterior: si otro proceso ya tomó este reintegro, no se envía nada.
      const res = db
        .prepare(
          `UPDATE reintegros SET estado = 'enviado', tx_hash = ?, tx_xdr = ?, tx_vence = ?, intentos = intentos + 1, error = NULL, updated_at = ?
           WHERE order_slug = ? AND estado IN ('pendiente', 'enviado') AND tx_hash IS ?`,
        )
        .run(sobre.hash, sobre.xdr, sobre.vence, now(), slug, r.tx_hash);
      if (res.changes !== 1) throw new Error("Otro proceso está pagando este reintegro");
      await red.enviar(sobre.xdr);
      return listo(sobre.hash);
    });
  } catch (e) {
    anotarError(db, slug, e, now());
    throw e;
  }
}
