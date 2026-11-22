import { IconoBolsa, IconoTienda } from "@/components/iconos";
import type { RolProbar } from "@/lib/probar";

/**
 * Marco de celular para /probar. Adentro va la página real (un iframe) o un aviso mientras no hay nada que mostrar.
 * El alto se calcula con el viewport: en celular (390 px) el marco entero, con la barra fija de "Pagar" incluida, tiene
 * que quedar a la vista sin bajar la página; en escritorio los dos celulares caben enteros en una laptop de 900 px.
 */
export function MarcoCelular({
  rol,
  titulo,
  turno = false,
  testId,
  className = "",
  children,
}: {
  rol: RolProbar;
  titulo: string;
  /** Es el celular en el que toca actuar: etiqueta y bisel en Yungas. */
  turno?: boolean;
  testId: string;
  className?: string;
  children: React.ReactNode;
}) {
  const Icono = rol === "vendedor" ? IconoTienda : IconoBolsa;
  return (
    <figure data-testid={testId} data-turno={turno ? "si" : "no"} className={`relative flex-col items-center gap-2.5 ${className}`}>
      <figcaption
        className={`absolute -top-3 left-1/2 z-10 hidden -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold shadow-card transition-colors duration-150 lg:inline-flex ${
          turno ? "bg-yungas text-monte" : "bg-white text-tinta-700 ring-1 ring-tinta-200"
        }`}
      >
        <Icono className="h-4 w-4" />
        {titulo}
      </figcaption>
      <div
        className={`relative w-full max-w-[380px] rounded-[2rem] bg-monte p-2 shadow-celular transition-shadow duration-150 lg:w-[340px] lg:rounded-[2.5rem] lg:p-2.5 xl:w-[360px] ${
          turno ? "ring-2 ring-yungas ring-offset-2 ring-offset-sal" : ""
        }`}
      >
        <div className="h-[calc(100svh-27rem)] max-h-[48rem] min-h-[25rem] overflow-hidden rounded-[1.5rem] bg-sal lg:h-[clamp(480px,calc(100vh-20rem),760px)] lg:rounded-[2rem]">
          {children}
        </div>
      </div>
    </figure>
  );
}
