import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ListaOperaciones, NumerosTienda } from "@/components/Kpis";
import { explorer } from "@/lib/format";
import { desdeTexto, fmtDuracion, fmtHora, fmtProporcion, nf } from "@/lib/kpi-format";
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
      <section className="card space-y-4" data-testid="perfil-tienda">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-brand-600 text-xl font-bold text-monte">{initials}</div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold" data-testid="perfil-nombre">
              {p.store_name}
            </h1>
            <p className="text-sm text-slate-600">
              {p.city ? `${p.city} · ` : ""}
              {desdeTexto(k, p.tienda_desde)}
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-800 ring-1 ring-brand-200" data-testid="sello">
          🛡️ Vende con Trato
        </span>
        <NumerosTienda k={k} />
        <ul className="space-y-0.5 text-sm text-slate-600">
          <li data-testid="verificacion">Verificación de identidad: pendiente (modo práctica)</li>
          <li>
            {p.pilot
              ? "Tienda del piloto con vendedores reales."
              : "Datos de práctica en la red de prueba: esta tienda es de las pruebas del equipo, no del piloto."}
          </li>
          <li className="text-xs text-slate-500" data-testid="perfil-actualizado">
            Calculado con el registro público de cada compra · actualizado: {fmtHora(p.actualizado)}
            {p.error ? " (no se pudo consultar la red ahora; se muestran los últimos datos guardados)" : ""}
          </li>
        </ul>
      </section>

      <section className="card space-y-2">
        <h2 className="font-bold">Historial verificable</h2>
        <p className="text-sm text-slate-600">
          Las últimas compras de esta tienda, cada una con su link al registro público.{" "}
          <a className="underline" href={explorer.account(p.cuenta)} target="_blank" rel="noreferrer">
            Ver la cuenta de la tienda en el registro público
          </a>
          .
        </p>
        <ListaOperaciones compras={p.registro} fx={p.fx} />
      </section>

      <p className="text-center text-xs text-slate-500">
        Este perfil no muestra el teléfono ni la dirección de la tienda. ·{" "}
        <Link className="underline" href="/metricas">
          Métricas de Trato
        </Link>
      </p>
    </div>
  );
}
