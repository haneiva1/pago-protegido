"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Countdown, ShipDeadline } from "@/components/Guardian";
import { Breakdown, SplitView, TxList } from "@/components/OrderBits";
import { CopyButton, ErrorBox, ExplorerLink, Progress, Spinner, StatusBadge, useProgress } from "@/components/ui";
import { Stat } from "@/components/Kpis";
import { fmtDuracion, fmtProporcion, nf as nfKpi } from "@/lib/kpi-format";
import { WhatsAppBox } from "@/components/WhatsAppBox";
import {
  CATEGORIAS,
  CIUDADES,
  DOLLAR_NOTE,
  EMPRESAS,
  PROTECCION,
  explorer,
  fmtBs,
  fmtBsUnits,
  fmtDate,
  linkAmounts,
  unitsToNumber,
  type FeePayer,
} from "@/lib/format";
import type { InfoData, SellerData, SellerOrder } from "@/lib/types";
import { api, getWallet, signAndSubmit, type PreparedTx } from "@/lib/wallet";
import { waText } from "@/lib/whatsapp";

const origin = () => (typeof window === "undefined" ? "" : window.location.origin);
const linkUrl = (slug: string) => `${origin()}/p/${slug}`;
const nf = (n: number) => n.toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
    const qs = new URLSearchParams(window.location.search);
    setPrimer(qs.has("primer"));
    setDemo(qs.has("demo"));
    // Link del bot (APP-ENDPOINTS §3): abrir ese pedido con la guía precargada.
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
  const fx = data.fx;
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
            {seller.city ? `${seller.city} · ` : ""}WhatsApp {seller.whatsapp} · {seller.completedSales} ventas protegidas
          </p>
          <p className="mt-1 text-xs">
            <ExplorerLink href={explorer.account(seller.pubkey)}>Ver registro público de tu cuenta</ExplorerLink>
          </p>
        </div>
        <div className="rounded-2xl bg-brand-600 px-5 py-4 text-white">
          <p className="text-xs text-brand-100">Saldo cobrado</p>
          <p className="text-3xl font-bold" data-testid="saldo">
            {fmtBsUnits(data.balance, fx)}
          </p>
        </div>
      </section>

      <p data-testid="antifraude-vendedor" className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
        🛡️ <strong>Para cobrar no tienes que abrir ningún link.</strong> Lo que vendes te llega solo cuando el comprador confirma. Nadie de Pago
        Protegido te va a pedir códigos ni contraseñas.
      </p>

      <section className="card space-y-3" data-testid="kpis-vendedor">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-bold">Tus números</h2>
          {seller.slug && (
            <Link href={`/tienda/${seller.slug}`} className="text-sm font-semibold text-brand-700 underline" data-testid="link-mi-perfil">
              Ver y compartir mi perfil público →
            </Link>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Stat
            testId="kpi-ventas"
            value={nfKpi(data.kpis.pagadas_al_vendedor)}
            label={data.kpis.pagadas_al_vendedor === 1 ? "venta protegida" : "ventas protegidas"}
            sub={data.kpis.en_curso ? `${data.kpis.en_curso} en curso` : undefined}
          />
          <Stat
            testId="kpi-sin-reclamo"
            value={fmtProporcion(data.kpis.ventas_sin_reclamo, data.kpis.cerradas)}
            label="sin reclamo"
            sub={data.kpis.cerradas ? `${data.kpis.ventas_sin_reclamo} de ${data.kpis.cerradas} cerradas` : "sin compras cerradas"}
          />
          <Stat
            testId="kpi-cobro"
            value={fmtDuracion(data.kpis.cobro_mediana_s)}
            label="hasta el cobro"
            sub={data.kpis.cobro_muestras ? "mediana desde el pago" : "todavía sin cobros"}
          />
        </div>
        <p className="text-xs text-slate-500">Calculados con el registro público de tus ventas: son los mismos que ven tus clientes en tu perfil.</p>
      </section>

      <CreateLink
        sellerPubkey={seller.pubkey}
        fx={info?.fx ?? fx}
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
            mode={info?.mode ?? "guardian"}
            capabilities={info?.capabilities}
            prefill={enviar && enviar.slug === o.slug && o.status === "pagado" ? enviar.evidencia : null}
            onChange={() => load(seller.pubkey)}
          />
        ))}
      </section>
      <p className="text-center text-xs text-slate-500">Modo práctica: no se mueve dinero real. {DOLLAR_NOTE}</p>
    </div>
  );
}

