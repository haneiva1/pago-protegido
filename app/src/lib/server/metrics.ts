import { rpc, scValToNative } from "@stellar/stellar-sdk";
import { RETIRED_V1, cfg } from "./config";
import { db, kv } from "./db";
import { server, withLock } from "./stellar";

/**
 * Métricas públicas de Pago Protegido calculadas SOLO con eventos on-chain de pp_guardian y pp_arbiter
 * (pago-protegido/docs/METRICAS.md). Los eventos se ingieren de forma incremental a SQLite porque el RPC
 * público solo guarda unos 7 días; la referencia de las reglas es contracts/scripts/metricas.sh.
 */

/** Ledger del despliegue de los contratos (contracts/deployments/testnet.json). */
export const DEPLOY_LEDGER = 5790662;
/** Cursor propio de v1+v2: con el filtro nuevo se vuelve a leer desde el inicio (los repetidos se ignoran). */
const CURSOR_KEY = "events:cursor:v1v2";
const PAGE = 200;

export interface PpEvent {
  id: string;
  kind: string;
  escrow: string | null;
  ledger: number;
  closed_at: string;
  tx_hash: string;
  data: Record<string, unknown>;
}

const toJson = (v: unknown) => JSON.stringify(v ?? null, (_k, x) => (typeof x === "bigint" ? x.toString() : x));

