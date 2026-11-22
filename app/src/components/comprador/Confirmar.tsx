"use client";

import { useState } from "react";
import { fmtLeft } from "@/components/Guardian";
import { IconoReloj } from "@/components/iconos";
import { Spinner } from "@/components/ui";
import type { OrderView } from "@/lib/types";
import { BarraAvance } from "./Espera";

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
  // La espera corre desde el envío: con eso la barra muestra cuánto falta de verdad.
  const total = o.confirm_after && o.shipped_at ? o.confirm_after - o.shipped_at : null;
  const restante = o.confirm_after ? Math.max(0, o.confirm_after - now) : 0;
  const pct = total && total > 0 ? ((total - restante) / total) * 100 : 0;
  return (
    <section className="space-y-3" data-testid="confirmar">
      {!canConfirm && o.confirm_after && (
        <div data-testid="espera-confirmar" className="space-y-2">
          <p className="flex items-center gap-2 text-base text-tinta-700">
            <IconoReloj className="h-5 w-5 flex-none text-musgo" />
            <span>
              Se habilita en <strong className="num">{fmtLeft(o.confirm_after - now)}</strong>
            </span>
          </p>
          {total ? <BarraAvance pct={pct} className="mt-2" /> : null}
          <p className="text-sm text-tinta-600">{v.confirmDelay} después del envío, para que alcances a recibir y revisar el producto.</p>
        </div>
      )}
      <button
        className={canConfirm ? "btn-primary w-full py-4 text-lg" : "btn w-full bg-tinta-200 py-4 text-lg text-tinta-700"}
        style={canConfirm ? undefined : { opacity: 1 }}
        disabled={!canConfirm || busy}
        onClick={onPagar}
      >
        {busy ? <Spinner /> : null} Pagar al vendedor (irreversible)
      </button>
      <p className="text-center text-sm font-medium text-tinta-600">Después ya no puedes reclamar.</p>
      <button className="btn-ghost w-full text-error-700 hover:bg-error-50" disabled={busy} onClick={onProblema}>
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
      <section className="space-y-3 rounded-card bg-white p-5 shadow-alzada ring-1 ring-aviso-200 animate-aparecer" data-testid="confirmar-presion">
        <h2 className="text-lg leading-snug">¿La tienda te pide que le pagues antes de tener el producto?</h2>
        <p className="text-base text-tinta-700">
          Vamos a abrir un reclamo por presión para confirmar: la plata queda congelada y un revisor ve el caso. La tienda no cobra mientras tanto.
        </p>
        <button className="btn-oscuro w-full" disabled={busy} onClick={onPresion}>
          {busy ? <Spinner /> : null} Sí, abrir un reclamo
        </button>
        <button className="btn-secondary w-full" disabled={busy} onClick={() => setPresion(false)}>
          No, volver
        </button>
      </section>
    );
  return (
    <section className="space-y-3 rounded-card bg-white p-5 shadow-alzada animate-aparecer" data-testid="pregunta-confirmar">
      <h2 className="text-lg leading-snug">¿Tienes el producto en tus manos y lo revisaste?</h2>
      <button className="btn-primary w-full" disabled={busy} onClick={onSi}>
        {busy ? <Spinner /> : null} Sí, lo tengo y está bien
      </button>
      <button className="btn-secondary w-full" disabled={busy} onClick={onTodaviaNo}>
        Todavía no
      </button>
      <button className="btn-ghost w-full text-error-700 hover:bg-error-50" disabled={busy} onClick={() => setPresion(true)}>
        El vendedor me pide que confirme
      </button>
    </section>
  );
}