function CreateLink({ sellerPubkey, fx, title, demo, onCreated }: { sellerPubkey: string; fx: number; title: string; demo: boolean; onCreated: (slug: string) => void }) {
  const [f, setF] = useState({ product: "", description: "", photoUrl: "", priceBs: "", deliveryDays: "3", category: "Otro" });
  const [feePayer, setFeePayer] = useState<FeePayer>("comprador");
  const [demoWindow, setDemoWindow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const price = Number(f.priceBs.replace(",", "."));
  const preview = price > 0 ? linkAmounts(Math.round(price * 100), fx, feePayer) : null;
  const sellerGets = preview ? (feePayer === "comprador" ? price : unitsToNumber(preview.amount) * fx * (1 - 0.023)) : 0;
  const buyerPays = preview ? unitsToNumber(preview.amount) * fx : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const o = await api<{ slug: string }>("/api/links", { ...f, sellerPubkey, deliveryDays: Number(f.deliveryDays), feePayer, demoWindow: demo && demoWindow });
      setF({ product: "", description: "", photoUrl: "", priceBs: "", deliveryDays: "3", category: "Otro" });
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
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="category">
            Categoría
          </label>
          <select id="category" className="input" value={f.category} onChange={set("category")}>
            {CATEGORIAS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
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
      <div>
        <label className="label" htmlFor="price">
          Precio en Bs
        </label>
        <input id="price" className="input" value={f.priceBs} onChange={set("priceBs")} inputMode="decimal" placeholder="450" required />
      </div>
      <fieldset className="space-y-2" data-testid="quien-paga">
        <legend className="label">¿Quién paga la protección?</legend>
        <label className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm ${feePayer === "comprador" ? "border-brand-500 bg-brand-50" : "border-slate-200"}`}>
          <input type="radio" name="fee" className="mt-1" checked={feePayer === "comprador"} onChange={() => setFeePayer("comprador")} />
          <span>
            <strong>El comprador</strong> ({PROTECCION.pct.toLocaleString("es-BO")}%, mín. Bs {PROTECCION.minBs}, máx. Bs {PROTECCION.maxBs}). Tú recibes el precio completo.
          </span>
        </label>
        <label className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm ${feePayer === "vendedor" ? "border-brand-500 bg-brand-50" : "border-slate-200"}`}>
          <input type="radio" name="fee" className="mt-1" checked={feePayer === "vendedor"} onChange={() => setFeePayer("vendedor")} />
          <span>
            <strong>Yo la regalo</strong> (2,3% de mi venta). Tu cliente paga solo el precio.
          </span>
        </label>
        {preview && (
          <p className="text-xs text-slate-600" data-testid="vista-previa-link">
            Tu cliente paga <strong>Bs {nf(buyerPays)}</strong> y tú recibes <strong>Bs {nf(sellerGets)}</strong>
            {feePayer === "vendedor" ? " (descontados 2% de plataforma y 0,3% de Trustless Work)" : ""}.
          </p>
        )}
      </fieldset>
      {demo && (
        <label className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          <input type="checkbox" className="mt-1" checked={demoWindow} onChange={(e) => setDemoWindow(e.target.checked)} />
          <span>
            <strong>Plazo corto de demo:</strong> liberación automática a los 2 minutos del pago.
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
  mode,
  capabilities,
  prefill,
  onChange,
}: {
  o: SellerOrder;
  store: string;
  sellerPubkey: string;
  mode: "direct" | "guardian";
  capabilities?: { extend: boolean; clockFromShipping: boolean; refundUnshipped?: boolean };
  prefill: string | null;
  onChange: () => void;
}) {
  const [reply, setReply] = useState(o.seller_reply ?? "");
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);
  const focused = prefill !== null;
  const url = linkUrl(o.slug);
  const d = { product: o.product, price: fmtBs(o.price_bs_cents), url, store, evidence: o.shipped_evidence, reason: o.dispute_reason, buyerPct: o.buyer_bps != null ? o.buyer_bps / 100 : undefined };

  useEffect(() => {
    if (prefill !== null) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [prefill]);

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
          <p className="text-xs font-semibold text-brand-700">{o.code}</p>
          <h3 className="truncate font-semibold">{o.product}</h3>
          <p className="muted">
            {fmtBs(o.price_bs_cents)} · {o.fee_payer === "comprador" ? "protección la paga el comprador" : "protección la regalas tú"} · {fmtDate(o.created_at)}
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

      {o.recipient_name && o.status !== "esperando_pago" && (
        <p data-testid="datos-entrega-vendedor" className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
          📍 Envía a: <strong>{o.recipient_name}</strong> · {o.dest_city}
          {o.pref_agency ? ` · agencia preferida: ${o.pref_agency}` : ""}
        </p>
      )}

      {o.status === "pagado" && (
        <>
          <div className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900">
            💰 Tu cliente pagó y el pago está guardado en el contrato. Despacha y registra el envío.
            {focused && <span className="mt-1 block font-semibold">Vienes desde el asistente de WhatsApp: revisa la guía y confirma con tu cuenta.</span>}
          </div>
          <ShipForm o={o} sellerPubkey={sellerPubkey} prefill={prefill} onDone={onChange} />
          <WhatsAppBox title="Mensaje para tu cliente" text={waText("despacho", d)} />
        </>
      )}

      {o.status === "enviado" && (
        <>
          <p className="text-sm text-slate-600">
            📦 Enviado: <strong>{[o.ship_company, o.ship_tracking && `guía ${o.ship_tracking}`, o.ship_weight && `${o.ship_weight} kg`].filter(Boolean).join(" · ")}</strong>. Cuando
            tu cliente confirme, se te paga.
          </p>
          <WhatsAppBox title="Avísale a tu cliente" text={waText("enviado", d)} />
        </>
      )}
      <ShipDeadline shipDeadline={o.ship_deadline} status={o.status} role="vendedor" />
      <Countdown slug={o.slug} deadline={o.deadline} status={o.status} mode={mode} onReleased={onChange} capabilities={capabilities} role="vendedor" extended={o.extended} />
      {o.status === "devuelto" && (
        <p data-testid="devuelto-vendedor" className="text-sm font-medium text-rose-800">
          ↩️ No registraste el envío antes del {o.ship_deadline ? new Date(o.ship_deadline).toLocaleString("es-BO", { timeZone: "America/La_Paz" }) : "plazo"}: el pago volvió al comprador.
        </p>
      )}

      {o.status === "liberado" && (
        <>
          <p className="text-sm font-medium text-brand-800">✅ Tu cliente confirmó. Ya se te pagó.</p>
          <Breakdown money={o} fx={o.fx} feePayer={o.fee_payer} platformBps={o.platform_bps ?? 200} />
        </>
      )}

      {o.status === "en_disputa" && (
        <>
          <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">⚠️ Reclamo abierto: {o.dispute_reason}</p>
            {o.dispute_text && <p className="mt-1">“{o.dispute_text}”</p>}
            <p className="mt-1 text-xs">La plata queda congelada en el contrato hasta que decida el revisor. Responde dentro de 48 h.</p>
          </div>
          <form onSubmit={sendReply} className="space-y-2">
            <label className="label" htmlFor={`rp-${o.slug}`}>
              Tu versión para el revisor
            </label>
            <textarea id={`rp-${o.slug}`} className="input min-h-20" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Comprobante de la empresa, foto del producto en el paquete con el código del pedido…" />
            <button className="btn-secondary w-full">{o.seller_reply ? "Actualizar mi versión" : "Enviar mi versión"}</button>
          </form>
        </>
      )}

      {o.status === "resuelto" && (
        <>
          <p className="text-sm font-medium text-violet-800">⚖️ El revisor resolvió el reclamo.</p>
          <SplitView money={o} buyerBps={o.buyer_bps} fx={o.fx} />
          <WhatsAppBox title="Mensaje para tu cliente" text={waText("resuelto", d)} />
        </>
      )}

      <ErrorBox error={error} />

      {o.txs.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-slate-600">Movimientos ({o.txs.length})</summary>
          <TxList txs={o.txs} />
        </details>
      )}
      {o.escrow_id && (
        <p className="text-xs text-slate-500">
          <ExplorerLink href={explorer.contract(o.escrow_id)}>Ver registro público del pedido</ExplorerLink>
        </p>
      )}
    </article>
  );
}

