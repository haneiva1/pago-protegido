"use client";

import { useEffect, useState } from "react";

/** Una duración legible: "47 s", "2 min 19 s", "3 min". */
export function legible(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return s % 60 ? `${m} min ${s % 60} s` : `${m} min`;
}

/** El resumen de la prueba: transacciones y duración cuentan hacia arriba (800 ms) la primera vez que aparecen. */
export function Resumen({ resumen }: { resumen: { transacciones: number; duracionMs: number } }) {
  const transacciones = useCuenta(resumen.transacciones);
  const duracionMs = useCuenta(resumen.duracionMs);
  return (
    <span data-testid="construido-resumen" className="num">
      · esta prueba: {transacciones} transacciones públicas en {legible(duracionMs)}
    </span>
  );
}

/** Cuenta de 0 al valor final con salida suave; con prefers-reduced-motion va directo al final. */
function useCuenta(final: number, ms = 800): number {
  const [valor, setValor] = useState(0);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || final <= 0) {
      setValor(final);
      return;
    }
    const t0 = performance.now();
    let raf = requestAnimationFrame(function paso(t) {
      const k = Math.min(1, (t - t0) / ms);
      const suave = 1 - Math.pow(1 - k, 3);
      setValor(Math.round(final * suave));
      if (k < 1) raf = requestAnimationFrame(paso);
    });
    return () => cancelAnimationFrame(raf);
  }, [final, ms]);
  return valor;
}
