"use client";

import { useState } from "react";
import { fmtLeft } from "@/components/Guardian";
import { Spinner } from "@/components/ui";
import type { OrderView } from "@/lib/types";

/** "Pagar al vendedor (irreversible)": se habilita después de la espera y siempre pregunta antes. */
export function ConfirmarPago({
  v,
  now,
  busy,
  onPagar,
  onProblema,
}: {
  v: OrderView;
  now: number;
  busy: boolean;
  onPagar: () => void;
  onProblema: () => void;
}) {
  const o = v.order;
  const canConfirm = o.status === "enviado" && o.confirm_after != null && now >= o.confirm_after;
  return (
    <section className="card space-y-2" data-testid="confirmar">
      <button className="btn-primary w-full py-4 text-lg" disabled={!canConfirm || busy} onClick={onPagar}>
        {busy ? <Spinner /> : null} Pagar al vendedor (irreversible)
      </button>
      <p className="text-center text-xs font-medium text-slate-600">Después ya no puedes reclamar.</p>
      {!canConfirm && o.confirm_after && (
        <p data-testid="espera-confirmar" className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
          Se habilita en <strong className="tabular-nums">{fmtLeft(o.confirm_after - now)}</strong>: {v.confirmDelay} después del envío, para que alcances a
          recibir y revisar el producto.
        </p>
      )}
      <button className="btn-danger w-full" disabled={busy} onClick={onProblema}>
        Tengo un problema
      </button>
    </section>
  );
}

/** La pregunta obligatoria antes de pagar al vendedor, con la salida anti-presión. */
export function PreguntaConfirmar({
  busy,
  onSi,
  onTodaviaNo,
  onPresion,
}: {
  busy: boolean;
  onSi: () => void;
  onTodaviaNo: () => void;
  onPresion: () => void;
}) {
  const [presion, setPresion] = useState(false);
  if (presion)
    return (
      <section className="card space-y-3 ring-2 ring-amber-300" data-testid="confirmar-presion">
        <h2 className="text-lg font-bold">¿La tienda te pide que le pagues antes de tener el producto?</h2>
        <p className="text-sm text-slate-700">
          Vamos a abrir un reclamo por presión para confirmar: la plata queda congelada y un revisor ve el caso. La tienda no cobra mientras tanto.
        </p>
        <button className="btn w-full bg-amber-500 text-white hover:bg-amber-600" disabled={busy} onClick={onPresion}>
          {busy ? <Spinner /> : null} Sí, abrir un reclamo
        </button>
        <button className="btn-secondary w-full" disabled={busy} onClick={() => setPresion(false)}>
          No, volver
        </button>
      </section>
    );
  return (
    <section className="card space-y-3 ring-2 ring-brand-200" data-testid="pregunta-confirmar">
      <h2 className="text-lg font-bold">¿Tienes el producto en tus manos y lo revisaste?</h2>
      <button className="btn-primary w-full" disabled={busy} onClick={onSi}>
        {busy ? <Spinner /> : null} Sí, lo tengo y está bien
      </button>
      <button className="btn-secondary w-full" disabled={busy} onClick={onTodaviaNo}>
        Todavía no
      </button>
      <button className="btn-danger w-full" disabled={busy} onClick={() => setPresion(true)}>
        El vendedor me pide que confirme
      </button>
    </section>
  );
}
