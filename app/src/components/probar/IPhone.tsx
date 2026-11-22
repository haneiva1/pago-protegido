import type { CSSProperties, ReactNode } from "react";
import { IconoBolsa, IconoTienda } from "@/components/iconos";
import type { RolProbar } from "@/lib/probar";

/**
 * Un iPhone de verdad para /probar: pantalla de 393×852 con bisel de 10 px, Dynamic Island, botones laterales,
 * barra de estado e indicador de inicio. Adentro, la app corre a 390 px reales; el teléfono entero se escala con
 * `transform` para entrar en el espacio disponible, y el contenedor reserva el alto escalado (sin huecos ni cortes).
 * En pantallas angostas (< 640 px) no se dibuja un teléfono dentro del teléfono del jurado: el chat va a pantalla
 * completa, sin bisel, isla ni barra de estado.
 */
export const IPHONE = {
  pantalla: { ancho: 393, alto: 852 },
  bisel: 10,
  barraEstado: 44,
  zonaInicio: 34,
};
export const IPHONE_ANCHO = IPHONE.pantalla.ancho + IPHONE.bisel * 2; // 413
export const IPHONE_ALTO = IPHONE.pantalla.alto + IPHONE.bisel * 2; // 872
/** Alto de la etiqueta de arriba más su separación: para reservar el espacio total del teléfono con etiqueta. */
export const IPHONE_ETIQUETA = 36;

const CUERPO = "#0b1511";
const BOTON = "#1a2a21";

export function IPhone({
  rol,
  titulo,
  turno = false,
  escala = 1,
  testId,
  className = "",
  children,
}: {
  rol: RolProbar;
  titulo: string;
  /** Es el celular en el que toca actuar: pantalla nítida; el otro queda atenuado (solo opacidad: el hardware no cambia). */
  turno?: boolean;
  /** Factor de escala del teléfono entero (1 = tamaño real). */
  escala?: number;
  testId: string;
  className?: string;
  children: ReactNode;
}) {
  const Icono = rol === "vendedor" ? IconoTienda : IconoBolsa;
  const e = Math.max(0.3, Math.min(1, escala));
  const vars = { "--escala": String(e) } as CSSProperties;
  return (
    <figure data-testid={testId} data-turno={turno ? "si" : "no"} className={`w-full scroll-mt-16 flex-col items-center sm:w-auto ${className}`} style={vars}>
      <figcaption className="mb-3 hidden h-6 items-center gap-1.5 whitespace-nowrap rounded-full bg-tinta-100 px-3 text-xs font-medium text-tinta-700 sm:inline-flex">
        <Icono className="h-3.5 w-3.5" />
        {titulo}
      </figcaption>
      {/* El contenedor reserva el tamaño escalado; adentro, el teléfono a tamaño real, escalado desde arriba a la izquierda. */}
      <div className="relative h-[var(--alto-movil,min(78svh,720px))] w-full shrink-0 sm:h-[calc(872px*var(--escala))] sm:w-[calc(413px*var(--escala))]">
        <div
          className={`absolute left-0 top-0 h-full w-full origin-top-left transition-opacity duration-300 sm:h-[872px] sm:w-[413px] sm:[transform:scale(var(--escala))] ${
            turno ? "" : "lg:opacity-50 lg:saturate-0"
          }`}
        >
          {/* Botones laterales: acción y volumen a la izquierda, encendido a la derecha. */}
          <span aria-hidden className="absolute -left-[3px] top-[172px] hidden h-8 w-[3px] rounded-l-[2px] sm:block" style={{ background: BOTON }} />
          <span aria-hidden className="absolute -left-[3px] top-[230px] hidden h-[58px] w-[3px] rounded-l-[2px] sm:block" style={{ background: BOTON }} />
          <span aria-hidden className="absolute -left-[3px] top-[300px] hidden h-[58px] w-[3px] rounded-l-[2px] sm:block" style={{ background: BOTON }} />
          <span aria-hidden className="absolute -right-[3px] top-[262px] hidden h-[94px] w-[3px] rounded-r-[2px] sm:block" style={{ background: BOTON }} />

          {/* Cuerpo: bisel fino, esquinas de 56 px, sombra suave en capas y un filo de luz casi invisible. */}
          <div className="absolute inset-0 hidden rounded-[56px] shadow-celular sm:block" style={{ background: CUERPO, boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.06)" }} />

          {/* Pantalla. */}
          <div className="absolute inset-0 overflow-hidden rounded-card bg-sal ring-1 ring-tinta-200 sm:inset-[10px] sm:rounded-[44px] sm:ring-0">
            {/* Barra de estado: hora a la izquierda; señal, wifi y batería a la derecha. */}
            <div className="absolute inset-x-0 top-0 hidden h-[44px] items-center justify-between pl-10 pr-[30px] text-monte sm:flex">
              <span className="num text-[15px] font-semibold leading-none">9:41</span>
              <span className="flex items-center gap-[6px]">
                <svg viewBox="0 0 18 12" className="h-3 w-[18px]" aria-hidden="true" fill="currentColor">
                  <rect x="0" y="8" width="3" height="4" rx="0.8" />
                  <rect x="5" y="5.5" width="3" height="6.5" rx="0.8" />
                  <rect x="10" y="3" width="3" height="9" rx="0.8" />
                  <rect x="15" y="0" width="3" height="12" rx="0.8" />
                </svg>
                <svg viewBox="0 0 16 12" className="h-3 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M1.2 4.4a10 10 0 0 1 13.6 0" />
                  <path d="M3.8 7a6.3 6.3 0 0 1 8.4 0" />
                  <path d="M6.4 9.6a2.6 2.6 0 0 1 3.2 0" />
                </svg>
                <svg viewBox="0 0 27 13" className="h-[13px] w-[27px]" aria-hidden="true">
                  <rect x="0.5" y="0.5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" opacity="0.4" />
                  <rect x="2" y="2" width="20" height="9" rx="2" fill="currentColor" />
                  <path d="M25 4.5v4a2.1 2.1 0 0 0 0-4Z" fill="currentColor" opacity="0.4" />
                </svg>
              </span>
            </div>
            <span aria-hidden className="absolute left-1/2 top-[11px] hidden h-9 w-[120px] -translate-x-1/2 rounded-full sm:block" style={{ background: CUERPO }} />

            {/* La app, a 390 px reales, entre la barra de estado y la zona del indicador de inicio (en angosto, toda la pantalla). */}
            <div className="absolute inset-x-0 bottom-0 top-0 sm:bottom-[34px] sm:top-[44px]">
              <div className="mx-auto h-full w-full sm:w-[390px]">{children}</div>
            </div>

            {/* Indicador de inicio. */}
            <span aria-hidden className="absolute bottom-2 left-1/2 hidden h-[5px] w-[134px] -translate-x-1/2 rounded-full bg-monte/85 sm:block" />
          </div>
        </div>
      </div>
    </figure>
  );
}
