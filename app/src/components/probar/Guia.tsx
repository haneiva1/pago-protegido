import { IconoBolsa, IconoCheck, IconoTienda } from "@/components/iconos";
import { ETAPAS, type EstadoEtapa, type EtapaId, type RolProbar } from "@/lib/probar";

/** La historia en 5 etapas, en una fila: círculos con número o check; en celular solo la etapa en curso lleva su nombre. */
export function Pasos({ estados, numero, terminada }: { estados: Record<EtapaId, EstadoEtapa>; numero: number; terminada: boolean }) {
  return (
    <ol aria-label={terminada ? "Historia completa" : `Paso ${numero} de ${ETAPAS.length}`} className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
      {ETAPAS.map((et, i) => {
        const st = estados[et.id];
        return (
          <li key={et.id} data-etapa={et.id} data-estado={st} className="flex items-center gap-2">
            <Circulo estado={st} n={i + 1} />
            <span className={`text-sm leading-none ${st === "ahora" ? "font-semibold text-monte" : st === "hecha" ? "hidden font-medium text-tinta-700 sm:inline" : "hidden font-medium text-tinta-500 sm:inline"}`}>
              <span className="hidden 2xl:inline">{et.titulo}</span>
              <span className="2xl:hidden">{et.corto}</span>
            </span>
            {i < ETAPAS.length - 1 && <span aria-hidden className={`ml-0.5 hidden h-px w-4 sm:block ${st === "hecha" ? "bg-musgo" : "bg-tinta-200"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

/** La presentación: un título grande que dice qué está pasando y, debajo, qué hacer ahora y en qué celular. */
export function Guia({ titulo, texto, turno }: { titulo: string; texto: string; turno: RolProbar | null }) {
  return (
    <section aria-label="Qué está pasando" className="space-y-1.5">
      <h2 data-testid="titulo-etapa" className="text-3xl lg:text-4xl">
        {titulo}
      </h2>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p data-testid="ahora" className="prosa text-base leading-snug text-tinta-700">
          <strong className="text-monte">Ahora: </strong>
          {texto}
        </p>
        {turno && (
          <span className="chip bg-yungas text-monte" data-testid="turno">
            {turno === "vendedor" ? <IconoTienda className="h-3.5 w-3.5" /> : <IconoBolsa className="h-3.5 w-3.5" />}
            {turno === "vendedor" ? "Chat de la tienda" : "Chat del comprador"}
          </span>
        )}
      </div>
    </section>
  );
}

function Circulo({ estado, n }: { estado: EstadoEtapa; n: number }) {
  const base = "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold num transition-colors duration-300";
  if (estado === "hecha")
    return (
      <span aria-hidden className={`${base} bg-musgo text-sal`}>
        <IconoCheck className="h-3.5 w-3.5" />
      </span>
    );
  if (estado === "ahora")
    return (
      <span aria-hidden className={`${base} bg-yungas text-monte ring-4 ring-exito-100`}>
        {n}
      </span>
    );
  return (
    <span aria-hidden className={`${base} bg-tinta-100 ${estado === "omitida" ? "text-tinta-400 line-through" : "text-tinta-600"}`}>
      {n}
    </span>
  );
}