/** Trae los eventos nuevos (con un candado y como mucho una vez cada 15 s). */
export async function ingestEvents(force = false): Promise<{ added: number; latestLedger: number }> {
  return withLock("ingest-events", async () => {
    const lastRun = Number(kv.get("events:last_run") ?? 0);
    if (!force && Date.now() - lastRun < 15_000) return { added: 0, latestLedger: Number(kv.get("events:latest") ?? 0) };
    const c = cfg();
    // v2 (compras nuevas) + v1 (historial): docs/METRICAS.md lee los dos.
    const ids = [...new Set([c.guardianId!, c.arbiterId!, RETIRED_V1.guardian, RETIRED_V1.arbiter])];
    const filters: rpc.Api.EventFilter[] = [{ type: "contract", contractIds: ids }];
    const s = server();
    const insert = db().prepare(
      `INSERT OR IGNORE INTO pp_events (id, kind, escrow, ledger, closed_at, tx_hash, data_json) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    let cursor = kv.get(CURSOR_KEY);
    let added = 0;
    let latest = 0;
    for (let page = 0; page < 100; page++) {
      let res: rpc.Api.GetEventsResponse;
      try {
        if (cursor) {
          res = await s.getEvents({ filters, cursor, limit: PAGE });
        } else {
          const { oldestLedger } = await s.getHealth();
          res = await s.getEvents({ filters, startLedger: Math.max(DEPLOY_LEDGER, oldestLedger), limit: PAGE });
        }
      } catch (e) {
        // Cursor fuera de la ventana de retención del RPC: se retoma desde el ledger más antiguo disponible.
        if (cursor) {
          cursor = undefined;
          continue;
        }
        throw e;
      }
      latest = res.latestLedger;
      for (const ev of res.events) {
        const kind = String(scValToNative(ev.topic[0]));
        const escrow = ev.topic[1] ? String(scValToNative(ev.topic[1])) : null;
        added += insert.run(ev.id, kind, escrow, ev.ledger, ev.ledgerClosedAt, ev.txHash, toJson(scValToNative(ev.value))).changes;
      }
      if (res.cursor) {
        cursor = res.cursor;
        kv.set(CURSOR_KEY, cursor);
      }
      if (res.events.length < PAGE) break;
    }
    kv.set("events:last_run", String(Date.now()));
    kv.set("events:latest", String(latest));
    return { added, latestLedger: latest };
  });
}

export function loadEvents(): PpEvent[] {
  const rows = db().prepare(`SELECT * FROM pp_events ORDER BY ledger ASC, id ASC`).all() as (Omit<PpEvent, "data"> & { data_json: string })[];
  return rows.map(({ data_json, ...r }) => ({ ...r, data: (JSON.parse(data_json) ?? {}) as Record<string, unknown> }));
}

const TERMINAL = new Set(["pp_confirmed", "pp_auto_released", "pp_resolved", "pp_refunded_unshipped"]);
const secs = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 1000;

export type PurchaseState = "liberada_confirmacion" | "liberada_plazo" | "resuelta" | "reembolsada" | "en_disputa" | "en_curso";

export interface Purchase {
  escrow: string;
  amount: string;
  buyer: string;
  seller: string;
  funded_at: string;
  tx_fondeo: string;
  state: PurchaseState;
  buyer_bps: number | null;
  closed_at: string | null;
  tx_cierre: string | null;
  disputed_by: "comprador" | "vendedor" | null;
}

/** Calcula las métricas con las mismas reglas que contracts/scripts/metricas.sh. */
export function computeMetrics(includeSeller: (seller: string) => boolean = () => true) {
  const events = loadEvents();
  const map = new Map<string, { funded?: PpEvent; disputed?: PpEvent; terminal?: PpEvent }>();
  for (const ev of events) {
    if (!ev.escrow) continue;
    const p = map.get(ev.escrow) ?? {};
    if (ev.kind === "pp_funded") p.funded ??= ev;
    else if (ev.kind === "pp_disputed") p.disputed ??= ev;
    else if (TERMINAL.has(ev.kind)) p.terminal ??= ev; // el primer evento terminal define el estado
    map.set(ev.escrow, p);
  }

  const purchases: Purchase[] = [];
  for (const [escrow, p] of map) {
    if (!p.funded) continue;
    const f = p.funded.data;
    if (!includeSeller(String(f.seller ?? ""))) continue;
    const t = p.terminal;
    const state: PurchaseState = t
      ? t.kind === "pp_confirmed"
        ? "liberada_confirmacion"
        : t.kind === "pp_auto_released"
          ? "liberada_plazo"
          : t.kind === "pp_resolved"
            ? "resuelta"
            : "reembolsada"
      : p.disputed
        ? "en_disputa"
        : "en_curso";
    purchases.push({
      escrow,
      amount: String(f.amount ?? "0"),
      buyer: String(f.buyer ?? ""),
      seller: String(f.seller ?? ""),
      funded_at: p.funded.closed_at,
      tx_fondeo: p.funded.tx_hash,
      state,
      buyer_bps: t?.kind === "pp_resolved" ? Number(t.data.buyer_bps) : t?.kind === "pp_refunded_unshipped" ? 10000 : null,
      closed_at: t?.closed_at ?? null,
      tx_cierre: t?.tx_hash ?? null,
      disputed_by: p.disputed ? (String(p.disputed.data.caller) === String(f.buyer) ? "comprador" : "vendedor") : null,
    });
  }
  purchases.sort((a, b) => b.funded_at.localeCompare(a.funded_at));

  const count = (s: PurchaseState) => purchases.filter((p) => p.state === s).length;
  const sum = (list: Purchase[]) => list.reduce((acc, p) => acc + BigInt(p.amount), 0n);
  const released = purchases.filter((p) => p.state === "liberada_confirmacion" || p.state === "liberada_plazo");
  const closed = purchases.filter((p) => p.closed_at);
  const disputed = purchases.filter((p) => p.disputed_by);
  const settled = purchases.filter((p) => p.state === "resuelta" || p.state === "reembolsada");
  const releaseTimes = released.map((p) => secs(p.funded_at, p.closed_at!));
  const resolveTimes = settled.map((p) => secs(p.funded_at, p.closed_at!));
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const closedVolume = sum(closed);
  const platformBps = BigInt(cfg().platformFeeBps);

  return {
    compras_protegidas: purchases.length,
    volumen_unidades: sum(purchases).toString(),
    liberadas_por_confirmacion: count("liberada_confirmacion"),
    liberadas_por_plazo: count("liberada_plazo"),
    en_curso: count("en_curso"),
    cerradas: closed.length,
    disputas: {
      total: disputed.length,
      abiertas_por_comprador: disputed.filter((p) => p.disputed_by === "comprador").length,
      abiertas_por_vendedor: disputed.filter((p) => p.disputed_by === "vendedor").length,
      pendientes: count("en_disputa"),
      resueltas_por_arbitro: count("resuelta"),
      reembolsos_sin_envio: count("reembolsada"),
      a_favor_del_comprador: settled.filter((p) => p.buyer_bps === 10000).length,
      a_favor_del_vendedor: settled.filter((p) => p.buyer_bps === 0).length,
      repartos_parciales: settled.filter((p) => p.buyer_bps != null && p.buyer_bps > 0 && p.buyer_bps < 10000).length,
      segundos_promedio_hasta_resolucion: avg(resolveTimes),
    },
    segundos_promedio_hasta_liberacion: avg(releaseTimes),
    muestras_liberacion: releaseTimes.length,
    comisiones: {
      plataforma: ((closedVolume * platformBps) / 10000n).toString(),
      trustless_work: ((closedVolume * 30n) / 10000n).toString(),
    },
    compras: purchases.slice(0, 15),
    ultimas_operaciones: events
      .slice(-15)
      .reverse()
      .map((e) => ({ id: e.id, kind: e.kind, escrow: e.escrow, closed_at: e.closed_at, tx_hash: e.tx_hash, ledger: e.ledger, data: e.data })),
    eventos: events.length,
    desde_ledger: DEPLOY_LEDGER,
    hasta_ledger: Number(kv.get("events:latest") ?? 0),
    contratos: { guardian: cfg().guardianId!, arbiter: cfg().arbiterId! },
    tipo_cambio: cfg().fx,
  };
}

export type Metrics = ReturnType<typeof computeMetrics>;
