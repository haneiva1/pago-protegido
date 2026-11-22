import type { SVGProps } from "react";

/**
 * Íconos de Trato: trazo de 1,75 px, puntas redondas, en `currentColor`. Reemplazan a los emojis en toda la interfaz.
 * Uso: <IconoCandado className="h-5 w-5" />. Son decorativos (aria-hidden); el texto de al lado dice lo que son.
 */
type P = SVGProps<SVGSVGElement> & { className?: string };

function Trazo({ children, className = "h-5 w-5", ...rest }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} {...rest}>
      {children}
    </svg>
  );
}

export const IconoTienda = (p: P) => (
  <Trazo {...p}>
    <path d="M3.5 9.5 5 4h14l1.5 5.5" />
    <path d="M3.5 9.5a2.85 2.85 0 0 0 5.7 0 2.85 2.85 0 0 0 5.7 0 2.85 2.85 0 0 0 5.6 0" />
    <path d="M5.5 12.5V20h13v-7.5" />
    <path d="M10 20v-5h4v5" />
  </Trazo>
);

export const IconoBolsa = (p: P) => (
  <Trazo {...p}>
    <path d="M6 8h12l1 12H5L6 8Z" />
    <path d="M9 10V6.5a3 3 0 0 1 6 0V10" />
  </Trazo>
);

export const IconoMensaje = (p: P) => (
  <Trazo {...p}>
    <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9.5L4 20V6Z" />
  </Trazo>
);

export const IconoCandado = (p: P) => (
  <Trazo {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    <path d="M12 14.5v2" />
  </Trazo>
);

export const IconoCandadoAbierto = (p: P) => (
  <Trazo {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 7.6-1.7" />
    <path d="M12 14.5v2" />
  </Trazo>
);

export const IconoReiniciar = (p: P) => (
  <Trazo {...p}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
    <path d="M3.5 4.5v5h5" />
  </Trazo>
);

export const IconoExterno = (p: P) => (
  <Trazo {...p}>
    <path d="M7 17 17 7" />
    <path d="M9 7h8v8" />
  </Trazo>
);

export const IconoCheck = (p: P) => (
  <Trazo {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Trazo>
);

export const IconoCheckCirculo = (p: P) => (
  <Trazo {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12.5 2.5 2.5 4.5-5" />
  </Trazo>
);

export const IconoAlerta = (p: P) => (
  <Trazo {...p}>
    <path d="M12 3.5 2.5 20h19L12 3.5Z" />
    <path d="M12 10v4.5" />
    <path d="M12 17.5h.01" />
  </Trazo>
);

export const IconoInfo = (p: P) => (
  <Trazo {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <path d="M12 8h.01" />
  </Trazo>
);

export const IconoReloj = (p: P) => (
  <Trazo {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Trazo>
);

export const IconoCamion = (p: P) => (
  <Trazo {...p}>
    <path d="M3 7h11v9H3z" />
    <path d="M14 10h3.5l3.5 3.5V16h-7" />
    <circle cx="7" cy="18" r="1.75" />
    <circle cx="17" cy="18" r="1.75" />
  </Trazo>
);

export const IconoFlechaDerecha = (p: P) => (
  <Trazo {...p}>
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </Trazo>
);

export const IconoVolver = (p: P) => (
  <Trazo {...p}>
    <path d="m9 14-5-5 5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </Trazo>
);

export const IconoCopiar = (p: P) => (
  <Trazo {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" />
  </Trazo>
);

export const IconoCerrar = (p: P) => (
  <Trazo {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Trazo>
);

export const IconoBloqueado = (p: P) => (
  <Trazo {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m5.6 5.6 12.8 12.8" />
  </Trazo>
);

export const IconoQr = (p: P) => (
  <Trazo {...p}>
    <rect x="4" y="4" width="6" height="6" rx="1" />
    <rect x="14" y="4" width="6" height="6" rx="1" />
    <rect x="4" y="14" width="6" height="6" rx="1" />
    <path d="M14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5zM17.5 14H20M14 17.5v2.5" />
  </Trazo>
);

export const IconoBillete = (p: P) => (
  <Trazo {...p}>
    <rect x="3" y="6.5" width="18" height="11" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M6.5 12h.01M17.5 12h.01" />
  </Trazo>
);

export const IconoCelular = (p: P) => (
  <Trazo {...p}>
    <rect x="7" y="3" width="10" height="18" rx="2" />
    <path d="M11 17.5h2" />
  </Trazo>
);

export const IconoBuscar = (p: P) => (
  <Trazo {...p}>
    <circle cx="11" cy="11" r="6" />
    <path d="m20 20-4.3-4.3" />
  </Trazo>
);

export const IconoUsuario = (p: P) => (
  <Trazo {...p}>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 20a7 7 0 0 1 14 0" />
  </Trazo>
);

export const IconoMarcador = (p: P) => (
  <Trazo {...p}>
    <path d="M6.5 3.5h11V20l-5.5-3.5L6.5 20V3.5Z" />
  </Trazo>
);

export const IconoMas = (p: P) => (
  <Trazo {...p}>
    <path d="M12 5v14M5 12h14" />
  </Trazo>
);

export const IconoChevronAbajo = (p: P) => (
  <Trazo {...p}>
    <path d="m6 9 6 6 6-6" />
  </Trazo>
);

export const IconoChevronDerecha = (p: P) => (
  <Trazo {...p}>
    <path d="m9 6 6 6-6 6" />
  </Trazo>
);

export const IconoCalendario = (p: P) => (
  <Trazo {...p}>
    <rect x="3.5" y="5" width="17" height="15" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Trazo>
);

export const IconoDocumento = (p: P) => (
  <Trazo {...p}>
    <path d="M7 3h7l4 4v14H7V3Z" />
    <path d="M14 3v4h4M10 12h5M10 16h5" />
  </Trazo>
);

export const IconoBalanza = (p: P) => (
  <Trazo {...p}>
    <path d="M12 4v16M5 20h14M4 8h16" />
    <path d="M7 8 4 14h6L7 8ZM17 8l-3 6h6l-3-6Z" />
  </Trazo>
);

/** Marca de WhatsApp (relleno). */
export const IconoWhatsApp = ({ className = "h-5 w-5", ...rest }: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className} {...rest}>
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-3.9-4.7-4.1-.1-.2-1.1-1.5-1.1-2.9s.7-2.1 1-2.4c.3-.3.6-.3.8-.3h.6c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .6l-.4.6-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.3Z" />
  </svg>
);

/** El Nudo: símbolo de Trato (dos triángulos unidos por la punta), en currentColor. */
export const Nudo = ({ className = "h-5 w-5", ...rest }: P) => (
  <svg viewBox="0 0 116 108" fill="currentColor" aria-hidden="true" className={className} {...rest}>
    <path d="M0 0 L58 47.5 L116 0 V108 L58 60.5 L0 108 Z" />
  </svg>
);
