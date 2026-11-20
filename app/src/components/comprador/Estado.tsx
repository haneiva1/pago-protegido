"use client";

import { useEffect, useState } from "react";
import { fmtBsUnits } from "@/lib/format";
import type { OrderView } from "@/lib/types";
import { waLink } from "@/lib/whatsapp";

/** WhatsApp oficial de soporte. Si no está configurado, no se muestra nada (no se inventan números). */
export const SOPORTE_WA = (process.env.NEXT_PUBLIC_SOPORTE_WHATSAPP ?? "").replace(/\D/g, "");

/** Candado: abierto mientras esperas el pago; se cierra (animado) cuando la plata queda guardada. */
export function Candado({ cerrado, className = "h-6 w-6" }: { cerrado: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

export function EstadoPedido({ v }: { v: OrderView }) {
  const o = v.order;
  const map = {
    pagado: { t: "Tu pago está guardado", d: "El vendedor ve que pagaste, pero no puede cobrar hasta que confirmes.", c: "bg-brand-600" },
    enviado: { t: "Tu pedido está en camino", d: "Tu pago sigue guardado. Cuando te llegue, revísalo y recién ahí paga al vendedor.", c: "bg-brand-600" },
    liberado: { t: "Se pagó al vendedor", d: "Confirmaste que lo recibiste bien. ¡Gracias por comprar con Trato!", c: "bg-brand-700" },
    en_disputa: { t: "Reclamo abierto", d: "La plata quedó congelada en el contrato. Un revisor va a ver el caso.", c: "bg-amber-500" },
    resuelto: { t: "Reclamo resuelto", d: "El revisor repartió la plata entre comprador y vendedor.", c: "bg-violet-600" },
    devuelto: { t: "Te devolvimos tu pago", d: "El vendedor no despachó a tiempo, así que el contrato te devolvió la plata.", c: "bg-rose-600" },
    esperando_pago: { t: "", d: "", c: "" },
  }[o.status];
  const guardado = o.status === "pagado" || o.status === "enviado" || o.status === "en_disputa";
  return (
    <section className={`rounded-2xl p-5 text-white ${map.c}`} data-testid="estado-pedido">
      <p className="text-xs uppercase tracking-wide text-white/80">
        {o.code} · {o.product}
      </p>
      <div className="mt-1 flex items-center gap-2">
        {guardado && <CandadoQueSeCierra className="h-7 w-7 flex-none" />}
        <h1 className="text-2xl font-bold">{map.t}</h1>
      </div>
      <p className="mt-1 text-sm text-white/90">{map.d}</p>
      <p className="mt-3 text-3xl font-extrabold">{fmtBsUnits(o.amount_units, o.fx)}</p>
    </section>
  );
}

export function Antifraude({ code, host }: { code: string | null; host: string }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600" data-testid="antifraude">
      <p className="font-semibold text-slate-800">🛡️ Señales de confianza</p>
      <p className="mt-1">Si un QR de Trato está a nombre de una persona, es estafa.</p>
      <p className="mt-1">
        Verifica este link en{" "}
        <a className="underline" href={`/verificar?codigo=${code ?? ""}`}>
          {host}/verificar
        </a>{" "}
        con el código <strong>{code}</strong>.
      </p>
      {SOPORTE_WA && (
        <p className="mt-1">
          ¿Dudas?{" "}
          <a className="underline" href={waLink("Hola, ¿este link de pago de Trato es auténtico?", SOPORTE_WA)} target="_blank" rel="noreferrer">
            Reenvía este link a nuestro WhatsApp
          </a>{" "}
          y te decimos si es auténtico.
        </p>
      )}
    </section>
  );
}

/** Esqueleto de carga con la forma del primer pantallazo (producto, total, dos salidas y botón). */
export function Esqueleto() {
  const b = "animate-pulse rounded-lg bg-slate-200/80";
  return (
    <div className="mx-auto max-w-md space-y-4" data-testid="cargando" aria-busy="true" aria-label="Cargando el link de pago">
      <section className="card space-y-3">
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
      <section className="card space-y-3">
        <div className={`h-5 w-2/3 ${b}`} />
        <div className={`h-12 w-full ${b}`} />
        <div className={`h-12 w-full ${b}`} />
      </section>
      <div className={`h-14 w-full rounded-xl ${b}`} />
    </div>
  );
}

/** 404: el link no existe. Puede ser un link falso: no pagues y verifica el código. */
export function LinkNoEncontrado() {
  return (
    <section className="card mx-auto max-w-md space-y-3 text-center" data-testid="link-no-encontrado">
      <p className="text-4xl" aria-hidden>
        ⚠️
      </p>
      <h1 className="text-xl font-bold">Este link de pago no existe</h1>
      <p className="text-sm font-medium text-slate-800">Puede ser un link falso. No pagues nada ni mandes tus datos hasta verificarlo.</p>
      <p className="text-sm text-slate-600">Pídele a la tienda el código del pedido (empieza con PP-) y revísalo en «Verificar un link».</p>
      <a className="btn-primary w-full" href="/verificar">
        Verificar un link
      </a>
    </section>
  );
}
