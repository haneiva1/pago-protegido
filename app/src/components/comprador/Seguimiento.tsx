"use client";

import { useEffect, useState } from "react";
import { IconoCheck } from "@/components/iconos";
import { CopyButton, Spinner } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { fmtFlete } from "@/lib/comprador";
import type { OrderView } from "@/lib/types";

/** "Ya lo recogí" vive en este navegador (no firma nada ni mueve plata): solo ordena el próximo paso. */
const claveRecogido = (slug: string) => `trato.recogido.${slug}`;

export function useRecogido(slug: string): [boolean, () => void] {
  const [recogido, setRecogido] = useState(false);
  useEffect(() => {
    try {
      setRecogido(window.localStorage.getItem(claveRecogido(slug)) === "1");
    } catch {
      /* sin almacenamiento: queda en memoria */
    }
  }, [slug]);
  const marcar = () => {
    setRecogido(true);
    try {
      window.localStorage.setItem(claveRecogido(slug), "1");
    } catch {
      /* sin almacenamiento */
    }
  };
  return [recogido, marcar];
}

/**
 * Seguimiento tipo delivery (M7): pagado → despachado → en tus manos → pagado a la tienda, y "Tu próximo paso" para el
 * comprador. "Todavía no llegó" usa el `extend` que ya existe (una sola vez).
 */
export function Seguimiento({
  v,
  esComprador,
  recogido,
  busy,
  onRecogido,
  onNoLlego,
}: {
  v: OrderView;
  esComprador: boolean;
  recogido: boolean;
  busy: boolean;
  onRecogido: () => void;
  onNoLlego: () => void;
}) {
  const o = v.order;
  if (o.status !== "pagado" && o.status !== "enviado" && o.status !== "liberado") return null;
  const pasos = [
    { t: "Pagado", ok: Boolean(o.funded_at) },
    { t: "Despachado", ok: Boolean(o.shipped_at) },
    { t: "En tus manos", ok: recogido || o.status === "liberado" },
    { t: "Pagado a la tienda", ok: o.status === "liberado" },
  ];
  const actual = pasos.findIndex((p) => !p.ok);
  const enPersona = o.ship_company === "Entrega en persona";
  const flete = fmtFlete(o.flete);
  const puedeExtender = Boolean(v.capabilities.extend && !o.extended && o.deadline && Date.now() < o.deadline);

  return (
    <section className="space-y-5" data-testid="seguimiento">
      <ol className="relative grid grid-cols-4 gap-1 text-center text-xs font-medium" data-testid="pasos-seguimiento">
        {/* La línea que une los pasos: completa hasta el último hecho. */}
        <span aria-hidden className="absolute left-[12.5%] right-[12.5%] top-3.5 h-0.5 bg-tinta-200" />
        <span
          aria-hidden
          className="absolute left-[12.5%] top-3.5 h-0.5 bg-yungas transition-[width] duration-500"
          style={{ width: `${Math.max(0, (actual < 0 ? 3 : actual - 1)) * 25}%` }}
        />
        {pasos.map((p, i) => (
          <li key={p.t} className="relative flex flex-col items-center gap-1.5" data-testid={`paso-${i + 1}`} data-hecho={p.ok ? "si" : "no"}>
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold num ${
                p.ok ? "bg-yungas text-monte" : i === actual ? "bg-white text-musgo ring-2 ring-musgo" : "bg-tinta-100 text-tinta-500 ring-1 ring-tinta-200"
              }`}
            >
              {p.ok ? <IconoCheck className="h-3.5 w-3.5" strokeWidth={2.5} /> : i + 1}
            </span>
            <span className={p.ok || i === actual ? "text-tinta-800" : "text-tinta-500"}>{p.t}</span>
          </li>
        ))}
      </ol>

      {esComprador && (
        <div className="space-y-1 border-l-2 border-yungas pl-4 text-base" data-testid="proximo-paso">
          <p className="eyebrow">Tu próximo paso</p>
          {o.status === "pagado" && (
            <p className="mt-1">
              Espera el despacho. {v.seller.store_name} tiene hasta el <strong>{fmtDate(o.ship_deadline)}</strong>; si no despacha, el pago vuelve a ti solo.
            </p>
          )}
          {o.status === "enviado" && !recogido && (
            <div className="mt-1 space-y-2">
              {enPersona ? (
                <p>Coordina la entrega con {v.seller.store_name}. Cuando lo tengas, revísalo antes de pagar.</p>
              ) : (
                <p>
                  Recoge en <strong>{o.ship_company ?? "la agencia"}</strong> con tu carnet{o.ship_tracking ? " y la guía " : ""}
                  {o.ship_tracking && <strong className="font-mono">{o.ship_tracking}</strong>}.
                </p>
              )}
              {flete && <p className="text-tinta-600">{flete}.</p>}
              <div className="flex flex-wrap gap-2">
                {o.ship_tracking && <CopyButton text={o.ship_tracking} label="Copiar guía" className="btn-secondary btn-sm" />}
                <button type="button" className="btn-oscuro btn-sm" onClick={onRecogido} disabled={busy}>
                  Ya lo recogí
                </button>
                {puedeExtender && (
                  <button type="button" className="btn-secondary btn-sm" onClick={onNoLlego} disabled={busy}>
                    {busy ? <Spinner /> : null} Todavía no llegó
                  </button>
                )}
              </div>
              {puedeExtender ? (
                <p className="text-sm text-tinta-600">«Todavía no llegó» suma otra ventana de revisión, una sola vez. La tienda no cobra mientras tanto.</p>
              ) : o.extended ? (
                <p className="text-sm text-tinta-600">Ya pediste más tiempo. Si no llega, abre un reclamo con el motivo «No llegó».</p>
              ) : null}
            </div>
          )}
          {o.status === "enviado" && recogido && (
            <p className="mt-1">
              Revísalo antes de pagar{o.ship_imei ? " y compara el IMEI (*#06#)" : ""}. Si está bien, paga a la tienda; si no, toca «Tengo un problema».
            </p>
          )}
          {o.status === "liberado" && <p className="mt-1">¡Listo! La tienda ya cobró. Este link queda como tu comprobante.</p>}
        </div>
      )}
    </section>
  );
}
