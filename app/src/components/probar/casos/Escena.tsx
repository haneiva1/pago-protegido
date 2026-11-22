import type { ReactNode } from "react";
import { IconoCandado } from "@/components/iconos";
import s from "./casos.module.css";

/**
 * El escenario de cada caso, en coordenadas de 160 × 100: el comprador a la izquierda, el contrato al centro con la plata
 * adentro, la tienda a la derecha y, abajo, quien aparece en el caso (el intruso o el revisor). Los nodos son HTML
 * (letra fija y legible en celular); las flechas, un SVG con el mismo sistema de coordenadas.
 */
export const P = {
  comprador: { x: 20, y: 28 },
  contrato: { x: 80, y: 28 },
  tienda: { x: 140, y: 28 },
  abajo: { x: 80, y: 80 },
} as const;
type Punto = { x: number; y: number };

const pos = (p: Punto) => ({ left: `${(p.x / 160) * 100}%`, top: `${p.y}%` });

export function Escena({ children, flechas, testId }: { children: ReactNode; flechas?: ReactNode; testId?: string }) {
  return (
    <div className={`${s.escena} mx-auto max-w-[560px] select-none`} data-testid={testId}>
      <svg viewBox="0 0 160 100" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
        <defs>
          <marker id="casos-punta-verde" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" className="fill-musgo" />
          </marker>
          <marker id="casos-punta-roja" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" className="fill-error-600" />
          </marker>
        </defs>
        {flechas}
      </svg>
      {children}
    </div>
  );
}

/** Una persona o cuenta: círculo con ícono y su nombre debajo. */
export function Nodo({
  en,
  icono,
  nombre,
  tono = "neutro",
  visible = true,
  extra,
  testId,
}: {
  en: Punto;
  icono: ReactNode;
  nombre: string;
  tono?: "neutro" | "exito" | "error" | "apagado";
  visible?: boolean;
  extra?: ReactNode;
  testId?: string;
}) {
  const color = {
    neutro: "bg-white text-monte ring-tinta-200",
    exito: "bg-exito-100 text-musgo ring-exito-200",
    error: "bg-error-50 text-error-600 ring-error-200",
    apagado: "bg-tinta-100 text-tinta-500 ring-tinta-200",
  }[tono];
  return (
    <div
      data-testid={testId}
      className={`${s.aparece} absolute -translate-x-1/2 -translate-y-1/2 ${visible ? "opacity-100" : "pointer-events-none opacity-0"}`}
      style={pos(en)}
    >
      <span className={`relative flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-inset transition-colors duration-300 sm:h-12 sm:w-12 ${color}`}>
        {icono}
        {extra}
      </span>
      <span className="absolute left-1/2 top-full mt-1 w-28 -translate-x-1/2 text-center text-xs font-medium leading-tight text-monte sm:text-sm">{nombre}</span>
    </div>
  );
}

/** El contrato: la caja del centro, con la plata adentro (o vacía) y, si está congelada, el candado. */
export function Contrato({ lleno = true, monto, congelado = false, className = "", testId }: { lleno?: boolean; monto?: string; congelado?: boolean; className?: string; testId?: string }) {
  return (
    <div
      data-testid={testId}
      className={`absolute flex w-[30%] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 rounded-card bg-monte px-2 py-2 text-sal shadow-card sm:py-3 ${className}`}
      style={pos(P.contrato)}
    >
      <span className="text-[11px] font-medium uppercase tracking-wide text-sal/70 sm:text-xs">Contrato</span>
      <span className={`${s.aparece} flex items-center gap-1.5 text-sm font-semibold sm:text-base ${lleno ? "opacity-100" : "opacity-30"}`}>
        <Moneda chica />
        {lleno ? (monto ?? "la plata") : "vacío"}
      </span>
      <span
        className={`${s.aparece} absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-sal text-monte ring-1 ring-tinta-200 ${congelado ? "scale-100 opacity-100" : "scale-75 opacity-0"}`}
        aria-hidden={!congelado}
      >
        <IconoCandado className="h-3.5 w-3.5" />
      </span>
    </div>
  );
}

/** La moneda de la plata. */
export function Moneda({ chica = false }: { chica?: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-yungas font-semibold text-monte ring-2 ring-monte/10 ${chica ? "h-4 w-4 text-[9px]" : "h-7 w-7 text-xs"}`}
    >
      Bs
    </span>
  );
}

/**
 * Algo que viaja (la plata o un paquete): una capa del tamaño de la escena, trasladada en % de la escena, con la pieza
 * centrada en `desde`. Para ir de `desde` a `hasta`, la capa se traslada la diferencia.
 */
export function Viajero({ desde, hasta, llegado, visible = true, children, testId }: { desde: Punto; hasta: Punto; llegado: boolean; visible?: boolean; children: ReactNode; testId?: string }) {
  const dx = llegado ? ((hasta.x - desde.x) / 160) * 100 : 0;
  const dy = llegado ? hasta.y - desde.y : 0;
  return (
    <div data-testid={testId} className={s.capa} style={{ transform: `translate(${dx}%, ${dy}%)`, opacity: visible ? 1 : 0 }} aria-hidden>
      <span className="absolute -translate-x-1/2 -translate-y-1/2" style={pos(desde)}>
        {children}
      </span>
    </div>
  );
}

/** Flecha de una salida (verde) o de un intento (rojo), con el trazo que se dibuja al aparecer. */
export function Flecha({ d, tono, visible = true, punteada = false, className = "" }: { d: string; tono: "verde" | "roja"; visible?: boolean; punteada?: boolean; className?: string }) {
  return (
    <path
      d={d}
      pathLength={1}
      fill="none"
      strokeWidth={1.6}
      strokeLinecap="round"
      markerEnd={`url(#casos-punta-${tono})`}
      className={`${punteada ? "" : `${s.trazo} ${visible ? s.trazoVisible : ""}`} ${tono === "verde" ? "stroke-musgo" : "stroke-error-600"} ${className}`}
      style={punteada ? { strokeDasharray: "0.04 0.03", opacity: visible ? 1 : 0, transition: "opacity 300ms ease-out" } : undefined}
    />
  );
}

/** Las dos salidas permitidas, de la caja del contrato a cada lado. */
export const SALIDA_TIENDA = "M 105 28 L 124 28";
export const SALIDA_COMPRADOR = "M 55 28 L 36 28";
