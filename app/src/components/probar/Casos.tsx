import { IconoAlerta, IconoBloqueado, IconoCheckCirculo, IconoExterno, IconoVolver } from "@/components/iconos";

const EVIDENCIA = "https://github.com/haneiva1/pago-protegido#evidencia-on-chain";

/** Cada caso en una línea, con la transacción real en la red de prueba (las del README, "Evidencia on-chain"). */
const CASOS = [
  {
    Icono: IconoCheckCirculo,
    titulo: "Todo bien",
    frase: "La tienda cobra.",
    href: "https://stellar.expert/explorer/testnet/tx/0d3cb6aa042da56b562c3490f5c45311b08af66d4fcf2eb80e742026aeefaba9",
    link: "Ver en la red",
  },
  {
    Icono: IconoAlerta,
    titulo: "Llega mal",
    frase: "Reclamo y un revisor decide, siempre entre los dos.",
    href: "https://stellar.expert/explorer/testnet/tx/68ba9ed24755a4c401a28bfa122b5a48fee7929a1d9ae9256bb7f4e1b2ff889d",
    link: "Ver en la red",
  },
  {
    Icono: IconoVolver,
    titulo: "No envía a tiempo",
    frase: "La plata vuelve sola.",
    href: "https://stellar.expert/explorer/testnet/tx/fdff2f9bb7ce10a0cf02f2d2dbbf299c38681bdea4db872bc98caec2713de0ee",
    link: "Ver en la red",
  },
  {
    Icono: IconoBloqueado,
    titulo: "Alguien intenta desviar",
    frase: "El contrato lo rechaza.",
    href: EVIDENCIA,
    link: "9 desvíos rechazados en testnet",
  },
];

export function Casos({ className = "" }: { className?: string }) {
  return (
    <section data-testid="casos" className={className} aria-labelledby="casos-titulo">
      <h2 id="casos-titulo" className="text-2xl">
        Cómo manejamos cada caso
      </h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CASOS.map(({ Icono, titulo, frase, href, link }) => (
          <li key={titulo} className="flex flex-col gap-2 rounded-card bg-white p-4 ring-1 ring-inset ring-tinta-200/70">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-exito-100 text-musgo">
                <Icono className="h-5 w-5" />
              </span>
              <p className="text-base font-semibold text-monte">{titulo}</p>
            </div>
            <p className="text-sm text-tinta-700">{frase}</p>
            <a href={href} target="_blank" rel="noreferrer" className="enlace mt-auto inline-flex items-center gap-1 text-sm">
              {link}
              <IconoExterno className="h-3.5 w-3.5" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
