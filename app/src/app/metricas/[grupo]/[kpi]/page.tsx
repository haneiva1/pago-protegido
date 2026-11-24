import Link from "next/link";
import { notFound } from "next/navigation";
import { IconoChevronDerecha } from "@/components/iconos";
import { ListaOperaciones } from "@/components/Kpis";
import { fmtDuracion, fmtHora, nf } from "@/lib/kpi-format";
import { TEXTO } from "@/lib/red";
import { KPI_DETALLE, comprasDeGrupo, isGrupo, isKpi, metricasSnapshot } from "@/lib/server/kpis";
import type { CompraOnchain } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operaciones · Métricas · Trato" };

const secs = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 1000;

/** La lista de compras que forma cada número de /metricas, con su link al registro público. */
export default async function Detalle({ params }: { params: Promise<{ grupo: string; kpi: string }> }) {
  const { grupo, kpi } = await params;
  if (!isGrupo(grupo) || !isKpi(kpi)) notFound();
  const m = await metricasSnapshot();
  const meta = KPI_DETALLE[kpi];
  const list = comprasDeGrupo(grupo).filter(meta.filtro);
  const extra = (c: CompraOnchain) =>
    kpi === "cobro" && c.closed_at
      ? `cobró ${fmtDuracion(secs(c.funded_at, c.closed_at))} después del pago`
      : kpi === "despacho" && c.shipped_at
        ? `despachó ${fmtDuracion(secs(c.funded_at, c.shipped_at))} después del pago`
        : null;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link className="inline-flex items-center gap-0.5 text-sm font-medium text-musgo hover:underline" href="/metricas">
        <IconoChevronDerecha className="h-4 w-4 rotate-180" />
        Métricas en vivo
      </Link>
      <header>
        <p className="eyebrow" data-testid="grupo-detalle">
          {grupo === "piloto" ? "Piloto con vendedores reales" : TEXTO.grupoPropioCorto}
        </p>
        <h1 className="mt-2 text-2xl sm:text-3xl">{meta.titulo}</h1>
        <p className="mt-2 text-tinta-600">{meta.explica}</p>
        <p className="mt-2 text-xs text-tinta-500 num" data-testid="total-detalle">
          {nf(list.length)} {list.length === 1 ? "compra" : "compras"} · actualizado: {fmtHora(m.actualizado)}
        </p>
      </header>
      <section className="card !py-2 sm:!px-6">
        <ListaOperaciones compras={list.slice(0, 200)} fx={m.fx} extra={extra} />
        {list.length > 200 && <p className="py-3 text-xs text-tinta-500">Se muestran las 200 más recientes. El resto está en /api/metricas.</p>}
      </section>
    </div>
  );
}
