"use client";

import { useEffect, useState } from "react";
import { IconoAlerta, IconoCamion, IconoCheckCirculo, IconoChevronDerecha } from "@/components/iconos";
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
    <section className="card space-y-2 sm:p-6" data-testid="pendientes">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xl">Pendientes de hoy</h2>
        {lista.length > 0 && <span className="chip-aviso num">{lista.length}</span>}
      </div>
      {lista.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-tinta-600" data-testid="sin-pendientes">
          <IconoCheckCirculo className="h-5 w-5 flex-none text-musgo" />
          Nada pendiente: no tienes pedidos por despachar ni reclamos por responder.
        </p>
      ) : (
        <ul className="divide-y divide-tinta-100">
          {lista.map((p) => {
            const plazo =
              p.vence == null
                ? null
                : p.cuando === "vencido"
                  ? `venció el ${diaHora(p.vence)}`
                  : p.cuando === "hoy"
                    ? `hasta hoy a las ${hora(p.vence)}`
                    : `hasta el ${diaHora(p.vence)}`;
            const Icono = p.tipo === "despachar" ? IconoCamion : IconoAlerta;
            return (
              <li key={`${p.tipo}-${p.slug}`} data-testid={`pendiente-${p.slug}`}>
                <button type="button" onClick={() => onIr(p.slug)} className="flex w-full items-center gap-3 rounded-control py-2.5 text-left transition-colors duration-150 hover:bg-tinta-50">
                  <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-full ${p.tipo === "despachar" ? "bg-exito-50 text-musgo" : "bg-aviso-50 text-aviso-700"}`}>
                    <Icono className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {p.tipo === "despachar" ? "Despachar" : "Responder el reclamo"}: {p.product}
                    </span>
                    <span className={`block text-xs ${p.cuando === "vencido" ? "font-semibold text-error-700" : p.cuando === "hoy" ? "font-semibold text-aviso-700" : "text-tinta-500"}`}>
                      {[p.code, plazo].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <IconoChevronDerecha className="h-5 w-5 flex-none text-tinta-400" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
