"use client";

import { useEffect, useState } from "react";
import { pendientes, type PedidoPendiente } from "@/lib/vendedor";

const TZ = "America/La_Paz";
const hora = (ms: number) => new Intl.DateTimeFormat("es-BO", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(ms));
const diaHora = (ms: number) =>
  new Intl.DateTimeFormat("es-BO", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(ms));

/** "Pendientes de hoy" (M9): qué despachar y qué reclamo responder, con su plazo. Tocar uno lleva al pedido. */
export function Pendientes({ pedidos, onIr }: { pedidos: PedidoPendiente[]; onIr: (slug: string) => void }) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const lista = pendientes(pedidos, ahora);

  return (
    <section className="card space-y-2" data-testid="pendientes">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">Pendientes de hoy</h2>
        {lista.length > 0 && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">{lista.length}</span>}
      </div>
      {lista.length === 0 ? (
        <p className="muted" data-testid="sin-pendientes">
          Nada pendiente: no tienes pedidos por despachar ni reclamos por responder. 🙌
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {lista.map((p) => {
            const plazo =
              p.vence == null
                ? null
                : p.cuando === "vencido"
                  ? `venció el ${diaHora(p.vence)}`
                  : p.cuando === "hoy"
                    ? `hasta hoy a las ${hora(p.vence)}`
                    : `hasta el ${diaHora(p.vence)}`;
            return (
              <li key={`${p.tipo}-${p.slug}`} data-testid={`pendiente-${p.slug}`}>
                <button type="button" onClick={() => onIr(p.slug)} className="flex w-full items-center gap-3 py-2.5 text-left">
                  <span className="text-xl" aria-hidden>
                    {p.tipo === "despachar" ? "📦" : "⚠️"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {p.tipo === "despachar" ? "Despachar" : "Responder el reclamo"}: {p.product}
                    </span>
                    <span className={`block text-xs ${p.cuando === "vencido" ? "font-semibold text-rose-700" : p.cuando === "hoy" ? "font-semibold text-amber-800" : "text-slate-500"}`}>
                      {[p.code, plazo].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="text-slate-400" aria-hidden>
                    →
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
