/**
 * Un check que se dibuja solo (stroke-dashoffset de 1 a 0), opcionalmente dentro de un círculo que se traza antes.
 * Se anima al montarse: sirve para el paso que se completa y para el cierre "La Zapatería cobró".
 */
export function CheckTrazo({ className = "h-4 w-4", circulo = false, retraso = 0 }: { className?: string; circulo?: boolean; retraso?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={circulo ? 1.8 : 2.4} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {circulo && (
        <circle
          cx="12"
          cy="12"
          r="10"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1}
          className="animate-[trazo_500ms_var(--ease-suave)_forwards]"
          style={{ animationDelay: `${retraso}ms` }}
        />
      )}
      <path
        d={circulo ? "M7.5 12.5l3 3 6-7" : "M5 12.5l4.5 4.5 9.5-10"}
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1}
        className="animate-[trazo_400ms_var(--ease-suave)_forwards]"
        style={{ animationDelay: `${retraso + (circulo ? 300 : 0)}ms` }}
      />
    </svg>
  );
}
