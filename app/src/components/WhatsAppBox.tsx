"use client";

import { waLink } from "@/lib/whatsapp";
import { IconoWhatsApp } from "./iconos";
import { CopyButton } from "./ui";

/** La vista previa muestra *negrita* como negrita; el texto copiado conserva los asteriscos (es lo que entiende WhatsApp). */
function negrita(texto: string): React.ReactNode[] {
  return texto.split(/(\*[^*\n]+\*)/g).map((parte, i) => (parte.startsWith("*") && parte.endsWith("*") ? <strong key={i}>{parte.slice(1, -1)}</strong> : parte));
}

/** Texto de WhatsApp listo para copiar, con botón para abrir WhatsApp. */
export function WhatsAppBox({ title, text, phone, testId }: { title: string; text: string; phone?: string | null; testId?: string }) {
  return (
    <div data-testid={testId ?? "whatsapp"} className="space-y-3 rounded-card bg-tinta-50 p-4">
      <p className="text-sm font-semibold text-monte">{title}</p>
      <p className="whitespace-pre-line rounded-control bg-white px-3.5 py-3 text-base text-tinta-700">{negrita(text)}</p>
      <div className="grid grid-cols-2 gap-2">
        <a href={waLink(text, phone)} target="_blank" rel="noreferrer" className="btn-oscuro btn-sm">
          <IconoWhatsApp className="h-4 w-4" />
          Compartir por WhatsApp
        </a>
        <CopyButton text={text} label="Copiar texto" className="btn-secondary btn-sm" />
      </div>
    </div>
  );
}
