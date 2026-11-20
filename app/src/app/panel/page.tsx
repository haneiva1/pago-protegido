"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Countdown, ShipDeadline } from "@/components/Guardian";
import { Breakdown, SplitView, TxList } from "@/components/OrderBits";
import { CopyButton, ErrorBox, ExplorerLink, Spinner, StatusBadge } from "@/components/ui";
import { Stat } from "@/components/Kpis";
import { Compartir } from "@/components/vendedor/Compartir";
import { EnvioForm } from "@/components/vendedor/EnvioForm";
import { Insignia } from "@/components/vendedor/Insignia";
import { LinkRapido } from "@/components/vendedor/LinkRapido";
import { PasarAMiBanco } from "@/components/vendedor/PasarAMiBanco";
import { Pendientes } from "@/components/vendedor/Pendientes";
import { fmtDuracion, fmtProporcion, nf as nfKpi } from "@/lib/kpi-format";
import { WhatsAppBox } from "@/components/WhatsAppBox";
import { fmtFlete } from "@/lib/comprador";
import { DOLLAR_NOTE, explorer, fmtBs, fmtBsUnits, fmtDate } from "@/lib/format";
import type { InfoData, SellerData, SellerOrder } from "@/lib/types";
import { apiFirmada } from "@/lib/api-firmada";
import { duplicarLink, ventasEnCurso, type LinkRapido as DatosLink } from "@/lib/vendedor";
import { api, getWallet } from "@/lib/wallet";
import { waText } from "@/lib/whatsapp";

const origin = () => (typeof window === "undefined" ? "" : window.location.origin);
const linkUrl = (slug: string) => `${origin()}/p/${slug}`;
/** Mensaje para el cliente, listo para WhatsApp (con el flete, si el vendedor lo puso). */
const textoLink = (o: SellerOrder, store: string) =>
  waText("link", { product: o.product, price: fmtBs(o.price_bs_cents), url: linkUrl(o.slug), store, flete: fmtFlete(o.flete) });

