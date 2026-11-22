"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconoBolsa, IconoChevronAbajo, IconoMensaje, IconoReiniciar, IconoReloj, IconoTienda } from "@/components/iconos";
import { Desvio } from "@/components/probar/Desvio";
import { Guia, Pasos } from "@/components/probar/Guia";
import { IPHONE_ALTO, IPHONE_ANCHO, IPHONE_ETIQUETA, IPhone } from "@/components/probar/IPhone";
import { PlataEntreLosDos } from "@/components/probar/PlataEntreLosDos";
import { RegistroEnVivo } from "@/components/probar/RegistroEnVivo";
import type { Desvio as DesvioT, Plazos, Registro } from "@/components/probar/tipos";
import { Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { PROBAR_SESION, etapaActual, etapas, filasRegistro, probarStorageKey, siguientePaso, tituloEtapa, turnoDe, type RolProbar } from "@/lib/probar";

const POLL_MS = 3000;
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

/**
 * Escala del iPhone para que entre en el espacio que queda debajo de la guía. En escritorio manda el alto (nunca menos de
 * 0,7: la app adentro tiene que seguir legible); en celular manda el ancho, salvo que el alto alcance para verlo entero.
 */
function escalaPara(escenario: HTMLElement): number {
  const lg = window.matchMedia("(min-width: 1024px)").matches;
  const top = escenario.getBoundingClientRect().top + window.scrollY;
  const porAlto = (window.innerHeight - top - 16 - IPHONE_ETIQUETA) / IPHONE_ALTO;
  const e = lg ? Math.min(1, Math.max(0.7, porAlto)) : Math.min((escenario.clientWidth - 8) / IPHONE_ANCHO, porAlto >= 0.72 ? porAlto : 1);
  return Math.round(Math.min(1, e) * 1000) / 1000;
}

export default function Probar({ plazos }: { plazos: Plazos }) {
  const [listo, setListo] = useState(false);
  const [bloqueo, setBloqueo] = useState<string | null>(null);
  const [marco, setMarco] = useState(0);
  const [tab, setTab] = useState<RolProbar>("vendedor");
  const [registro, setRegistro] = useState<Registro | null>(null);
  const [compradorSlug, setCompradorSlug] = useState<string | null>(null);
  const [aviso, setAviso] = useState<RolProbar | null>(null);
  const [desvios, setDesvios] = useState<DesvioT[]>([]);
  const [desviando, setDesviando] = useState(false);
  const [desvioError, setDesvioError] = useState<string | null>(null);
  const [reiniciando, setReiniciando] = useState(false);
  // Reloj de un segundo para las cuentas regresivas (plazo de despacho y espera para pagar al vendedor).
  const [ahora, setAhora] = useState(() => Date.now());
  const [escala, setEscala] = useState(0.72);
  const escenario = useRef<HTMLDivElement>(null);
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

  // Solo hace falta el reloj mientras hay una espera que contar: pagando, plazo de despacho o espera para cobrar.
  const contando = status === "pagado" || status === "enviado" || status === "esperando_pago";
  useEffect(() => {
    if (!contando) return;
    setAhora(Date.now());
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [contando]);

  // Los iPhone se escalan para entrar en lo que queda de pantalla; se vuelve a medir si cambia el viewport o lo de arriba.
  useEffect(() => {
    if (!listo) return;
    const medir = () => {
      if (escenario.current) setEscala(escalaPara(escenario.current));
    };
    medir();
    window.addEventListener("resize", medir);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;
    ro?.observe(document.body);
    return () => {
      window.removeEventListener("resize", medir);
      ro?.disconnect();
    };
  }, [listo]);

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

  // En celular, al cambiar de pestaña el teléfono que toca se trae entero a la vista: la barra "Pagar" del comprador vive abajo.
  const claveScroll = `${tab}:${status ?? ""}`;
  const scrollAnterior = useRef(claveScroll);
  useEffect(() => {
    if (scrollAnterior.current === claveScroll) return;
    scrollAnterior.current = claveScroll;
    if (window.matchMedia("(min-width: 1024px)").matches) return;
    document.querySelector<HTMLElement>(`[data-testid="marco-${tab}"]`)?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [claveScroll, tab]);

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
      const r = await api<Omit<DesvioT, "at">>("/api/probar/desvio", { slug });
      setDesvios((d) => [{ ...r, at: Date.now() }, ...d]);
    } catch (e) {
      setDesvioError((e as Error).message);
    } finally {
      setDesviando(false);
    }
  }

  const filas = registro?.tienda ? filasRegistro(registro.movimientos, registro.tienda.pubkey) : [];
  const ultimo = desvios[0];
  const hayTienda = Boolean(registro?.tienda);
  const hayPedido = Boolean(registro?.pedido);
  const estados = etapas({ pedido: hayPedido, status, desvios: desvios.length, envio: filas.some((f) => f.paso === "envio") });
  const { numero, terminada } = etapaActual(estados);
  const turno = turnoDe({ tienda: hayTienda, status: hayPedido ? status : null });

  return (
    <div data-probar-ancho className="space-y-4" data-testid="probar">
      <header className="flex items-center justify-between gap-4">
        {listo ? <Pasos estados={estados} numero={numero} terminada={terminada} /> : <span />}
        <button className="btn-secondary btn-sm shrink-0" onClick={empezarDeNuevo} disabled={reiniciando} data-testid="empezar-de-nuevo">
          {reiniciando ? <Spinner className="h-4 w-4" /> : <IconoReiniciar className="h-4 w-4" />}
          <span className="hidden sm:inline">Empezar de nuevo</span>
          <span className="sm:hidden">De nuevo</span>
        </button>
      </header>

      {bloqueo && (
        <p data-testid="probar-bloqueo" className="caja-aviso">
          {bloqueo}
        </p>
      )}

      <h1 className="font-sans text-xs font-semibold uppercase tracking-[0.08em] text-musgo">Prueba Trato de punta a punta</h1>

      {listo && (
        <>
          <Guia
            titulo={tituloEtapa({ pedido: hayPedido, status, desvios: desvios.length })}
            texto={siguientePaso({ tienda: hayTienda, status: hayPedido ? status : null })}
            turno={turno}
          />

          <div className="grid gap-8 xl:grid-cols-[auto_minmax(0,1fr)] xl:items-start">
            {/* El escenario: los dos iPhone con la plata en el medio. En celular, uno a la vez, en pestañas. */}
            <div ref={escenario} className="flex flex-col gap-3 lg:grid lg:grid-cols-[auto_minmax(10rem,13rem)_auto] lg:items-start lg:justify-center lg:gap-8">
              <div role="tablist" aria-label="Celulares" className="order-2 grid grid-cols-2 gap-1 rounded-control bg-tinta-200/60 p-1 lg:hidden">
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
                    className={`relative inline-flex items-center justify-center gap-2 rounded-chip px-3 py-2 text-sm font-semibold transition-colors duration-150 ${
                      tab === r ? "bg-white text-monte shadow-card" : "text-tinta-600"
                    }`}
                  >
                    {r === "vendedor" ? <IconoTienda className="h-4 w-4" /> : <IconoBolsa className="h-4 w-4" />}
                    {r === "vendedor" ? "Vendedor" : "Comprador"}
                    {turno === r && <span className="sr-only">(te toca)</span>}
                    {aviso === r && tab !== r && <span aria-label="hay algo nuevo" className="absolute right-2 top-2 h-2 w-2 rounded-full bg-yungas ring-2 ring-tinta-200" />}
                  </button>
                ))}
              </div>

              <IPhone rol="vendedor" titulo="Celular del vendedor" turno={turno === "vendedor"} escala={escala} testId="marco-vendedor" className={`order-3 lg:order-none ${tab === "vendedor" ? "flex" : "hidden lg:flex"}`}>
                <iframe key={`v${marco}`} name="vendedor" title="Celular del vendedor" src="/vender" className="h-full w-full border-0 bg-sal" />
              </IPhone>

              <PlataEntreLosDos pedido={registro?.pedido ?? null} tienda={registro?.tienda?.nombre ?? null} filas={filas} plazos={plazos} ahora={ahora} className="order-1 lg:order-none lg:self-start lg:pt-20" />

              <IPhone rol="comprador" titulo="Celular del comprador" turno={turno === "comprador"} escala={escala} testId="marco-comprador" className={`order-3 lg:order-none ${tab === "comprador" ? "flex" : "hidden lg:flex"}`}>
                {compradorSlug ? (
                  <iframe key={`c${marco}-${compradorSlug}`} name="comprador" title="Celular del comprador" src={`/p/${compradorSlug}`} className="h-full w-full border-0 bg-sal" />
                ) : (
                  <div data-testid="esperando-link" className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
                    <IconoMensaje className="h-10 w-10 text-tinta-300" />
                    <p className="text-base font-semibold text-monte">Todavía no te llegó ningún link</p>
                    <p className="text-sm leading-snug text-tinta-600">Cuando el vendedor cree uno, aparece aquí, como si te lo mandara por WhatsApp.</p>
                  </div>
                )}
              </IPhone>
            </div>

            <aside className="grid gap-8 lg:grid-cols-2 xl:grid-cols-1">
              <RegistroEnVivo registro={registro} filas={filas} desvios={desvios} />
              <div className="space-y-6">
                <Desvio status={status} desviando={desviando} error={desvioError} ultimo={ultimo} onDesviar={desviar} />
                <details data-testid="plazos" className="group text-sm text-tinta-600">
                  <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-tinta-700 [&::-webkit-details-marker]:hidden">
                    <IconoReloj className="h-4 w-4 shrink-0 text-tinta-500" />
                    Plazos de esta demo
                    <IconoChevronAbajo className="ml-auto h-4 w-4 shrink-0 text-tinta-500 transition-transform duration-150 group-open:rotate-180" />
                  </summary>
                  <ul className="prosa mt-3 list-disc space-y-1.5 pl-5 leading-relaxed">
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
                </details>
              </div>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
