import { IconoBloqueado, IconoExterno } from "@/components/iconos";
import { Spinner } from "@/components/ui";
import { explorer } from "@/lib/format";
import { errorDelContrato, hayPlataGuardada, horaProbar } from "@/lib/probar";
import type { Desvio as DesvioT } from "./tipos";

/** "Intenta desviar la plata": el momento en que alguien lo intenta y el contrato dice que no. Sin caja: título, aire y una línea. */
export function Desvio({
  status,
  desviando,
  error,
  ultimo,
  onDesviar,
}: {
  status: string | null;
  desviando: boolean;
  error: string | null;
  ultimo: DesvioT | undefined;
  onDesviar: () => void;
}) {
  const hay = hayPlataGuardada(status);
  return (
    <section data-testid="desvio" className="seccion">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-error-50 text-error-600">
          <IconoBloqueado className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg">Intenta desviar la plata</h2>
          <p className="prosa mt-1 text-sm leading-relaxed text-tinta-600">
            Con la plata en el contrato, pídele que mande todo el saldo a otra cuenta, con la firma del revisor del equipo. Es un intento real contra el
            contrato, en simulación: no se envía nada ni se cobra comisión.
          </p>
        </div>
      </div>

      <button className="btn-danger w-full" onClick={onDesviar} disabled={!hay || desviando} data-testid="desviar">
        {desviando ? <Spinner /> : <IconoBloqueado className="h-5 w-5" />}
        Intenta desviar la plata
      </button>

      {!hay && (
        <p className="text-sm leading-snug text-tinta-600" data-testid="desvio-espera">
          {status === "liberado" || status === "resuelto" || status === "devuelto"
            ? "La plata ya salió del contrato por una de sus salidas."
            : "Primero paga desde el celular del comprador: tiene que haber plata en el contrato."}
        </p>
      )}
      {error && <p className="caja-aviso">{error}</p>}
      {ultimo && <ResultadoDesvio d={ultimo} />}

      <p data-testid="dos-salidas" className="divisor pt-4 text-center font-display text-lg font-extrabold text-monte">
        Dos salidas, nunca una tercera.
      </p>
    </section>
  );
}

function ResultadoDesvio({ d }: { d: DesvioT }) {
  const err = errorDelContrato(d.raw, d.code);
  if (!d.rejected)
    return (
      <div data-testid="desvio-resultado" className="caja-aviso">
        La simulación no falló: hay que revisar los roles de este contrato. {d.detail}
      </div>
    );
  return (
    <div data-testid="desvio-resultado" className="animate-aparecer space-y-3 rounded-card bg-error-50 p-4 text-sm text-monte">
      <p className="flex items-center gap-2 font-semibold text-error-700">
        <IconoBloqueado className="h-4 w-4 shrink-0" />
        Rechazado por el {d.by === "contrato" ? "contrato" : "servidor"}
      </p>
      {err && (
        <p>
          <code data-testid="desvio-error" className="inline-block rounded-chip bg-white px-2.5 py-1.5 font-mono text-lg text-error-700">
            {err}
          </code>
        </p>
      )}
      <p className="prosa leading-relaxed text-tinta-700">
        {d.by === "contrato"
          ? "El contrato no aceptó la orden. Solo su revisor designado puede repartir la plata, y ese revisor es un programa que reparte únicamente entre el comprador y la tienda: no tiene cómo mandarla a otra cuenta."
          : d.detail}
      </p>
      {d.call && <p className="break-all font-mono text-xs text-tinta-600">Se intentó: {d.call}</p>}
      <p className="text-sm text-tinta-600">
        Simulación a las <span className="num">{horaProbar(d.at)}</span>: no se envió nada.
        {d.escrowId && (
          <>
            {" "}
            <a href={explorer.contract(d.escrowId)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-musgo underline-offset-2 hover:underline">
              Ver el contrato de este pedido
              <IconoExterno className="h-3.5 w-3.5" />
            </a>
          </>
        )}
      </p>
    </div>
  );
}
