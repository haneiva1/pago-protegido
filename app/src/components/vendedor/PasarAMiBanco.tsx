"use client";

/**
 * "Pasar a mi banco", simulado (mejora 6 del informe de Bolivia): explica cómo cobraría el vendedor en producción.
 * No pide número de cuenta ni ningún dato bancario: en testnet no se mueve dinero real.
 */
export function PasarAMiBanco({ saldo, onCerrar }: { saldo: string; onCerrar: () => void }) {
  return (
    <section className="card space-y-3 ring-2 ring-brand-200" data-testid="pasar-a-mi-banco" aria-labelledby="banco-titulo">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="banco-titulo" className="text-lg font-bold">
          🏦 Pasar a mi banco
        </h2>
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900" data-testid="banco-simulado">
          Simulado en testnet
        </span>
      </div>
      <p className="text-sm text-slate-700">
        Tu saldo cobrado es <strong>{saldo}</strong>. Así lo pasarías a tu banco cuando Trato funcione con dinero real:
      </p>
      <ol className="space-y-2 text-sm text-slate-700">
        <li className="flex gap-2">
          <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-monte">1</span>
          <span>Pides pasar tu saldo cobrado a tu banco.</span>
        </li>
        <li className="flex gap-2">
          <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-monte">2</span>
          <span>
            Una <strong>entidad autorizada</strong> te deposita en <strong>bolivianos</strong> en tu cuenta.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-monte">3</span>
          <span>Ves el depósito en la app de tu banco, como cualquier transferencia.</span>
        </li>
      </ol>
      <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
        Modo práctica: no se mueve dinero real y aquí no te pedimos número de cuenta ni ningún dato bancario. Si alguien te pide datos de tu banco o
        códigos para «liberar» un pago de Trato, es estafa.
      </p>
      <button type="button" className="btn-secondary w-full" onClick={onCerrar}>
        Entendido
      </button>
    </section>
  );
}
