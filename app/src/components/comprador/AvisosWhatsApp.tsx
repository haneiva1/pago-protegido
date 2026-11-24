import { waLink } from "@/lib/whatsapp";

/** Número del asistente de WhatsApp (docs/WHATSAPP.md). Si no está configurado, no se muestra nada. */
const BOT_WA = (process.env.NEXT_PUBLIC_BOT_WHATSAPP ?? "").replace(/\D/g, "");

/**
 * El comprador le escribe primero al asistente: WhatsApp no deja que el asistente empiece la conversación. El texto
 * ("avisos PP-…") lo entiende el bot (bot/src/engine/engine.ts, intención "novedades").
 */
export function AvisosWhatsApp({ code }: { code: string | null }) {
  if (!BOT_WA || !code) return null;
  return (
    <section data-testid="avisos-whatsapp">
      <a className="btn-secondary w-full" href={waLink(`avisos ${code}`, BOT_WA)} target="_blank" rel="noreferrer">
        Recibir los avisos por WhatsApp
      </a>
      <p className="mt-1 text-xs text-tinta-500">
        Escríbele al asistente de Trato desde el número que dejaste al pagar. WhatsApp le deja escribirte hasta 24 horas después de tu último mensaje.
      </p>
    </section>
  );
}
