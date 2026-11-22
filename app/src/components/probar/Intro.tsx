import { IconoReloj } from "@/components/iconos";

/** Qué es Trato en dos líneas, visible junto a la demo sin hacer scroll. Texto de Hans (02:57). */
export function Intro({ className = "" }: { className?: string }) {
  return (
    <section data-testid="intro" className={`max-w-[62ch] ${className}`}>
      <p className="text-base leading-snug text-monte sm:text-lg">
        Link de pago por WhatsApp: la plata del comprador espera entre los dos hasta que recibe; recién ahí le llega a la tienda.
      </p>
      <p className="eyebrow mt-2 inline-flex items-center gap-1.5">
        <IconoReloj className="h-4 w-4" />
        Pruébalo en 1 minuto
      </p>
    </section>
  );
}
