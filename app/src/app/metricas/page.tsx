import Link from "next/link";
import { IconoChevronDerecha } from "@/components/iconos";
import { GraficoDiario } from "@/components/Kpis";
import { explorer, fmtUsd } from "@/lib/format";
import { COMPRAS_INTERNAS, fmtDuracion, fmtHora, fmtProporcion, nf, plural, rotuloCompras, rotuloMonto } from "@/lib/kpi-format";
import { metricasSnapshot } from "@/lib/server/kpis";
import type { Grupo, GrupoMetricas } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Métricas en vivo · Trato",
  description: "Compras protegidas, monto, reclamos y tiempos de cobro, calculados con el registro público de cada compra.",
};

function KpiTile({ href, label, value, sub, testId }: { href: string; label: string; value: string; sub?: string; testId: string }) {
  return (
    <Link href={href} className="card group flex flex-col !p-4 transition-[box-shadow,border-color] duration-150 hover:border-tinta-300 hover:shadow-alzada" data-testid={testId}>
      <p className="text-xs font-medium uppercase tracking-wide text-tinta-500">{label}</p>
      <p className="mt-2 font-display text-3xl leading-none tracking-tight text-monte num" data-testid="valor">
        {value}
      </p>
      {sub && <p className="mt-2 text-xs text-tinta-500">{sub}</p>}
      <p className="mt-auto flex items-center gap-0.5 pt-3 text-xs font-medium text-musgo">
        Ver las operaciones que lo forman
        <IconoChevronDerecha className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
      </p>
    </Link>
  );
}

function GrupoSection({ grupo, g, titulo, nota }: { grupo: Grupo; g: GrupoMetricas; titulo: string; nota: string }) {
  const k = g.kpis;
  const base = `/metricas/${grupo}`;
  return (
    <section className="space-y-4" data-testid={`grupo-${grupo}`}>
      <div>
        <h2 className="text-xl sm:text-2xl" data-testid={`titulo-${grupo}`}>
          {titulo}
        </h2>
        <p className="mt-1 text-sm text-tinta-600">{nota}</p>
      </div>
      {k.compras === 0 ? (
        <div className="rounded-card border border-dashed border-tinta-300 px-5 py-6 text-sm text-tinta-600" data-testid={`vacio-${grupo}`}>
          Todavía no hay compras en este grupo.{" "}
          {grupo === "piloto" && (
            <>
              Se cuentan aparte de las pruebas del equipo.{" "}
              <Link className="enlace" href="/piloto">
                Únete al piloto
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile testId="kpi-compras" href={`${base}/compras`} label={rotuloCompras(grupo)} value={nf(k.compras)} sub={`${k.en_curso} en curso ahora · ${k.cerradas} cerradas`} />
            <KpiTile testId="kpi-monto" href={`${base}/compras`} label={rotuloMonto(grupo)} value={`Bs ${nf(k.monto_bs)}`} sub={`${fmtUsd(k.monto_unidades)} dólares de prueba`} />
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
          <GraficoDiario serie={g.diario} compras={rotuloCompras(grupo)} monto={rotuloMonto(grupo)} testId={`grafico-${grupo}`} />
        </>
      )}
    </section>
  );
}

export default async function Metricas() {
  const m = await metricasSnapshot();
  return (
    <div className="mx-auto max-w-5xl space-y-12">
      <header className="pt-2">
        <p className="eyebrow">Registro público</p>
        <h1 className="mt-2 text-3xl sm:text-4xl">Métricas en vivo</h1>
        <p className="mt-4 max-w-3xl text-lg text-tinta-600">
          Los números de compras salen del registro público (red de prueba), no de una base de datos privada. Toca un número para ver las
          operaciones que lo forman, cada una con su link al registro público.
        </p>
        <p className="mt-3 text-xs text-tinta-500 num" data-testid="actualizado">
          Actualizado: {fmtHora(m.actualizado)} (hora de Bolivia) · {nf(m.eventos)} eventos hasta el bloque {nf(m.hasta_ledger)} · se recalcula cada 30 segundos
        </p>
        {m.error && (
          <p className="caja-aviso mt-3 max-w-3xl" data-testid="aviso-red" title={m.error}>
            No se pudo consultar la red ahora.{" "}
            {m.actualizado ? `Se muestran los últimos datos guardados, del ${fmtHora(m.actualizado)}.` : "Todavía no hay datos guardados: vuelve a intentarlo en un momento."}
          </p>
        )}
      </header>

      <section className="panel-suave space-y-2 sm:p-6" data-testid="inscritas-piloto">
        <h2 className="text-xl sm:text-2xl">Tiendas inscritas al piloto</h2>
        <p className="font-display text-3xl leading-none tracking-tight text-monte num" data-testid="valor">
          {nf(m.tiendas_inscritas_piloto)}
        </p>
        <p className="text-sm text-tinta-600">
          Son inscripciones, no compras: tiendas que llenaron el formulario de{" "}
          <Link className="enlace" href="/piloto">
            Únete al piloto
          </Link>
          , una por WhatsApp. No se suman con las compras de prueba ni con las del piloto.
        </p>
      </section>

      <GrupoSection
        grupo="piloto"
        g={m.piloto}
        titulo="Piloto con vendedores reales"
        nota="Solo compras de tiendas que entraron por el piloto. Nunca se suman con las pruebas del equipo."
      />
      <GrupoSection
        grupo="equipo"
        g={m.equipo}
        titulo={`${COMPRAS_INTERNAS} (incluye reclamos forzados)`}
        nota="No son ventas de tiendas reales: son compras hechas por el equipo y por las pruebas automáticas, con reclamos y devoluciones forzados a propósito para probar cada camino."
      />

      <p className="border-t border-tinta-200 pt-6 text-center text-sm text-tinta-500">
        Registro público de los contratos:{" "}
        <a className="enlace" href={explorer.contract(m.contratos.guardian)} target="_blank" rel="noreferrer">
          pp_guardian
        </a>{" "}
        y{" "}
        <a className="enlace" href={explorer.contract(m.contratos.arbiter)} target="_blank" rel="noreferrer">
          pp_arbiter
        </a>{" "}
        ·{" "}
        <Link className="enlace" href="/transparencia">
          Transparencia
        </Link>{" "}
        ·{" "}
        <a className="enlace" href="/api/metricas">
          Datos en JSON
        </a>
      </p>
    </div>
  );
}
