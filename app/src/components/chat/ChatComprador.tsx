"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PreguntaConfirmar } from "@/components/comprador/Confirmar";
import { ErrorBox, useProgress } from "@/components/ui";
import { api } from "@/lib/api";
import { mensajesComprador, type Estafa } from "@/lib/chat";
import { errorDelContrato } from "@/lib/probar";
import type { PreparedTx } from "@/lib/wallet/types";
import { Chat } from "./Chat";
import { canal, conReintentos, sesion, useAhora, useMarco, usePedidoChat } from "./pedido";

interface Desvio {
  rejected: boolean;
  by: "contrato" | "servidor";
  detail: string;
  call?: string;
  code?: number;
  raw?: string;
  escrowId: string | null;
}

/**
 * El chat del comprador con Trato: le llega el link en una tarjeta, "Abrir y pagar" abre la página de pago real
 * dentro del mismo celular, el aviso anti-presión al pagar, el estafador bloqueado, "Sí, me llegó" (la pregunta
 * obligatoria y el pago al vendedor con su cuenta) y el cierre.
 */
export function ChatComprador({ slugInicial = null }: { slugInicial?: string | null }) {
  useMarco();
  const ahora = useAhora();
  const [slug, setSlug] = useState<string | null>(slugInicial);
  const [reenviado, setReenviado] = useState(false);
  const [overlay, setOverlay] = useState(false);
  const [hoja, setHoja] = useState<null | "pregunta">(null);
  const [confirmando, setConfirmando] = useState(false);
  const [lento, setLento] = useState(false);
  const [fallo, setFallo] = useState<"cobro" | null>(null);
  const [estafa, setEstafa] = useState<Estafa | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const progreso = useProgress();
  const { pedido, tienda, recargar } = usePedidoChat(slug);
  const wallet = useRef<typeof import("@/lib/wallet") | null>(null);
  const cargarWallet = useCallback(async () => (wallet.current ??= await import("@/lib/wallet")), []);
  const estafaEnCurso = useRef(false);

  // Sin slug en la URL: lo descubre por el registro de la tienda de este navegador (el mismo que usa /probar).
  useEffect(() => {
    if (slug) return;
    let vivo = true;
    const buscar = async () => {
      try {
        const qs = new URLSearchParams(window.location.search).get("slug");
        if (qs) return setSlug(qs);
        const w = await cargarWallet();
        const pk = w.getWallet("vendedor").publicKey();
        if (!pk) return;
        const r = await api<{ pedido: { slug: string } | null }>(`/api/probar/registro?vendedor=${pk}`);
        if (vivo && r.pedido?.slug) setSlug(r.pedido.slug);
      } catch {}
    };
    void buscar();
    const t = setInterval(buscar, 3000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [slug, cargarWallet]);

  // El link "llega" cuando la tienda lo reenvía (o si el pedido ya avanzó).
  useEffect(() => {
    if (!slug) return;
    if (sesion.get(`pp.chat.reenviado.${slug}`) === "1" || (pedido && pedido.status !== "esperando_pago")) setReenviado(true);
  }, [slug, pedido?.status]);

  const estafar = useCallback(async () => {
    if (!slug || estafaEnCurso.current) return;
    estafaEnCurso.current = true;
    const at = Date.now();
    setEstafa({ at, rechazado: false, error: null, detalle: "", enCurso: true });
    try {
      const r = await api<Desvio>("/api/probar/desvio", { slug });
      const res: Estafa = { at, rechazado: r.rejected, error: errorDelContrato(r.raw, r.code), detalle: r.detail };
      setEstafa(res);
      canal()?.postMessage({ tipo: "estafa-resultado", slug, ...r, at });
    } catch (e) {
      setEstafa(null);
      setError((e as Error).message);
    } finally {
      estafaEnCurso.current = false;
    }
  }, [slug]);

  useEffect(() => {
    const c = canal();
    if (!c) return;
    c.onmessage = (ev: MessageEvent) => {
      const d = ev.data ?? {};
      if (d.tipo === "link-reenviado" && d.slug) {
        setSlug(d.slug);
        setReenviado(true);
      }
      // Dentro de /probar la simulación la hace la página madre; suelto, la hace el propio chat.
      if (d.tipo === "estafa" && window.self === window.top) void estafar();
      // /probar hace la simulación y manda el resultado: el chat solo lo cuenta.
      if (d.tipo === "estafa-en-curso") setEstafa({ at: d.at ?? Date.now(), rechazado: false, error: null, detalle: "", enCurso: true });
      if (d.tipo === "estafa-resultado") setEstafa({ at: d.at ?? Date.now(), rechazado: Boolean(d.rejected), error: errorDelContrato(d.raw, d.code), detalle: String(d.detail ?? "") });
    };
    return () => c.close();
  }, [estafar]);

  // La página de pago se cierra sola cuando el pago quedó guardado.
  useEffect(() => {
    if (overlay && pedido && pedido.status !== "esperando_pago") {
      const t = setTimeout(() => setOverlay(false), 2500);
      return () => clearTimeout(t);
    }
  }, [overlay, pedido?.status]);

  async function confirmar() {
    if (!slug) return;
    setHoja(null);
    setConfirmando(true);
    setFallo(null);
    setLento(false);
    setOcupado(true);
    setError(null);
    progreso.reset();
    try {
      const w = await cargarWallet();
      const wal = w.getWallet("comprador");
      const signer = wal.publicKey();
      if (!signer) throw new Error("Este celular no tiene la cuenta que pagó este pedido");
      await conReintentos(async () => {
        const prepared = await api<PreparedTx>(`/api/orders/${slug}/action`, { action: "confirm", signer });
        await w.signAndSubmit(wal, prepared, progreso.push);
      }, () => setLento(true));
      await recargar();
      canal()?.postMessage({ tipo: "actualiza" });
    } catch {
      // Nunca el error crudo de la red: el bot ofrece "Reintentar".
      setFallo("cobro");
    } finally {
      setLento(false);
      setConfirmando(false);
      setOcupado(false);
    }
  }

  function onBoton(id: string) {
    setError(null);
    if (id === "pagar" || id === "problema") setOverlay(true);
    else if (id === "me-llego" || id === "reintentar-cobro") void confirmar();
  }

  const mensajes = mensajesComprador({
    ahora,
    tienda,
    pedido,
    reenviado,
    estafa,
    confirmando,
    lento,
    fallo,
    host: typeof window !== "undefined" ? window.location.host : "",
  });

  // Le cuenta a /probar si ya se puede pagar (la línea de ayuda de arriba).
  const puedePagar = pedido?.status === "enviado" && pedido.confirm_after != null && ahora >= pedido.confirm_after;
  useEffect(() => {
    if (pedido?.status === "enviado") canal()?.postMessage({ tipo: "sub", valor: puedePagar ? "puede-pagar" : "cuenta-atras" });
  }, [puedePagar, pedido?.status]);

  const vacio = !pedido || !reenviado;

  return (
    <>
      <Chat
        testId="chat-comprador"
        mensajes={mensajes}
        onBoton={onBoton}
        pasos={progreso.steps}
        ocupado={ocupado}
        hoja={
          hoja === "pregunta"
            ? {
                titulo: undefined,
                onCerrar: () => setHoja(null),
                contenido: <PreguntaConfirmar busy={ocupado} onSi={() => void confirmar()} onTodaviaNo={() => setHoja(null)} onPresion={() => setOverlay(true)} />,
              }
            : null
        }
        overlay={
          overlay && slug
            ? {
                titulo: "Pagar con Trato",
                onCerrar: () => setOverlay(false),
                contenido: <iframe name="pago" title="Página de pago" src={`/p/${slug}`} className="h-full w-full border-0" />,
              }
            : null
        }
      />
      {vacio && (
        <div className="pointer-events-none absolute inset-x-0 top-20 flex justify-center px-6" data-testid="esperando-link">
          <p className="rounded-lg bg-tinta-100 px-3 py-1.5 text-center text-xs text-tinta-600">Todavía no te llegó ningún link. Cuando la tienda te lo mande, aparece aquí.</p>
        </div>
      )}
      {error && (
        <div className="absolute inset-x-3 bottom-16 z-40 animate-aparecer">
          <ErrorBox error={error} />
        </div>
      )}
    </>
  );
}
