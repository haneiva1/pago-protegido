"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorBox, Spinner, useProgress } from "@/components/ui";
import { api } from "@/lib/api";
import { apiFirmada } from "@/lib/api-firmada";
import { DEMO, mensajesVendedor, type PedidoChat } from "@/lib/chat";
import { CIUDADES } from "@/lib/format";
import type { PreparedTx } from "@/lib/wallet/types";

/** Datos del envío de la demo (los mismos del e2e): la tienda no escribe nada. */
const ENVIO = { company: "Trans Copacabana (encomiendas)", tracking: "SRV-2026-118734", weight: "1,2", city: "La Paz" };
import { Chat, TocaAqui } from "./Chat";
import { canal, conReintentos, sesion, useAhora, useMarco, usePedidoChat } from "./pedido";

interface Registro {
  tienda: { nombre: string; pubkey: string } | null;
  pedido: { slug: string } | null;
}

/**
 * El chat de la tienda con Trato: "Hola" → "Crear mi cuenta" (hoja con nombre y ciudad) → "Vender…" → link en tarjeta →
 * "Mandar al cliente" → aviso del pago → "Ya lo envié" (el formulario real de envío en una hoja) → aviso del cobro.
 * Las acciones son las mismas de /vender y /panel: cuenta local del rol vendedor, /api/sellers, /api/links, mark_shipped.
 */
