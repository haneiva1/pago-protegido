"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconoBillete, IconoBloqueado, IconoBolsa, IconoCerrar, IconoCheck, IconoChevronAbajo, IconoInfo, IconoReiniciar, IconoReloj, IconoTienda, IconoUsuario } from "@/components/iconos";
import { Casos } from "@/components/probar/Casos";
import { ComoFunciona3 } from "@/components/probar/ComoFunciona3";
import { ConstruidoLinea } from "@/components/probar/Construido";
import { Intro } from "@/components/probar/Intro";
import { Desvio } from "@/components/probar/Desvio";
import { IPHONE_ALTO, IPHONE_ANCHO, IPHONE_ETIQUETA, IPhone } from "@/components/probar/IPhone";
import { RegistroEnVivo } from "@/components/probar/RegistroEnVivo";
import type { Desvio as DesvioT, Plazos, Registro } from "@/components/probar/tipos";
import { Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { canal } from "@/components/chat/pedido";
import { PASOS_DEMO, pasoDemo } from "@/lib/chat";
import { PROBAR_SESION, filasRegistro, hayPlataGuardada, probarStorageKey, resumenRed, type RolProbar } from "@/lib/probar";

const POLL_MS = 3000;
const minutos = (s: number) => `${Math.round(s / 60)} ${Math.round(s / 60) === 1 ? "minuto" : "minutos"}`;
const ICONOS = [IconoUsuario, IconoTienda, IconoBillete, IconoCheck];
/** Lo que acaba de pasar, por estado del pedido (≤ 6 palabras). */
const HECHO: Record<string, string> = {
  tienda: "La Zapatería ya tiene cuenta",
  esperando_pago: "El link ya está en el chat",
  pagado: "La plata quedó guardada",
  enviado: "El envío quedó registrado",
  liberado: "La Zapatería cobró",
  devuelto: "La plata volvió al comprador",
  en_disputa: "Hay un reclamo abierto",
  resuelto: "El revisor repartió la plata",
};

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

/** Escala del iPhone según la altura que queda bajo la cabecera: en escritorio entran completos (bisel e indicador de inicio incluidos). */
function escalaPara(escenario: HTMLElement): number {
  const lg = window.matchMedia("(min-width: 1024px)").matches;
  const top = escenario.getBoundingClientRect().top + window.scrollY;
  // En escritorio la etiqueta sobre el teléfono no se muestra (la nombra la franja del paso): todo el alto es para el iPhone.
  const porAlto = (window.innerHeight - top - 8 - (lg ? 0 : IPHONE_ETIQUETA)) / IPHONE_ALTO;
  // En escritorio manda el alto, sin piso: los dos iPhone tienen que entrar completos sin desplazar la página.
  const e = lg ? Math.min(1, Math.max(0.45, porAlto)) : Math.min((escenario.clientWidth - 8) / IPHONE_ANCHO, porAlto >= 0.72 ? porAlto : 1);
  return Math.round(Math.min(1, e) * 1000) / 1000;
}

/**
 * /probar: cuatro pasos (se registra · vende · le pagan · cobra), un título de pocas palabras, dos iPhone con un chat
 * y un solo botón que resalta por paso. Todo lo demás (registro en la red, plazos, por qué simulado, lo construido) va en
 * el cajón "Ver detalles".
 */
export default function Probar({ plazos }: { plazos: Plazos }) {
  const [listo, setListo] = useState(false);
  const [bloqueo, setBloqueo] = useState<string | null>(null);
  const [marco, setMarco] = useState(0);
  const [tab, setTab] = useState<RolProbar>("vendedor");
  const [registro, setRegistro] = useState<Registro | null>(null);
  const [aviso, setAviso] = useState<RolProbar | null>(null);
  const [desvios, setDesvios] = useState<DesvioT[]>([]);
  const [desviando, setDesviando] = useState(false);
  const [desvioError, setDesvioError] = useState<string | null>(null);
  const [reiniciando, setReiniciando] = useState(false);
  const [cajon, setCajon] = useState(false);
  const [escala, setEscala] = useState(0.72);
  const [altoMovil, setAltoMovil] = useState(640);
  const [mandado, setMandado] = useState(false);
  const [sub, setSub] = useState<string | null>(null);
  // El bloqueo se ve 2 s en el celular del comprador antes de pasar la escena a la tienda.
  const [bloqueoVisto, setBloqueoVisto] = useState(false);
  // Precalentar: las dos cuentas de prueba (tienda y comprador) se crean y activan en segundo plano apenas carga la demo.
  const [precalentando, setPrecalentando] = useState<null | number>(null);
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

  // Precalentar: las dos cuentas de prueba (tienda y comprador) se crean y activan en segundo plano apenas carga la demo,
  // así "Crear mi cuenta" solo guarda la tienda y el pago no espera la activación del comprador.
  useEffect(() => {
    if (!listo) return;
    let vivo = true;
    const t0 = Date.now();
    setPrecalentando(0);
    const tic = setInterval(() => {
      if (vivo) setPrecalentando(Math.round((Date.now() - t0) / 1000));
    }, 1000);
    (async () => {
      try {
        wallet.current ??= await import("@/lib/wallet");
        const w = wallet.current;
        await Promise.all([w.activateWallet(w.getWallet("vendedor")), w.activateWallet(w.getWallet("comprador"))]);
      } catch {
        // Si falla, cada chat activa su cuenta al momento de usarla, como antes.
      } finally {
        clearInterval(tic);
        if (vivo) setPrecalentando(null);
      }
    })();
    return () => {
      vivo = false;
      clearInterval(tic);
    };
  }, [listo, marco]);

  useEffect(() => {
    if (!listo) return;
    let vivo = true;
    const t0 = Date.now();
    setPrecalentando(0);
    const tic = setInterval(() => vivo && setPrecalentando(Math.round((Date.now() - t0) / 1000)), 1000);
    (async () => {
      try {
        wallet.current ??= await import("@/lib/wallet");
        const w = wallet.current;
        await Promise.all([w.activateWallet(w.getWallet("vendedor")), w.activateWallet(w.getWallet("comprador"))]);
      } catch {
        // Si falla, cada chat activa la suya al momento de usarla (como antes).
      } finally {
        clearInterval(tic);
        if (vivo) setPrecalentando(null);
      }
    })();
    return () => {
      vivo = false;
      clearInterval(tic);
    };
  }, [listo, marco]);

  // Marca la página para el CSS del sitio (en /probar se esconde el "Crear mi link" del encabezado).
  useEffect(() => {
    document.documentElement.setAttribute("data-probar", "1");
    return () => document.documentElement.removeAttribute("data-probar");
  }, []);

  // Lo que cuentan los chats por el canal: el link ya llegó al comprador, el sub-estado del alta y el resultado de la estafa.
  useEffect(() => {
    const c = canal();
    if (!c) return;
    c.onmessage = (ev: MessageEvent) => {
      const d = ev.data ?? {};
      if (d.tipo === "link-reenviado") {
        setMandado(true);
        setTab("comprador");
        setAviso("comprador");
      }
      if (d.tipo === "sub") {
        setSub(typeof d.valor === "string" ? d.valor : null);
        // Al abrir una hoja dentro del chat el foco puede mover la página: se vuelve a anclar a las pestañas.
        if (!window.matchMedia("(min-width: 1024px)").matches)
          for (const ms of [150, 450]) setTimeout(() => document.querySelector<HTMLElement>('[role="tablist"]')?.scrollIntoView({ block: "start" }), ms);
      }
      if (d.tipo === "actualiza") void cargar();
    };
    return () => c.close();
  }, [cargar]);

  // Si la pestaña se recarga, el "mandado" queda guardado por pedido.
  useEffect(() => {
    const slug = registro?.pedido?.slug;
    if (!slug) return setMandado(false);
    try {
      if (window.sessionStorage.getItem(`pp.chat.reenviado.${slug}`) === "1") setMandado(true);
    } catch {}
  }, [registro?.pedido?.slug]);

  // Los iPhone se escalan para entrar en lo que queda de pantalla; en celular, el chat ocupa lo que queda bajo el encabezado del sitio.
  useEffect(() => {
    if (!listo) return;
    const medir = () => {
      if (escenario.current) setEscala(escalaPara(escenario.current));
      // Encabezado fijo del sitio (56) + pestañas (52) + aire: el chat ocupa exactamente lo que queda.
      setAltoMovil(Math.max(420, window.innerHeight - 184));
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

  // En el celular (pestañas), cada paso lleva al chat de quien tiene que actuar, y el teléfono se trae al tope de la pantalla.
  useEffect(() => {
    if (status === prevStatus.current) return;
    const antes = prevStatus.current;
    prevStatus.current = status;
    if (antes === null && status === null) return;
    const turno: RolProbar | null = status === "enviado" ? "comprador" : status === "pagado" || status === "liberado" ? "vendedor" : null;
    if (turno) {
      setTab(turno);
      setAviso(turno);
    }
  }, [status]);
  useEffect(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) return;
    document.querySelector<HTMLElement>('[role="tablist"]')?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [tab, status]);

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
      for (const k of Object.keys(window.sessionStorage)) if (k.startsWith("pp.chat.")) window.sessionStorage.removeItem(k);
    } catch {}
    guardarSesion();
    generacion.current += 1;
    prevStatus.current = null;
    setRegistro(null);
    setDesvios([]);
    setBloqueoVisto(false);
    setMandado(false);
    setSub(null);
    setDesvioError(null);
    setBloqueo(null);
    setTab("vendedor");
    setAviso(null);
    setCajon(false);
    setMarco((m) => m + 1);
    setListo(true);
    setReiniciando(false);
  }

  /** "Alguien intenta robar la plata": la simulación real contra el contrato; el chat del comprador la cuenta como un mensaje del estafador. */
  async function desviar() {
    const slug = registro?.pedido?.slug;
    if (!slug) return;
    const at = Date.now();
    setDesviando(true);
    setDesvioError(null);
    setTab("comprador");
    canal()?.postMessage({ tipo: "estafa-en-curso", slug, at });
    try {
      const r = await api<Omit<DesvioT, "at">>("/api/probar/desvio", { slug });
      setDesvios((d) => [{ ...r, at }, ...d]);
      canal()?.postMessage({ tipo: "estafa-resultado", slug, at, ...r });
      setTimeout(() => {
        try {
          window.sessionStorage.setItem(`pp.chat.estafa.${slug}`, "1");
        } catch {}
        canal()?.postMessage({ tipo: "estafa-vista", slug });
        setBloqueoVisto(true);
        setAviso("vendedor");
      }, 2000);
      // En celular la escena del estafador se queda en el comprador hasta que el jurado toque la pestaña o pasen 6 s.
      setTimeout(() => setTab("vendedor"), 6000);
    } catch (e) {
      setDesvioError((e as Error).message);
      canal()?.postMessage({ tipo: "estafa-resultado", slug, at, rejected: false, detail: (e as Error).message });
    } finally {
      setDesviando(false);
    }
  }

  const filas = registro?.tienda ? filasRegistro(registro.movimientos, registro.tienda.pubkey) : [];
  const ultimo = desvios[0];
  const hayTienda = Boolean(registro?.tienda);
  const hayPedido = Boolean(registro?.pedido);
  const paso = pasoDemo({ tienda: hayTienda, status: hayPedido ? status : null, estafa: desviando || (desvios.length > 0 && !bloqueoVisto) ? "en-curso" : desvios.length ? "bloqueada" : "no", mandado, sub });
  const turno = paso.quien;
  const resumen = status === "liberado" && registro?.pedido ? resumenRed(filas, registro.pedido.created_at) : null;
  const mostrarEstafa = hayPlataGuardada(status) && status === "pagado" && desvios.length === 0;

  return (
    <div data-probar-ancho className="space-y-3 lg:grid lg:grid-cols-[380px_minmax(0,1fr)] lg:gap-x-10 lg:gap-y-5 lg:space-y-0" data-testid="probar">
      <h1 className="sr-only">Prueba Trato de punta a punta</h1>
      {/* Columna izquierda en escritorio: qué es Trato, cómo funciona y los dos controles. */}
      <aside className="space-y-4 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:space-y-6">
        <Intro />
        <ComoFunciona3 vertical />
        <div className="flex flex-wrap items-center gap-2" data-testid="controles">
          <button className="btn-secondary btn-sm" onClick={() => setCajon(true)} data-testid="ver-detalles" aria-expanded={cajon}>
            <IconoInfo className="h-4 w-4" />
            Ver detalles
          </button>
          <button className="btn-secondary btn-sm" onClick={empezarDeNuevo} disabled={reiniciando} data-testid="empezar-de-nuevo">
            {reiniciando ? <Spinner className="h-4 w-4" /> : <IconoReiniciar className="h-4 w-4" />}
            Empezar de nuevo
          </button>
        </div>
      </aside>

      {/* Arriba: los 4 pasos con ícono, el actual resaltado; a la derecha, "Ver detalles" y "Empezar de nuevo". */}
      {/* Una sola franja: los 4 pasos, el título del paso (≤ 6 palabras) con su línea (≤ 10) y los dos controles. */}
      <header className="grid grid-cols-1 items-center gap-x-6 gap-y-2 lg:col-start-2 lg:row-start-1 lg:grid-cols-[auto_minmax(0,1fr)]">
        <ol aria-label={`Paso ${paso.n} de 4`} className="flex items-center gap-1 sm:gap-2" data-testid="pasos">
          {PASOS_DEMO.map((p, i) => {
            const Icono = ICONOS[i];
            const estado = p.n < paso.n || (p.n === paso.n && paso.terminado) ? "hecho" : p.n === paso.n ? "ahora" : "pendiente";
            return (
              <li key={p.n} data-paso={p.n} data-estado={estado} className="flex items-center gap-1 sm:gap-2">
                <span
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold transition-colors duration-300 sm:px-3 ${
                    estado === "ahora" ? "bg-monte text-sal" : estado === "hecho" ? "bg-exito-100 text-musgo" : "bg-tinta-100 text-tinta-500"
                  }`}
                >
                  {estado === "hecho" ? <IconoCheck className="h-4 w-4" /> : <Icono className="h-4 w-4" />}
                  <span className="num">{p.n}</span>
                  <span className={estado === "ahora" ? "inline" : "hidden sm:inline"}>{p.nombre}</span>
                </span>
                {i < PASOS_DEMO.length - 1 && <span aria-hidden className="h-px w-2 bg-tinta-300 sm:w-4" />}
              </li>
            );
          })}
        </ol>
        {listo && (
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 lg:px-2">
            <h2 data-testid="titulo-etapa" className="text-2xl leading-tight" data-paso={paso.n}>
              {paso.titulo}
            </h2>
            <p data-testid="ahora" className="text-sm text-tinta-600 lg:text-base">
              {paso.linea}
            </p>
            {precalentando !== null && (
              <span className="inline-flex items-center gap-1.5 text-sm text-tinta-500" data-testid="precalentando">
                <Spinner className="h-3.5 w-3.5" />
                Preparando la demo… <span className="num">{precalentando} s</span>
              </span>
            )}
            {mostrarEstafa && (
              <button className="btn-danger btn-sm hidden lg:inline-flex" onClick={desviar} disabled={desviando} data-testid="desviar">
                {desviando ? <Spinner className="h-4 w-4" /> : <IconoBloqueado className="h-4 w-4" />}
                Alguien intenta robar la plata
              </button>
            )}
          </div>
        )}
      </header>

      {bloqueo && (
        <p data-testid="probar-bloqueo" className="caja-aviso lg:col-start-2">
          {bloqueo}
        </p>
      )}

      {listo && (
        <>
          {/* El escenario: los dos iPhone; el que no toca, atenuado. En celular, uno a la vez, en pestañas. */}
          <div ref={escenario} className="flex flex-col gap-3 lg:col-start-2 lg:row-start-2 lg:grid lg:grid-cols-[auto_auto] lg:items-start lg:justify-center lg:gap-16" style={{ "--alto-movil": `${altoMovil}px` } as React.CSSProperties}>
            <div role="tablist" aria-label="Celulares" className="order-2 grid scroll-mt-16 grid-cols-2 gap-1 rounded-control bg-tinta-200/60 p-1 lg:hidden">
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
                  {r === "vendedor" ? "Zapatería" : "Comprador"}
                  {aviso === r && tab !== r && <span aria-label="hay algo nuevo" className="absolute right-2 top-2 h-2 w-2 rounded-full bg-yungas ring-2 ring-tinta-200" />}
                </button>
              ))}
            {/* En celular, el paso actual bajo las pestañas: una sola línea compacta. */}
            <div className="order-2 space-y-2 lg:hidden" data-testid="paso-compacto">
              <p className="text-sm leading-tight">
                <strong className="block text-monte">{paso.titulo}</strong>
                <span className="block text-tinta-600">{paso.corta}</span>
              </p>
              {mostrarEstafa && (
                <button className="btn-danger w-full py-3" onClick={desviar} disabled={desviando} data-testid="desviar-movil">
                  {desviando ? <Spinner className="h-4 w-4" /> : <IconoBloqueado className="h-5 w-5" />}
                  Alguien intenta robar la plata
                </button>
              )}
            </div>
            </div>

            <IPhone rol="vendedor" titulo="Chat de la Zapatería" turno={turno !== "comprador"} escala={escala} testId="marco-vendedor" className={`order-3 lg:order-none ${tab === "vendedor" ? "flex" : "hidden lg:flex"}`}>
              <iframe key={`v${marco}`} name="vendedor" title="Chat de la Zapatería (simulación)" src="/probar/chat/vendedor" className="h-full w-full border-0 bg-sal" />
            </IPhone>

            <IPhone rol="comprador" titulo="Chat del comprador" turno={turno !== "vendedor"} escala={escala} testId="marco-comprador" className={`order-3 lg:order-none ${tab === "comprador" ? "flex" : "hidden lg:flex"}`}>
              <iframe key={`c${marco}`} name="comprador" title="Chat del comprador (simulación)" src="/probar/chat/comprador" className="h-full w-full border-0 bg-sal" />
            </IPhone>
          </div>

          {/* Lo que acaba de pasar, en 6 palabras o menos, y por qué la demo es simulada. */}
          <p data-testid="recien" className="text-center text-2xl lg:col-span-2 lg:text-3xl">
            {HECHO[status ?? (hayTienda ? "tienda" : "")] ?? ""}
          </p>
          <p className="mx-auto flex max-w-3xl items-start justify-center gap-2 text-sm leading-snug text-tinta-600 lg:col-span-2" data-testid="por-que-simulado">
            <IconoInfo className="mt-0.5 h-4 w-4 shrink-0 text-tinta-500" />
            <span>
              ¿Por qué simulado? Meta solo deja que un número de prueba le responda a 5 teléfonos hasta verificar la empresa. El bot real ya está hecho
              (carpeta bot/, 191 tests, API oficial de WhatsApp) y lo mostramos en vivo en la final.
            </span>
          </p>
          <div className="lg:col-span-2">
            <Casos />
          </div>
          <div className="lg:col-span-2">
            <ConstruidoLinea resumen={resumen} />
          </div>
        </>
      )}

      {/* Cajón "Ver detalles": el registro en la red, el estafador, los plazos, por qué simulado y lo construido. Siempre en el DOM, para los tests. */}
      <div
        aria-hidden={!cajon}
        className={`fixed inset-0 z-40 bg-monte/40 transition-opacity duration-300 ${cajon ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={() => setCajon(false)}
      />
      <aside
        data-testid="cajon-red"
        data-abierto={cajon ? "si" : "no"}
        aria-label="Ver detalles"
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-sal text-monte shadow-alzada transition-transform duration-300 ${cajon ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <div>
            <p className="text-base font-semibold">Ver detalles</p>
            <p className="text-sm text-tinta-600" data-testid="dentro-de-whatsapp">
              Trato funciona dentro de WhatsApp: no hay que bajar ninguna app.
            </p>
          </div>
          <button type="button" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-tinta-600 hover:bg-tinta-100" onClick={() => setCajon(false)} aria-label="Cerrar" data-testid="cerrar-cajon">
            <IconoCerrar className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-8 overflow-y-auto px-5 pb-10">
          <RegistroEnVivo registro={registro} filas={filas} desvios={desvios} />
          <Desvio status={status} desviando={desviando} error={desvioError} ultimo={ultimo} onDesviar={desviar} soloResultado />
          <details data-testid="plazos" className="group text-sm text-tinta-600">
            <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-tinta-700 [&::-webkit-details-marker]:hidden">
              <IconoReloj className="h-4 w-4 shrink-0 text-tinta-500" />
              Plazos de esta demo
              <IconoChevronAbajo className="ml-auto h-4 w-4 shrink-0 text-tinta-500 transition-transform duration-150 group-open:rotate-180" />
            </summary>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 leading-relaxed">
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
  );
}
