"use client";

import { fmtBsUnits, fmtDate } from "@/lib/format";
import type { MoneyView, PublicOrder, TxRow } from "@/lib/types";
import { TxLink } from "./ui";

/** Cómo se repartió el pago liberado, en Bs. */
export function Breakdown({ money, fx, feePayer, platformBps = 200 }: { money: MoneyView; fx: number; feePayer?: string | null; platformBps?: number }) {
  if (!money.breakdown) return null;
  const b = money.breakdown;
  const prot = BigInt(b.platform) + BigInt(b.tw);
  return (
    <dl data-testid="desglose" className="grid grid-cols-2 gap-2 text-center">
      <div className="rounded-xl bg-brand-50 p-3 ring-1 ring-brand-100">
        <dt className="text-xs text-brand-800">Vendedor recibió</dt>
        <dd className="mt-1 text-lg font-bold text-brand-900">{fmtBsUnits(b.seller, fx)}</dd>
      </div>
      <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
        <dt className="text-xs text-slate-600">Protección{feePayer === "comprador" ? " (la pagó el comprador)" : ` (${(platformBps / 100).toLocaleString("es-BO")}% + 0,3%)`}</dt>
        <dd className="mt-1 text-lg font-semibold">{fmtBsUnits(prot, fx)}</dd>
      </div>
      <p className="col-span-2 text-xs text-slate-500">
        Plataforma {fmtBsUnits(b.platform, fx)} · Trustless Work (0,3%) {fmtBsUnits(b.tw, fx)}. Montos calculados igual que el contrato.
      </p>
    </dl>
  );
}

/** Montos del reparto del revisor, en Bs. */
export function SplitView({ money, buyerBps, fx }: { money: MoneyView; buyerBps: number | null; fx: number }) {
  if (!money.split || buyerBps == null) return null;
  const s = money.split;
  const b = buyerBps / 100;
  // Sin "100 %" en pantalla (lista de palabras prohibidas): en los extremos se dice con palabras.
  const pct = (x: number) => (x === 100 ? "todo" : x === 0 ? "nada" : `${x.toLocaleString("es-BO")}%`);
  return (
    <dl data-testid="reparto" className="grid grid-cols-2 gap-2 text-center">
      <div className="rounded-xl bg-violet-50 p-3 ring-1 ring-violet-100">
        <dt className="text-xs text-violet-800">Comprador ({pct(b)})</dt>
        <dd className="mt-1 text-lg font-bold text-violet-900">{fmtBsUnits(s.buyer, fx)}</dd>
      </div>
      <div className="rounded-xl bg-violet-50 p-3 ring-1 ring-violet-100">
        <dt className="text-xs text-violet-800">Vendedor ({pct(100 - b)})</dt>
        <dd className="mt-1 text-lg font-bold text-violet-900">{fmtBsUnits(s.seller, fx)}</dd>
      </div>
      <p className="col-span-2 text-xs text-slate-500">
        Netos. Comisiones descontadas por el contrato: plataforma {fmtBsUnits(s.platform, fx)} · Trustless Work {fmtBsUnits(s.tw, fx)}.
      </p>
    </dl>
  );
}

const ICON: Record<string, string> = {
  rampa: "🏦",
  escrow: "📄",
  fondeo: "🔒",
  envio: "📦",
  aprobacion: "👍",
  liberacion: "✅",
  disputa: "⚠️",
  resolucion: "⚖️",
  extension: "⏳",
  devolucion: "↩️",
};

/** Línea de tiempo del pedido, con "Ver registro público" en cada transacción. */
export function Timeline({ order, txs }: { order: PublicOrder; txs: TxRow[] }) {
  const items: { key: string; title: string; when?: number | null; detail?: string; done: boolean; tone?: string; tx?: TxRow }[] = [];
  const tx = (kind: string) => txs.filter((t) => t.kind === kind).at(-1);
  const envio = [order.ship_company, order.ship_tracking && `guía ${order.ship_tracking}`, order.ship_weight && `${order.ship_weight} kg`]
    .filter(Boolean)
    .join(" · ");
  items.push({ key: "pago", title: "Pagaste: tu pago quedó guardado", when: order.funded_at, done: Boolean(order.funded_at), tx: tx("fondeo") });
  items.push({
    key: "envio",
    title: "El vendedor registró el envío",
    when: order.shipped_at,
    detail: envio || order.shipped_evidence || undefined,
    done: Boolean(order.shipped_at),
    tx: tx("envio"),
  });
  if (order.status === "en_disputa" || order.status === "resuelto") {
    items.push({ key: "disputa", title: "Reclamo abierto: la plata quedó congelada", when: order.disputed_at, detail: order.dispute_reason ?? undefined, done: true, tone: "amber", tx: tx("disputa") });
    items.push({ key: "resuelto", title: "El revisor repartió la plata", when: order.resolved_at, done: order.status === "resuelto", tone: "violet", tx: tx("resolucion") });
  } else {
    items.push({ key: "liberado", title: "Se pagó al vendedor", when: order.released_at, done: order.status === "liberado", tx: tx("liberacion") });
  }
  const dot = (done: boolean, tone?: string) =>
    done ? (tone === "amber" ? "bg-amber-500" : tone === "violet" ? "bg-violet-600" : "bg-brand-600") : "bg-slate-300";
  return (
    <ol data-testid="linea-de-tiempo" className="relative space-y-5 border-l-2 border-slate-200 pl-6">
      {items.map((it) => (
        <li key={it.key} className="relative">
          <span className={`absolute -left-[31px] top-1 h-4 w-4 rounded-full ring-4 ring-white ${dot(it.done, it.tone)}`} />
          <p className={`font-medium ${it.done ? "text-slate-900" : "text-slate-400"}`}>{it.title}</p>
          {it.done && it.when ? <p className="text-xs text-slate-500">{fmtDate(it.when)}</p> : null}
          {it.detail && it.done ? <p className="mt-0.5 text-sm text-slate-600">{it.detail}</p> : null}
          {it.tx ? <TxLink hash={it.tx.hash} /> : null}
        </li>
      ))}
    </ol>
  );
}

/** Historial completo de transacciones del pedido. */
export function TxList({ txs }: { txs: TxRow[] }) {
  if (!txs.length) return null;
  return (
    <ul className="divide-y divide-slate-100">
      {txs.map((t) => (
        <li key={t.id} className="flex items-start gap-3 py-2.5 text-sm">
          <span aria-hidden>{ICON[t.kind] ?? "•"}</span>
          <span className="flex-1">
            <span className="block text-slate-800">{t.label}</span>
            <span className="text-xs text-slate-500">{fmtDate(t.created_at)}</span>
          </span>
          <TxLink hash={t.hash} />
        </li>
      ))}
    </ul>
  );
}
