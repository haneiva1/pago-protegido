"use client";

import { IconoWhatsApp } from "@/components/iconos";
import { CopyButton } from "@/components/ui";
import { waLink } from "@/lib/whatsapp";

/** Las dos únicas acciones para mandar un link: abrir WhatsApp con el mensaje listo, o copiar ese mismo mensaje. */
export function EnviarWhatsApp({ text, chico = false }: { text: string; chico?: boolean }) {
  return (
    <div className={chico ? "flex gap-2" : "space-y-2"}>
      <a href={waLink(text)} target="_blank" rel="noreferrer" className={chico ? "btn-secondary btn-sm flex-1" : "btn-primary w-full py-4 text-lg"} data-testid="enviar-whatsapp">
        <IconoWhatsApp className={chico ? "h-4 w-4 flex-none text-musgo" : "h-5 w-5 flex-none"} />
        Enviar por WhatsApp
      </a>
      <CopyButton text={text} label="Copiar" className={chico ? "btn-secondary btn-sm flex-none" : "btn-secondary w-full"} testId="copiar-mensaje" />
    </div>
  );
}
