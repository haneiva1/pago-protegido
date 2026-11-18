"use client";

import QRCode from "qrcode";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Breakdown, SplitView, Timeline, TxList } from "@/components/OrderBits";
import { ErrorBox, ExplorerLink, Progress, Spinner, StatusBadge, useProgress } from "@/components/ui";
import { WhatsAppBox } from "@/components/WhatsAppBox";
import { explorer, fmtBs, fmtDate, fmtUsd } from "@/lib/format";
import type { OrderView } from "@/lib/types";
import { activateWallet, api, getWallet, signAndSubmit, type PreparedTx } from "@/lib/wallet";
import { waLink, waText } from "@/lib/whatsapp";

const MOTIVOS = ["No llegó", "Llegó dañado", "No es lo que pedí", "Llegó incompleto", "Otro"];

export default function PaginaDePago() {
  const { slug } = useParams<{ slug: string }>();
  const [v, setV] = useState<OrderView | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [problem, setProblem] = useState(false);
  const progress = useProgress();

  const load = useCallback(async () => {
    try {
      setV(await api<OrderView>(`/api/orders/${slug}?onchain=1`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [slug]);

  useEffect(() => {
    setMe(getWallet("comprador").publicKey());
    load();
  }, [load]);

  useEffect(() => {
    if (busy) return;
    const t = setInterval(load, 7000);
    return () => clearInterval(t);
  }, [busy, load]);

  if (!v) return <div className="flex justify-center py-20">{error ? <ErrorBox error={error} /> : <Spinner className="h-6 w-6" />}</div>;

  const o = v.order;
  const url = typeof window === "undefined" ? "" : window.location.href.split("?")[0];
  const isBuyer = Boolean(me && me === o.buyer_pubkey);
  const takenByOther = Boolean(o.buyer_pubkey && !isBuyer && o.status === "esperando_pago");
  const d = { product: o.product, price: fmtBs(o.price_bs_cents), url, store: v.seller.store_name, reason: o.dispute_reason, buyerPct: o.buyer_bps != null ? o.buyer_bps / 100 : undefined, amount: v.breakdown ? `${fmtUsd(v.breakdown.seller)} USD de prueba` : undefined };

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    progress.reset();
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const pagar = () =>
    run(async () => {
      const wallet = getWallet("comprador");
      progress.push("Creando tu billetera en este dispositivo");
      const pk = await wallet.connect();
      setMe(pk);
      progress.finish("Creando tu billetera en este dispositivo");
      await activateWallet(wallet, progress.push);
      const L = "Banco: pago simulado y contrato protegido creado";
      progress.push(L);
      const prepared = await api<PreparedTx>(`/api/orders/${slug}/pay`, { buyer: pk });
      progress.finish(L);
      await signAndSubmit(wallet, prepared, progress.push);
      setQrOpen(false);
    });

  const accion = (action: "confirm" | "dispute", extra: Record<string, string> = {}) =>
    run(async () => {
      const wallet = getWallet("comprador");
      const prepared = await api<PreparedTx>(`/api/orders/${slug}/action`, { action, signer: wallet.publicKey(), ...extra });
      await signAndSubmit(wallet, prepared, progress.push);
      setProblem(false);
    });

  return (
    <div className="mx-auto max-w-md space-y-4">
      {o.status === "esperando_pago" ? (
        <>
          <ProductCard v={v} />
          <SellerCard v={v} />
          <Protection />
          {takenByOther ? (
            <p className="card text-center text-sm text-slate-600">Este link ya lo está pagando otra persona.</p>
          ) : !qrOpen && !busy ? (
            <button className="btn-primary w-full py-4 text-lg" onClick={() => setQrOpen(true)}>
              🔒 Pagar protegido
            </button>
          ) : (
            <QrPanel v={v} busy={busy} onPay={pagar} />
          )}
          <Progress steps={progress.steps} />
          <ErrorBox error={error} />
        </>
      ) : (
        <>
          <StatusHero v={v} />
          <ErrorBox error={error} />
          <Progress steps={progress.steps} />

          {isBuyer && (o.status === "pagado" || o.status === "enviado") && !problem && (
            <div className="grid gap-2">
              <button className="btn-primary w-full py-4 text-lg" disabled={busy} onClick={() => accion("confirm")}>
                {busy ? <Spinner /> : "✅"} Recibí conforme
              </button>
              <button className="btn-danger w-full" disabled={busy} onClick={() => setProblem(true)}>
                Tengo un problema
              </button>
            </div>
          )}
          {problem && <ProblemForm busy={busy} onCancel={() => setProblem(false)} onSubmit={(x) => accion("dispute", x)} />}

          <section className="card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">Seguimiento del pedido</h2>
              <StatusBadge status={o.status} />
            </div>
            <Timeline order={o} txs={v.txs} />
            {o.deadline && (o.status === "pagado" || o.status === "enviado") && (
              <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600" data-testid="plazo">
                ⏱️ Liberación automática: <strong>{fmtDate(o.deadline)}</strong>. Si para entonces no confirmas ni reportas un problema, la
                plata se libera al vendedor.
                {v.mode === "direct" && " (En esta versión de prueba la liberación automática todavía no está activa.)"}
              </p>
            )}
          </section>

          {o.status === "liberado" && (
            <section className="card space-y-3">
              <h2 className="font-bold">Así se repartió el pago</h2>
              <Breakdown money={v} platformFeeBps={v.platformFeeBps} />
            </section>
          )}
          {o.status === "resuelto" && (
            <section className="card space-y-3">
              <h2 className="font-bold">Decisión del árbitro</h2>
              <SplitView money={v} buyerBps={o.buyer_bps} />
            </section>
          )}

          {isBuyer && o.status === "pagado" && <WhatsAppBox title="Avísale al vendedor" text={waText("pagado", d)} phone={v.seller.whatsapp} />}
          {isBuyer && o.status === "liberado" && <WhatsAppBox title="Avísale al vendedor" text={waText("liberado", d)} phone={v.seller.whatsapp} />}
          {isBuyer && o.status === "en_disputa" && <WhatsAppBox title="Avísale al vendedor" text={waText("disputa", d)} phone={v.seller.whatsapp} />}
          {o.status === "resuelto" && <WhatsAppBox title="Compartir la decisión" text={waText("resuelto", d)} phone={v.seller.whatsapp} />}

          <ProductCard v={v} compact />
          <SellerCard v={v} />

          <section className="card space-y-2">
            <h2 className="font-bold">Transparencia</h2>
            {o.escrow_id && (
              <p className="text-xs text-slate-600">
                Contrato de este pedido: <ExplorerLink href={explorer.contract(o.escrow_id)}>{o.escrow_id}</ExplorerLink>
              </p>
            )}
            {v.onchain && (
              <p className="text-xs text-slate-600" data-testid="onchain">
                Saldo en el contrato: <strong>{fmtUsd(v.onchain.balance)} USD de prueba</strong>
                {v.onchain.flags.released && " · liberado"}
                {v.onchain.flags.disputed && " · en disputa"}
                {v.onchain.flags.resolved && " · resuelto"}
                {v.onchain.milestone && ` · hito: “${v.onchain.milestone.status}”`}
              </p>
            )}
            <TxList txs={v.txs} />
          </section>
        </>
      )}
    </div>
  );
}

function ProductCard({ v, compact }: { v: OrderView; compact?: boolean }) {
  const o = v.order;
  return (
    <section className="card overflow-hidden !p-0">
      {o.photo_url && !compact ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={o.photo_url} alt={o.product} className="h-56 w-full object-cover" />
      ) : null}
      <div className="p-5">
        <h1 className={compact ? "font-semibold" : "text-2xl font-bold"} data-testid="producto">
          {o.product}
        </h1>
        {o.description && !compact && <p className="mt-1 text-slate-600">{o.description}</p>}
        <p className={compact ? "muted" : "mt-3 text-4xl font-extrabold tracking-tight"}>{fmtBs(o.price_bs_cents)}</p>
        <p className="text-sm text-slate-500">
          ≈ {fmtUsd(o.amount_units)} USD de prueba · entrega en {o.delivery_days} {o.delivery_days === 1 ? "día" : "días"}
        </p>
      </div>
    </section>
  );
}

function SellerCard({ v }: { v: OrderView }) {
  const s = v.seller;
  const initials = s.store_name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <section className="card flex items-center gap-3">
      <div className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-brand-600 font-bold text-white">{initials}</div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{s.store_name}</p>
        <p className="text-xs text-slate-500">
          {s.completedSales} {s.completedSales === 1 ? "venta completada" : "ventas completadas"} con Pago Protegido
        </p>
      </div>
      <a className="btn-secondary !px-3 !py-2 text-sm" href={waLink("Hola, te escribo por tu link de Pago Protegido", s.whatsapp)} target="_blank" rel="noreferrer">
        WhatsApp {s.whatsapp}
      </a>
    </section>
  );
}

function Protection() {
  const steps = [
    { i: "💳", t: "Pagas", d: "Con QR desde tu banco." },
    { i: "🔒", t: "Tu plata queda guardada", d: "En un contrato que nadie puede tocar, ni el vendedor ni nosotros." },
    { i: "✅", t: "Se libera cuando confirmas", d: "O, si hay un problema, un árbitro decide cómo repartir." },
  ];
  return (
    <section className="card">
      <h2 className="font-bold">Cómo te protegemos</h2>
      <ol className="mt-3 space-y-3">
        {steps.map((s, i) => (
          <li key={s.t} className="flex gap-3">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brand-50 text-lg">{s.i}</span>
            <div>
              <p className="font-medium">
                {i + 1}. {s.t}
              </p>
              <p className="text-sm text-slate-600">{s.d}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function QrPanel({ v, busy, onPay }: { v: OrderView; busy: boolean; onPay: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const o = v.order;
  useEffect(() => {
    QRCode.toDataURL(`PAGO-PROTEGIDO-EJEMPLO|NO-ES-UN-QR-REAL|${o.slug}|BOB ${(o.price_bs_cents / 100).toFixed(2)}`, { margin: 1, width: 220 })
      .then(setQr)
      .catch(() => {});
  }, [o.slug, o.price_bs_cents]);
  return (
    <section className="card space-y-4" data-testid="qr">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">Pagar con QR</h2>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">SIMULADO</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="QR de ejemplo" className="h-48 w-48 rounded-xl ring-1 ring-slate-200" />
        ) : (
          <div className="h-48 w-48 animate-pulse rounded-xl bg-slate-100" />
        )}
        <p className="text-xs text-slate-500">QR de ejemplo</p>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl bg-slate-50 p-3">
          <dt className="text-xs text-slate-500">Pagas desde tu banco</dt>
          <dd className="text-lg font-bold">{fmtBs(o.price_bs_cents)}</dd>
        </div>
        <div className="rounded-xl bg-brand-50 p-3">
          <dt className="text-xs text-brand-800">Quedan protegidos</dt>
          <dd className="text-lg font-bold text-brand-900">{fmtUsd(o.amount_units)} USD de prueba</dd>
        </div>
      </dl>
      <p className="text-center text-xs text-slate-500">Tipo de cambio: 1 USD = Bs {o.fx.toLocaleString("es-BO", { minimumFractionDigits: 2 })}</p>
      <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900" data-testid="rampa-simulada">
        Rampa simulada en testnet. En producción la hace una entidad certificada por ASFI.
      </p>
      <button className="btn-primary w-full" disabled={busy} onClick={onPay}>
        {busy ? (
          <>
            <Spinner /> Procesando pago…
          </>
        ) : (
          "Simular pago del banco (testnet)"
        )}
      </button>
    </section>
  );
}

function StatusHero({ v }: { v: OrderView }) {
  const o = v.order;
  const map = {
    pagado: { t: "Tu plata está protegida", d: "Está guardada en el contrato. El vendedor ya puede despachar.", c: "bg-brand-600" },
    enviado: { t: "Tu plata está protegida", d: "El vendedor despachó tu pedido. Cuando lo recibas, confirma aquí.", c: "bg-brand-600" },
    liberado: { t: "Pago liberado al vendedor", d: "Confirmaste que recibiste. ¡Gracias por comprar protegido!", c: "bg-brand-700" },
    en_disputa: { t: "Reclamo abierto", d: "La plata quedó congelada en el contrato. Un árbitro va a revisar el caso.", c: "bg-amber-500" },
    resuelto: { t: "Reclamo resuelto", d: "El árbitro repartió la plata entre comprador y vendedor.", c: "bg-violet-600" },
    esperando_pago: { t: "", d: "", c: "" },
  }[o.status];
  return (
    <section className={`rounded-2xl p-5 text-white ${map.c}`} data-testid="estado-pedido">
      <p className="text-xs uppercase tracking-wide text-white/80">{o.product}</p>
      <h1 className="mt-1 text-2xl font-bold">{map.t}</h1>
      <p className="mt-1 text-sm text-white/90">{map.d}</p>
      <p className="mt-3 text-3xl font-extrabold">{fmtUsd(o.amount_units)} <span className="text-base font-semibold">USD de prueba</span></p>
      <p className="text-xs text-white/80">{fmtBs(o.price_bs_cents)}</p>
    </section>
  );
}

function ProblemForm({ busy, onCancel, onSubmit }: { busy: boolean; onCancel: () => void; onSubmit: (x: Record<string, string>) => void }) {
  const [reason, setReason] = useState(MOTIVOS[0]);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState("");
  return (
    <form
      className="card space-y-3 ring-2 ring-amber-200"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ reason, text, photo });
      }}
    >
      <h2 className="font-bold">¿Qué pasó?</h2>
      <p className="muted">Al enviar, la plata queda congelada y un árbitro revisa la evidencia de los dos lados.</p>
      <div>
        <label className="label" htmlFor="motivo">
          Motivo
        </label>
        <select id="motivo" className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
          {MOTIVOS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="detalle">
          Cuéntanos más
        </label>
        <textarea id="detalle" className="input min-h-24" value={text} onChange={(e) => setText(e.target.value)} maxLength={600} placeholder="Describe el problema" />
      </div>
      <div>
        <label className="label" htmlFor="foto">
          Foto <span className="font-normal text-slate-400">(opcional, link https://…)</span>
        </label>
        <input id="foto" className="input" value={photo} onChange={(e) => setPhoto(e.target.value)} inputMode="url" placeholder="https://…" />
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button className="btn flex-1 bg-amber-500 text-white hover:bg-amber-600" disabled={busy}>
          {busy ? <Spinner /> : null} Enviar reclamo
        </button>
      </div>
    </form>
  );
}
