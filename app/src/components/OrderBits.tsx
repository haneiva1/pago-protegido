"use client";

import type { ComponentType, SVGProps } from "react";
import {
  IconoAlerta,
  IconoBalanza,
  IconoBillete,
  IconoCamion,
  IconoCandado,
  IconoCheckCirculo,
  IconoDocumento,
  IconoReloj,
  IconoVolver,
} from "@/components/iconos";
import { fmtBsUnits, fmtDate, fmtKg } from "@/lib/format";
import type { MoneyView, PublicOrder, ReintegroView, TxRow } from "@/lib/types";
import { TxLink } from "./ui";

/** Cómo se repartió el pago liberado, en Bs. */
export function Breakdown({ money, fx, feePayer, platformBps = 200 }: { money: MoneyView; fx: number; feePayer?: string | null; platformBps?: number }) {
  if (!money.breakdown) return null;
  const b = money.breakdown;
  const prot = BigInt(b.platform) + BigInt(b.tw);
  return (
    <dl data-testid="desglose" className="divide-y divide-tinta-200/80 text-base">
      <div className="flex justify-between gap-3 py-2.5">
        <dt className="text-tinta-600">Vendedor recibió</dt>
        <dd className="font-semibold num">{fmtBsUnits(b.seller, fx)}</dd>
      </div>
      <div className="flex justify-between gap-3 py-2.5">
        <dt className="text-tinta-600">Protección{feePayer === "comprador" ? " (la pagó el comprador)" : ` (${String(platformBps / 100).replace(".", ",")}% + 0,3%)`}</dt>
        <dd className="num">{fmtBsUnits(prot, fx)}</dd>
      </div>
      <div className="flex justify-between gap-3 py-2 text-sm">
        <dt className="text-tinta-500">Plataforma</dt>
        <dd className="text-tinta-600 num">{fmtBsUnits(b.platform, fx)}</dd>
      </div>
      <div className="flex justify-between gap-3 py-2 text-sm">
        <dt className="text-tinta-500">Red (0,3 %)</dt>
        <dd className="text-tinta-600 num">{fmtBsUnits(b.tw, fx)}</dd>
      </div>
    </dl>
  );
}

/** Montos del reparto del revisor, en Bs. */
export function SplitView({ money, buyerBps, fx }: { money: MoneyView; buyerBps: number | null; fx: number }) {
  if (!money.split || buyerBps == null) return null;
  const s = money.split;
  const b = buyerBps / 100;
  // Sin "100 %" en pantalla (lista de palabras prohibidas): en los extremos se dice con palabras.
  const pct = (x: number) => (x === 100 ? "todo" : x === 0 ? "nada" : `${String(x).replace(".", ",")}%`);
  return (
    <dl data-testid="reparto" className="grid grid-cols-2 gap-2 text-center">
      <div className="rounded-control bg-info-50 p-3 ring-1 ring-info-200">
        <dt className="text-xs text-info-700">Comprador ({pct(b)})</dt>
        <dd className="mt-1 font-display text-lg text-info-700 num">{fmtBsUnits(s.buyer, fx)}</dd>
      </div>
      <div className="rounded-control bg-info-50 p-3 ring-1 ring-info-200">
        <dt className="text-xs text-info-700">Vendedor ({pct(100 - b)})</dt>
        <dd className="mt-1 font-display text-lg text-info-700 num">{fmtBsUnits(s.seller, fx)}</dd>
      </div>
      <p className="col-span-2 text-xs text-tinta-500">
        Netos. Comisiones descontadas por el contrato: plataforma {fmtBsUnits(s.platform, fx)} · Trustless Work {fmtBsUnits(s.tw, fx)}.
      </p>
      {money.reintegro && <Reintegro r={money.reintegro} fx={fx} />}
    </dl>
  );
}

/** Devolución completa (PP_DEVOLUCION_COMPLETA=1): Trato le transfiere al comprador las comisiones de la devolución. */
function Reintegro({ r, fx }: { r: ReintegroView; fx: number }) {
  if (r.estado === "confirmado" && r.hash) {
    return (
      <div data-testid="reintegro" className="col-span-2 space-y-1 rounded-card bg-exito-50 p-4 text-left">
        <p className="font-semibold text-monte">Te devolvimos todo lo que pagaste: {fmtBsUnits(r.pagado, fx)}</p>
        <p className="text-xs text-tinta-700">
          El contrato te devolvió {fmtBsUnits(r.recibido, fx)} y Trato te transfirió las comisiones ({fmtBsUnits(r.monto, fx)}).
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <TxLink hash={r.devolucion_hash} label="Ver la devolución" />
          <TxLink hash={r.hash} label="Ver el reintegro" />
        </p>
      </div>
    );
  }
  return (
    <p data-testid="reintegro" className="caja-aviso col-span-2 text-left text-xs">
      Trato te va a transferir las comisiones ({fmtBsUnits(r.monto, fx)}) para que recibas todo lo que pagaste.
    </p>
  );
}

