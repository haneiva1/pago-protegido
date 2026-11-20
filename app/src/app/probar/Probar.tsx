"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MarcoCelular } from "@/components/MarcoCelular";
import { Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { explorer } from "@/lib/format";
import {
  PASOS,
  PROBAR_SESION,
  errorDelContrato,
  filasRegistro,
  hayPlataGuardada,
  probarStorageKey,
  siguientePaso,
  type FilaRegistro,
  type PasoId,
  type RolProbar,
  type TxProbar,
} from "@/lib/probar";

interface Plazos {
  despachoSegundos: number;
  confirmarSegundos: number;
  demoTimers: boolean;
}

interface Registro {
  tienda: { nombre: string; pubkey: string } | null;
  pedido: {
    slug: string;
    code: string | null;
    product: string;
    status: string;
    total: string;
    escrow_id: string | null;
    created_at: number;
    demo: boolean;
  } | null;
  movimientos: TxProbar[];
}

interface Desvio {
  rejected: boolean;
  by: "contrato" | "servidor";
  detail: string;
  call?: string;
  code?: number;
  raw?: string;
  escrowId: string | null;
  at: number;
}

const POLL_MS = 3000;
const hora = (ms: number) => new Date(ms).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/La_Paz" });
const minutos = (s: number) => `${Math.round(s / 60)} ${Math.round(s / 60) === 1 ? "minuto" : "minutos"}`;

function leerSesion(): boolean {
  try {
    return window.sessionStorage.getItem(PROBAR_SESION) === "1";
  } catch {
    return false;
  }
}

function guardarSesion() {
  try {
    window.sessionStorage.setItem(PROBAR_SESION, "1");
  } catch {}
}

export default function Probar({ plazos }: { plazos: Plazos }) {
  const [listo, setListo] = useState(false);
  const [bloqueo, setBloqueo] = useState<string | null>(null);
  const [marco, setMarco] = useState(0);
  const [tab, setTab] = useState<RolProbar>("vendedor");
  const [registro, setRegistro] = useState<Registro | null>(null);
  const [compradorSlug, setCompradorSlug] = useState<string | null>(null);
  const [aviso, setAviso] = useState<RolProbar | null>(null);
  const [desvios, setDesvios] = useState<Desvio[]>([]);
  const [desviando, setDesviando] = useState(false);
  const [desvioError, setDesvioError] = useState<string | null>(null);
  const [reiniciando, setReiniciando] = useState(false);
  const wallet = useRef<typeof import("@/lib/wallet") | null>(null);
  const status = registro?.pedido?.status ?? null;
  const prevStatus = useRef<string | null>(null);
  // Sube con "Empezar de nuevo": una consulta que salió antes no puede traer de vuelta el pedido anterior.
  const generacion = useRef(0);

  // Prueba nueva: el servidor la cuenta para el límite por IP. Si esta pestaña ya tenía una, se retoma.
  useEffect(() => {
    if (leerSesion()) {
      setListo(true);
      return;
    }
    api("/api/probar/inicio", {})
      .then(() => {
        guardarSesion();
        setListo(true);
      })
      .catch((e: Error) => setBloqueo(e.message));
  }, []);

  const cargar = useCallback(async () => {
    const gen = generacion.current;
    wallet.current ??= await import("@/lib/wallet");
    const pk = wallet.current.getWallet("vendedor").publicKey();
    if (!pk) {
      if (gen === generacion.current) setRegistro(null);
      return;
    }
    try {
      const r = await api<Registro>(`/api/probar/registro?vendedor=${pk}`);
      if (gen === generacion.current) setRegistro(r);
    } catch {
      // Un corte de red no borra lo que ya se ve: el próximo ciclo vuelve a intentar.
    }
  }, []);

  useEffect(() => {
    if (!listo) return;
    void cargar();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void cargar();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [listo, cargar, marco]);

  // El link que crea el vendedor llega al celular del comprador (como si se lo mandara por WhatsApp).
  useEffect(() => {
    const slug = registro?.pedido?.slug ?? null;
    if (slug && slug !== compradorSlug) {
      setCompradorSlug(slug);
      setAviso("comprador");
    }
  }, [registro?.pedido?.slug, compradorSlug]);

  // En el celular (pestañas), cada paso lleva a la pantalla de quien tiene que actuar.
  useEffect(() => {
    if (status === prevStatus.current) return;
    const antes = prevStatus.current;
    prevStatus.current = status;
    if (antes === null && status === null) return;
    const turno: RolProbar | null = status === "esperando_pago" || status === "enviado" ? "comprador" : status === "pagado" ? "vendedor" : null;
    if (turno) {
      setTab(turno);
      setAviso(turno);
    }
  }, [status]);

  async function empezarDeNuevo() {
    setReiniciando(true);
    try {
      await api("/api/probar/inicio", {});
    } catch (e) {
      setBloqueo((e as Error).message);
      setReiniciando(false);
      return;
    }
    try {
      window.localStorage.removeItem(probarStorageKey("vendedor"));
      window.localStorage.removeItem(probarStorageKey("comprador"));
    } catch {}
    guardarSesion();
    generacion.current += 1;
    prevStatus.current = null;
    setRegistro(null);
    setCompradorSlug(null);
    setDesvios([]);
    setDesvioError(null);
    setBloqueo(null);
    setTab("vendedor");
    setAviso(null);
    setMarco((m) => m + 1);
    setListo(true);
    setReiniciando(false);
  }

  async function desviar() {
    const slug = registro?.pedido?.slug;
    if (!slug) return;
    setDesviando(true);
    setDesvioError(null);
    try {
      const r = await api<Omit<Desvio, "at">>("/api/probar/desvio", { slug });
      setDesvios((d) => [{ ...r, at: Date.now() }, ...d]);
    } catch (e) {
      setDesvioError((e as Error).message);
    } finally {
      setDesviando(false);
    }
  }

  const filas = registro?.tienda ? filasRegistro(registro.movimientos, registro.tienda.pubkey) : [];
  const ultimo = desvios[0];

  return (
    <div data-probar-ancho className="space-y-5" data-testid="probar">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Prueba en vivo · modo práctica</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Prueba Trato de punta a punta</h1>
          <p className="mt-1 text-sm text-slate-600">
            Dos celulares con las pantallas reales de Trato: a la izquierda el vendedor, a la derecha el comprador. Cada uno tiene su propia cuenta de
            prueba, creada en este navegador. No se mueve dinero real.
          </p>
        </div>
        <button className="btn-secondary shrink-0 !py-2 text-sm" onClick={empezarDeNuevo} disabled={reiniciando} data-testid="empezar-de-nuevo">
          {reiniciando ? <Spinner /> : "↺"} Empezar de nuevo
        </button>
      </header>

      {bloqueo && (
        <p data-testid="probar-bloqueo" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {bloqueo}
        </p>
      )}

      {listo && (
        <>
          <p data-testid="ahora" className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-900 ring-1 ring-brand-100">
            <strong>Ahora: </strong>
            {siguientePaso({ tienda: Boolean(registro?.tienda), status: registro?.pedido ? status : null })}
          </p>

          <div role="tablist" aria-label="Celulares" className="grid grid-cols-2 gap-1 rounded-xl bg-slate-200/70 p-1 lg:hidden">
            {(["vendedor", "comprador"] as const).map((r) => (
              <button
                key={r}
                role="tab"
                aria-selected={tab === r}
                data-testid={`tab-${r}`}
                onClick={() => {
                  setTab(r);
                  if (aviso === r) setAviso(null);
                }}
                className={`relative rounded-lg px-3 py-2 text-sm font-semibold ${tab === r ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
              >
                {r === "vendedor" ? "🏪 Vendedor" : "🛍️ Comprador"}
                {aviso === r && tab !== r && <span aria-label="hay algo nuevo" className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500" />}
              </button>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-[auto_auto] lg:justify-center xl:grid-cols-[auto_auto_minmax(0,1fr)]">
            <MarcoCelular titulo="Celular del vendedor" testId="marco-vendedor" className={tab === "vendedor" ? "flex" : "hidden lg:flex"}>
              <iframe key={`v${marco}`} name="vendedor" title="Celular del vendedor" src="/vender" className="h-full w-full border-0" />
            </MarcoCelular>
            <MarcoCelular titulo="Celular del comprador" testId="marco-comprador" className={tab === "comprador" ? "flex" : "hidden lg:flex"}>
              {compradorSlug ? (
                <iframe key={`c${marco}-${compradorSlug}`} name="comprador" title="Celular del comprador" src={`/p/${compradorSlug}`} className="h-full w-full border-0" />
              ) : (
                <div data-testid="esperando-link" className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
                  <span className="text-4xl" aria-hidden>
                    💬
                  </span>
                  <p className="font-semibold">Todavía no te llegó ningún link</p>
                  <p className="text-sm text-slate-500">Cuando el vendedor cree uno, aparece aquí, como si te lo mandara por WhatsApp.</p>
                </div>
              )}
            </MarcoCelular>

            <div className="space-y-5 lg:col-span-2 xl:col-span-1">
              <RegistroEnVivo registro={registro} filas={filas} desvios={desvios} />
              <section data-testid="desvio" className="card space-y-3 border-rose-200">
                <h2 className="text-lg font-bold">Intenta desviar la plata</h2>
                <p className="text-sm text-slate-600">
                  Con la plata guardada, pídele al contrato que mande todo el saldo a otra cuenta, con la firma del revisor del equipo. Es un intento real
                  contra el contrato, simulado: no se envía nada ni se cobra comisión.
                </p>
                <button className="btn-danger w-full" onClick={desviar} disabled={!hayPlataGuardada(status) || desviando} data-testid="desviar">
                  {desviando ? <Spinner /> : "🕳️"} Intenta desviar la plata
                </button>
                {!hayPlataGuardada(status) && (
                  <p className="text-xs text-slate-500" data-testid="desvio-espera">
                    {status === "liberado" || status === "resuelto" || status === "devuelto"
                      ? "La plata ya salió del contrato por una de sus salidas."
                      : "Primero paga desde el celular del comprador: tiene que haber plata guardada en el contrato."}
                  </p>
                )}
                {desvioError && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{desvioError}</p>}
                {ultimo && <ResultadoDesvio d={ultimo} />}
                <p data-testid="dos-salidas" className="border-t border-slate-100 pt-3 text-center text-base font-bold text-slate-900">
                  Dos salidas, nunca una tercera.
                </p>
              </section>
              <section data-testid="plazos" className="card space-y-2 text-sm text-slate-600">
                <h2 className="text-base font-bold text-slate-900">Plazos de demo</h2>
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    El vendedor tiene {minutos(plazos.despachoSegundos)} para registrar el envío después del pago. Si no lo hace, la plata vuelve sola al
                    comprador.
                  </li>
                  <li>
                    El comprador puede pagar al vendedor {minutos(plazos.confirmarSegundos)} después del envío. En una compra real son 2 horas en la misma
                    ciudad y 24 horas entre ciudades.
                  </li>
                  <li>Si el comprador no hace nada, {minutos(plazos.despachoSegundos)} después del envío cualquiera puede liberar el pago al vendedor.</li>
                </ul>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ResultadoDesvio({ d }: { d: Desvio }) {
  const err = errorDelContrato(d.raw, d.code);
  if (!d.rejected)
    return (
      <div data-testid="desvio-resultado" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        La simulación no falló: hay que revisar los roles de este contrato. {d.detail}
      </div>
    );
  return (
    <div data-testid="desvio-resultado" className="space-y-2 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
      <p className="font-bold text-rose-800">❌ Rechazado por el {d.by === "contrato" ? "contrato" : "servidor"}</p>
      {err && (
        <p>
          <code data-testid="desvio-error" className="rounded bg-white px-2 py-1 font-mono text-base font-bold text-rose-700 ring-1 ring-rose-200">
            {err}
          </code>
        </p>
      )}
      {d.by === "contrato" ? (
        <p>
          Solo el revisor designado en el contrato puede repartir la plata. Y ese revisor es un programa que solo reparte entre el comprador y el
          vendedor: no tiene cómo mandarla a otra cuenta.
        </p>
      ) : (
        <p>{d.detail}</p>
      )}
      {d.call && <p className="break-all font-mono text-xs text-rose-800/80">Se intentó: {d.call}</p>}
      <p className="text-xs">
        Simulación a las {hora(d.at)}: no se envió nada.
        {d.escrowId && (
          <>
            {" "}
            <a href={explorer.contract(d.escrowId)} target="_blank" rel="noreferrer" className="font-semibold underline">
              Ver el contrato de este pedido ↗
            </a>
          </>
        )}
      </p>
    </div>
  );
}

function RegistroEnVivo({ registro, filas, desvios }: { registro: Registro | null; filas: FilaRegistro[]; desvios: Desvio[] }) {
  const p = registro?.pedido ?? null;
  const hecho: Record<PasoId, boolean> = {
    link: Boolean(p),
    pago: filas.some((f) => f.kind === "fondeo"),
    envio: filas.some((f) => f.paso === "envio"),
    cobro: filas.some((f) => f.kind === "liberacion"),
  };
  const otros = filas.filter((f) => f.paso === "otro");
  return (
    <section data-testid="registro" className="card space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">Registro en vivo</h2>
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" aria-hidden /> se actualiza solo
        </span>
      </div>
      {p && (
        <p className="text-sm text-slate-600">
          Pedido <strong data-testid="registro-codigo">{p.code}</strong> · {p.product} · {p.total}
          {p.escrow_id && (
            <>
              {" · "}
              <a href={explorer.contract(p.escrow_id)} target="_blank" rel="noreferrer" className="text-brand-700 underline" data-testid="registro-contrato">
                contrato ↗
              </a>
            </>
          )}
        </p>
      )}
      <ol className="space-y-3">
        {PASOS.map((paso, i) => {
          const mias = filas.filter((f) => f.paso === paso.id);
          return (
            <li key={paso.id} data-testid={`paso-registro-${paso.id}`} data-hecho={hecho[paso.id] ? "si" : "no"} className="space-y-1.5">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <span
                  aria-hidden
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${hecho[paso.id] ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-600"}`}
                >
                  {hecho[paso.id] ? "✓" : i + 1}
                </span>
                {paso.titulo}
              </p>
              <ul className="ml-8 space-y-1">
                {paso.id === "link" && p && <Fila texto={`Link ${p.code ?? ""} creado: todavía no se movió plata`} at={p.created_at} hash={null} sinTx />}
                {mias.map((f, j) => (
                  <Fila key={j} texto={f.texto} at={f.at} hash={f.hash} />
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
      {(otros.length > 0 || desvios.length > 0) && (
        <div className="space-y-1.5 border-t border-slate-100 pt-3">
          <p className="text-sm font-semibold">Otros movimientos</p>
          <ul className="ml-1 space-y-1">
            {otros.map((f, j) => (
              <Fila key={`o${j}`} texto={f.texto} at={f.at} hash={f.hash} />
            ))}
            {desvios.map((d) => (
              <li key={d.at} data-testid="registro-desvio" className="text-sm text-rose-700">
                ❌ Intento de desvío {d.rejected ? "rechazado" : "sin rechazo"}
                {errorDelContrato(d.raw, d.code) ? `: ${errorDelContrato(d.raw, d.code)}` : ""} · simulación, sin transacción ·{" "}
                <span className="text-slate-500">{hora(d.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!registro?.tienda && <p className="text-sm text-slate-500">Todavía no hay movimientos: empieza por crear la tienda.</p>}
    </section>
  );
}

function Fila({ texto, at, hash, sinTx }: { texto: string; at: number; hash: string | null; sinTx?: boolean }) {
  return (
    <li className="text-sm text-slate-700" data-testid="registro-fila">
      {texto} · <span className="text-slate-500">{hora(at)}</span>
      {hash ? (
        <>
          {" · "}
          <a href={explorer.tx(hash)} target="_blank" rel="noreferrer" className="font-medium text-brand-700 underline" data-testid="registro-tx">
            Ver transacción ↗
          </a>
        </>
      ) : sinTx ? (
        <span className="text-slate-500"> · sin transacción</span>
      ) : null}
    </li>
  );
}