/** Evidencia de envío estructurada: empresa, guía, peso, foto, destino (e IMEI si es celular). */
function ShipForm({ o, sellerPubkey, prefill, onDone }: { o: SellerOrder; sellerPubkey: string; prefill: string | null; onDone: () => void }) {
  const [f, setF] = useState({ company: "", tracking: prefill ?? "", weight: "", photo: "", city: o.dest_city ?? "", imei: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const progress = useProgress();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const id = (k: string) => `${k}-${o.slug}`;

  useEffect(() => {
    if (prefill) setF((cur) => ({ ...cur, tracking: cur.tracking || prefill }));
  }, [prefill]);

  async function ship(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    progress.reset();
    try {
      const prepared = await api<PreparedTx>(`/api/orders/${o.slug}/action`, { action: "ship", signer: sellerPubkey, ...f });
      await signAndSubmit(getWallet("vendedor"), prepared, progress.push);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={ship} className="space-y-3" data-testid="form-envio">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={id("company")}>
            Empresa de envío
          </label>
          <select id={id("company")} className="input" value={f.company} onChange={set("company")} required>
            <option value="">Elige…</option>
            {EMPRESAS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={id("tracking")}>
            Número de guía
          </label>
          <input id={id("tracking")} className="input" value={f.tracking} onChange={set("tracking")} placeholder="Ej.: SRV-2026-118734" />
        </div>
        <div>
          <label className="label" htmlFor={id("weight")}>
            Peso declarado (kg)
          </label>
          <input id={id("weight")} className="input" value={f.weight} onChange={set("weight")} inputMode="decimal" placeholder="1,2" required />
        </div>
        <div>
          <label className="label" htmlFor={id("city")}>
            Ciudad de destino
          </label>
          <select id={id("city")} className="input" value={f.city} onChange={set("city")} required>
            <option value="">Elige…</option>
            {CIUDADES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor={id("photo")}>
          Foto del paquete <span className="font-normal text-slate-400">(link; con el código {o.code} escrito a mano)</span>
        </label>
        <input id={id("photo")} className="input" value={f.photo} onChange={set("photo")} inputMode="url" placeholder="https://…" />
      </div>
      {o.category === "Celular" && (
        <div>
          <label className="label" htmlFor={id("imei")}>
            IMEI del celular <span className="font-normal text-slate-400">(obligatorio; marca *#06# en el equipo)</span>
          </label>
          <input id={id("imei")} className="input" value={f.imei} onChange={set("imei")} inputMode="numeric" placeholder="15 dígitos" />
        </div>
      )}
      <ErrorBox error={error} />
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? <Spinner /> : null} Marcar como enviado
      </button>
      <Progress steps={progress.steps} />
    </form>
  );
}
