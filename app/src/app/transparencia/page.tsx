import Link from "next/link";
import { IconoAlerta, IconoBalanza, IconoCamion, IconoCandado, IconoCheckCirculo, IconoExterno, IconoInfo, IconoReloj, IconoVolver } from "@/components/iconos";
import { explorer, fmtPct, fmtUsd, shortAddr, unitsToNumber } from "@/lib/format";
import { plural, rotuloCompras, rotuloMonto } from "@/lib/kpi-format";
import { ES_MAINNET, TEXTO } from "@/lib/red";
import { sellers } from "@/lib/server/db";
import { computeMetrics, ingestEvents, type Metrics, type PurchaseState } from "@/lib/server/metrics";

export const dynamic = "force-dynamic";
export const metadata = { title: "Transparencia · Trato" };

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
  liberada_confirmacion: { label: "Liberada: el comprador confirmó", cls: "chip-exito" },
  liberada_plazo: { label: "Liberada por plazo vencido", cls: "chip-exito" },
  resuelta: { label: "Resuelta por el revisor", cls: "chip-neutro" },
  reembolsada: { label: "Reembolsada (sin envío)", cls: "chip-aviso" },
  en_disputa: { label: "En disputa", cls: "chip-aviso" },
  en_curso: { label: "En curso: plata protegida", cls: "chip-info" },
};

type Icono = (p: { className?: string }) => React.ReactNode;
const EVENT: Record<string, { texto: string; Icono: Icono }> = {
  pp_funded: { texto: "Compra protegida (la plata quedó en el contrato)", Icono: IconoCandado },
  pp_shipped: { texto: "El vendedor registró el envío", Icono: IconoCamion },
  pp_extended: { texto: "El comprador pidió más tiempo para revisar", Icono: IconoReloj },
  pp_confirmed: { texto: "El comprador confirmó y se pagó al vendedor", Icono: IconoCheckCirculo },
  pp_auto_released: { texto: "Pago al vendedor por plazo vencido", Icono: IconoReloj },
  pp_disputed: { texto: "Se abrió un reclamo", Icono: IconoAlerta },
  pp_resolved: { texto: "El revisor repartió", Icono: IconoBalanza },
  pp_refunded_unshipped: { texto: "Reembolso por falta de envío", Icono: IconoVolver },
  pp_arbiter_set: { texto: "Configuración del revisor", Icono: IconoInfo },
  pp_admin_changed: { texto: "Cambio de admin del revisor", Icono: IconoInfo },
};

function Tile({ label, value, sub, testId }: { label: string; value: string; sub?: string; testId?: string }) {
  return (
    <div className="card !p-4" data-testid={testId}>
      <p className="text-xs font-medium uppercase tracking-wide text-tinta-500">{label}</p>
      <p className="mt-2 font-display text-3xl leading-none tracking-tight text-monte num">{value}</p>
      {sub && <p className="mt-2 text-xs text-tinta-500">{sub}</p>}
    </div>
  );
}

function Cifra({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-card bg-tinta-50 p-3 text-center ring-1 ring-tinta-200/60">
      <p className="font-display text-2xl leading-none text-monte num">{nf(n)}</p>
      <p className="mt-1.5 text-xs text-tinta-600">{label}</p>
    </div>
  );
}

const Externo = ({ href, children, mono = false }: { href: string; children: React.ReactNode; mono?: boolean }) => (
  <a className={`enlace ${mono ? "font-mono" : ""}`} href={href} target="_blank" rel="noreferrer">
    {children}
  </a>
);

