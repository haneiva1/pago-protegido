import Link from "next/link";
import { GraficoDiario } from "@/components/Kpis";
import { explorer, fmtUsd } from "@/lib/format";
import { fmtDuracion, fmtHora, fmtProporcion, nf, plural } from "@/lib/kpi-format";
import { metricasSnapshot } from "@/lib/server/kpis";
import type { Grupo, GrupoMetricas } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Métricas en vivo · Trato",
  description: "Compras protegidas, monto, reclamos y tiempos de cobro, calculados con el registro público de cada compra.",
};

function KpiTile({ href, label, value, sub, testId }: { href: string; label: string; value: string; sub?: string; testId: string }) {
  return (
    <Link href={href} className="card !p-4 block transition hover:ring-2 hover:ring-brand-200" data-testid={testId}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900" data-testid="valor">
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
      <p className="mt-2 text-xs font-medium text-brand-700">Ver las operaciones que lo forman →</p>
    </Link>
  );
}

function GrupoSection({ grupo, g, titulo, nota }: { grupo: Grupo; g: GrupoMetricas; titulo: string; nota: string }) {
  const k = g.kpis;
  const base = `/metricas/${grupo}`;
  return (
    <section className="space-y-3" data-testid={`grupo-${grupo}`}>
      <div>
        <h2 className="text-xl font-bold" data-testid={`titulo-${grupo}`}>
          {titulo}
        </h2>
        <p className="text-sm text-slate-600">{nota}</p>
      </div>
      {k.compras === 0 ? (
        <div className="card text-sm text-slate-600" data-testid={`vacio-${grupo}`}>
          Todavía no hay compras en este grupo.{" "}
          {grupo === "piloto" && (
            <>
              Se cuentan aparte de las pruebas del equipo.{" "}
              <Link className="underline" href="/piloto">
                Únete al piloto
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile testId="kpi-compras" href={`${base}/compras`} label="Compras protegidas" value={nf(k.compras)} sub={`${k.en_curso} en curso ahora · ${k.cerradas} cerradas`} />
            <KpiTile testId="kpi-monto" href={`${base}/compras`} label="Monto protegido" value={`Bs ${nf(k.monto_bs)}`} sub={`${fmtUsd(k.monto_unidades)} dólares de prueba`} />
            <KpiTile
              testId="kpi-sin-reclamo"
              href={`${base}/sin-reclamo`}
              label="Confirmadas sin reclamo"
              value={fmtProporcion(k.confirmadas_sin_reclamo, k.cerradas)}
              sub={`${k.confirmadas_sin_reclamo} de ${k.cerradas} cerradas: el comprador confirmó y nadie reclamó. Otras ${k.plazo_sin_reclamo} se pagaron por plazo vencido sin reclamo.`}
            />
            <KpiTile
              testId="kpi-cobro"
              href={`${base}/cobro`}
              label="Del pago al cobro del vendedor"
              value={fmtDuracion(k.cobro_mediana_s)}
              sub={`Mediana de ${plural(k.cobro_muestras, "compra pagada", "compras pagadas")} al vendedor`}
            />
            <KpiTile
              testId="kpi-reclamos"
              href={`${base}/reclamos`}
              label="Reclamos"
              value={nf(k.reclamos.total)}
              sub={`${k.reclamos.en_revision} en revisión · ${k.reclamos.resueltos} resueltos (${k.reclamos.a_favor_comprador} a favor del comprador, ${k.reclamos.a_favor_vendedor} del vendedor, ${k.reclamos.repartidos} repartidos)`}
            />
            <KpiTile
              testId="kpi-devoluciones"
              href={`${base}/devoluciones`}
              label="Devoluciones por no despacho"
              value={nf(k.devoluciones_sin_despacho)}
              sub="El vendedor no despachó a tiempo y el pago volvió solo al comprador"
            />
            <KpiTile testId="kpi-mas-tiempo" href={`${base}/mas-tiempo`} label="Pedidos de “más tiempo”" value={nf(k.mas_tiempo)} sub="El comprador pidió una vez más tiempo para revisar" />
            <KpiTile
              testId="kpi-despacho"
              href={`${base}/despacho`}
              label="Del pago al despacho"
              value={fmtDuracion(k.despacho_promedio_s)}
              sub={`Promedio de ${plural(k.despacho_muestras, "envío registrado", "envíos registrados")}`}
            />
          </div>
          <GraficoDiario serie={g.diario} testId={`grafico-${grupo}`} />
        </>
      )}
    </section>
  );
}

export default async function Metricas() {
  const m = await metricasSnapshot();
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Métricas en vivo</h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          Cada número sale del registro público de las compras protegidas (red de prueba), no de una base de datos privada. Toca un número para ver
          las operaciones que lo forman, cada una con su link al registro público.
        </p>
        <p className="mt-2 text-xs text-slate-500" data-testid="actualizado">
          Actualizado: {fmtHora(m.actualizado)} (hora de Bolivia) · {nf(m.eventos)} eventos hasta el bloque {nf(m.hasta_ledger)} · se recalcula cada 30
          segundos
        </p>
        {m.error && (
          <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900" data-testid="aviso-red">
            {m.error} Se muestran los últimos datos guardados, del {fmtHora(m.actualizado)}.
          </p>
        )}
      </header>

      <GrupoSection
        grupo="piloto"
        g={m.piloto}
        titulo="Piloto con vendedores reales"
        nota="Solo compras de tiendas que entraron por el piloto. Nunca se suman con las pruebas del equipo."
      />
      <GrupoSection
        grupo="equipo"
        g={m.equipo}
        titulo="Pruebas del equipo en testnet (incluye reclamos forzados)"
        nota="Compras hechas por el equipo y por las pruebas automáticas, con reclamos y devoluciones forzados a propósito para probar cada camino."
      />

      <p className="text-center text-sm text-slate-500">
        Registro público de los contratos:{" "}
        <a className="underline" href={explorer.contract(m.contratos.guardian)} target="_blank" rel="noreferrer">
          pp_guardian
        </a>{" "}
        y{" "}
        <a className="underline" href={explorer.contract(m.contratos.arbiter)} target="_blank" rel="noreferrer">
          pp_arbiter
        </a>{" "}
        ·{" "}
        <Link className="underline" href="/transparencia">
          Transparencia
        </Link>{" "}
        ·{" "}
        <a className="underline" href="/api/metricas">
          Datos en JSON
        </a>
      </p>
    </div>
  );
}
