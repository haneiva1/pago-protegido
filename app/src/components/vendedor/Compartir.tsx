"use client";

import { useEffect, useState } from "react";
import { waLink } from "@/lib/whatsapp";

/**
 * Compartir con el menú nativo del celular (Web Share): el vendedor elige WhatsApp, Messenger o Instagram y el texto
 * ya va listo. Si el navegador no tiene ese menú (computadora), abre WhatsApp con el mismo texto.
 */
export function Compartir({ text, label = "Compartir", className = "btn-primary", testId = "compartir" }: { text: string; label?: string; className?: string; testId?: string }) {
  const [nativo, setNativo] = useState(false);
  useEffect(() => setNativo(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);

  if (!nativo)
    return (
      <a href={waLink(text)} target="_blank" rel="noreferrer" className={className} data-testid={testId}>
        📤 {label}
      </a>
    );
  return (
    <button
      type="button"
      className={className}
      data-testid={testId}
      onClick={() => {
        // Solo el texto (ya trae el link): si se manda también `url`, algunas apps lo pegan dos veces.
        navigator.share({ text }).catch(() => {});
      }}
    >
      📤 {label}
    </button>
  );
}
