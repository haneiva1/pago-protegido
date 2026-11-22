"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EnvioForm } from "@/components/vendedor/EnvioForm";
import { ErrorBox, useProgress } from "@/components/ui";
import { api } from "@/lib/api";
import { apiFirmada } from "@/lib/api-firmada";
import { DEMO, mensajesVendedor, type PedidoChat } from "@/lib/chat";
import type { SellerData, SellerOrder } from "@/lib/types";
import { Chat } from "./Chat";
import { canal, sesion, useAhora, useMarco, usePedidoChat } from "./pedido";

interface Registro {
  tienda: { nombre: string; pubkey: string } | null;
  pedido: { slug: string } | null;
}

/**
 * El chat de la tienda con Trato: alta por respuestas rápidas, "Vendo … a Bs 450" → link en tarjeta, reenviar al
 * cliente, aviso del pago, "Ya lo envié" (el formulario real de envío en una hoja) y el aviso del cobro.
 * Las acciones son las mismas de /vender y /panel: cuenta local del rol vendedor, /api/sellers, /api/links, mark_shipped.
 */
export function ChatVendedor() {
  useMarco();
  const ahora = useAhora();
  const [t0] = useState(() => Date.now());
  const [alta, setAlta] = useState<{ nombre?: string; ciudad?: string; whatsapp?: string; creando?: boolean }>({});
  const [tienda, setTienda] = useState<string | null>(null);
  const [pk, setPk] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [creandoLink, setCreandoLink] = useState(false);
  const [reenviado, setReenviado] = useState(false);
  const [hoja, setHoja] = useState<null | "envio">(null);
  const [orden, setOrden] = useState<SellerOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const progreso = useProgress();
  const wallet = useRef<typeof import("@/lib/wallet") | null>(null);
  const { pedido, recargar } = usePedidoChat(slug);

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

  // "Reenviar a mi cliente" queda guardado por pedido y avisa al celular del comprador.
  useEffect(() => {
    if (!slug) return;
    const ya = sesion.get(`pp.chat.reenviado.${slug}`) === "1" || (pedido ? pedido.status !== "esperando_pago" : false);
    if (ya) setReenviado(true);
  }, [slug, pedido?.status]);

  async function crearCuenta(whatsapp: string) {
    setOcupado(true);
    setError(null);
    progreso.reset();
    try {
      const w = await cargarWallet();
      const wal = w.getWallet("vendedor");
      const pubkey = await wal.connect();
      await w.activateWallet(wal, progreso.push);
      progreso.push("Guardando tu tienda");
      await apiFirmada(wal, "/api/sellers", { pubkey, storeName: DEMO.tienda, whatsapp, city: DEMO.ciudad, pilotId: null });
      progreso.finish("Guardando tu tienda");
      setPk(pubkey);
      setTienda(DEMO.tienda);
      setAlta((a) => ({ ...a, creando: false }));
    } catch (e) {
      setError((e as Error).message);
      setAlta((a) => ({ ...a, whatsapp: undefined, creando: false }));
    } finally {
      setOcupado(false);
    }
  }

  async function crearLink() {
    if (!pk) return;
    setOcupado(true);
    setCreandoLink(true);
    setError(null);
    try {
      const w = await cargarWallet();
      const o = await apiFirmada<{ slug: string }>(w.getWallet("vendedor"), "/api/links", {
        sellerPubkey: pk,
        product: DEMO.producto,
        priceBs: DEMO.precioBs,
        deliveryDays: DEMO.dias,
        category: DEMO.categoria,
        feePayer: "comprador",
      });
      setSlug(o.slug);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreandoLink(false);
      setOcupado(false);
    }
  }

  function reenviar() {
    if (!slug) return;
    sesion.set(`pp.chat.reenviado.${slug}`, "1");
    setReenviado(true);
    canal()?.postMessage({ tipo: "link-reenviado", slug });
  }

  async function abrirEnvio() {
    if (!pk || !slug) return;
    setOcupado(true);
    setError(null);
    try {
      const w = await cargarWallet();
      const d = await apiFirmada<SellerData>(w.getWallet("vendedor"), `/api/sellers/${pk}/panel`);
      const o = d.orders.find((x) => x.slug === slug) ?? null;
      if (!o) throw new Error("No encontramos el pedido en tu panel");
      setOrden(o);
      setHoja("envio");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  function onBoton(id: string) {
    setError(null);
    if (id === "nombre") setAlta((a) => ({ ...a, nombre: DEMO.tienda }));
    else if (id === "ciudad") setAlta((a) => ({ ...a, ciudad: DEMO.ciudad }));
    else if (id === "whatsapp") {
      setAlta((a) => ({ ...a, whatsapp: DEMO.whatsappBonito, creando: true }));
      void crearCuenta(DEMO.whatsapp);
    } else if (id === "vender") void crearLink();
    else if (id === "reenviar") reenviar();
    else if (id === "enviado") void abrirEnvio();
  }

  const mensajes = mensajesVendedor({
    t0,
    ahora,
    alta,
    tienda,
    creandoLink,
    pedido: pedido && pedido.slug === slug ? (pedido as PedidoChat) : null,
    reenviado,
    enviando: hoja === "envio",
    host: typeof window !== "undefined" ? window.location.host : "",
  });

  return (
    <>
      <Chat
        testId="chat-vendedor"
        mensajes={mensajes}
        onBoton={onBoton}
        pasos={progreso.steps}
        ocupado={ocupado}
        hoja={
          hoja === "envio" && orden && pk
            ? {
                titulo: undefined,
                onCerrar: () => setHoja(null),
                contenido: (
                  <EnvioForm
                    o={orden}
                    sellerPubkey={pk}
                    prefill={null}
                    onDone={() => {
                      setHoja(null);
                      void recargar();
                    }}
                  />
                ),
              }
            : null
        }
      />
      {error && (
        <div className="absolute inset-x-3 bottom-16 z-40 animate-aparecer">
          <ErrorBox error={error} />
        </div>
      )}
    </>
  );
}
