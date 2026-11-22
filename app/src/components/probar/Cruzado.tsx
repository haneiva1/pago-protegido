"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Fundido cruzado de un texto que cambia: el anterior se desvanece mientras el nuevo entra (opacidad y 8 px), los dos en
 * la misma celda de una grilla, así el alto no salta. Con prefers-reduced-motion el cambio es instantáneo.
 */
export function Cruzado({ clave, children, className = "" }: { clave: string; children: ReactNode; className?: string }) {
  const [ultima, setUltima] = useState<{ clave: string; children: ReactNode }>({ clave, children });
  const [saliente, setSaliente] = useState<{ clave: string; children: ReactNode } | null>(null);
  // Patrón "estado derivado del render anterior": se guarda lo que se va en el mismo render en que cambia la clave.
  if (ultima.clave !== clave) {
    setSaliente(ultima);
    setUltima({ clave, children });
  }
  useEffect(() => {
    if (!saliente) return;
    const t = setTimeout(() => setSaliente(null), 240);
    return () => clearTimeout(t);
  }, [saliente]);
  return (
    <span className={`grid ${className}`}>
      {saliente && (
        <span key={`s-${saliente.clave}`} aria-hidden className="pointer-events-none [grid-area:1/1] animate-[sale_220ms_var(--ease-suave)_both]">
          {saliente.children}
        </span>
      )}
      <span key={clave} className="[grid-area:1/1] animate-[paso_260ms_var(--ease-suave)_both]">
        {children}
      </span>
    </span>
  );
}