type Icono = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;

const ICONO: Record<string, Icono> = {
  rampa: IconoBillete,
  escrow: IconoDocumento,
  fondeo: IconoCandado,
  envio: IconoCamion,
  aprobacion: IconoCheckCirculo,
  liberacion: IconoCheckCirculo,
  disputa: IconoAlerta,
  resolucion: IconoBalanza,
  extension: IconoReloj,
  devolucion: IconoVolver,
  reintegro: IconoBillete,
};

/** Línea de tiempo del pedido, con "Ver registro público" en cada transacción. */
export function Timeline({ order, txs }: { order: PublicOrder; txs: TxRow[] }) {
  const items: { key: string; title: string; when?: number | null; detail?: string; done: boolean; tone?: string; tx?: TxRow }[] = [];
  const tx = (kind: string) => txs.filter((t) => t.kind === kind).at(-1);
  const envio = [order.ship_company, order.ship_tracking && `guía ${order.ship_tracking}`, order.ship_weight && fmtKg(`${order.ship_weight} kg`)]
    .filter(Boolean)
    .join(" · ");
  items.push({ key: "pago", title: "Pagaste: tu pago quedó guardado", when: order.funded_at, done: Boolean(order.funded_at), tx: tx("fondeo") });
  items.push({
    key: "envio",
    title: "El vendedor registró el envío",
    when: order.shipped_at,
    detail: envio || fmtKg(order.shipped_evidence) || undefined,
    done: Boolean(order.shipped_at),
    tx: tx("envio"),
  });
  if (order.status === "en_disputa" || order.status === "resuelto") {
    items.push({ key: "disputa", title: "Reclamo abierto: la plata quedó congelada", when: order.disputed_at, detail: order.dispute_reason ?? undefined, done: true, tone: "aviso", tx: tx("disputa") });
    items.push({ key: "resuelto", title: "El revisor repartió la plata", when: order.resolved_at, done: order.status === "resuelto", tone: "info", tx: tx("resolucion") });
  } else {
    items.push({ key: "liberado", title: "Se pagó al vendedor", when: order.released_at, done: order.status === "liberado", tx: tx("liberacion") });
  }
  const dot = (done: boolean, tone?: string) => (done ? (tone === "aviso" ? "bg-aviso-600" : tone === "info" ? "bg-info-600" : "bg-musgo") : "bg-tinta-200");
  return (
    <ol data-testid="linea-de-tiempo" className="relative space-y-5 border-l-2 border-tinta-200 pl-6">
      {items.map((it) => (
        <li key={it.key} className="relative">
          <span className={`absolute -left-[31px] top-1 h-4 w-4 rounded-full ring-4 ring-white ${dot(it.done, it.tone)}`} />
          <p className={`font-medium ${it.done ? "text-monte" : "text-tinta-500"}`}>{it.title}</p>
          {it.done && it.when ? <p className="text-xs text-tinta-500 num">{fmtDate(it.when)}</p> : null}
          {it.detail && it.done ? <p className="mt-0.5 text-sm text-tinta-600">{it.detail}</p> : null}
          {it.tx ? <TxLink hash={it.tx.hash} label="Ver en el registro" /> : null}
        </li>
      ))}
    </ol>
  );
}

/** Historial completo de transacciones del pedido. */
export function TxList({ txs }: { txs: TxRow[] }) {
  if (!txs.length) return null;
  return (
    <ul className="divide-y divide-tinta-100">
      {txs.map((t) => {
        const I = ICONO[t.kind] ?? IconoDocumento;
        return (
          <li key={t.id} className="flex items-start gap-3 py-2.5 text-sm">
            <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-tinta-100 text-tinta-700">
              <I className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-tinta-800">{fmtKg(t.label)}</span>
              <span className="text-xs text-tinta-500 num">{fmtDate(t.created_at)}</span>
            </span>
            <TxLink hash={t.hash} />
          </li>
        );
      })}
    </ul>
  );
}
