"use client";

import { IconoBillete } from "@/components/iconos";

/**
 * "Pasar a mi banco", simulado (mejora 6 del informe de Bolivia): explica cómo cobraría el vendedor en producción.
 * No pide número de cuenta ni ningún dato bancario: en testnet no se mueve dinero real.
 */
export function PasarAMiBanco({ saldo, onCerrar }: { saldo: string; onCerrar: () => void }) {
  const pasos = ["Pides pasar tu saldo cobrado a tu banco.", "Una entidad autorizada te deposita en bolivianos en tu cuenta.", "Ves el depósito en la app de tu banco, como cualquier transferencia."];
  return (
    <section className="card space-y-3 ring-2 ring-exito-200 animate-aparecer sm:p-6" data-testid="pasar-a-mi-banco" aria-labelledby="banco-titulo">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="banco-titulo" className="flex items-center gap-2 text-xl">
          <IconoBillete className="h-6 w-6 flex-none text-musgo" />
          Pasar a mi banco
        </h2>
        <span className="chip-aviso" data-testid="banco-simulado">
          Simulado
        </span>
      </div>
      <p className="text-sm text-tinta-700">
        Tu saldo cobrado es <strong className="num">{saldo}</strong>. Así lo pasarías a tu banco cuando Trato funcione con dinero real:
      </p>
      <ol className="space-y-2 text-sm text-tinta-700">
        {pasos.map((p, i) => (
          <li key={p} className="flex gap-2.5">
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-yungas text-xs font-semibold text-monte num">{i + 1}</span>
            <span>{p}</span>
          </li>
        ))}
      </ol>
      <p className="caja-aviso text-xs">
        Modo práctica: no se mueve dinero real y aquí no te pedimos número de cuenta ni ningún dato bancario. Si alguien te pide datos de tu banco o códigos
        para «liberar» un pago de Trato, es estafa.
      </p>
      <button type="button" className="btn-secondary w-full" onClick={onCerrar}>
        Entendido
      </button>
    </section>
  );
}
