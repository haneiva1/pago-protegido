"use client";

import { Countdown, ShipDeadline } from "@/components/Guardian";
import { Breakdown, SplitView, Timeline, TxList } from "@/components/OrderBits";
import { StatusBadge } from "@/components/ui";
import { fmtBsUnits } from "@/lib/format";
import type { OrderView } from "@/lib/types";

/** Línea de tiempo del pedido con los plazos (despacho y revisión). */
export function LineaDeTiempo({ v, onReload, onExtend }: { v: OrderView; onReload: () => void; onExtend?: () => void }) {
  const o = v.order;
  return (
    <section className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">Seguimiento · {o.code}</h2>
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
      <section className="card space-y-3">
        <h2 className="font-bold">Así se repartió el pago</h2>
        <Breakdown money={v} fx={o.fx} feePayer={o.fee_payer} platformBps={v.platformFeeBps} />
      </section>
    );
  if (o.status === "resuelto")
    return (
      <section className="card space-y-3">
        <h2 className="font-bold">Decisión del revisor</h2>
        <SplitView money={v} buyerBps={o.buyer_bps} fx={o.fx} />
      </section>
    );
  if (o.status === "devuelto")
    return (
      <section className="card space-y-3" data-testid="devolucion">
        <h2 className="font-bold">Devolución por falta de despacho</h2>
        <p className="text-sm text-slate-600">El vendedor no registró el envío antes del plazo. El contrato devolvió el pago al comprador.</p>
        <SplitView money={v} buyerBps={o.buyer_bps} fx={o.fx} />
      </section>
    );
  return null;
}

/** Registro público del pedido: saldo guardado en el contrato y cada transacción. */
export function RegistroPedido({ v }: { v: OrderView }) {
  const o = v.order;
  return (
    <section className="card space-y-2">
      <h2 className="font-bold">Registro del pedido</h2>
      {v.onchain && (
        <p className="text-xs text-slate-600" data-testid="onchain">
          Guardado en el contrato ahora: <strong>{fmtBsUnits(v.onchain.balance, o.fx)}</strong>
          {v.onchain.flags.released && " · pagado al vendedor"}
          {v.onchain.flags.disputed && " · en reclamo"}
          {v.onchain.flags.resolved && " · resuelto"}
        </p>
      )}
      <TxList txs={v.txs} />
    </section>
  );
}
