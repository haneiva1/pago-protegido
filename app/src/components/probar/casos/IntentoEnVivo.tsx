"use client";

import { useEffect, useRef, useState } from "react";
import { IconoBloqueado, IconoExterno, IconoTienda, IconoUsuario } from "@/components/iconos";
import { Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { explorer } from "@/lib/format";
import { errorDelContrato } from "@/lib/probar";
import type { Desvio } from "../tipos";
import { Contrato, Escena, Flecha, Nodo, P, SALIDA_COMPRADOR, SALIDA_TIENDA } from "./Escena";
import { buscarPedidoConPlata, prepararPedidoConPlata, type PedidoConPlata } from "./pedidoCaso";
import s from "./casos.module.css";

type Estado =
  | { fase: "buscando" }
  | { fase: "preparando" }
  | { fase: "listo" }
  | { fase: "enviando" }
  | { fase: "rechazado"; d: Desvio }
  | { fase: "error"; mensaje: string };

/** La flecha del intruso: de su cuenta, abajo, hacia el borde inferior del contrato. */
const INTENTO = "M 80 74 L 80 50";

/**
 * Caso 1, en vivo: alguien consiguió el número del pedido y le pide a la red que le pague a su cuenta. El botón manda esa
 * orden (el mismo desvío de /probar: `escrow.resolve_dispute` hacia otra cuenta) y la red la rechaza.
 */
export function IntentoEnVivo() {
  const [pedido, setPedido] = useState<PedidoConPlata | null>(null);
  const [estado, setEstado] = useState<Estado>({ fase: "buscando" });
  const vivo = useRef(true);

  useEffect(() => {
    vivo.current = true;
    (async () => {
      try {
        let p = await buscarPedidoConPlata();
        if (!p) {
          if (!vivo.current) return;
          setEstado({ fase: "preparando" });
          p = await prepararPedidoConPlata();
        }
        if (!vivo.current) return;
        setPedido(p);
        setEstado({ fase: "listo" });
      } catch {
        if (vivo.current) setEstado({ fase: "error", mensaje: "No pudimos preparar el pedido de prueba. Vuelve a abrir este caso en un momento." });
      }
    })();
    return () => {
      vivo.current = false;
    };
  }, []);

  async function intentar() {
    if (!pedido) return;
    setEstado({ fase: "enviando" });
    try {
      const d = await api<Omit<Desvio, "at">>("/api/probar/desvio", { slug: pedido.slug });
      setEstado({ fase: "rechazado", d: { ...d, at: Date.now() } });
    } catch (e) {
      setEstado({ fase: "error", mensaje: (e as Error).message });
    }
  }

  const rechazado = estado.fase === "rechazado" && estado.d.rejected;
  const porLaRed = estado.fase === "rechazado" && estado.d.by === "contrato";
  const codigo = estado.fase === "rechazado" ? errorDelContrato(estado.d.raw, estado.d.code) : null;
  const escrowId = (estado.fase === "rechazado" && estado.d.escrowId) || pedido?.escrowId || null;

  return (
    <div className="space-y-5" data-testid="caso-intento">
      <p className="text-base leading-snug text-monte">
        Alguien consiguió el número del pedido y le pide a la red: <strong>«págale toda la plata a mi cuenta»</strong>.
      </p>

      <Escena
        testId="intento-escena"
        flechas={
          <>
            <Flecha d={SALIDA_TIENDA} tono="verde" />
            <Flecha d={SALIDA_COMPRADOR} tono="verde" />
            {estado.fase === "enviando" && <Flecha d={INTENTO} tono="roja" punteada className={s.enviando} />}
            {estado.fase === "rechazado" && (
              <g key={estado.d.at} className={s.intento}>
                <Flecha d={INTENTO} tono="roja" />
              </g>
            )}
          </>
        }
      >
        <Nodo en={P.comprador} icono={<IconoUsuario className="h-5 w-5" />} nombre="De vuelta al comprador" tono="exito" />
        <Contrato key={estado.fase === "rechazado" ? estado.d.at : "c"} monto={pedido?.total?.replace(/^Bs\s*/, "")} className={estado.fase === "rechazado" ? s.golpe : ""} />
        <Nodo en={P.tienda} icono={<IconoTienda className="h-5 w-5" />} nombre="A la tienda" tono="exito" />
        <Nodo en={P.abajo} icono={<IconoBloqueado className="h-5 w-5" />} nombre="Otra cuenta" tono="error" testId="intento-intruso" />
        {estado.fase === "rechazado" && (
          <span
            key={estado.d.at}
            data-testid="intento-sello"
            className={`${s.sello} absolute whitespace-nowrap rounded-chip border-2 border-error-600 bg-white/95 px-2.5 py-1 text-sm font-semibold uppercase tracking-wide text-error-700 shadow-card sm:text-base`}
            style={{ left: "50%", top: "66%" }}
          >
            {rechazado ? (porLaRed ? "Rechazado por la red" : "Rechazado por el servidor") : "Revisar"}
          </span>
        )}
      </Escena>

      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          className={`${s.tocable} btn-danger w-full max-w-sm`}
          onClick={intentar}
          disabled={!pedido || estado.fase === "enviando" || estado.fase === "preparando" || estado.fase === "buscando"}
          data-testid="intentar-llevarsela"
        >
          {estado.fase === "enviando" || estado.fase === "preparando" || estado.fase === "buscando" ? <Spinner /> : <IconoBloqueado className="h-5 w-5" />}
          {estado.fase === "rechazado" ? "Intentar otra vez" : "Intentar llevársela"}
        </button>
        {estado.fase === "preparando" && (
          <p className={`${s.texto} text-sm text-tinta-600`} data-testid="intento-preparando">
            Preparando un pedido con plata adentro, en la red de prueba…
          </p>
        )}
        {estado.fase === "error" && <p className="caja-aviso text-sm">{estado.mensaje}</p>}
      </div>

      <p className="prosa mx-auto max-w-2xl text-center text-sm leading-relaxed text-tinta-700" data-testid="intento-explica">
        La plata está en un contrato que solo puede pagarle a la tienda o devolvérsela al comprador.
        <br className="hidden sm:inline" /> Si alguien, incluso Trato, intenta mandarla a otra cuenta, la red lo rechaza.
      </p>

      {estado.fase === "rechazado" && (
        <div key={estado.d.at} className={`${s.texto} flex flex-col items-center gap-1.5 text-center text-sm text-tinta-600`} data-testid="intento-resultado">
          {codigo && (
            <p>
              Respuesta de la red: <code className="rounded-chip bg-error-50 px-1.5 py-0.5 font-mono text-error-700" data-testid="intento-codigo">{codigo}</code>
            </p>
          )}
          <p>La orden se probó en la red y no pasó: no se movió nada y la plata sigue adentro.</p>
          {escrowId && (
            <a href={explorer.contract(escrowId)} target="_blank" rel="noreferrer" className="enlace inline-flex items-center gap-1" data-testid="intento-link-contrato">
              Ver el contrato de este pedido en la red
              <IconoExterno className="h-3.5 w-3.5" />
            </a>
          )}
          {pedido?.pagoHash && (
            <a href={explorer.tx(pedido.pagoHash)} target="_blank" rel="noreferrer" className="enlace inline-flex items-center gap-1" data-testid="intento-link-pago">
              Ver el pago que dejó la plata adentro
              <IconoExterno className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
