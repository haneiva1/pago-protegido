"use client";

import { Countdown, ShipDeadline } from "@/components/Guardian";
import { IconoChevronAbajo } from "@/components/iconos";
import { Breakdown, SplitView, Timeline, TxList } from "@/components/OrderBits";
import { StatusBadge } from "@/components/ui";
import { fmtBsUnits } from "@/lib/format";
import type { OrderView } from "@/lib/types";

/** Línea de tiempo del pedido con los plazos (despacho y revisión). */
export function LineaDeTiempo({ v, plegada = false, onReload, onExtend }: { v: OrderView; plegada?: boolean; onReload: () => void; onExtend?: () => void }) {
  const o = v.order;
  // Recién pagado, el próximo paso y el plazo ya están arriba: el detalle queda plegado.
  if (plegada)
    return (
      <details className="group border-t border-tinta-200" data-testid="seguimiento-plegado">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-2 text-lg font-semibold [&::-webkit-details-marker]:hidden">
          Seguimiento · {o.code}
          <IconoChevronAbajo className="h-5 w-5 flex-none text-tinta-500 transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <div className="space-y-4 pb-5">
          <Timeline order={o} txs={v.txs} />
          <ShipDeadline shipDeadline={o.ship_deadline} status={o.status} role="comprador" />
        </div>
      </details>
    );
  return (
    <section className="space-y-4 border-t border-tinta-200 pt-6">
      {/* Con el código de 8 caracteres, en celular la etiqueta de estado baja en vez de cortar el título. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <h2 className="min-w-0 text-lg">Seguimiento · {o.code}</h2>
        <StatusBadge status={o.status} />
      </div>
      <Timeline order={o} txs={v.txs} />
      <ShipDeadline shipDeadline={o.ship_deadline} status={o.status} role="comprador" />
      <Countdown
        slug={o.slug}
        deadline={o.deadline}
        status={o.status}
        mode={v.mode}
        onReleased={onReload}
        capabilities={v.capabilities}
        role="comprador"
        extended={o.extended}
        onExtend={onExtend}
      />
    </section>
  );
}

/** Cómo terminó: reparto del pago liberado, decisión del revisor o devolución. */
export function Cierre({ v }: { v: OrderView }) {
  const o = v.order;
  if (o.status === "liberado")
    return (
      <section className="space-y-3 border-t border-tinta-200 pt-6">
        <h2 className="text-lg">Así se repartió el pago</h2>
        <Breakdown money={v} fx={o.fx} feePayer={o.fee_payer} platformBps={v.platformFeeBps} />
      </section>
    );
  if (o.status === "resuelto")
    return (
      <section className="space-y-3 border-t border-tinta-200 pt-6">
        <h2 className="text-lg">Decisión del revisor</h2>
        <SplitView money={v} buyerBps={o.buyer_bps} fx={o.fx} />
      </section>
    );
  if (o.status === "devuelto")
    return (
      <section className="space-y-3 border-t border-tinta-200 pt-6" data-testid="devolucion">
        <h2 className="text-lg">Devolución por falta de despacho</h2>
        <p className="text-base text-tinta-600">El vendedor no registró el envío antes del plazo. El contrato devolvió el pago al comprador.</p>
        <SplitView money={v} buyerBps={o.buyer_bps} fx={o.fx} />
      </section>
    );
  return null;
}

/** Registro público del pedido: saldo guardado en el contrato y cada transacción. */
export function RegistroPedido({ v }: { v: OrderView }) {
  const o = v.order;
  return (
    <details className="group border-t border-tinta-200 pt-5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-lg font-semibold [&::-webkit-details-marker]:hidden">
        Movimientos en la red ({v.txs.length})
        <IconoChevronAbajo className="h-5 w-5 flex-none text-tinta-500 transition-transform duration-200 group-open:rotate-180" />
      </summary>
      {v.onchain && (
        <p className="mt-3 text-sm text-tinta-600" data-testid="onchain">
          Guardado en el contrato ahora: <strong className="num">{fmtBsUnits(v.onchain.balance, o.fx)}</strong>
          {v.onchain.flags.released && " · pagado al vendedor"}
          {v.onchain.flags.disputed && " · en reclamo"}
          {v.onchain.flags.resolved && " · resuelto"}
        </p>
      )}
      <TxList txs={v.txs} />
    </details>
  );
}