export function ChatVendedor() {
  useMarco();
  const ahora = useAhora();
  const [t0] = useState(() => Date.now());
  const [alta, setAlta] = useState<{ hola?: boolean; creando?: boolean }>({});
  const [tienda, setTienda] = useState<string | null>(null);
  const [pk, setPk] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [creandoLink, setCreandoLink] = useState(false);
  const [reenviado, setReenviado] = useState(false);
  const [hoja, setHoja] = useState<null | "cuenta">(null);
  const [nombre, setNombre] = useState(DEMO.tienda);
  const [ciudad, setCiudad] = useState(DEMO.ciudad);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [estafaHecha, setEstafaHecha] = useState(false);
  const [estafaEnCurso, setEstafaEnCurso] = useState(false);
  const [lento, setLento] = useState(false);
  const [fallo, setFallo] = useState<"cuenta" | "link" | "envio" | null>(null);
  const [enviando, setEnviando] = useState(false);
  const progreso = useProgress();
  const wallet = useRef<typeof import("@/lib/wallet") | null>(null);
  const { pedido, recargar } = usePedidoChat(slug);
  /** Le cuenta a /probar en qué sub-estado está el chat (para la línea de ayuda de arriba). */
  const sub = (valor: string | null) => canal()?.postMessage({ tipo: "sub", valor });

  // El estafador ya fue bloqueado (lo avisa /probar por el canal o quedó guardado): recién ahí aparece "Ya lo envié".
  useEffect(() => {
    if (slug && sesion.get(`pp.chat.estafa.${slug}`) === "1") setEstafaHecha(true);
    const c = canal();
    if (!c) return;
    c.onmessage = (ev: MessageEvent) => {
      if (ev.data?.tipo === "estafa-en-curso") setEstafaEnCurso(true);
      if (ev.data?.tipo === "estafa-vista") {
        setEstafaHecha(true);
        setEstafaEnCurso(false);
      }
    };
    return () => c.close();
  }, [slug]);

  const cargarWallet = useCallback(async () => (wallet.current ??= await import("@/lib/wallet")), []);

  // La tienda y su último pedido, por el registro de /probar (cada 3 s).
  const cargar = useCallback(async () => {
    const w = await cargarWallet();
    const p = w.getWallet("vendedor").publicKey();
    if (!p) return;
    setPk(p);
    try {
      const r = await api<Registro>(`/api/probar/registro?vendedor=${p}`);
      if (r.tienda) setTienda(r.tienda.nombre);
      if (r.pedido?.slug) setSlug(r.pedido.slug);
    } catch {}
  }, [cargarWallet]);

  useEffect(() => {
    void cargar();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void cargar();
    }, 3000);
    return () => clearInterval(t);
  }, [cargar]);

  // "Mandar al cliente" queda guardado por pedido y avisa al celular del comprador.
  useEffect(() => {
    if (!slug) return;
    const ya = sesion.get(`pp.chat.reenviado.${slug}`) === "1" || (pedido ? pedido.status !== "esperando_pago" : false);
    if (ya) setReenviado(true);
  }, [slug, pedido?.status]);

  function crearCuenta(e: React.FormEvent) {
    e.preventDefault();
    if (nombre.trim().length < 2 || !ciudad) return setError("Escribe el nombre de tu tienda y elige tu ciudad");
    setHoja(null);
    void crearCuentaReal();
  }

  /** Crea y activa la cuenta y guarda la tienda, reintentando si la red de prueba falla; nunca muestra el error crudo. */
  async function crearCuentaReal() {
    setAlta({ hola: true, creando: true });
    setFallo(null);
    setLento(false);
    sub("creando");
    setOcupado(true);
    setError(null);
    progreso.reset();
    try {
      const w = await cargarWallet();
      const wal = w.getWallet("vendedor");
      const pubkey = await wal.connect();
      await conReintentos(() => w.activateWallet(wal, progreso.push), () => setLento(true));
      progreso.push("Guardando tu tienda");
      await conReintentos(() => apiFirmada(wal, "/api/sellers", { pubkey, storeName: nombre.trim(), whatsapp: DEMO.whatsapp, city: ciudad, pilotId: null }), () => setLento(true));
      progreso.finish("Guardando tu tienda");
      setPk(pubkey);
      setTienda(nombre.trim());
      sub(null);
    } catch {
      setFallo("cuenta");
      setAlta({ hola: true, creando: false });
      sub("hola");
    } finally {
      setLento(false);
      setOcupado(false);
    }
  }

  async function crearLink() {
    if (!pk) return;
    setOcupado(true);
    setCreandoLink(true);
    setFallo(null);
    setLento(false);
    sub("creando-link");
    setError(null);
    try {
      const w = await cargarWallet();
      const o = await conReintentos(() => apiFirmada<{ slug: string }>(w.getWallet("vendedor"), "/api/links", {
        sellerPubkey: pk,
        product: DEMO.producto,
        priceBs: DEMO.precioBs,
        deliveryDays: DEMO.dias,
        category: DEMO.categoria,
        feePayer: "comprador",
      }), () => setLento(true));
      setSlug(o.slug);
    } catch {
      setFallo("link");
    } finally {
      setLento(false);
      sub(null);
      setCreandoLink(false);
      setOcupado(false);
    }
  }

  function mandar() {
    if (!slug) return;
    sesion.set(`pp.chat.reenviado.${slug}`, "1");
    setReenviado(true);
    canal()?.postMessage({ tipo: "link-reenviado", slug });
  }

  /** "Ya lo envié": registra el envío real con los datos de la demo, sin abrir ningún formulario (la misma firma que EnvioForm). */
  async function registrarEnvio() {
    if (!pk || !slug) return;
    setOcupado(true);
    setEnviando(true);
    setFallo(null);
    setLento(false);
    setError(null);
    progreso.reset();
    try {
      const w = await cargarWallet();
      const body = { action: "ship", signer: pk, company: ENVIO.company, tracking: ENVIO.tracking, weight: ENVIO.weight, city: ENVIO.city, imei: "", photo: "" };
      await conReintentos(async () => {
        const prepared = await api<PreparedTx>(`/api/orders/${slug}/action`, body);
        await w.signAndSubmit(w.getWallet("vendedor"), prepared, progreso.push);
      }, () => setLento(true));
      await recargar();
      canal()?.postMessage({ tipo: "actualiza" });
    } catch {
      setFallo("envio");
    } finally {
      setLento(false);
      setEnviando(false);
      setOcupado(false);
    }
  }

  function onBoton(id: string) {
    setError(null);
    if (id === "hola") {
      setAlta({ hola: true });
      sub("hola");
    } else if (id === "crear-cuenta") {
      setHoja("cuenta");
      sub("hoja-cuenta");
    }
    else if (id === "vender") void crearLink();
    else if (id === "mandar") mandar();
    else if (id === "enviado" || id === "reintentar-envio") void registrarEnvio();
    else if (id === "reintentar-cuenta") void crearCuentaReal();
    else if (id === "reintentar-link") void crearLink();
    else if (id === "estafa") {
      // /probar hace la simulación real contra el contrato y la cuenta en el chat del comprador.
      setEstafaEnCurso(true);
      canal()?.postMessage({ tipo: "estafa", slug });
    }
  }

  const mensajes = mensajesVendedor({
    t0,
    ahora,
    alta,
    tienda,
    creandoLink,
    pedido: pedido && pedido.slug === slug ? (pedido as PedidoChat) : null,
    reenviado,
    enviando,
    estafaHecha,
    estafaEnCurso,
    lento,
    fallo,
    host: typeof window !== "undefined" ? window.location.host : "",
  });

  const hojaCuenta = {
    titulo: "Tu cuenta de cobro",
    onCerrar: () => {
      setHoja(null);
      sub("hola");
    },
    contenido: (
      <form onSubmit={crearCuenta} className="space-y-4" data-testid="form-cuenta">
        <div>
          <label className="label" htmlFor="chat-store">
            Nombre de la tienda
          </label>
          <input id="chat-store" className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} />
        </div>
        <div>
          <label className="label" htmlFor="chat-city">
            Tu ciudad
          </label>
          <select id="chat-city" className="input" value={ciudad} onChange={(e) => setCiudad(e.target.value)}>
            {CIUDADES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <ErrorBox error={error} />
        <TocaAqui />
        <button className="btn-primary w-full py-3.5 text-base" disabled={ocupado} data-testid="listo">
          {ocupado ? <Spinner className="h-4 w-4" /> : null} Listo
        </button>
      </form>
    ),
  };

  return (
    <>
      <Chat
        testId="chat-vendedor"
        mensajes={mensajes}
        onBoton={onBoton}
        pasos={progreso.steps}
        ocupado={ocupado}
        hoja={hoja === "cuenta" ? hojaCuenta : null}
      />
      {error && hoja !== "cuenta" && (
        <div className="absolute inset-x-3 bottom-16 z-40 animate-aparecer">
          <ErrorBox error={error} />
        </div>
      )}
    </>
  );
}
