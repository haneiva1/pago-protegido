"use client";

import { useEffect, useState } from "react";
import { IconoAlerta, IconoBalanza, IconoCamion, IconoExterno, IconoReiniciar, IconoTienda, IconoUsuario } from "@/components/iconos";
import { explorer } from "@/lib/format";
import { Contrato, Escena, Flecha, Moneda, Nodo, P, SALIDA_COMPRADOR, SALIDA_TIENDA, Viajero } from "./Escena";
import s from "./casos.module.css";

/** Transacciones reales en la red de prueba, del README ("Evidencia on-chain"). */
const TX = {
  reparto: "68ba9ed24755a4c401a28bfa122b5a48fee7929a1d9ae9256bb7f4e1b2ff889d",
  devolucion: "fdff2f9bb7ce10a0cf02f2d2dbbf299c38681bdea4db872bc98caec2713de0ee",
  liberacionPorPlazo: "4a6feb28078c8404d88947730aadea7c32c42d2a400ee1fb21e2cd937633644a",
};

/** Donde se apoya la plata al llegar: arriba a la derecha del círculo, sin taparlo. */
const junto = (p: { x: number; y: number }) => ({ x: p.x + 9, y: p.y - 12 });

/** Avanza los pasos de una animación (ms desde el inicio de cada uno). Con prefers-reduced-motion, salta al último. */
function usePasos(tiempos: number[], vuelta: number) {
  const [paso, setPaso] = useState(0);
  useEffect(() => {
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (quieto) {
      setPaso(tiempos.length - 1);
      return;
    }
    setPaso(0);
    const ids = tiempos.map((t, i) => window.setTimeout(() => setPaso(i), t));
    return () => ids.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vuelta]);
  return paso;
}

function Pie({ textos, paso, tx, link, onOtraVez, fin }: { textos: string[]; paso: number; tx: string; link: string; onOtraVez: () => void; fin: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p key={paso} className={`${s.texto} min-h-[3rem] max-w-xl text-base leading-snug text-monte sm:min-h-0`} data-testid="caso-texto" aria-live="polite">
        {textos[paso]}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
        <a href={explorer.tx(tx)} target="_blank" rel="noreferrer" className="enlace inline-flex items-center gap-1" data-testid="caso-link">
          {link}
          <IconoExterno className="h-3.5 w-3.5" />
        </a>
        <button
          type="button"
          onClick={onOtraVez}
          className={`${s.tocable} inline-flex items-center gap-1.5 rounded-control px-2 py-1 font-medium text-tinta-700 hover:bg-tinta-100 ${fin ? "opacity-100" : "opacity-60"}`}
          data-testid="caso-otra-vez"
        >
          <IconoReiniciar className="h-4 w-4" />
          Ver de nuevo
        </button>
      </div>
    </div>
  );
}

/** Un reloj de plazo que se vacía, encima de un nodo. */
function Reloj({ vencido, visible }: { vencido: boolean; visible: boolean }) {
  return (
    <svg viewBox="0 0 36 36" className={`${s.aparece} absolute -inset-1.5 h-[calc(100%+0.75rem)] w-[calc(100%+0.75rem)] -rotate-90 ${visible ? "opacity-100" : "opacity-0"}`} aria-hidden>
      <circle cx="18" cy="18" r="16" fill="none" strokeWidth="2.5" className="stroke-tinta-200" />
      <circle cx="18" cy="18" r="16" fill="none" strokeWidth="2.5" pathLength={1} strokeLinecap="round" className={`${s.plazo} ${vencido ? s.plazoVencido : ""} stroke-error-600`} />
    </svg>
  );
}

/** Caso 2: llega mal. Reclamo con foto, la plata se congela y un revisor la reparte, siempre entre los dos. */
export function LlegaMal() {
  const [vuelta, setVuelta] = useState(0);
  const tiempos = [0, 1400, 3200, 5200, 7200];
  const paso = usePasos(tiempos, vuelta);
  const textos = [
    "El pedido llega mal.",
    "El comprador toca «Tengo un problema» y adjunta una foto.",
    "La plata queda congelada: nadie la puede mover.",
    "Un revisor decide: devolverla, pagarla o repartirla.",
    "Siempre entre los dos. Nunca a un tercero.",
  ];
  return (
    <div className="space-y-5" data-testid="caso-llega-mal">
      <Escena
        flechas={
          <>
            <Flecha d={SALIDA_TIENDA} tono="verde" visible={paso >= 3} />
            <Flecha d={SALIDA_COMPRADOR} tono="verde" visible={paso >= 3} />
          </>
        }
      >
        <Nodo
          en={P.comprador}
          icono={<IconoUsuario className="h-5 w-5" />}
          nombre="Comprador"
          tono={paso >= 4 ? "exito" : "neutro"}
          extra={
            <span className={`${s.aparece} absolute -left-1 -top-3 flex items-center gap-1 whitespace-nowrap rounded-chip bg-error-50 px-1.5 py-0.5 text-[10px] font-semibold text-error-700 ring-1 ring-error-200 sm:text-xs ${paso >= 1 ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"}`}>
              <IconoAlerta className="h-3 w-3" />
              Foto
            </span>
          }
        />
        <Contrato congelado={paso >= 2 && paso < 4} lleno={paso < 4} />
        <Nodo en={P.tienda} icono={<IconoTienda className="h-5 w-5" />} nombre="Tienda" tono={paso >= 4 ? "exito" : "neutro"} />
        <Nodo en={P.abajo} icono={<IconoBalanza className="h-5 w-5" />} nombre="Un revisor decide" visible={paso >= 3} />
        <Viajero desde={P.contrato} hasta={junto(P.comprador)} llegado={paso >= 4} visible={paso >= 4}>
          <Moneda />
        </Viajero>
        <Viajero desde={P.contrato} hasta={junto(P.tienda)} llegado={paso >= 4} visible={paso >= 4}>
          <Moneda />
        </Viajero>
      </Escena>
      <Pie textos={textos} paso={paso} tx={TX.reparto} link="Ver un reparto real en la red" onOtraVez={() => setVuelta((v) => v + 1)} fin={paso === tiempos.length - 1} />
    </div>
  );
}

