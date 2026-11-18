import Link from "next/link";
import { explorer, fmtPct, fmtUsd, shortAddr, unitsToNumber } from "@/lib/format";
import { sellers } from "@/lib/server/db";
import { computeMetrics, ingestEvents, type Metrics, type PurchaseState } from "@/lib/server/metrics";

export const dynamic = "force-dynamic";
export const metadata = { title: "Transparencia · Pago Protegido" };

const nf = (n: number, d = 0) => n.toLocaleString("es-BO", { minimumFractionDigits: d, maximumFractionDigits: d });

function fmtDuration(s: number | null): string {
  if (s == null) return "—";
  if (s < 3600) return `${nf(Math.max(1, Math.round(s / 60)))} min`;
  if (s < 86400 * 2) return `${nf(s / 3600, 1)} h`;
  return `${nf(s / 86400, 1)} días`;
}

const fmtWhen = (iso: string) =>
  new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/La_Paz" }).format(new Date(iso));

const STATE: Record<PurchaseState, { label: string; cls: string }> = {
  liberada_confirmacion: { label: "Liberada: el comprador confirmó", cls: "bg-brand-50 text-brand-800 ring-brand-200" },
  liberada_plazo: { label: "Liberada por plazo vencido", cls: "bg-brand-50 text-brand-800 ring-brand-200" },
  resuelta: { label: "Resuelta por el revisor", cls: "bg-violet-50 text-violet-800 ring-violet-200" },
  reembolsada: { label: "Reembolsada (sin envío)", cls: "bg-violet-50 text-violet-800 ring-violet-200" },
  en_disputa: { label: "En disputa", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  en_curso: { label: "En curso: plata protegida", cls: "bg-sky-50 text-sky-800 ring-sky-200" },
};

const EVENT: Record<string, string> = {
  pp_funded: "🔒 Compra protegida (fondeo)",
  pp_confirmed: "✅ El comprador confirmó y se liberó",
  pp_auto_released: "⏱️ Liberación por plazo vencido",
  pp_disputed: "⚠️ Se abrió un reclamo",
  pp_resolved: "⚖️ El revisor repartió",
  pp_refunded_unshipped: "↩️ Reembolso por falta de envío",
  pp_arbiter_set: "🔧 Configuración del revisor",
  pp_admin_changed: "🔧 Cambio de admin del revisor",
};

function Tile({ label, value, sub, testId }: { label: string; value: string; sub?: string; testId?: string }) {
  return (
    <div className="card !p-4" data-testid={testId}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export default async function Transparencia() {
  let warning: string | null = null;
  try {
    await ingestEvents();
  } catch (e) {
    warning = `No se pudo consultar la red ahora (${(e as Error).message.slice(0, 80)}). Se muestran los últimos datos guardados.`;
  }
  let m: Metrics;
  let pm: Metrics | null = null;
  try {
    // Piloto con vendedores reales (marcados desde /piloto) aparte de las pruebas del equipo.
    const pilotSet = sellers.pilotPubkeys();
    m = computeMetrics((s) => !pilotSet.has(s));
    pm = computeMetrics((s) => pilotSet.has(s));
  } catch (e) {
    return <p className="card">No se pudieron calcular las métricas: {(e as Error).message}</p>;
  }
  const vol = unitsToNumber(m.volumen_unidades);
  const okReleased = m.liberadas_por_confirmacion + m.liberadas_por_plazo;
  const d = m.disputas;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Transparencia</h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          Estas cifras se calculan con datos públicos de la red Stellar (testnet). Cualquiera puede verificarlas.
        </p>
        <p className="mt-1 text-xs text-slate-500" data-testid="rango-ledgers">
          Eventos de{" "}
          <a className="underline" href={explorer.contract(m.contratos.guardian)} target="_blank" rel="noreferrer">
            pp_guardian
          </a>{" "}
          y{" "}
          <a className="underline" href={explorer.contract(m.contratos.arbiter)} target="_blank" rel="noreferrer">
            pp_arbiter
          </a>{" "}
          desde el ledger {nf(m.desde_ledger)} hasta el {nf(m.hasta_ledger)} · {m.eventos} eventos · USD de prueba a Bs {nf(m.tipo_cambio, 2)}.
        </p>
        {warning && <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{warning}</p>}
      </header>

      <section className="card space-y-1 ring-2 ring-brand-200" data-testid="piloto">
        <h2 className="font-bold">Piloto con vendedores reales</h2>
        {pm && pm.compras_protegidas > 0 ? (
          <p className="text-sm text-slate-700">
            <strong>{pm.compras_protegidas}</strong> compras protegidas · Bs {nf(unitsToNumber(pm.volumen_unidades) * pm.tipo_cambio)} ·{" "}
            {pm.liberadas_por_confirmacion + pm.liberadas_por_plazo} pagadas al vendedor · {pm.disputas.total} reclamos
          </p>
        ) : (
          <p className="text-sm text-slate-600">
            Todavía no hay compras de vendedores del piloto. Se cuentan aparte de las pruebas del equipo.{" "}
            <Link className="underline" href="/piloto">
              Únete al piloto
            </Link>
          </p>
        )}
      </section>

      <h2 className="text-xl font-bold" data-testid="pruebas-equipo">
        Pruebas del equipo en testnet (incluye reclamos forzados)
      </h2>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile testId="compras-protegidas" label="Compras protegidas" value={nf(m.compras_protegidas)} sub={`${m.en_curso} en curso ahora`} />
        <Tile label="Volumen protegido" value={`Bs ${nf(vol * m.tipo_cambio)}`} sub={`${fmtUsd(m.volumen_unidades)} USD de prueba`} />
        <Tile
          testId="como-terminaron"
          label="Cómo terminaron"
          value={`${okReleased} de ${m.cerradas}`}
          sub={`pagadas al vendedor sin reclamo (${m.liberadas_por_confirmacion} confirmadas por el comprador · ${m.liberadas_por_plazo} por plazo). Las otras ${d.resueltas_por_arbitro + d.reembolsos_sin_envio} son reclamos forzados a propósito en las pruebas: ${d.resueltas_por_arbitro} resueltos por el revisor y ${d.reembolsos_sin_envio} reembolsos.`}
        />
        <Tile
          label="Tiempo hasta que el vendedor cobra"
          value={fmtDuration(m.segundos_promedio_hasta_liberacion)}
          sub={`Promedio desde el pago (${m.muestras_liberacion} compras)`}
        />
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <div className="card space-y-2 lg:col-span-2" data-testid="reclamos">
          <h2 className="font-bold">Reclamos</h2>
          <p className="text-sm text-slate-600">
            <strong className="text-slate-900">{d.total}</strong> reclamos: {d.abiertas_por_comprador} abiertos por el comprador y {d.abiertas_por_vendedor} por el vendedor.{" "}
            {d.pendientes > 0 ? `${d.pendientes} esperan al revisor.` : "Ninguno pendiente."}
          </p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-violet-50 p-3">
              <p className="text-2xl font-bold text-violet-900">{d.a_favor_del_comprador}</p>
              <p className="text-xs text-violet-800">a favor del comprador</p>
            </div>
            <div className="rounded-xl bg-violet-50 p-3">
              <p className="text-2xl font-bold text-violet-900">{d.a_favor_del_vendedor}</p>
              <p className="text-xs text-violet-800">a favor del vendedor</p>
            </div>
            <div className="rounded-xl bg-violet-50 p-3">
              <p className="text-2xl font-bold text-violet-900">{d.repartos_parciales}</p>
              <p className="text-xs text-violet-800">repartidos</p>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            {d.resueltas_por_arbitro} resueltos por el revisor y {d.reembolsos_sin_envio} reembolsos por falta de envío · tiempo promedio hasta la resolución:{" "}
            {fmtDuration(d.segundos_promedio_hasta_resolucion)}. El revisor solo puede repartir entre comprador y vendedor.
          </p>
        </div>
        <div className="card space-y-2">
          <h2 className="font-bold">Comisiones</h2>
          <p className="text-sm text-slate-600">Sobre compras cerradas, descontadas por el contrato:</p>
          <p className="text-sm">
            Plataforma (2%): <strong>{fmtUsd(m.comisiones.plataforma)}</strong> USD de prueba
          </p>
          <p className="text-sm">
            Trustless Work (0,3%): <strong>{fmtUsd(m.comisiones.trustless_work)}</strong> USD de prueba
          </p>
          <p className="text-xs text-slate-500">Las comisiones de red las paga la plataforma (fee bump).</p>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">Últimas operaciones</h2>
        <ul className="divide-y divide-slate-100" data-testid="ultimas-operaciones">
          {m.ultimas_operaciones.map((e) => (
            <li key={e.id} className="flex flex-col gap-1 py-2.5 text-sm sm:flex-row sm:items-center sm:gap-3">
              <span className="flex-1">
                <span className="block text-slate-800">
                  {EVENT[e.kind] ?? e.kind}
                  {e.kind === "pp_funded" && e.data.amount != null ? ` · ${fmtUsd(String(e.data.amount))} USD de prueba` : ""}
                  {e.kind === "pp_resolved" && e.data.buyer_bps != null ? ` · ${fmtPct(Number(e.data.buyer_bps) / 100)} comprador / ${fmtPct(100 - Number(e.data.buyer_bps) / 100)} vendedor` : ""}
                </span>
                <span className="text-xs text-slate-500">
                  {fmtWhen(e.closed_at)} · ledger {nf(e.ledger)}
                  {e.escrow && (
                    <>
                      {" "}
                      · contrato{" "}
                      <a className="font-mono underline" href={explorer.contract(e.escrow)} target="_blank" rel="noreferrer">
                        {shortAddr(e.escrow)}
                      </a>
                    </>
                  )}
                </span>
              </span>
              <a className="text-sm font-medium text-brand-700 underline" href={explorer.tx(e.tx_hash)} target="_blank" rel="noreferrer">
                Ver en Stellar ↗
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">Compras recientes</h2>
        <ul className="divide-y divide-slate-100">
          {m.compras.map((p) => (
            <li key={p.escrow} className="flex flex-col gap-1 py-2.5 text-sm sm:flex-row sm:items-center sm:gap-3">
              <span className="w-28 font-semibold">{fmtUsd(p.amount)} USD</span>
              <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${STATE[p.state].cls}`}>
                {STATE[p.state].label}
                {p.state === "resuelta" && p.buyer_bps != null ? ` ${p.buyer_bps / 100}/${100 - p.buyer_bps / 100}` : ""}
              </span>
              <span className="flex-1 text-xs text-slate-500">
                {fmtWhen(p.funded_at)} · comprador {shortAddr(p.buyer)} · vendedor {shortAddr(p.seller)}
              </span>
              <span className="flex gap-3 text-xs">
                <a className="underline" href={explorer.contract(p.escrow)} target="_blank" rel="noreferrer">
                  Contrato
                </a>
                <a className="underline" href={explorer.tx(p.tx_fondeo)} target="_blank" rel="noreferrer">
                  Fondeo
                </a>
                {p.tx_cierre && (
                  <a className="underline" href={explorer.tx(p.tx_cierre)} target="_blank" rel="noreferrer">
                    Cierre
                  </a>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-center text-sm text-slate-500">
        <Link className="underline" href="/como-funciona">
          Cómo funciona
        </Link>{" "}
        ·{" "}
        <a className="underline" href="/api/transparencia">
          Datos en JSON
        </a>
      </p>
    </div>
  );
}
