"use client";

import { waLink } from "@/lib/whatsapp";
import { IconoWhatsApp } from "./iconos";
import { CopyButton } from "./ui";

/** Texto de WhatsApp listo para copiar, con botón para abrir WhatsApp. */
export function WhatsAppBox({ title, text, phone, testId }: { title: string; text: string; phone?: string | null; testId?: string }) {
  return (
    <div data-testid={testId ?? "whatsapp"} className="card space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-monte">
        <IconoWhatsApp className="h-5 w-5 shrink-0 text-musgo" />
        {title}
      </div>
      <p className="whitespace-pre-line rounded-control bg-tinta-50 px-3.5 py-3 text-sm text-tinta-700 ring-1 ring-tinta-200/80">{text}</p>
      <div className="flex flex-wrap gap-2">
        <a href={waLink(text, phone)} target="_blank" rel="noreferrer" className="btn-oscuro btn-sm">
          <IconoWhatsApp className="h-4 w-4" />
          Compartir por WhatsApp
        </a>
        <CopyButton text={text} label="Copiar texto" className="btn-secondary btn-sm" />
      </div>
    </div>
  );
}
