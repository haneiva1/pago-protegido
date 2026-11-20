"use client";

import { NumerosTienda } from "@/components/Kpis";
import { desdeTexto, fmtProporcion, plural } from "@/lib/kpi-format";
import type { Kpis, OrderView } from "@/lib/types";
import { waLink } from "@/lib/whatsapp";

const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

/**
 * La reputación en una sola línea, con los mismos números de la tarjeta y del perfil público (num-ventas y
 * num-sin-reclamo): nunca dos cifras de reclamos que se contradigan.
 */
export function reputacionTexto(k: Kpis): string {
  if (!k.pagadas_al_vendedor) return "Tienda nueva · igual tu plata queda guardada";
  const sin = fmtProporcion(k.ventas_sin_reclamo, k.cerradas);
  return `${plural(k.pagadas_al_vendedor, "venta protegida", "ventas protegidas")} · ${sin === "Todas" ? "todas" : sin} sin reclamo`;
}

/** Primer pantallazo: quién vende y su reputación, en una línea cada uno. */
export function Reputacion({ v }: { v: OrderView }) {
  const s = v.seller;
  return (
    <div className="flex items-center gap-2.5 pt-2" data-testid="reputacion">
      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{iniciales(s.store_name)}</span>
      <div className="min-w-0 flex-1 text-sm leading-tight">
        <p className="truncate font-semibold text-slate-900">
          {s.store_name}
          {s.city ? <span className="font-normal text-slate-500"> · {s.city}</span> : null}
        </p>
        <p className="truncate text-slate-600">{reputacionTexto(s.kpis)}</p>
      </div>
      {s.slug && (
        <a className="flex-none text-xs font-semibold text-brand-700 underline" href={`/tienda/${s.slug}`}>
          Ver tienda
        </a>
      )}
    </div>
  );
}

/** Tarjeta completa del vendedor: los mismos números del perfil público /tienda/<slug>, calculados con el registro público. */
export function TarjetaVendedor({ v }: { v: OrderView }) {
  const s = v.seller;
  const k = s.kpis;
  return (
    <section className="card space-y-3" data-testid="vendedor">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-brand-600 font-bold text-white">{iniciales(s.store_name)}</div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            Vendedor: {s.store_name}
            {s.city ? ` · ${s.city}` : ""}
          </p>
          <p className="text-xs text-slate-600">{reputacionTexto(k)}</p>
        </div>
        <a className="btn-secondary flex-none !px-3 !py-2 text-sm" href={waLink("Hola, te escribo por tu link de pago de Trato", s.whatsapp)} target="_blank" rel="noreferrer">
          Escribir
        </a>
      </div>
      <NumerosTienda k={k} compacto />
      <ul className="space-y-0.5 text-xs text-slate-600">
        <li>{desdeTexto(k, s.since)}</li>
        <li>Verificación de identidad: pendiente (modo práctica)</li>
        <li>WhatsApp {s.whatsapp}</li>
      </ul>
      {s.slug && (
        <a className="inline-block text-sm font-semibold text-brand-700 underline" href={`/tienda/${s.slug}`} data-testid="link-perfil-tienda">
          Ver el perfil de la tienda y su historial →
        </a>
      )}
    </section>
  );
}
