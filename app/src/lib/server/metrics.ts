import { rpc, scValToNative } from "@stellar/stellar-sdk";
import { DEPLOYED, HORIZON_URL, NETWORK_PASSPHRASE, RETIRED_V1, TESTNET_PUBLICO, cfg } from "./config";
import { db, kv } from "./db";
import { server, withLock } from "./stellar";
import { REGLAS, evaluar, firmaReglas, hechosDe, type CompraFondeada, type Hechos, type Regla, type Reglas, type Resultado } from "./verificacion";

/**
 * Métricas públicas de Pago Protegido calculadas SOLO con eventos on-chain de pp_guardian y pp_arbiter
 * (pago-protegido/docs/METRICAS.md). Los eventos se ingieren de forma incremental a SQLite porque el RPC
 * público solo guarda unos 7 días; la referencia de las reglas es contracts/scripts/metricas.sh.
 *
 * H-9: un evento auténtico de pp_guardian no prueba una compra real. Cada compra pasa por el indexador
 * verificado (verificacion.ts) y solo cuenta si su escrow cumple las cinco reglas públicas.
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
    await verificarPendientes().catch((e) => console.error("[indexador] no se pudo verificar:", (e as Error).message));
    return { added, latestLedger: latest };
  });
}

export function loadEvents(): PpEvent[] {
  const rows = db().prepare(`SELECT * FROM pp_events ORDER BY ledger ASC, id ASC`).all() as (Omit<PpEvent, "data"> & { data_json: string })[];
  return rows.map(({ data_json, ...r }) => ({ ...r, data: (JSON.parse(data_json) ?? {}) as Record<string, unknown> }));
}

// ---------- Indexador verificado (H-9) ----------

/** Lo que se espera de cada escrow: valores de la configuración o, sin .env.local, los públicos de DEPLOYED.md. */
export function reglasIndexador(): Reglas {
  const c = cfg();
  let platform = TESTNET_PUBLICO.plataforma;
  try {
    platform = c.plataforma.publicKey();
  } catch {
    // Sin .env.local (e2e público): se usa la cuenta publicada.
  }
  return {
    wasmHash: process.env.ESCROW_WASM_HASH || TESTNET_PUBLICO.twWasmHash,
    labusdSac: process.env.LABUSD_SAC || TESTNET_PUBLICO.labusdSac,
    platform,
    pares: [
      { guardian: c.guardianId ?? DEPLOYED.guardian, arbiter: c.arbiterId ?? DEPLOYED.arbiter },
      { guardian: RETIRED_V1.guardian, arbiter: RETIRED_V1.arbiter },
    ],
  };
}

/** Primer `pp_funded` de cada escrow, como lo leen computeMetrics y comprasOnchain. */
export function comprasFondeadas(events: PpEvent[] = loadEvents()): CompraFondeada[] {
  const seen = new Map<string, CompraFondeada>();
  for (const ev of events) {
    if (ev.kind !== "pp_funded" || !ev.escrow || seen.has(ev.escrow)) continue;
    const f = ev.data;
    seen.set(ev.escrow, { escrow: ev.escrow, buyer: String(f.buyer ?? ""), seller: String(f.seller ?? ""), amount: String(f.amount ?? "0"), tx_fondeo: ev.tx_hash });
  }
  return [...seen.values()];
}

/** Escrows que creó la app para un pedido (5.ª regla, "origen"). */
function escrowsDeTrato(): Set<string> {
  const rows = db().prepare(`SELECT escrow_id FROM orders WHERE escrow_id IS NOT NULL`).all() as { escrow_id: string }[];
  return new Set(rows.map((r) => r.escrow_id));
}

/** Espera antes de releer la red para una compra pendiente, según los intentos hechos: 1 min, 2, 4… hasta 12 h. */
export const esperaReintento = (intentos: number) => Math.min(60_000 * 2 ** Math.max(0, intentos - 1), 12 * 3_600_000);

const SIN_HECHOS: Hechos = { creadoPorTrato: null, wasmHash: null, roles: null, token: null, monto: null, transferencias: null };

interface FilaVerificada {
  escrow: string;
  reglas: string;
  estado: "ok" | "descartada" | "pendiente" | null;
  hechos_json: string | null;
  intentos: number;
  proximo_at: number | null;
}

/**
 * Verifica por RPC (y Horizon para pagos viejos) las compras sin resultado guardado con las reglas de hoy.
 * - Solo una contradicción probada descarta. Si falta un dato, la compra queda pendiente y se relee con espera creciente.
 * - Los hechos leídos quedan guardados: si cambian las reglas, se reevalúa con ellos sin releer la red.
 * - Un escrow que no es de un pedido de la app se descarta sin leer la red: no le cuesta nada al RPC.
 */
