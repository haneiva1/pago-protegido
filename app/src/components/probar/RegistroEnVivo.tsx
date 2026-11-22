import { IconoBloqueado, IconoCheck, IconoExterno } from "@/components/iconos";
import { explorer } from "@/lib/format";
import { PASOS, duracion, errorDelContrato, horaProbar, resumenRed, type FilaRegistro, type PasoId } from "@/lib/probar";
import type { Desvio, Registro } from "./tipos";

/** El registro en vivo: los 4 pasos del pedido con cada transacción real y su link al explorador, sobre Monte. */
export function RegistroEnVivo({ registro, filas, desvios }: { registro: Registro | null; filas: FilaRegistro[]; desvios: Desvio[] }) {
  const p = registro?.pedido ?? null;
  const hecho: Record<PasoId, boolean> = {
    link: Boolean(p),
    pago: filas.some((f) => f.kind === "fondeo"),
    envio: filas.some((f) => f.paso === "envio"),
    cobro: filas.some((f) => f.kind === "liberacion"),
  };
  const otros = filas.filter((f) => f.paso === "otro");
  const resumen = p && p.status === "liberado" ? resumenRed(filas, p.created_at) : null;

  return (
    <section data-testid="registro" data-oscuro className="panel-oscuro space-y-5 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg text-sal">Registro en vivo</h2>
        <span className="flex shrink-0 items-center gap-2 whitespace-nowrap text-xs text-sal/60">
          <span className="h-2 w-2 animate-latido rounded-full bg-yungas" aria-hidden />
          se actualiza solo
        </span>
      </div>

      {p && (
        <p className="text-sm leading-relaxed text-sal/80">
          Pedido{" "}
          <strong data-testid="registro-codigo" className="font-mono text-sal">
            {p.code}
          </strong>{" "}
          · {p.product} · <span className="num">{p.total}</span>
          {p.escrow_id && (
            <>
              {" · "}
              <a
                href={explorer.contract(p.escrow_id)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-yungas underline-offset-2 hover:underline"
                data-testid="registro-contrato"
              >
                contrato
                <IconoExterno className="h-3.5 w-3.5" />
              </a>
            </>
          )}
        </p>
      )}

      <ol className="space-y-4">
        {PASOS.map((paso, i) => {
          const mias = filas.filter((f) => f.paso === paso.id);
          const ok = hecho[paso.id];
          return (
            <li key={paso.id} data-testid={`paso-registro-${paso.id}`} data-hecho={ok ? "si" : "no"} className="relative pl-9">
              {i < PASOS.length - 1 && <span aria-hidden className="absolute bottom-[-1rem] left-[0.8125rem] top-7 w-px bg-sal/15" />}
              <span
                aria-hidden
                className={`absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold num transition-colors duration-300 ${
                  ok ? "bg-yungas text-monte" : "border border-sal/25 text-sal/60"
                }`}
              >
                {ok ? <IconoCheck className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <p className={`pt-1 text-sm font-semibold ${ok ? "text-sal" : "text-sal/70"}`}>{paso.titulo}</p>
              {(mias.length > 0 || (paso.id === "link" && p)) && (
                <ul className="mt-2 space-y-1.5">
                  {paso.id === "link" && p && <Fila texto={`Link ${p.code ?? ""} creado: todavía no se movió plata`} at={p.created_at} hash={null} sinTx />}
                  {mias.map((f, j) => (
                    <Fila key={j} texto={f.texto} at={f.at} hash={f.hash} />
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>

      {(otros.length > 0 || desvios.length > 0) && (
        <div className="space-y-2 border-t border-sal/15 pt-4">
          <p className="text-sm font-semibold text-sal">Otros movimientos</p>
          <ul className="space-y-1.5">
            {otros.map((f, j) => (
              <Fila key={`o${j}`} texto={f.texto} at={f.at} hash={f.hash} />
            ))}
            {desvios.map((d) => {
              const err = errorDelContrato(d.raw, d.code);
              return (
                <li key={d.at} data-testid="registro-desvio" className="flex items-start gap-2 text-sm leading-snug text-error-200">
                  <IconoBloqueado className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Intento de desvío {d.rejected ? "rechazado" : "sin rechazo"}
                    {err ? `: ${err}` : ""} · simulación, sin transacción · <span className="num text-sal/50">{horaProbar(d.at)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!registro?.tienda && <p className="text-sm text-sal/60">Todavía no hay movimientos: empieza por crear la tienda.</p>}

      {resumen && (
        <div data-testid="resumen-red" className="animate-aparecer rounded-card bg-sal/5 p-4 ring-1 ring-sal/10">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-yungas">Lo que pasó en la red</p>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <p className="font-display text-2xl font-extrabold leading-none text-sal num">{resumen.transacciones}</p>
              <p className="mt-1 text-xs text-sal/60">transacciones públicas, cada una con su link</p>
            </div>
            <div>
              <p className="font-display text-2xl font-extrabold leading-none text-sal num">{duracion(resumen.duracionMs)}</p>
              <p className="mt-1 text-xs text-sal/60">desde el link hasta el cobro</p>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-sal/70">
            La plata entró al contrato, salió a la tienda cuando el comprador confirmó y nadie más pudo tocarla
            {desvios.filter((d) => d.rejected).length > 0 ? `: ${desvios.filter((d) => d.rejected).length === 1 ? "el intento de desvío fue rechazado" : `los ${desvios.filter((d) => d.rejected).length} intentos de desvío fueron rechazados`}.` : "."}
          </p>
        </div>
      )}
    </section>
  );
}

function Fila({ texto, at, hash, sinTx }: { texto: string; at: number; hash: string | null; sinTx?: boolean }) {
  return (
    <li className="text-sm leading-snug text-sal/85" data-testid="registro-fila">
      {texto} <span className="num text-sal/50">{horaProbar(at)}</span>
      {hash ? (
        <>
          {" "}
          <a
            href={explorer.tx(hash)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-yungas underline-offset-2 hover:underline"
            data-testid="registro-tx"
          >
            Ver transacción
            <IconoExterno className="h-3.5 w-3.5" />
          </a>
        </>
      ) : sinTx ? (
        <span className="text-sal/50"> · sin transacción</span>
      ) : null}
    </li>
  );
}
