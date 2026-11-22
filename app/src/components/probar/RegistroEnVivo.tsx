import { IconoBloqueado, IconoCheck, IconoExterno } from "@/components/iconos";
import { explorer } from "@/lib/format";
import { PASOS, duracion, errorDelContrato, horaProbar, resumenRed, type FilaRegistro, type PasoId } from "@/lib/probar";
import type { Desvio, Registro } from "./tipos";

/** El registro en vivo: una línea de tiempo limpia sobre Monte, con cada transacción real y su link al explorador. */
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
  const rechazados = desvios.filter((d) => d.rejected).length;

  return (
    <section data-testid="registro" data-oscuro className="panel-oscuro p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg text-sal">Registro en vivo</h2>
        <span className="flex shrink-0 items-center gap-2 whitespace-nowrap text-xs text-sal/70">
          <span className="h-2 w-2 animate-latido rounded-full bg-yungas" aria-hidden />
          se actualiza solo
        </span>
      </div>

      {p && (
        <p className="mt-2 text-sm leading-relaxed text-sal/80">
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

      {/* La línea de tiempo: una línea fina a la izquierda, un nodo por paso y, debajo, cada movimiento con su hora. */}
      <ol className="relative mt-6 ml-3 border-l border-sal/15 pl-6">
        {PASOS.map((paso, i) => {
          const mias = filas.filter((f) => f.paso === paso.id);
          const ok = hecho[paso.id];
          return (
            <li key={paso.id} data-testid={`paso-registro-${paso.id}`} data-hecho={ok ? "si" : "no"} className={`relative ${i < PASOS.length - 1 ? "pb-5" : ""}`}>
              <span
                aria-hidden
                className={`absolute -left-[calc(1.5rem+0.75rem+0.5px)] top-0 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold num transition-colors duration-300 ${
                  ok ? "bg-yungas text-monte" : "bg-monte text-sal/70 ring-1 ring-sal/25"
                }`}
              >
                {ok ? <IconoCheck className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <p className={`text-sm font-semibold leading-6 ${ok ? "text-sal" : "text-sal/70"}`}>{paso.titulo}</p>
              {(mias.length > 0 || (paso.id === "link" && p)) && (
                <ul className="mt-1.5 space-y-1.5">
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
        <div className="mt-5 border-t border-sal/15 pt-4">
          <p className="text-sm font-semibold text-sal">Otros movimientos</p>
          <ul className="mt-1.5 space-y-1.5">
            {otros.map((f, j) => (
              <Fila key={`o${j}`} texto={f.texto} at={f.at} hash={f.hash} />
            ))}
            {desvios.map((d) => {
              const err = errorDelContrato(d.raw, d.code);
              return (
                <li key={d.at} data-testid="registro-desvio" className="grid grid-cols-[4.5rem_1fr] gap-x-2 text-sm leading-snug">
                  <span className="num text-sal/50">{horaProbar(d.at)}</span>
                  <span className="flex items-start gap-1.5 text-error-200">
                    <IconoBloqueado className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Intento de desvío {d.rejected ? "rechazado" : "sin rechazo"}
                      {err ? `: ${err}` : ""} · simulación, sin transacción
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!registro?.tienda && <p className="mt-4 text-sm text-sal/70">Todavía no hay movimientos: empieza por crear la tienda.</p>}

      {resumen && (
        <div data-testid="resumen-red" className="mt-5 animate-aparecer border-t border-sal/15 pt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-yungas">Lo que pasó en la red</p>
          <div className="mt-3 grid grid-cols-2 gap-6">
            <div>
              <p className="font-display text-3xl font-extrabold text-sal num">{resumen.transacciones}</p>
              <p className="mt-1 text-sm text-sal/70">transacciones públicas, cada una con su link</p>
            </div>
            <div>
              <p className="font-display text-3xl font-extrabold text-sal num">{duracion(resumen.duracionMs)}</p>
              <p className="mt-1 text-sm text-sal/70">desde el link hasta el cobro</p>
            </div>
          </div>
          <p className="prosa mt-3 text-sm leading-relaxed text-sal/80">
            La plata entró al contrato, salió a la tienda cuando el comprador confirmó y nadie más pudo tocarla
            {rechazados > 0 ? `: ${rechazados === 1 ? "el intento de desvío fue rechazado" : `los ${rechazados} intentos de desvío fueron rechazados`}.` : "."}
          </p>
        </div>
      )}
    </section>
  );
}

function Fila({ texto, at, hash, sinTx }: { texto: string; at: number; hash: string | null; sinTx?: boolean }) {
  return (
    <li className="grid grid-cols-[4.5rem_1fr] gap-x-2 text-sm leading-snug text-sal/85" data-testid="registro-fila">
      <span className="num text-sal/50">{horaProbar(at)}</span>
      <span>
        {texto}
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
      </span>
    </li>
  );
}
