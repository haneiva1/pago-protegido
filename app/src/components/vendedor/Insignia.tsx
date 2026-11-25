"use client";

import { IconoChevronAbajo } from "@/components/iconos";
import { CopyButton } from "@/components/ui";
import { fmtDuracion, fmtProporcion, nf, rotuloVentas } from "@/lib/kpi-format";
import type { Kpis } from "@/lib/types";

/**
 * Insignia "Vendo con Trato" para la bio de Instagram o TikTok (M9). Antes estaba en /tienda/<slug>, donde la veía el
 * comprador; ahora está en el panel, que es donde la usa el vendedor. La imagen sigue en /tienda/<slug>/insignia.
 */
export function Insignia({ slug, storeName, kpis, piloto }: { slug: string; storeName: string; kpis: Kpis; piloto: boolean }) {
  const url = `${typeof window === "undefined" ? "" : window.location.origin}/tienda/${slug}`;
  const resumen = `${nf(kpis.pagadas_al_vendedor)} ${rotuloVentas(kpis.pagadas_al_vendedor, piloto)} · ${fmtProporcion(kpis.ventas_sin_reclamo, kpis.cerradas)} sin reclamo · despacho promedio ${fmtDuracion(kpis.despacho_promedio_s)}`;
  const bio = `Vendo con Trato ✅ ${resumen} ${url}`;

  return (
    <details className="group border-t border-tinta-200 pt-5" data-testid="insignia" open={kpis.pagadas_al_vendedor > 0}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-lg font-semibold [&::-webkit-details-marker]:hidden">
        Insignia «Vendo con Trato» para tu bio
        <IconoChevronAbajo className="h-5 w-5 flex-none text-tinta-500 transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <p className="mt-3 text-sm text-tinta-600">
        Pega este link en la bio de tu Instagram o TikTok. Quien lo abra ve tus números y puede revisar cada compra en el registro público.
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/tienda/${slug}/insignia`} alt={`${storeName} vende con Trato`} width={1200} height={630} className="mt-3 h-auto w-full rounded-card ring-1 ring-tinta-200" />
      <p className="mt-3 truncate rounded-control bg-tinta-50 px-3.5 py-3 font-mono text-sm" data-testid="link-perfil">
        {url}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <CopyButton text={url} label="Copiar link" className="btn-secondary btn-sm" testId="copiar-link-perfil" />
        <CopyButton text={bio} label="Copiar texto para la bio" className="btn-secondary btn-sm" />
        <a className="btn-secondary btn-sm" href={`/tienda/${slug}/insignia`} download={`trato-${slug}.png`}>
          Descargar imagen
        </a>
      </div>
    </details>
  );
}
