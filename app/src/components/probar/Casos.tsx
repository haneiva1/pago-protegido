"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { IconoAlerta, IconoBloqueado, IconoReloj, IconoVolver } from "@/components/iconos";
import { LlegaMal, NoConfirma, NoEnvia } from "./casos/Animados";
import { IntentoEnVivo } from "./casos/IntentoEnVivo";
import s from "./casos/casos.module.css";

/**
 * "¿Y si algo sale mal?", debajo de la demo: cuatro casos para elegir, cada uno en 15 s o menos. El primero es en vivo
 * (una orden real a la red que la red rechaza); los otros tres son animaciones cortas con su transacción real del README.
 */
const CASOS: { id: string; titulo: string; Icono: ComponentType<{ className?: string }>; enVivo?: boolean; Panel: ComponentType }[] = [
  { id: "intento", titulo: "Alguien intenta llevarse la plata", Icono: IconoBloqueado, enVivo: true, Panel: IntentoEnVivo },
  { id: "llega-mal", titulo: "Llega mal", Icono: IconoAlerta, Panel: LlegaMal },
  { id: "no-envia", titulo: "La tienda no envía a tiempo", Icono: IconoVolver, Panel: NoEnvia },
  { id: "no-confirma", titulo: "El comprador no confirma", Icono: IconoReloj, Panel: NoConfirma },
];

export function Casos({ className = "" }: { className?: string }) {
  const [elegido, setElegido] = useState(CASOS[0].id);
  // El caso en vivo prepara su pedido recién cuando la sección se ve: no compite con el arranque de la demo de arriba.
  const [visto, setVisto] = useState(false);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || visto) return;
    if (typeof IntersectionObserver === "undefined") return setVisto(true);
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setVisto(true), { rootMargin: "120px" });
    io.observe(el);
    return () => io.disconnect();
  }, [visto]);

  const caso = CASOS.find((c) => c.id === elegido) ?? CASOS[0];
  const Panel = caso.Panel;

  return (
    <section ref={ref} id="casos" data-testid="casos" className={`scroll-mt-24 ${className}`} aria-labelledby="casos-titulo">
      <div className="text-center">
        <h2 id="casos-titulo" className="text-2xl lg:text-3xl">
          ¿Y si algo sale mal?
        </h2>
        <p className="mt-1 text-sm text-tinta-600">Elige un caso.</p>
      </div>

      <div role="tablist" aria-label="Casos" className="mx-auto mt-5 grid max-w-4xl grid-cols-2 gap-2.5 lg:grid-cols-4">
        {CASOS.map(({ id, titulo, Icono, enVivo }) => {
          const activo = id === elegido;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`caso-tab-${id}`}
              aria-selected={activo}
              aria-controls="caso-panel"
              data-testid={`tab-caso-${id}`}
              onClick={() => setElegido(id)}
              className={`${s.tocable} relative flex min-h-[4.5rem] items-center gap-2.5 rounded-card px-3 py-3 text-left ${
                activo ? "bg-monte text-sal shadow-card" : "bg-white text-monte ring-1 ring-inset ring-tinta-200/80 hover:bg-tinta-50"
              }`}
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${activo ? "bg-sal/10 text-yungas" : id === "intento" ? "bg-error-50 text-error-600" : "bg-tinta-100 text-tinta-700"}`}>
                <Icono className="h-5 w-5" />
              </span>
              <span className="flex flex-col items-start gap-1">
                <span className="text-sm font-semibold leading-tight">{titulo}</span>
                {enVivo && (
                  <span className={`rounded-chip px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide ${activo ? "bg-yungas text-monte" : "bg-exito-100 text-musgo"}`}>
                    En vivo
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div
        key={caso.id}
        id="caso-panel"
        role="tabpanel"
        aria-labelledby={`caso-tab-${caso.id}`}
        className={`${s.panel} mx-auto mt-4 max-w-4xl rounded-panel bg-white px-4 py-6 ring-1 ring-inset ring-tinta-200/70 sm:px-8`}
      >
        {caso.id === "intento" ? <IntentoEnVivo activo={visto} /> : <Panel />}
      </div>
    </section>
  );
}
