"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Countdown } from "@/components/Guardian";
import { Breakdown, SplitView, TxList } from "@/components/OrderBits";
import { CopyButton, ErrorBox, ExplorerLink, Progress, Spinner, StatusBadge, useProgress } from "@/components/ui";
import { WhatsAppBox } from "@/components/WhatsAppBox";
import { explorer, fmtBs, fmtDate, fmtUsd } from "@/lib/format";
import type { InfoData, SellerData, SellerOrder } from "@/lib/types";
import { api, getWallet, signAndSubmit, type PreparedTx } from "@/lib/wallet";
import { waText } from "@/lib/whatsapp";

const origin = () => (typeof window === "undefined" ? "" : window.location.origin);
const linkUrl = (slug: string) => `${origin()}/p/${slug}`;

export default function Panel() {
  const [pk, setPk] = useState<string | null | undefined>(undefined);
  const [data, setData] = useState<SellerData | null>(null);
  const [info, setInfo] = useState<InfoData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [primer, setPrimer] = useState(false);
  const [demo, setDemo] = useState(false);
  const [enviar, setEnviar] = useState<{ slug: string; evidencia: string } | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const load = useCallback(async (p: string) => {
    try {
      setData(await api<SellerData>(`/api/sellers/${p}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    const p = getWallet("vendedor").publicKey();
    setPk(p);
    setPrimer(new URLSearchParams(window.location.search).has("primer"));
    const qs = new URLSearchParams(window.location.search);
    setDemo(qs.has("demo"));
    // Link del bot (APP-ENDPOINTS §3): abrir ese pedido con la evidencia precargada.
    if (qs.get("enviar")) setEnviar({ slug: qs.get("enviar")!, evidencia: qs.get("evidencia") ?? "" });
    api<InfoData>("/api/info").then(setInfo).catch(() => {});
    if (!p) return;
    load(p);
    const t = setInterval(() => load(p), 8000);
    return () => clearInterval(t);
  }, [load]);

  if (pk === undefined) return null;
  if (pk === null)
    return (
      <div className="card mx-auto max-w-md text-center">
        <h1 className="text-xl font-bold">Todavía no tienes tienda en este dispositivo</h1>
        <p className="muted mt-1">Crea tu tienda en 3 pasos y tu primer link.</p>
        <Link href="/vender" className="btn-primary mt-4 w-full">
          Crear mi tienda
        </Link>
      </div>
    );
  if (!data) return <div className="flex justify-center py-20">{error ? <ErrorBox error={error} /> : <Spinner className="h-6 w-6" />}</div>;

  const { seller, orders } = data;
  const firstLink = primer && orders.length === 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Tu tienda</p>
          <h1 className="text-2xl font-bold" data-testid="tienda">
            {seller.store_name}
          </h1>
          <p className="muted">
            WhatsApp {seller.whatsapp} · {seller.completedSales} ventas completadas
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Billetera: <ExplorerLink href={explorer.account(seller.pubkey)}>{seller.pubkey.slice(0, 6)}…{seller.pubkey.slice(-6)}</ExplorerLink>
          </p>
        </div>
        <div className="rounded-2xl bg-brand-600 px-5 py-4 text-white">
          <p className="text-xs text-brand-100">Saldo</p>
          <p className="text-3xl font-bold" data-testid="saldo">
            {fmtUsd(data.balance)}
          </p>
          <p className="text-xs text-brand-100">USD de prueba</p>
        </div>
      </section>

      <CreateLink
        sellerPubkey={seller.pubkey}
        fx={info?.fx ?? 11.7}
        title={firstLink ? "Tu primer link" : "Crear link"}
        demo={demo}
        onCreated={(slug) => {
          setCreated(slug);
          load(seller.pubkey);
        }}
      />

      {created && (
        <section className="card space-y-3 ring-2 ring-brand-200" data-testid="link-creado">
          <h2 className="text-lg font-bold">¡Tu link está listo! 🎉</h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            <code data-testid="link-url" className="flex-1 truncate rounded-xl bg-slate-100 px-3 py-3 text-sm">
              {linkUrl(created)}
            </code>
            <CopyButton text={linkUrl(created)} label="Copiar link" testId="copiar-link" />
          </div>
          {(() => {
            const o = orders.find((x) => x.slug === created);
            return o ? (
              <WhatsAppBox
                title="Mensaje para tu cliente"
                text={waText("link", { product: o.product, price: fmtBs(o.price_bs_cents), url: linkUrl(o.slug), store: seller.store_name })}
              />
            ) : null;
          })()}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Pedidos</h2>
        {orders.length === 0 && <p className="muted card">Todavía no tienes pedidos. Crea tu primer link y compártelo.</p>}
        {orders.map((o) => (
          <OrderCard
            key={o.slug}
            o={o}
            store={seller.store_name}
            sellerPubkey={seller.pubkey}
            platformFeeBps={info?.platformFeeBps ?? 200}
            mode={info?.mode ?? "guardian"}
            prefill={enviar && enviar.slug === o.slug && o.status === "pagado" ? enviar.evidencia : null}
            onChange={() => load(seller.pubkey)}
          />
        ))}
      </section>
    </div>
  );
}

function CreateLink({ sellerPubkey, fx, title, demo, onCreated }: { sellerPubkey: string; fx: number; title: string; demo: boolean; onCreated: (slug: string) => void }) {
  const [f, setF] = useState({ product: "", description: "", photoUrl: "", priceBs: "", deliveryDays: "3" });
  const [demoWindow, setDemoWindow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const price = Number(f.priceBs.replace(",", "."));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const o = await api<{ slug: string }>("/api/links", { ...f, sellerPubkey, deliveryDays: Number(f.deliveryDays), demoWindow: demo && demoWindow });
      setF({ product: "", description: "", photoUrl: "", priceBs: "", deliveryDays: "3" });
      onCreated(o.slug);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4" data-testid="crear-link">
      <h2 className="text-lg font-bold">{title}</h2>
      <div>
        <label className="label" htmlFor="product">
          Producto
        </label>
        <input id="product" className="input" value={f.product} onChange={set("product")} placeholder="Ej.: Zapatillas Nike talla 40" maxLength={80} required />
      </div>
      <div>
        <label className="label" htmlFor="description">
          Descripción corta <span className="font-normal text-slate-400">(opcional)</span>
        </label>
        <textarea id="description" className="input min-h-20" value={f.description} onChange={set("description")} maxLength={280} placeholder="Color, estado, qué incluye…" />
      </div>
      <div>
        <label className="label" htmlFor="photo">
          Foto <span className="font-normal text-slate-400">(opcional, link https://…)</span>
        </label>
        <input id="photo" className="input" value={f.photoUrl} onChange={set("photoUrl")} inputMode="url" placeholder="https://…" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="price">
            Precio en Bs
          </label>
          <input id="price" className="input" value={f.priceBs} onChange={set("priceBs")} inputMode="decimal" placeholder="450" required />
          <p className="mt-1 text-xs text-slate-500">{price > 0 ? `≈ ${(price / fx).toLocaleString("es-BO", { maximumFractionDigits: 2, minimumFractionDigits: 2 })} USD de prueba` : `1 USD = Bs ${fx.toLocaleString("es-BO")}`}</p>
        </div>
        <div>
          <label className="label" htmlFor="days">
            Días de entrega
          </label>
          <select id="days" className="input" value={f.deliveryDays} onChange={set("deliveryDays")}>
            {Array.from({ length: 15 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d} {d === 1 ? "día" : "días"}
              </option>
            ))}
          </select>
        </div>
      </div>
      {demo && (
        <label className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          <input type="checkbox" className="mt-1" checked={demoWindow} onChange={(e) => setDemoWindow(e.target.checked)} />
          <span>
            <strong>Plazo corto de demo:</strong> liberación automática a los 2 minutos del pago (en vez de días de entrega + 3 días).
          </span>
        </label>
      )}
      <ErrorBox error={error} />
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? <Spinner /> : null} Crear link
      </button>
    </form>
  );
}

function OrderCard({
  o,
  store,
  sellerPubkey,
  platformFeeBps,
  mode,
  prefill,
  onChange,
}: {
  o: SellerOrder;
  store: string;
  sellerPubkey: string;
  platformFeeBps: number;
  mode: "direct" | "guardian";
  prefill: string | null;
  onChange: () => void;
}) {
  const [evidence, setEvidence] = useState(prefill ?? "");
  const ref = useRef<HTMLElement>(null);
  const focused = prefill !== null;
  useEffect(() => {
    if (prefill === null) return;
    setEvidence((cur) => cur || prefill);
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [prefill]);
  const [reply, setReply] = useState(o.seller_reply ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const progress = useProgress();
  const url = linkUrl(o.slug);
  const d = { product: o.product, price: fmtBs(o.price_bs_cents), url, store, evidence: o.shipped_evidence, reason: o.dispute_reason, buyerPct: o.buyer_bps != null ? o.buyer_bps / 100 : undefined };

  async function ship(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    progress.reset();
    try {
      const prepared = await api<PreparedTx>(`/api/orders/${o.slug}/action`, { action: "ship", signer: sellerPubkey, evidence });
      await signAndSubmit(getWallet("vendedor"), prepared, progress.push);
      onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api(`/api/orders/${o.slug}/reply`, { pubkey: sellerPubkey, text: reply });
      onChange();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <article ref={ref} className={`card space-y-4 ${focused ? "ring-2 ring-brand-500" : ""}`} data-testid={`pedido-${o.slug}`}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{o.product}</h3>
          <p className="muted">
            {fmtBs(o.price_bs_cents)} · ≈ {fmtUsd(o.amount_units)} USD de prueba · {fmtDate(o.created_at)}
          </p>
        </div>
        <StatusBadge status={o.status} />
      </header>

      {o.status === "esperando_pago" && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <code className="flex-1 truncate rounded-xl bg-slate-100 px-3 py-2.5 text-sm">{url}</code>
          <CopyButton text={url} label="Copiar link" className="btn-secondary !py-2 text-sm" />
        </div>
      )}

      {o.status === "pagado" && (
        <>
          <div className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900">
            💰 Tu cliente pagó y la plata está guardada en el contrato. Despacha y marca el pedido como enviado.
            {focused && <span className="mt-1 block font-semibold">Vienes desde el asistente de WhatsApp: revisa la guía y confirma con tu billetera.</span>}
          </div>
          <form onSubmit={ship} className="space-y-2">
            <label className="label" htmlFor={`ev-${o.slug}`}>
              Código de encomienda o link de la foto del envío
            </label>
            <input id={`ev-${o.slug}`} className="input" value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Ej.: SRV-2026-118734" required />
            <button className="btn-primary w-full" disabled={busy}>
              {busy ? <Spinner /> : null} Marcar como enviado
            </button>
          </form>
          <Progress steps={progress.steps} />
          <WhatsAppBox title="Mensaje para tu cliente" text={waText("despacho", d)} />
        </>
      )}

      {o.status === "enviado" && (
        <>
          <p className="text-sm text-slate-600">
            📦 Enviado con: <strong>{o.shipped_evidence}</strong>. Cuando tu cliente confirme, la plata se libera a tu billetera.
          </p>
          <WhatsAppBox title="Avísale a tu cliente" text={waText("enviado", d)} />
        </>
      )}

      <Countdown slug={o.slug} deadline={o.deadline} status={o.status} mode={mode} onReleased={onChange} />

      {o.status === "liberado" && (
        <>
          <p className="text-sm font-medium text-brand-800">✅ Tu cliente confirmó. La plata ya está en tu billetera.</p>
          <Breakdown money={o} platformFeeBps={platformFeeBps} />
        </>
      )}

      {o.status === "en_disputa" && (
        <>
          <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">⚠️ Reclamo abierto: {o.dispute_reason}</p>
            {o.dispute_text && <p className="mt-1">“{o.dispute_text}”</p>}
            {o.dispute_photo && (
              <a className="underline" href={o.dispute_photo} target="_blank" rel="noreferrer">
                Ver foto
              </a>
            )}
            <p className="mt-1 text-xs">La plata queda congelada en el contrato hasta que decida el árbitro.</p>
          </div>
          <form onSubmit={sendReply} className="space-y-2">
            <label className="label" htmlFor={`rp-${o.slug}`}>
              Tu versión para el árbitro
            </label>
            <textarea id={`rp-${o.slug}`} className="input min-h-20" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Cuéntale al árbitro qué pasó y agrega links a fotos o chats." />
            <button className="btn-secondary w-full">{o.seller_reply ? "Actualizar mi versión" : "Enviar mi versión"}</button>
          </form>
        </>
      )}

      {o.status === "resuelto" && (
        <>
          <p className="text-sm font-medium text-violet-800">⚖️ El árbitro resolvió el reclamo.</p>
          <SplitView money={o} buyerBps={o.buyer_bps} />
          <WhatsAppBox title="Mensaje para tu cliente" text={waText("resuelto", d)} />
        </>
      )}

      <ErrorBox error={error} />

      {o.txs.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-slate-600">Transacciones ({o.txs.length})</summary>
          <TxList txs={o.txs} />
        </details>
      )}
      {o.escrow_id && (
        <p className="text-xs text-slate-500">
          Contrato del pedido: <ExplorerLink href={explorer.contract(o.escrow_id)}>{o.escrow_id}</ExplorerLink>
        </p>
      )}
    </article>
  );
}