/** Caso 3: la tienda no envía a tiempo. El plazo vence y la plata vuelve sola al comprador. */
export function NoEnvia() {
  const [vuelta, setVuelta] = useState(0);
  const tiempos = [0, 400, 3200, 4400];
  const paso = usePasos(tiempos, vuelta);
  const textos = ["La plata espera en el contrato.", "La tienda tiene un plazo para enviar.", "El plazo vence y la tienda no envió.", "La plata vuelve sola al comprador."];
  return (
    <div className="space-y-5" data-testid="caso-no-envia">
      <Escena flechas={<Flecha d={SALIDA_COMPRADOR} tono="verde" visible={paso >= 3} />}>
        <Nodo en={P.comprador} icono={<IconoUsuario className="h-5 w-5" />} nombre="Comprador" tono={paso >= 3 ? "exito" : "neutro"} />
        <Contrato lleno={paso < 3} />
        <Nodo
          en={P.tienda}
          icono={<IconoTienda className="h-5 w-5" />}
          nombre={paso >= 2 ? "Plazo vencido" : "Tienda"}
          tono={paso >= 2 ? "apagado" : "neutro"}
          extra={<Reloj vencido={paso >= 1} visible={paso >= 1 && paso < 3} />}
        />
        <Viajero desde={P.contrato} hasta={junto(P.comprador)} llegado={paso >= 3} visible={paso >= 3}>
          <Moneda />
        </Viajero>
      </Escena>
      <Pie textos={textos} paso={paso} tx={TX.devolucion} link="Ver una devolución real en la red" onOtraVez={() => setVuelta((v) => v + 1)} fin={paso === tiempos.length - 1} />
    </div>
  );
}

/** Caso 4: el comprador no confirma. El plazo vence y se le paga sola a la tienda. */
export function NoConfirma() {
  const [vuelta, setVuelta] = useState(0);
  const tiempos = [0, 1400, 4200, 5400];
  const paso = usePasos(tiempos, vuelta);
  const textos = ["La tienda envía el pedido.", "El comprador lo recibe, pero no confirma.", "El plazo para confirmar vence.", "Se le paga sola a la tienda."];
  return (
    <div className="space-y-5" data-testid="caso-no-confirma">
      <Escena flechas={<Flecha d={SALIDA_TIENDA} tono="verde" visible={paso >= 3} />}>
        <Nodo
          en={P.comprador}
          icono={<IconoUsuario className="h-5 w-5" />}
          nombre={paso >= 2 ? "Plazo vencido" : "Comprador"}
          tono={paso >= 2 ? "apagado" : "neutro"}
          extra={<Reloj vencido={paso >= 1} visible={paso >= 1 && paso < 3} />}
        />
        <Contrato lleno={paso < 3} />
        <Nodo en={P.tienda} icono={<IconoTienda className="h-5 w-5" />} nombre="Tienda" tono={paso >= 3 ? "exito" : "neutro"} />
        <Viajero desde={{ x: P.tienda.x, y: 62 }} hasta={{ x: P.comprador.x, y: 62 }} llegado={paso >= 1} visible={paso < 2}>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-monte ring-1 ring-tinta-200">
            <IconoCamion className="h-4 w-4" />
          </span>
        </Viajero>
        <Viajero desde={P.contrato} hasta={junto(P.tienda)} llegado={paso >= 3} visible={paso >= 3}>
          <Moneda />
        </Viajero>
      </Escena>
      <Pie textos={textos} paso={paso} tx={TX.liberacionPorPlazo} link="Ver un pago por plazo real en la red" onOtraVez={() => setVuelta((v) => v + 1)} fin={paso === tiempos.length - 1} />
    </div>
  );
}
