import { unitsToNumber } from "@/lib/format";
import type { CompraOnchain, Desenlace, DiaSerie, Grupo, GrupoMetricas, KpiClave, Kpis, MetricasSnapshot, PerfilTienda } from "@/lib/types";
import { ES_MAINNET, RED } from "@/lib/red";
import { cfg } from "./config";
import { db, kv, pilot as piloto, sellers } from "./db";
import { estadoIndexador, ingestEvents, loadEvents, type PpEvent } from "./metrics";

/**
 * KPIs de /metricas, del panel del vendedor y del perfil público /tienda/<slug>. Salen SOLO de los eventos
 * on-chain de pp_guardian y pp_arbiter (v1 y v2) que ingiere metrics.ts, con las reglas de
 * contracts/scripts/metricas.sh: el primer evento terminal define cómo terminó cada compra.
 * Pruebas del equipo y piloto nunca se mezclan: cada grupo se calcula por separado (sellers.pilot).
 * Mainnet tampoco: su instancia tiene su propia base y sus propios contratos, y lo que no es piloto va al grupo
 * "mainnet" (el grupo "equipo" es solo de testnet).
 * H-9: solo cuentan las compras que pasaron el indexador verificado (metrics.ts, docs/METRICAS.md).
 */

const TERMINAL = new Set(["pp_confirmed", "pp_auto_released", "pp_resolved", "pp_refunded_unshipped"]);
const secs = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 1000;
const TZ = "America/La_Paz";

