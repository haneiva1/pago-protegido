import type { SVGProps } from "react";

/** Íconos del chat (mismo trazo que components/iconos.tsx: 1,75 px, puntas redondas, currentColor). */
type P = SVGProps<SVGSVGElement> & { className?: string };

function Trazo({ children, className = "h-5 w-5", ...rest }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} {...rest}>
      {children}
    </svg>
  );
}

export const IconoAtras = (p: P) => (
  <Trazo {...p}>
    <path d="m15 5-7 7 7 7" />
  </Trazo>
);

export const IconoClip = (p: P) => (
  <Trazo {...p}>
    <path d="m20 11.5-8.5 8.5a5 5 0 0 1-7-7l9-9a3.25 3.25 0 0 1 4.6 4.6l-9 9a1.5 1.5 0 0 1-2.1-2.1l8-8" />
  </Trazo>
);

export const IconoCamara = (p: P) => (
  <Trazo {...p}>
    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-9Z" />
    <circle cx="12" cy="13" r="3.25" />
  </Trazo>
);

export const IconoMicrofono = (p: P) => (
  <Trazo {...p}>
    <rect x="9" y="3.5" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5M9 20.5h6" />
  </Trazo>
);

export const IconoVideo = (p: P) => (
  <Trazo {...p}>
    <rect x="3.5" y="7" width="12" height="10" rx="2" />
    <path d="m15.5 11 5-3v8l-5-3" />
  </Trazo>
);

export const IconoTelefono = (p: P) => (
  <Trazo {...p}>
    <path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A15.5 15.5 0 0 1 4.5 5.5a2 2 0 0 1 2-2Z" />
  </Trazo>
);

export const IconoPuntos = (p: P) => (
  <Trazo {...p}>
    <path d="M12 5.5h.01M12 12h.01M12 18.5h.01" strokeWidth={3} />
  </Trazo>
);

/** Doble visto: dos checks finos superpuestos. */
export const IconoVistos = ({ className = "h-4 w-4", ...rest }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} {...rest}>
    <path d="m2.5 12.5 4 4L14 8.5" />
    <path d="m10.5 16.5 1 1L21.5 8.5" />
  </svg>
);

export const IconoEnviar = (p: P) => (
  <Trazo {...p}>
    <path d="m4 4 16 8-16 8 3-8-3-8Z" />
    <path d="M7 12h13" />
  </Trazo>
);
