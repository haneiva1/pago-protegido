"use client";

import { Spinner, type ProgressStep } from "@/components/ui";

/**
 * Espera larga explicada en una sola línea ("Guardando tu pago… unos 30 segundos") con una barra de avance.
 * Nadie debe pensar que se colgó; los detalles (cada transacción) quedan en el registro del pedido al terminar.
 */
export function EsperaEnCurso({ titulo, nota, testId }: { titulo: string; nota?: string; steps?: ProgressStep[]; testId?: string }) {
  return (
    <section className="space-y-2.5 rounded-card bg-tinta-50 p-4 animate-aparecer" data-testid={testId ?? "espera"} aria-live="polite">
      <p className="flex items-center gap-2 text-base font-semibold text-monte">
        <Spinner className="h-4 w-4 flex-none text-musgo" />
        {titulo}
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-tinta-200" aria-hidden>
        <div className="h-full w-1/3 rounded-full bg-yungas animate-barra" />
      </div>
      {nota ? <p className="text-sm text-tinta-600">{nota}</p> : null}
    </section>
  );
}

/** Barra de avance determinada (de 0 a 100) para plazos conocidos: cuenta regresiva de la revisión, del despacho, etc. */
export function BarraAvance({ pct, className = "" }: { pct: number; className?: string }) {
  const p = Math.min(100, Math.max(0, pct));
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-tinta-200 ${className}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p)}>
      <div className="h-full rounded-full bg-yungas transition-[width] duration-1000 ease-linear" style={{ width: `${p}%` }} />
    </div>
  );
}
