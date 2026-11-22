import { IconoBolsa, IconoCheck, IconoTienda } from "@/components/iconos";
import { ETAPAS, type EstadoEtapa, type EtapaId, type RolProbar } from "@/lib/probar";

/** La historia en 5 etapas (una fila compacta) y qué hacer ahora, en qué celular. */
export function Guia({
  estados,
  numero,
  terminada,
  texto,
  turno,
}: {
  estados: Record<EtapaId, EstadoEtapa>;
  numero: number;
  terminada: boolean;
  texto: string;
  turno: RolProbar | null;
}) {
  return (
    <section aria-label="Paso a paso" className="card p-3.5 sm:px-4 sm:py-2.5">
      <ol className="hidden sm:flex sm:flex-wrap sm:items-center sm:gap-x-2.5 sm:gap-y-1.5">
        {ETAPAS.map((et, i) => {
          const st = estados[et.id];
          return (
            <li key={et.id} data-etapa={et.id} data-estado={st} className="flex items-center gap-2">
              <Circulo estado={st} n={i + 1} />
              <span className={`text-sm leading-tight ${st === "ahora" ? "font-semibold text-monte" : st === "hecha" ? "font-medium text-tinta-700" : "font-medium text-tinta-500"}`}>
                {et.titulo}
              </span>
              {i < ETAPAS.length - 1 && <span aria-hidden className={`ml-1 h-px w-5 ${st === "hecha" ? "bg-musgo" : "bg-tinta-200"}`} />}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-col gap-1.5 sm:mt-2 sm:flex-row sm:items-center sm:gap-4 sm:border-t sm:border-tinta-100 sm:pt-2">
        <div className="flex items-center gap-2 sm:order-2 sm:ml-auto sm:shrink-0">
          <span className="chip-oscuro sm:hidden">{terminada ? "Historia completa" : `Paso ${numero} de ${ETAPAS.length}`}</span>
          {turno && (
            <span className="chip bg-yungas text-monte ring-yungas" data-testid="turno">
              {turno === "vendedor" ? <IconoTienda className="h-3.5 w-3.5" /> : <IconoBolsa className="h-3.5 w-3.5" />}
              Celular del {turno}
            </span>
          )}
        </div>
        <p data-testid="ahora" className="min-w-0 text-sm leading-snug text-monte sm:order-1 sm:flex-1 sm:text-base">
          <strong>Ahora: </strong>
          {texto}
        </p>
      </div>
    </section>
  );
}

function Circulo({ estado, n }: { estado: EstadoEtapa; n: number }) {
  const base = "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold num transition-colors duration-150";
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
    <span aria-hidden className={`${base} bg-tinta-100 ${estado === "omitida" ? "text-tinta-400 line-through" : "text-tinta-500"}`}>
      {n}
    </span>
  );
}