export default async function Transparencia() {
  let warning: string | null = null;
  try {
    await ingestEvents();
  } catch (e) {
    console.error("[transparencia] no se pudo leer la red:", (e as Error).message);
    warning = "No se pudo consultar la red ahora. Se muestran los últimos datos guardados. Vuelve a intentarlo en un momento.";
  }
  let m: Metrics;
  let pm: Metrics | null = null;
  try {
    // Piloto con vendedores reales (marcados desde /piloto) aparte de las pruebas del equipo.
    const pilotSet = sellers.pilotPubkeys();
    m = computeMetrics((s) => !pilotSet.has(s));
    pm = computeMetrics((s) => pilotSet.has(s));
  } catch (e) {
    console.error("[transparencia] no se pudieron calcular las métricas:", (e as Error).message);
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-3xl sm:text-4xl">Transparencia</h1>
        <p className="caja-aviso">No se pudieron calcular las métricas ahora. Vuelve a intentarlo en un momento.</p>
      </div>
    );
  }
  const vol = unitsToNumber(m.volumen_unidades);
  const okReleased = m.liberadas_por_confirmacion + m.liberadas_por_plazo;
  const d = m.disputas;

  return (
    <div className="mx-auto max-w-5xl space-y-12">
      <header className="pt-2">
        <p className="eyebrow">Registro público</p>
        <h1 className="mt-2 text-3xl sm:text-4xl">Transparencia</h1>
        <p className="mt-4 max-w-3xl text-lg text-tinta-600">Estas cifras se calculan con datos públicos de la {ES_MAINNET ? TEXTO.redPublica : "red (de prueba)"}. Cualquiera puede verificarlas.</p>
        <p className="mt-3 text-xs text-tinta-500 num" data-testid="rango-ledgers">
          Eventos de <Externo href={explorer.contract(m.contratos.guardian)}>pp_guardian</Externo> y <Externo href={explorer.contract(m.contratos.arbiter)}>pp_arbiter</Externo> desde el
          bloque {nf(m.desde_ledger)} hasta el {nf(m.hasta_ledger)} · {m.eventos} eventos · {TEXTO.dolares} a Bs {nf(m.tipo_cambio, 2)}.
        </p>
        {warning && <p className="caja-aviso mt-3 max-w-3xl">{warning}</p>}
        <p className="mt-3 text-sm">
          <Link className="enlace" href="/metricas" data-testid="link-metricas">
            Ver métricas en vivo: compras, reclamos y tiempos por día
          </Link>
        </p>
      </header>

      <section className="panel-suave space-y-1 sm:p-6" data-testid="piloto">
        <h2 className="text-xl">Piloto con vendedores reales</h2>
        {pm && pm.compras_protegidas > 0 ? (
          <p className="text-sm text-tinta-700">
            <strong>{pm.compras_protegidas}</strong> {pm.compras_protegidas === 1 ? "compra protegida" : "compras protegidas"} · Bs {nf(unitsToNumber(pm.volumen_unidades) * pm.tipo_cambio)} ·{" "}
            {plural(pm.liberadas_por_confirmacion + pm.liberadas_por_plazo, "pagada al vendedor", "pagadas al vendedor")} · {plural(pm.disputas.total, "reclamo", "reclamos")}
          </p>
        ) : (
          <p className="text-sm text-tinta-600">
            Todavía no hay compras de vendedores del piloto. Se cuentan aparte de las pruebas del equipo.{" "}
            <Link className="enlace" href="/piloto">
              Únete al piloto
            </Link>
          </p>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl sm:text-2xl" data-testid="pruebas-equipo">
          {TEXTO.grupoPropio}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile testId="compras-protegidas" label={rotuloCompras(ES_MAINNET ? "mainnet" : "equipo")} value={nf(m.compras_protegidas)} sub={`${m.en_curso} en curso ahora`} />
          <Tile label={rotuloMonto(ES_MAINNET ? "mainnet" : "equipo")} value={`Bs ${nf(vol * m.tipo_cambio)}`} sub={`${fmtUsd(m.volumen_unidades)} ${TEXTO.dolares}`} />
          <Tile
            testId="como-terminaron"
            label="Cómo terminaron"
            value={`${okReleased} de ${m.cerradas}`}
            sub={`pagadas al vendedor sin reclamo (${m.liberadas_por_confirmacion} confirmadas por el comprador · ${m.liberadas_por_plazo} por plazo). Las otras ${d.resueltas_por_arbitro + d.reembolsos_sin_envio} son reclamos forzados a propósito en las pruebas: ${d.resueltas_por_arbitro} resueltos por el revisor y ${d.reembolsos_sin_envio} reembolsos.`}
          />
          <Tile
            label="Tiempo hasta que el vendedor cobra"
            value={fmtDuration(m.segundos_promedio_hasta_liberacion)}
            sub={`Promedio desde el pago (${plural(m.muestras_liberacion, "compra", "compras")})`}
          />
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <div className="card space-y-3 lg:col-span-2" data-testid="reclamos">
          <h2 className="text-xl">Reclamos</h2>
          <p className="text-sm text-tinta-600">
            <strong className="text-monte">{d.total}</strong> reclamos: {d.abiertas_por_comprador} abiertos por el comprador y {d.abiertas_por_vendedor} por el vendedor.{" "}
            {d.pendientes > 0 ? `${d.pendientes} esperan al revisor.` : "Ninguno pendiente."}
          </p>
          <div className="grid grid-cols-3 gap-2">
            <Cifra n={d.a_favor_del_comprador} label="a favor del comprador" />
            <Cifra n={d.a_favor_del_vendedor} label="a favor del vendedor" />
            <Cifra n={d.repartos_parciales} label="repartidos" />
          </div>
          <p className="text-xs text-tinta-500">
            {d.resueltas_por_arbitro} resueltos por el revisor y {d.reembolsos_sin_envio} reembolsos por falta de envío · tiempo promedio hasta la resolución:{" "}
            {fmtDuration(d.segundos_promedio_hasta_resolucion)}. El revisor solo puede repartir entre comprador y vendedor.
          </p>
        </div>
        <div className="card space-y-3">
          <h2 className="text-xl">Comisiones</h2>
          <p className="text-sm text-tinta-600">Sobre compras cerradas, descontadas por el contrato:</p>
          <dl className="space-y-2 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-tinta-600">Plataforma (2%)</dt>
              <dd className="font-semibold text-monte num">{fmtUsd(m.comisiones.plataforma)} {TEXTO.dolares}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-tinta-600">Trustless Work (0,3%)</dt>
              <dd className="font-semibold text-monte num">{fmtUsd(m.comisiones.trustless_work)} {TEXTO.dolares}</dd>
            </div>
          </dl>
          <p className="text-xs text-tinta-500">Las comisiones de red las paga la plataforma.</p>
        </div>
      </section>

      <section className="card space-y-3 sm:p-6" data-testid="indexador">
        <h2 className="text-xl">Qué compras cuentan</h2>
        <p className="text-sm text-tinta-600">
          Un evento del guardián no alcanza: cualquiera puede imitar un contrato y generar eventos sin mover plata. Por eso cada compra se comprueba en la red y
          cuenta solo si cumple estas cinco reglas públicas (docs/METRICAS.md del repositorio):
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-tinta-700">
          {m.indexador.reglas.map((r) => (
            <li key={r.regla}>{r.texto}</li>
          ))}
        </ol>
        <p className="text-sm text-tinta-700" data-testid="indexador-resumen">
          <strong data-testid="indexador-contadas">{nf(m.indexador.contadas)}</strong> compras verificadas ·{" "}
          <strong data-testid="indexador-descartadas">{nf(m.indexador.descartadas)}</strong> descartadas
          {m.indexador.pendientes > 0 ? ` · ${nf(m.indexador.pendientes)} todavía sin verificar (no cuentan hasta verificarse)` : ""}.
        </p>
        {m.indexador.descartadas > 0 && (
          <>
            <ul className="text-sm text-tinta-700" data-testid="indexador-motivos">
              {m.indexador.por_motivo
                .filter((x) => x.compras > 0)
                .map((x) => (
                  <li key={x.regla}>
                    {x.texto}: <strong>{nf(x.compras)}</strong>
                  </li>
                ))}
            </ul>
            <ul className="divide-y divide-tinta-100 text-xs">
              {m.indexador.ejemplos.map((e) => (
                <li key={e.escrow} className="flex flex-wrap gap-x-3 py-1.5">
                  <Externo href={explorer.contract(e.escrow)} mono>
                    {shortAddr(e.escrow)}
                  </Externo>
                  <Externo href={explorer.tx(e.tx_fondeo)}>pago</Externo>
                  <span className="text-tinta-500">falla: {e.fallas.join(", ")}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="card space-y-3 sm:p-6">
        <h2 className="text-xl">Últimas operaciones</h2>
        <ul className="divide-y divide-tinta-100" data-testid="ultimas-operaciones">
          {m.ultimas_operaciones.map((e) => {
            const ev = EVENT[e.kind] ?? { texto: e.kind, Icono: IconoInfo };
            return (
              <li key={e.id} className="flex flex-col gap-1.5 py-3 text-sm sm:flex-row sm:items-center sm:gap-3">
                <span className="flex flex-1 items-start gap-2.5">
                  <ev.Icono className="mt-0.5 h-4 w-4 shrink-0 text-musgo" />
                  <span className="min-w-0">
                    <span className="block text-monte">
                      {ev.texto}
                      {e.kind === "pp_funded" && e.data.amount != null ? ` · ${fmtUsd(String(e.data.amount))} ${TEXTO.dolares}` : ""}
                      {e.kind === "pp_resolved" && e.data.buyer_bps != null ? ` · ${fmtPct(Number(e.data.buyer_bps) / 100)} comprador / ${fmtPct(100 - Number(e.data.buyer_bps) / 100)} vendedor` : ""}
                    </span>
                    <span className="text-xs text-tinta-500 num">
                      {fmtWhen(e.closed_at)} · bloque {nf(e.ledger)}
                      {e.escrow && (
                        <>
                          {" "}
                          · contrato{" "}
                          <Externo href={explorer.contract(e.escrow)} mono>
                            {shortAddr(e.escrow)}
                          </Externo>
                        </>
                      )}
                    </span>
                  </span>
                </span>
                <a className="enlace inline-flex items-center gap-1 text-sm sm:shrink-0" href={explorer.tx(e.tx_hash)} target="_blank" rel="noreferrer">
                  Ver en el registro público
                  <IconoExterno className="h-3.5 w-3.5" />
                </a>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card space-y-3 sm:p-6">
        <h2 className="text-xl">Compras recientes</h2>
        <ul className="divide-y divide-tinta-100">
          {m.compras.map((p) => (
            <li key={p.escrow} className="flex flex-col gap-1.5 py-3 text-sm sm:flex-row sm:items-center sm:gap-3">
              <span className="w-28 font-semibold text-monte num">{fmtUsd(p.amount)} USD</span>
              <span className={STATE[p.state].cls}>
                {STATE[p.state].label}
                {p.state === "resuelta" && p.buyer_bps != null ? ` ${p.buyer_bps / 100}/${100 - p.buyer_bps / 100}` : ""}
              </span>
              <span className="flex-1 text-xs text-tinta-500 num">
                {fmtWhen(p.funded_at)} · comprador {shortAddr(p.buyer)} · vendedor {shortAddr(p.seller)}
              </span>
              <span className="flex gap-3 text-xs">
                <Externo href={explorer.contract(p.escrow)}>Contrato</Externo>
                <Externo href={explorer.tx(p.tx_fondeo)}>Pago</Externo>
                {p.tx_cierre && <Externo href={explorer.tx(p.tx_cierre)}>Cierre</Externo>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="border-t border-tinta-200 pt-6 text-center text-sm text-tinta-500">
        <Link className="enlace" href="/como-funciona">
          Cómo funciona
        </Link>{" "}
        ·{" "}
        <a className="enlace" href="/api/transparencia">
          Datos en JSON
        </a>
      </p>
    </div>
  );
}