export default function Panel() {
  const [pk, setPk] = useState<string | null | undefined>(undefined);
  const [data, setData] = useState<SellerData | null>(null);
  const [info, setInfo] = useState<InfoData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [primer, setPrimer] = useState(false);
  const [demo, setDemo] = useState(false);
  const [enviar, setEnviar] = useState<{ slug: string; evidencia: string } | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [plantilla, setPlantilla] = useState<(DatosLink & { code: string | null }) | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [banco, setBanco] = useState(false);
  const [resaltado, setResaltado] = useState<string | null>(null);

  const load = useCallback(async (p: string) => {
    try {
      setData(await apiFirmada<SellerData>(getWallet("vendedor"), `/api/sellers/${p}/panel`));
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
  // Ventas en curso: la plata ya está guardada en el contrato y se cobra cuando el cliente confirma (lo que le llega al
  // vendedor, sin los pedidos en reclamo, que van aparte).
  const { enCurso, enReclamo } = ventasEnCurso(orders);
  const saldo = fmtBsUnits(data.balance, fx);

  function irAlPedido(slug: string) {
    document.querySelector(`[data-testid="pedido-${slug}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setResaltado(slug);
    setTimeout(() => setResaltado((r) => (r === slug ? null : r)), 2500);
  }

  function duplicar(o: SellerOrder) {
    setPlantilla({ ...duplicarLink(o), code: o.code ?? null });
    setFormKey((k) => k + 1);
    setTimeout(() => {
      document.getElementById("crear-link")?.scrollIntoView({ behavior: "smooth", block: "start" });
      document.getElementById("product")?.focus({ preventScroll: true });
    }, 50);
  }

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
            {saldo}
          </p>
          {enCurso.cantidad > 0 && (
            <p className="mt-1 text-xs text-brand-100" data-testid="por-cobrar">
              {enCurso.cantidad === 1 ? "Y 1 venta en curso" : `Y ${enCurso.cantidad} ventas en curso`} por {fmtBs(enCurso.netoBsCents)}, ya guardada
              {enCurso.cantidad === 1 ? "" : "s"} en el contrato: cobras cuando tu cliente confirma.
            </p>
          )}
          {enReclamo.cantidad > 0 && (
            <p className="mt-1 text-xs text-brand-100" data-testid="en-reclamo">
              {enReclamo.cantidad === 1 ? "1 venta en reclamo" : `${enReclamo.cantidad} ventas en reclamo`}: hasta {fmtBs(enReclamo.hastaBsCents)}, según lo que
              decida el revisor.
            </p>
          )}
          <button
            type="button"
            className="mt-3 w-full rounded-xl bg-white/15 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/40 hover:bg-white/25"
            aria-expanded={banco}
            onClick={() => setBanco((b) => !b)}
          >
            🏦 Pasar a mi banco
          </button>
        </div>
      </section>

      {banco && <PasarAMiBanco saldo={saldo} onCerrar={() => setBanco(false)} />}

      <p data-testid="antifraude-vendedor" className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
        🛡️ <strong>Para cobrar no tienes que abrir ningún link.</strong> Lo que vendes te llega solo cuando el comprador confirma. Nadie de Trato te va a
        pedir códigos ni contraseñas.
      </p>

      <Pendientes pedidos={orders} onIr={irAlPedido} />

      <LinkRapido
        key={formKey}
        sellerPubkey={seller.pubkey}
        fx={info?.fx ?? fx}
        title={firstLink ? "Tu primer link" : "Crear link"}
        demo={demo}
        plantilla={plantilla}
        onCreated={(slug) => {
          setCreated(slug);
          setPlantilla(null);
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
              <>
                <Compartir text={textoLink(o, seller.store_name)} label="Compartir con tu cliente" className="btn-primary w-full" testId="compartir-link" />
                <WhatsAppBox title="Mensaje para tu cliente" text={textoLink(o, seller.store_name)} />
              </>
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
            resaltado={resaltado === o.slug}
            onDuplicar={() => duplicar(o)}
            onChange={() => load(seller.pubkey)}
          />
        ))}
      </section>

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

      {seller.slug && <Insignia slug={seller.slug} storeName={seller.store_name} kpis={data.kpis} />}

      <p className="text-center text-xs text-slate-500">Modo práctica: no se mueve dinero real. {DOLLAR_NOTE}</p>
    </div>
  );
}

function OrderCard({
  o,
  store,
  sellerPubkey,
  mode,
  capabilities,
  prefill,
  resaltado,
  onDuplicar,
  onChange,
}: {
  o: SellerOrder;
  store: string;
  sellerPubkey: string;
  mode: "direct" | "guardian";
  capabilities?: { extend: boolean; clockFromShipping: boolean; refundUnshipped?: boolean };
  prefill: string | null;
  resaltado: boolean;
  onDuplicar: () => void;
  onChange: () => void;
}) {
  const [reply, setReply] = useState(o.seller_reply ?? "");
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);
  const focused = prefill !== null;
  const url = linkUrl(o.slug);
  const d = { product: o.product, price: fmtBs(o.price_bs_cents), url, store, evidence: [o.ship_company, o.ship_tracking && `guía ${o.ship_tracking}`].filter(Boolean).join(" · ") || o.shipped_evidence, reason: o.dispute_reason, buyerPct: o.buyer_bps != null ? o.buyer_bps / 100 : undefined };

  useEffect(() => {
    if (prefill !== null) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [prefill]);

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFirmada(getWallet("vendedor"), `/api/orders/${o.slug}/reply`, { pubkey: sellerPubkey, text: reply });
      onChange();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <article ref={ref} className={`card scroll-mt-20 space-y-4 ${focused || resaltado ? "ring-2 ring-brand-500" : ""}`} data-testid={`pedido-${o.slug}`}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-brand-700">{o.code}</p>
          <h3 className="truncate font-semibold">{o.product}</h3>
          <p className="muted">
            {fmtBs(o.price_bs_cents)} · {o.fee_payer === "comprador" ? "protección la paga el comprador" : "protección la regalas tú"} · {fmtDate(o.created_at)}
          </p>
        </div>
        <div className="flex flex-none flex-col items-end gap-1.5">
          <StatusBadge status={o.status} />
          <button type="button" className="text-xs font-semibold text-brand-700 underline" onClick={onDuplicar} data-testid="duplicar">
            Duplicar
          </button>
        </div>
      </header>

      {o.status === "esperando_pago" && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <code className="flex-1 truncate rounded-xl bg-slate-100 px-3 py-2.5 text-sm">{url}</code>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <CopyButton text={url} label="Copiar link" className="btn-secondary !py-2 text-sm" />
            <Compartir text={textoLink(o, store)} className="btn-primary !py-2 text-sm" />
          </div>
        </div>
      )}

      {o.recipient_name && o.status !== "esperando_pago" && (
        <div data-testid="datos-entrega-vendedor" className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
          <p>
            📍 Envía a: <strong>{o.recipient_name}</strong> · {o.dest_city}
            {o.pref_agency ? ` · agencia preferida: ${o.pref_agency}` : ""}
          </p>
          {o.pickup_phone && (
            <p data-testid="telefono-recoge">
              📞 Teléfono de quien recoge:{" "}
              <a className="font-semibold text-brand-700 underline" href={`tel:${o.pickup_phone}`}>
                {o.pickup_phone}
              </a>
            </p>
          )}
          {fmtFlete(o.flete) && <p data-testid="flete-pedido">🚚 {fmtFlete(o.flete)}</p>}
        </div>
      )}

      {o.status === "pagado" && (
        <>
          <div className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900">
            💰 Tu cliente pagó y el pago está guardado en el contrato. Despacha y registra el envío: cobras cuando tu cliente confirme que lo recibió o,
            si no dice nada, al terminar su tiempo de revisión.
            {focused && <span className="mt-1 block font-semibold">Vienes desde el asistente de WhatsApp: revisa la guía y confirma con tu cuenta.</span>}
          </div>
          <EnvioForm o={o} sellerPubkey={sellerPubkey} prefill={prefill} onDone={onChange} />
          <WhatsAppBox title="Mensaje para tu cliente" text={waText("despacho", d)} />
        </>
      )}

      {o.status === "enviado" && (
        <>
          <p className="text-sm text-slate-600">
            📦 Enviado: <strong>{[o.ship_company, o.ship_tracking && `guía ${o.ship_tracking}`, o.ship_weight && `${o.ship_weight} kg`].filter(Boolean).join(" · ")}</strong>. Cuando
            tu cliente confirme, se te paga{o.deadline ? `; si no dice nada, el ${fmtDate(o.deadline)}` : ""}.
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
