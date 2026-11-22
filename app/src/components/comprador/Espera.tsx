"use client";

import { Progress, Spinner, type ProgressStep } from "@/components/ui";

/**
 * Espera larga explicada: qué está pasando, cuánto suele tardar y los pasos que ya salieron (cada uno con su
 * transacción). Nadie debe pensar que se colgó.
 */
export function EsperaEnCurso({ titulo, nota, steps, testId }: { titulo: string; nota: string; steps: ProgressStep[]; testId?: string }) {
  return (
    <section className="space-y-3 rounded-card bg-tinta-50 p-4 animate-aparecer" data-testid={testId ?? "espera"} aria-live="polite">
      <div className="flex items-center gap-2 text-musgo">
        <Spinner className="h-5 w-5" />
        <h2 className="font-sans text-lg font-semibold text-monte">{titulo}</h2>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-tinta-100" aria-hidden>
        <div className="h-full w-1/3 rounded-full bg-yungas animate-barra" />
      </div>
      <p className="text-base text-tinta-600">{nota}</p>
      <Progress steps={steps} />
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
