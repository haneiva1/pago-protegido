"use client";

import { useEffect, useState } from "react";
import { IconoAlerta, IconoBalanza, IconoCheckCirculo, IconoInfo, IconoVolver } from "@/components/iconos";
import { fmtBsUnits } from "@/lib/format";
import type { OrderView } from "@/lib/types";
import { waLink } from "@/lib/whatsapp";

/** WhatsApp oficial de soporte. Si no está configurado, no se muestra nada (no se inventan números). */
export const SOPORTE_WA = (process.env.NEXT_PUBLIC_SOPORTE_WHATSAPP ?? "").replace(/\D/g, "");

/** Candado: abierto mientras esperas el pago; se cierra (animado) cuando la plata queda guardada. */
export function Candado({ cerrado, className = "h-6 w-6" }: { cerrado: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path
        d="M8 11V7a4 4 0 0 1 8 0v4"
        style={{ transform: cerrado ? "translateY(0)" : "translateY(-3.5px)", transition: "transform 700ms cubic-bezier(.2,.8,.2,1.2)" }}
      />
      <rect x="4.5" y="11" width="15" height="10" rx="2.5" fill="currentColor" fillOpacity="0.15" />
      <circle cx="12" cy="16" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Se monta abierto y se cierra solo: la animación de "tu plata quedó guardada". */
export function CandadoQueSeCierra({ className }: { className?: string }) {
  const [cerrado, setCerrado] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setCerrado(true), 150);
    return () => clearTimeout(t);
  }, []);
  return <Candado cerrado={cerrado} className={className} />;
}

type Tono = "acento" | "oscuro" | "aviso" | "suave";

const TONO: Record<Tono, { caja: string; eyebrow: string; detalle: string }> = {
  acento: { caja: "panel-acento", eyebrow: "text-monte/70", detalle: "text-monte/80" },
  oscuro: { caja: "panel-oscuro", eyebrow: "text-yungas", detalle: "text-sal/80" },
  aviso: { caja: "rounded-panel border border-aviso-200 bg-aviso-50 text-aviso-700", eyebrow: "text-aviso-600", detalle: "text-aviso-700" },
  suave: { caja: "rounded-panel border border-exito-200 bg-exito-50 text-monte", eyebrow: "text-musgo", detalle: "text-tinta-700" },
};

/** Cabecera del pedido después del pago: el estado, en una sola frase, con el monto. Un solo acento por pantalla. */
export function EstadoPedido({ v }: { v: OrderView }) {
  const o = v.order;
  const map: Record<string, { t: string; d: string; tono: Tono }> = {
    pagado: { t: "Tu pago está guardado", d: "El vendedor ve que pagaste, pero no puede cobrar hasta que confirmes.", tono: "acento" },
    enviado: { t: "Tu pedido está en camino", d: "Tu pago sigue guardado. Cuando te llegue, revísalo y recién ahí paga al vendedor.", tono: "acento" },
    liberado: { t: "Se pagó al vendedor", d: "Confirmaste que lo recibiste bien. Gracias por comprar con Trato.", tono: "oscuro" },
    en_disputa: { t: "Reclamo abierto", d: "La plata quedó congelada en el contrato. Un revisor va a ver el caso.", tono: "aviso" },
    resuelto: { t: "Reclamo resuelto", d: "El revisor repartió la plata entre comprador y vendedor.", tono: "oscuro" },
    devuelto: { t: "Te devolvimos tu pago", d: "El vendedor no despachó a tiempo, así que el contrato te devolvió la plata.", tono: "suave" },
  };
  const m = map[o.status] ?? { t: "", d: "", tono: "suave" as Tono };
  const s = TONO[m.tono];
  const guardado = o.status === "pagado" || o.status === "enviado" || o.status === "en_disputa";
  const icono =
    o.status === "liberado" ? (
      <IconoCheckCirculo className="h-8 w-8 flex-none text-yungas" />
    ) : o.status === "resuelto" ? (
      <IconoBalanza className="h-8 w-8 flex-none text-yungas" />
    ) : o.status === "devuelto" ? (
      <IconoVolver className="h-8 w-8 flex-none text-musgo" />
    ) : guardado ? (
      <CandadoQueSeCierra className="h-8 w-8 flex-none" />
    ) : null;
  return (
    <section className={`${s.caja} animate-aparecer !p-5 sm:!p-6`} data-testid="estado-pedido" data-oscuro={m.tono === "oscuro" ? "" : undefined}>
      <p className={`text-xs font-semibold uppercase tracking-[0.08em] ${s.eyebrow}`}>
        {o.code} · {o.product}
      </p>
      <div className="mt-3 space-y-3">
        {icono}
        <h1 className="text-3xl leading-tight">{m.t}</h1>
      </div>
      <p className={`mt-3 max-w-[32ch] text-base ${s.detalle}`}>{m.d}</p>
      <p className="mt-5 font-display text-5xl leading-none tracking-tight num">{fmtBsUnits(o.amount_units, o.fx)}</p>
    </section>
  );
}

