"use client";

import { IconoChevronDerecha, IconoWhatsApp } from "@/components/iconos";
import { TEXTO } from "@/lib/red";
import { NumerosTienda } from "@/components/Kpis";
import { desdeTexto, fmtProporcion, plural } from "@/lib/kpi-format";
import type { Kpis, OrderView } from "@/lib/types";
import { fmtWhatsApp } from "@/lib/format";
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
  if (!k.pagadas_al_vendedor) return "Tienda nueva · igual tu plata espera entre los dos";
  const sin = fmtProporcion(k.ventas_sin_reclamo, k.cerradas);
  return `${plural(k.pagadas_al_vendedor, "venta protegida", "ventas protegidas")} · ${sin === "Todas" ? "todas" : sin} sin reclamo`;
}

/**
 * Primer pantallazo: quién vende y su reputación, en una línea cada uno. Sin link a la tienda: en celular le quitaba
 * espacio a la reputación, y la tarjeta del vendedor ya lo tiene ("Ver el perfil de la tienda").
 */
export function Reputacion({ v }: { v: OrderView }) {
  const s = v.seller;
  return (
    <div className="flex items-center gap-2.5 pt-3" data-testid="reputacion">
      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-yungas text-xs font-semibold text-monte">{iniciales(s.store_name)}</span>
      <div className="min-w-0 flex-1 text-sm leading-tight">
        <p className="truncate font-semibold text-monte">
          {s.store_name}
          {s.city ? <span className="font-normal text-tinta-500"> · {s.city}</span> : null}
        </p>
        <p className="truncate text-tinta-600">{reputacionTexto(s.kpis)}</p>
      </div>
    </div>
  );
}

/** Primer pantallazo: quién vende, en una línea gris; la ficha completa va más abajo (una sola vez). */
export function VendidoPor({ v }: { v: OrderView }) {
  const s = v.seller;
  return (
    <p className="text-sm text-tinta-600" data-testid="reputacion">
      Vendido por <span className="font-medium text-monte">{s.store_name}</span>
      {s.city ? ` · ${s.city}` : ""}
    </p>
  );
}

/** Tarjeta completa del vendedor: los mismos números del perfil público /tienda/<slug>, calculados con el registro público. */
export function TarjetaVendedor({ v }: { v: OrderView }) {
  const s = v.seller;
  const k = s.kpis;
  return (
    <section className="space-y-4 border-t border-tinta-200 pt-5" data-testid="vendedor">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-tinta-100 font-semibold text-monte">{iniciales(s.store_name)}</div>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">La tienda</p>
          <p className="text-lg font-semibold leading-tight">{s.store_name}</p>
          <p className="text-sm text-tinta-600">
            {s.city ? `${s.city} · ` : ""}
            {reputacionTexto(k)}
          </p>
        </div>
        <a className="btn-secondary btn-sm flex-none" href={waLink("Hola, te escribo por tu link de pago de Trato", s.whatsapp)} target="_blank" rel="noreferrer">
          <IconoWhatsApp className="h-4 w-4 text-musgo" />
          Escribir
        </a>
      </div>
      {k.pagadas_al_vendedor > 0 && <NumerosTienda k={k} compacto />}
      <ul className="space-y-0.5 text-sm text-tinta-600">
        <li>{desdeTexto(k, s.since)}</li>
        <li>Verificación de identidad: pendiente ({TEXTO.modo})</li>
        <li>WhatsApp {fmtWhatsApp(s.whatsapp)}</li>
      </ul>
      {s.slug && (
        <a className="inline-flex items-center gap-1 text-sm font-semibold text-musgo" href={`/tienda/${s.slug}`} data-testid="link-perfil-tienda">
          Ver el perfil de la tienda y su historial
          <IconoChevronDerecha className="h-4 w-4" />
        </a>
      )}
    </section>
  );
}
