"use client";

import { CopyButton } from "@/components/ui";
import { fmtDuracion, fmtProporcion, nf } from "@/lib/kpi-format";
import type { Kpis } from "@/lib/types";

/**
 * Insignia "Vendo con Trato" para la bio de Instagram o TikTok (M9). Antes estaba en /tienda/<slug>, donde la veía el
 * comprador; ahora está en el panel, que es donde la usa el vendedor. La imagen sigue en /tienda/<slug>/insignia.
 */
export function Insignia({ slug, storeName, kpis }: { slug: string; storeName: string; kpis: Kpis }) {
  const url = `${typeof window === "undefined" ? "" : window.location.origin}/tienda/${slug}`;
  const resumen = `${nf(kpis.pagadas_al_vendedor)} ${kpis.pagadas_al_vendedor === 1 ? "venta protegida" : "ventas protegidas"} · ${fmtProporcion(kpis.ventas_sin_reclamo, kpis.cerradas)} sin reclamo · despacho promedio ${fmtDuracion(kpis.despacho_promedio_s)}`;
  const bio = `Vendo con Trato ✅ ${resumen} ${url}`;

  return (
    <section className="card space-y-3 sm:p-6" data-testid="insignia">
      <h2 className="text-xl">Insignia «Vendo con Trato» para tu bio</h2>
      <p className="text-sm text-tinta-600">
        Pega este link en la bio de tu Instagram o TikTok. Quien lo abra ve tus números y puede revisar cada compra en el registro público.
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/tienda/${slug}/insignia`} alt={`${storeName} vende con Trato`} width={1200} height={630} className="h-auto w-full rounded-card ring-1 ring-tinta-200" />
      <p className="break-all rounded-control bg-tinta-50 p-3 font-mono text-sm ring-1 ring-tinta-200" data-testid="link-perfil">
        {url}
      </p>
      <div className="flex flex-wrap gap-2">
        <CopyButton text={url} label="Copiar link" testId="copiar-link-perfil" />
        <CopyButton text={bio} label="Copiar texto para la bio" />
        <a className="btn-secondary" href={`/tienda/${slug}/insignia`} download={`trato-${slug}.png`}>
          Descargar imagen
        </a>
      </div>
    </section>
  );
}