export async function verificarPendientes(opts: { limiteMs?: number; ahora?: number } = {}): Promise<{ verificadas: number; errores: number }> {
  const ahora = opts.ahora ?? Date.now();
  const reglas = reglasIndexador();
  const firma = firmaReglas(reglas);
  const filas = new Map(
    (db().prepare(`SELECT escrow, reglas, estado, hechos_json, intentos, proximo_at FROM escrow_verificado`).all() as FilaVerificada[]).map((f) => [f.escrow, f]),
  );
  const guardar = db().prepare(
    `INSERT OR REPLACE INTO escrow_verificado (escrow, reglas, ok, fallas, wasm_hash, verificado_at, estado, hechos_json, intentos, proximo_at, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  /** Guarda el resultado. Pendiente: suma un intento y agenda el próximo. */
  const anotar = (c: CompraFondeada, h: Hechos, r: Resultado, intentos: number, error: string | null = null) => {
    const estado = r.ok ? "ok" : r.fallas.length ? "descartada" : "pendiente";
    const n = estado === "pendiente" ? intentos + 1 : intentos;
    const proximo = estado === "pendiente" ? ahora + esperaReintento(n) : null;
    guardar.run(c.escrow, firma, r.ok ? 1 : 0, r.fallas.join(","), h.wasmHash, ahora, estado, JSON.stringify(h), n, proximo, error);
  };

  const trato = escrowsDeTrato();
  const porLeer: { c: CompraFondeada; previos: Hechos; intentos: number }[] = [];
  for (const c of comprasFondeadas()) {
    const f = filas.get(c.escrow);
    const mismas = f?.reglas === firma;
    if (mismas && f.estado !== "pendiente") continue; // ya resuelta con estas reglas
    if (mismas && (f.proximo_at ?? 0) > ahora) continue; // pendiente, esperando su próximo intento
    // Primero con lo que ya se sabe (hechos guardados y el origen, que es local): puede alcanzar sin leer la red.
    const previos: Hechos = { ...SIN_HECHOS, ...(f?.hechos_json ? (JSON.parse(f.hechos_json) as Partial<Hechos>) : {}), creadoPorTrato: trato.has(c.escrow) };
    const intentos = mismas ? f.intentos : 0;
    const r = evaluar(c, previos, reglas);
    if (r.ok || r.fallas.length) anotar(c, previos, r, intentos);
    else porLeer.push({ c, previos, intentos });
  }

  const s = server();
  const hasta = Date.now() + (opts.limiteMs ?? 120_000);
  let verificadas = 0;
  let errores = 0;
  for (let i = 0; i < porLeer.length && Date.now() < hasta; i += 6) {
    await Promise.all(
      porLeer.slice(i, i + 6).map(async ({ c, previos, intentos }) => {
        try {
          const h = await hechosDe(c, s, { horizonUrl: HORIZON_URL, networkPassphrase: NETWORK_PASSPHRASE, creadoPorTrato: true, previos });
          anotar(c, h, evaluar(c, h, reglas), intentos);
          verificadas++;
        } catch (e) {
          errores++; // transitorio (RPC u Horizon caídos): queda pendiente y se reintenta con espera
          anotar(c, previos, evaluar(c, previos, reglas), intentos, (e as Error).message ?? String(e));
          console.warn(`[indexador] ${c.escrow}: ${(e as Error).message}`);
        }
      }),
    );
  }
  return { verificadas, errores };
}

export interface Descartada {
  escrow: string;
  tx_fondeo: string;
  seller: string;
  motivo: Regla;
  fallas: Regla[];
}

export interface EstadoIndexador {
  /** Escrows que cumplen las cinco reglas: los únicos que cuentan. */
  ok: Set<string>;
  descartadas: Descartada[];
  /** Compras todavía sin verificar (no cuentan hasta que se verifiquen). */
  pendientes: number;
}

export function estadoIndexador(events: PpEvent[] = loadEvents()): EstadoIndexador {
  const firma = firmaReglas(reglasIndexador());
  const rows = db().prepare(`SELECT escrow, ok, fallas, estado FROM escrow_verificado WHERE reglas = ?`).all(firma) as {
    escrow: string;
    ok: number;
    fallas: string;
    estado: string | null;
  }[];
  const res = new Map(rows.map((r) => [r.escrow, r]));
  const ok = new Set<string>();
  const descartadas: Descartada[] = [];
  let pendientes = 0;
  for (const c of comprasFondeadas(events)) {
    const r = res.get(c.escrow);
    if (!r || r.estado === "pendiente") pendientes++;
    else if (r.ok) ok.add(c.escrow);
    else {
      const fallas = r.fallas.split(",").filter(Boolean) as Regla[];
      descartadas.push({ escrow: c.escrow, tx_fondeo: c.tx_fondeo, seller: c.seller, motivo: fallas[0] ?? "wasm", fallas });
    }
  }
  return { ok, descartadas, pendientes };
}

/** Resumen público para /transparencia: cuántas compras cuenta, cuántas descartó y por qué. */
export function resumenIndexador(st: EstadoIndexador) {
  return {
    contadas: st.ok.size,
    pendientes: st.pendientes,
    descartadas: st.descartadas.length,
    por_motivo: REGLAS.map((r) => ({ regla: r.regla, texto: r.falla, compras: st.descartadas.filter((d) => d.motivo === r.regla).length })),
    reglas: REGLAS.map((r) => ({ regla: r.regla, texto: r.cumple })),
    ejemplos: st.descartadas.slice(-10).reverse(),
  };
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
  const all = loadEvents();
  const indexador = estadoIndexador(all);
  // Solo eventos de compras verificadas (y los que no son de una compra, como pp_arbiter_set).
  const events = all.filter((e) => !e.escrow || indexador.ok.has(e.escrow));
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
    eventos: all.length,
    indexador: resumenIndexador(indexador),
    desde_ledger: DEPLOY_LEDGER,
    hasta_ledger: Number(kv.get("events:latest") ?? 0),
    contratos: { guardian: cfg().guardianId!, arbiter: cfg().arbiterId! },
    tipo_cambio: cfg().fx,
  };
}

export type Metrics = ReturnType<typeof computeMetrics>;