export function Antifraude({ code, host }: { code: string | null; host: string }) {
  return (
    <section className="flex gap-3 border-t border-tinta-200 pt-5 text-sm text-tinta-600" data-testid="antifraude">
      <IconoInfo className="mt-0.5 h-5 w-5 flex-none text-musgo" />
      <div className="space-y-1">
        <p className="text-base font-semibold text-monte">Señales de confianza</p>
        <p>Si un QR de Trato está a nombre de una persona, es estafa.</p>
        <p>
          Comprueba este link en{" "}
          <a className="enlace" href={`/verificar?codigo=${code ?? ""}`}>
            Verificar un link
          </a>{" "}
          con el código <strong>{code}</strong>.
        </p>
        {SOPORTE_WA && (
          <p>
            ¿Dudas?{" "}
            <a className="enlace" href={waLink("Hola, ¿este link de pago de Trato es auténtico?", SOPORTE_WA)} target="_blank" rel="noreferrer">
              Reenvía este link a nuestro WhatsApp
            </a>{" "}
            y te decimos si es auténtico.
          </p>
        )}
      </div>
    </section>
  );
}

/** Esqueleto de carga con la forma del primer pantallazo (producto, total, dos salidas y botón). */
export function Esqueleto() {
  const b = "animate-pulse rounded-chip bg-tinta-200/70";
  return (
    <div className="mx-auto max-w-md space-y-6" data-testid="cargando" aria-busy="true" aria-label="Cargando el link de pago">
      <section className="space-y-3">
        <div className={`h-3 w-40 ${b}`} />
        <div className={`h-6 w-3/4 ${b}`} />
        <div className={`h-9 w-1/2 ${b}`} />
        <div className="flex items-center gap-2 pt-1">
          <div className={`h-8 w-8 rounded-full ${b}`} />
          <div className="flex-1 space-y-1.5">
            <div className={`h-3 w-1/2 ${b}`} />
            <div className={`h-3 w-2/3 ${b}`} />
          </div>
        </div>
      </section>
      <section className="rounded-panel bg-monte/90 p-5 space-y-3">
        <div className="h-5 w-2/3 animate-pulse rounded-chip bg-white/15" />
        <div className="h-12 w-full animate-pulse rounded-control bg-white/10" />
        <div className="h-12 w-full animate-pulse rounded-control bg-white/10" />
      </section>
      <div className={`h-14 w-full rounded-control ${b}`} />
      <p className="text-center text-xs text-tinta-500">Cargando tu link de pago…</p>
    </div>
  );
}

/** 404: el link no existe. Puede ser un link falso: no pagues y verifica el código. */
export function LinkNoEncontrado() {
  return (
    <section className="mx-auto max-w-md space-y-3 pt-6 text-center" data-testid="link-no-encontrado">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-aviso-50 text-aviso-600">
        <IconoAlerta className="h-6 w-6" />
      </span>
      <h1 className="text-2xl">Este link de pago no existe</h1>
      <p className="text-base font-medium text-tinta-800">Puede ser un link falso. No pagues nada ni mandes tus datos hasta verificarlo.</p>
      <p className="text-sm text-tinta-600">Pídele a la tienda el código del pedido (empieza con PP-) y revísalo en «Verificar un link».</p>
      <a className="btn-primary w-full" href="/verificar">
        Verificar un link
      </a>
    </section>
  );
}