/** Una fila por compra verificada (pp_funded), con su envío, pedido de más tiempo, reclamo y cierre. */
export function comprasOnchain(): CompraOnchain[] {
  type Slots = Partial<Record<"funded" | "shipped" | "extended" | "disputed" | "terminal", PpEvent>>;
  const by = new Map<string, Slots>();
  const events = loadEvents();
  const { ok } = estadoIndexador(events);
  for (const ev of events) {
    if (!ev.escrow || !ok.has(ev.escrow)) continue;
    const p = by.get(ev.escrow) ?? {};
    if (ev.kind === "pp_funded") p.funded ??= ev;
    else if (ev.kind === "pp_shipped") p.shipped ??= ev;
    else if (ev.kind === "pp_extended") p.extended ??= ev;
    else if (ev.kind === "pp_disputed") p.disputed ??= ev;
    else if (TERMINAL.has(ev.kind)) p.terminal ??= ev;
    by.set(ev.escrow, p);
  }
  const out: CompraOnchain[] = [];
  for (const [escrow, p] of by) {
    if (!p.funded) continue;
    const f = p.funded.data;
    const t = p.terminal;
    const desenlace: Desenlace = t
      ? t.kind === "pp_confirmed"
        ? "confirmada"
        : t.kind === "pp_auto_released"
          ? "plazo"
          : t.kind === "pp_resolved"
            ? "resuelta"
            : "devuelta"
      : p.disputed
        ? "en_reclamo"
        : "en_curso";
    out.push({
      escrow,
      seller: String(f.seller ?? ""),
      amount: String(f.amount ?? "0"),
      funded_at: p.funded.closed_at,
      tx_fondeo: p.funded.tx_hash,
      shipped_at: p.shipped?.closed_at ?? null,
      tx_envio: p.shipped?.tx_hash ?? null,
      extended_at: p.extended?.closed_at ?? null,
      tx_extension: p.extended?.tx_hash ?? null,
      disputed_at: p.disputed?.closed_at ?? null,
      tx_reclamo: p.disputed?.tx_hash ?? null,
      reclamo_por: p.disputed ? (String(p.disputed.data.caller) === String(f.buyer) ? "comprador" : "vendedor") : null,
      closed_at: t?.closed_at ?? null,
      tx_cierre: t?.tx_hash ?? null,
      buyer_bps: t?.kind === "pp_resolved" ? Number(t.data.buyer_bps) : t?.kind === "pp_refunded_unshipped" ? 10000 : null,
      desenlace,
    });
  }
  return out.sort((a, b) => b.funded_at.localeCompare(a.funded_at));
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pagada = (c: CompraOnchain) => c.desenlace === "confirmada" || c.desenlace === "plazo";

export function kpisFor(list: CompraOnchain[]): Kpis {
  const fx = cfg().fx;
  const units = list.reduce((a, c) => a + BigInt(c.amount), 0n);
  const pagadas = list.filter(pagada);
  const reclamos = list.filter((c) => c.disputed_at);
  const resueltas = list.filter((c) => c.desenlace === "resuelta");
  const devueltas = list.filter((c) => c.desenlace === "devuelta");
  const cobro = pagadas.map((c) => secs(c.funded_at, c.closed_at!));
  const despacho = list.filter((c) => c.shipped_at).map((c) => secs(c.funded_at, c.shipped_at!));
  return {
    compras: list.length,
    monto_unidades: units.toString(),
    monto_bs: Math.round(unitsToNumber(units) * fx * 100) / 100,
    en_curso: list.filter((c) => !c.closed_at).length,
    cerradas: list.filter((c) => c.closed_at).length,
    pagadas_al_vendedor: pagadas.length,
    confirmadas_sin_reclamo: pagadas.filter((c) => c.desenlace === "confirmada" && !c.disputed_at).length,
    plazo_sin_reclamo: pagadas.filter((c) => c.desenlace === "plazo" && !c.disputed_at).length,
    ventas_sin_reclamo: pagadas.filter((c) => !c.disputed_at).length,
    cobro_mediana_s: median(cobro),
    cobro_muestras: cobro.length,
    despacho_promedio_s: avg(despacho),
    despacho_muestras: despacho.length,
    reclamos: {
      total: reclamos.length,
      en_revision: reclamos.filter((c) => !c.closed_at).length,
      resueltos: reclamos.filter((c) => c.closed_at).length,
      a_favor_comprador: resueltas.filter((c) => c.buyer_bps === 10000).length,
      a_favor_vendedor: resueltas.filter((c) => c.buyer_bps === 0).length,
      repartidos: resueltas.filter((c) => c.buyer_bps != null && c.buyer_bps > 0 && c.buyer_bps < 10000).length,
    },
    devoluciones_sin_despacho: devueltas.length,
    mas_tiempo: list.filter((c) => c.extended_at).length,
    // Conservador: cuenta como perdido todo reclamo en el que el comprador recuperó algo, y cada devolución por no despachar.
    reclamos_perdidos: resueltas.filter((c) => (c.buyer_bps ?? 0) > 0).length + devueltas.length,
    desde: list.length ? list.reduce((m, c) => (c.funded_at < m ? c.funded_at : m), list[0].funded_at) : null,
  };
}

const dayKey = (v: string | number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(v));

/** Compras y monto (Bs) por día de pago, hora de Bolivia, con los días sin compras en cero. */
export function serieDiaria(list: CompraOnchain[], dias = 30, hoy = Date.now()): DiaSerie[] {
  const fx = cfg().fx;
  const map = new Map<string, { compras: number; units: bigint }>();
  for (const c of list) {
    const k = dayKey(c.funded_at);
    const e = map.get(k) ?? { compras: 0, units: 0n };
    e.compras++;
    e.units += BigInt(c.amount);
    map.set(k, e);
  }
  const out: DiaSerie[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    const k = dayKey(hoy - i * 86_400_000);
    const e = map.get(k);
    out.push({ dia: k, compras: e?.compras ?? 0, monto_bs: e ? Math.round(unitsToNumber(e.units) * fx) : 0 });
  }
  return out;
}

export function comprasDeGrupo(grupo: Grupo, all = comprasOnchain()): CompraOnchain[] {
  const pilot = sellers.pilotPubkeys();
  if (grupo !== "piloto" && (grupo === "mainnet") !== ES_MAINNET) return [];
  return all.filter((c) => (grupo === "piloto") === pilot.has(c.seller));
}

/** Qué compras forman cada número de /metricas (la lista que se abre al tocarlo). */
export const KPI_DETALLE: Record<KpiClave, { titulo: string; explica: string; filtro: (c: CompraOnchain) => boolean }> = {
  compras: {
    titulo: "Compras y monto",
    explica: "Cada compra es un pago que quedó bloqueado en su propio contrato hasta que se decida si va al vendedor o vuelve al comprador.",
    filtro: () => true,
  },
  "sin-reclamo": {
    titulo: "Compras cerradas y cómo terminaron",
    explica:
      "Confirmadas sin reclamo: el comprador confirmó que recibió y nadie abrió un reclamo. El porcentaje se calcula sobre todas las compras cerradas, incluidas las devoluciones y los reclamos.",
    filtro: (c) => Boolean(c.closed_at),
  },
  cobro: {
    titulo: "Tiempo entre el pago y el cobro del vendedor",
    explica: "Compras pagadas al vendedor (confirmó el comprador o venció el plazo de revisión), con la hora del pago y la del cobro.",
    filtro: pagada,
  },
  reclamos: {
    titulo: "Reclamos",
    explica: "Compras en las que el comprador o el vendedor abrió un reclamo. Un tercero lo revisa y solo puede repartir entre comprador y vendedor.",
    filtro: (c) => Boolean(c.disputed_at),
  },
  devoluciones: {
    titulo: "Devoluciones por no despacho",
    explica: "El vendedor no registró el envío dentro del plazo y el pago volvió solo al comprador, sin que tuviera que reclamar.",
    filtro: (c) => c.desenlace === "devuelta",
  },
  "mas-tiempo": {
    titulo: "Pedidos de más tiempo",
    explica: "El comprador pidió una vez más tiempo para revisar el pedido antes de que se le pague al vendedor.",
    filtro: (c) => Boolean(c.extended_at),
  },
  despacho: {
    titulo: "Tiempo de despacho",
    explica: "Compras con envío registrado: la hora del pago y la del envío.",
    filtro: (c) => Boolean(c.shipped_at),
  },
};

export const isGrupo = (g: string): g is Grupo => g === (ES_MAINNET ? "mainnet" : "equipo") || g === "piloto";
export const isKpi = (k: string): k is KpiClave => Object.hasOwn(KPI_DETALLE, k);

// ---------- Caché corta ----------

/** El RPC se consulta como mucho cada 15 s (ingestEvents) y el cálculo se guarda 30 s. */
const TTL_MS = 30_000;
const g = globalThis as unknown as { __ppMetricas?: { at: number; snap: MetricasSnapshot } };

/** Hora de la última lectura exitosa de la red (no se mueve si el RPC falla). */
const lastOk = () => Number(kv.get("events:last_run") ?? 0) || null;

async function ingestOrWarn(): Promise<string | null> {
  try {
    await ingestEvents();
    return null;
  } catch (e) {
    console.error("[metricas] no se pudo leer la red:", (e as Error).message);
    return "No se pudo consultar la red ahora.";
  }
}

function grupoMetricas(list: CompraOnchain[]): GrupoMetricas {
  return { kpis: kpisFor(list), diario: serieDiaria(list) };
}

export async function metricasSnapshot(): Promise<MetricasSnapshot> {
  const hit = g.__ppMetricas;
  if (hit && Date.now() - hit.at < TTL_MS) return hit.snap;
  const error = await ingestOrWarn();
  const all = comprasOnchain();
  const c = cfg();
  const snap: MetricasSnapshot = {
    equipo: grupoMetricas(comprasDeGrupo("equipo", all)),
    piloto: grupoMetricas(comprasDeGrupo("piloto", all)),
    tiendas_inscritas_piloto: piloto.tiendas(),
    ...(ES_MAINNET ? { red: RED, mainnet: grupoMetricas(comprasDeGrupo("mainnet", all)) } : {}),
    actualizado: lastOk(),
    calculado: Date.now(),
    error,
    eventos: (db().prepare(`SELECT COUNT(*) AS n FROM pp_events`).get() as { n: number }).n,
    hasta_ledger: Number(kv.get("events:latest") ?? 0),
    contratos: { guardian: c.guardianId!, arbiter: c.arbiterId! },
    fx: c.fx,
  };
  // Con error se guarda solo 5 s: se reintenta pronto, sin saturar el RPC.
  g.__ppMetricas = { at: error ? Date.now() - TTL_MS + 5_000 : Date.now(), snap };
  return snap;
}

/** KPIs propios del vendedor (panel y tarjeta de la página de pago), con lo ya ingerido. */
export function sellerKpis(pubkey: string): Kpis {
  return kpisFor(comprasOnchain().filter((c) => c.seller === pubkey));
}

/** Perfil público /tienda/<slug>: sin teléfono ni dirección, solo números del registro público. */
export async function perfilTienda(slug: string): Promise<PerfilTienda | null> {
  const s = sellers.bySlug(slug);
  if (!s) return null;
  const error = await ingestOrWarn();
  const list = comprasOnchain().filter((c) => c.seller === s.pubkey);
  return {
    slug: s.slug!,
    store_name: s.store_name,
    city: s.city,
    pilot: s.pilot === 1,
    tienda_desde: s.created_at,
    cuenta: s.pubkey,
    kpis: kpisFor(list),
    verificacion: "pendiente",
    registro: list.slice(0, 20),
    actualizado: lastOk(),
    error,
    fx: cfg().fx,
  };
}
