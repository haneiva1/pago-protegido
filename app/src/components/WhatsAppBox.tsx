"use client";

import { waLink } from "@/lib/whatsapp";
import { CopyButton } from "./ui";

/** Texto de WhatsApp listo para copiar, con botón para abrir WhatsApp. */
export function WhatsAppBox({ title, text, phone, testId }: { title: string; text: string; phone?: string | null; testId?: string }) {
  return (
    <div data-testid={testId ?? "whatsapp"} className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-900">
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-emerald-600" aria-hidden>
          <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-3.9-4.7-4.1-.1-.2-1.1-1.5-1.1-2.9s.7-2.1 1-2.4c.3-.3.6-.3.8-.3h.6c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .6l-.4.6-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.3Z" />
        </svg>
        {title}
      </div>
      <p className="whitespace-pre-line rounded-lg bg-white/80 p-3 text-sm text-slate-700 ring-1 ring-emerald-100">{text}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <CopyButton text={text} label="Copiar texto" className="btn-secondary !py-2 text-sm" />
        <a href={waLink(text, phone)} target="_blank" rel="noreferrer" className="btn !py-2 bg-emerald-600 text-sm text-white hover:bg-emerald-700">
          Compartir por WhatsApp
        </a>
      </div>
    </div>
  );
}
