"use client";

import { IconoChevronAbajo } from "@/components/iconos";

/** Select con el estilo de los inputs y el chevron del set (en vez del del navegador). Mantiene id y label. */
export function Select({ className = "", children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select {...rest} className={`input appearance-none pr-11 ${className}`}>
        {children}
      </select>
      <IconoChevronAbajo className="pointer-events-none absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-tinta-500" />
    </span>
  );
}
