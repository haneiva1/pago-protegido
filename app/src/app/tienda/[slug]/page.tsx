import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Nudo } from "@/components/iconos";
import { ListaOperaciones, NumerosTienda } from "@/components/Kpis";
import { explorer } from "@/lib/format";
import { COMPRAS_INTERNAS, desdeTexto, fmtDuracion, fmtHora, fmtProporcion, nf } from "@/lib/kpi-format";
import { perfilTienda } from "@/lib/server/kpis";
import type { PerfilTienda } from "@/lib/types";

export const dynamic = "force-dynamic";

const cargar = cache(perfilTienda);

const resumen = (p: PerfilTienda) => {
  const k = p.kpis;
  return `${nf(k.pagadas_al_vendedor)} ${k.pagadas_al_vendedor === 1 ? "venta protegida" : "ventas protegidas"} · ${fmtProporcion(k.ventas_sin_reclamo, k.cerradas)} sin reclamo · despacho promedio ${fmtDuracion(k.despacho_promedio_s)}`;
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await cargar(slug);
  if (!p) return { title: "Tienda no encontrada · Trato" };
  const title = `${p.store_name} vende con Trato`;
  const description = `${resumen(p)}. Historial verificable en el registro público de cada compra.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "profile", siteName: "Trato", locale: "es_BO" },
    twitter: { card: "summary_large_image", title, description },
  };
}

/**
 * Perfil público y verificable de la tienda. Sin teléfono ni dirección: solo números del registro público.
 * La insignia para la bio está en el panel del vendedor (M9); la imagen sigue en /tienda/<slug>/insignia.
 */
export default async function Tienda({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await cargar(slug);
  if (!p) notFound();
  const k = p.kpis;
  const initials = p.store_name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Cabecera en Monte: el perfil es la cara pública de la tienda, con el Nudo y el sello en Yungas. */}
      <section className="panel-oscuro space-y-5 !p-5 sm:!p-7" data-testid="perfil-tienda" data-oscuro="">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-yungas font-display text-lg text-monte sm:h-16 sm:w-16 sm:text-2xl">{initials}</div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl leading-tight text-sal sm:text-3xl" data-testid="perfil-nombre">
              {p.store_name}
            </h1>
            <p className="mt-1 text-sm text-sal/70">
              {p.city ? `${p.city} · ` : ""}
              {desdeTexto(k, p.tienda_desde)}
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-yungas px-3 py-1.5 text-sm font-semibold text-monte" data-testid="sello">
          <Nudo className="h-3.5 w-3.5" />
          Vende con Trato
        </span>
        <NumerosTienda k={k} />
        <ul className="space-y-1 text-sm text-sal/80">
          <li data-testid="verificacion">Verificación de identidad: pendiente (modo práctica)</li>
          <li>
            {p.pilot
              ? "Tienda del piloto con vendedores reales."
              : `${COMPRAS_INTERNAS}: esta tienda es de las pruebas del equipo, no del piloto.`}
          </li>
          <li className="text-xs text-sal/60" data-testid="perfil-actualizado">
            Calculado con el registro público de cada compra · actualizado: {fmtHora(p.actualizado)}
            {p.error ? " (no se pudo consultar la red ahora; se muestran los últimos datos guardados)" : ""}
          </li>
        </ul>
      </section>

      <section className="card space-y-3 sm:p-6">
        <h2 className="text-2xl">Historial verificable</h2>
        <p className="text-sm text-tinta-600">
          Las últimas compras de esta tienda, cada una con su link al registro público.{" "}
          <a className="enlace" href={explorer.account(p.cuenta)} target="_blank" rel="noreferrer">
            Ver la cuenta de la tienda en el registro público
          </a>
          .
        </p>
        <ListaOperaciones compras={p.registro} fx={p.fx} />
      </section>

      <p className="text-center text-xs text-tinta-500">
        Este perfil no muestra el teléfono ni la dirección de la tienda. ·{" "}
        <Link className="enlace" href="/metricas">
          Métricas de Trato
        </Link>
      </p>
    </div>
  );
}
