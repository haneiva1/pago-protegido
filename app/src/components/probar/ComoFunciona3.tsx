import { IconoBillete, IconoCandado, IconoCheckCirculo } from "@/components/iconos";

const PASOS = [
  { Icono: IconoBillete, texto: "Tu cliente paga" },
  { Icono: IconoCandado, texto: "La plata espera entre los dos" },
  { Icono: IconoCheckCirculo, texto: "Recibe y la tienda cobra" },
];

/**
 * Cómo funciona, en tres pasos de una línea con ícono. `vertical`: en columna, sin conectores (la columna izquierda
 * de /probar en escritorio); si no, en fila desde `sm` con conectores finos.
 */
export function ComoFunciona3({ className = "", vertical = false }: { className?: string; vertical?: boolean }) {
  return (
    <ol data-testid="como-funciona-3" className={`flex flex-col gap-2 ${vertical ? "" : "sm:flex-row sm:items-center sm:gap-6"} ${className}`}>
      {PASOS.map(({ Icono, texto }, i) => (
        <li key={texto} className="flex items-center gap-2.5 text-sm font-medium text-monte">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-exito-100 text-musgo">
            <Icono className="h-4 w-4" />
          </span>
          <span>
            <span className="num mr-1.5 text-tinta-500">{i + 1}</span>
            {texto}
          </span>
          {!vertical && i < PASOS.length - 1 && <span aria-hidden className="ml-2 hidden h-px w-6 bg-tinta-300 sm:block" />}
        </li>
      ))}
    </ol>
  );
}
