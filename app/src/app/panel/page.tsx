"use client";

import { RespaldoCuenta, RetirarUsdc } from "@/components/mainnet/CuentaUsdc";
import { ES_MAINNET, TEXTO } from "@/lib/red";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Countdown, ShipDeadline } from "@/components/Guardian";
import { Breakdown, SplitView, TxList } from "@/components/OrderBits";
import { CopyButton, ErrorBox, Spinner, StatusBadge } from "@/components/ui";
import { IconoAlerta, IconoBalanza, IconoBillete, IconoCamion, IconoCandado, IconoCelular, IconoCheckCirculo, IconoChevronAbajo, IconoChevronDerecha, IconoInfo, IconoMas, IconoUsuario, IconoVolver } from "@/components/iconos";
import { Stat } from "@/components/Kpis";
import { Compartir } from "@/components/vendedor/Compartir";
import { EnvioForm } from "@/components/vendedor/EnvioForm";
import { Insignia } from "@/components/vendedor/Insignia";
import { LinkRapido } from "@/components/vendedor/LinkRapido";
import { PasarAMiBanco } from "@/components/vendedor/PasarAMiBanco";
import { Pendientes } from "@/components/vendedor/Pendientes";
import { fmtDuracion, fmtProporcion, nf as nfKpi, rotuloVentas } from "@/lib/kpi-format";
import { WhatsAppBox } from "@/components/WhatsAppBox";
import { fmtFlete } from "@/lib/comprador";
import { explorer, fmtBs, fmtBsUnits, fmtDate, fmtKg, fmtWhatsApp } from "@/lib/format";
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

/** Los pedidos que piden algo del vendedor van primero; después los abiertos; al final los cerrados. */
const PRIORIDAD: Record<string, number> = { pagado: 0, en_disputa: 0, esperando_pago: 1, enviado: 2, liberado: 3, resuelto: 3, devuelto: 3 };
const ordenar = (orders: SellerOrder[]) => [...orders].sort((a, b) => (PRIORIDAD[a.status] ?? 9) - (PRIORIDAD[b.status] ?? 9) || b.created_at - a.created_at);

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
      <div className="mx-auto max-w-md space-y-3 pt-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-exito-50 text-musgo">
          <IconoCandado className="h-6 w-6" />
        </span>
        <h1 className="text-3xl">Todavía no tienes tienda en este dispositivo</h1>
        <p className="text-base text-tinta-600">Crea tu tienda en 3 pasos y tu primer link.</p>
        <Link href="/vender" className="btn-primary w-full">
          Crear mi tienda
        </Link>
      </div>
    );
  if (!data)
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-sm text-tinta-600" aria-busy="true">
        {error ? (
          <ErrorBox error={error} />
        ) : (
          <>
            <Spinner className="h-6 w-6 text-musgo" />
            Cargando tu panel…
          </>
        )}
      </div>
    );

  const { seller } = data;
  const esPiloto = seller.pilot === 1;
  const orders = ordenar(data.orders);
  const fx = data.fx;
  const firstLink = primer && orders.length === 0;
  // Ventas en curso: la plata ya está guardada en el contrato y se cobra cuando el cliente confirma (lo que le llega al
  // vendedor, sin los pedidos en reclamo, que van aparte).
  const { enCurso, enReclamo } = ventasEnCurso(orders);
  const saldo = fmtBsUnits(data.balance, fx);
  const haySaldo = Number(data.balance) > 0;
  const hayVentas = data.kpis.pagadas_al_vendedor > 0;

  function irAlPedido(slug: string) {
    document.querySelector(`[data-testid="pedido-${slug}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setResaltado(slug);
    setTimeout(() => setResaltado((r) => (r === slug ? null : r)), 2500);
  }

  function duplicar(o: SellerOrder) {
    setCreated(null);
    setPlantilla({ ...duplicarLink(o), code: o.code ?? null });
    setFormKey((k) => k + 1);
    setTimeout(() => {
      document.getElementById("crear-link")?.scrollIntoView({ behavior: "smooth", block: "start" });
      document.getElementById("product")?.focus({ preventScroll: true });
    }, 50);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <section className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">Tu tienda</p>
          <h1 className="mt-1 text-3xl" data-testid="tienda">
            {seller.store_name}
          </h1>
          <p className="mt-1 text-sm text-tinta-600">
            {seller.city ? `${seller.city} · ` : ""}
            {fmtWhatsApp(seller.whatsapp)}
            {seller.completedSales > 0 ? ` · ${seller.completedSales} ${rotuloVentas(seller.completedSales, esPiloto)}` : ""}
          </p>
          <p className="mt-2 text-sm">
            <a className="enlace" href={explorer.account(seller.pubkey)} target="_blank" rel="noreferrer">
              Ver el registro público de tu cuenta
            </a>
          </p>
        </div>
        <div className="sm:w-80 sm:flex-none sm:text-right">
          <p className="eyebrow">Saldo cobrado</p>
          <p className={`mt-1 tracking-tight num ${haySaldo ? "font-display text-5xl leading-none" : "text-lg font-semibold text-tinta-700"}`} data-testid="saldo">
            {saldo}
          </p>
          {enCurso.cantidad > 0 && (
            <p className="mt-3 text-sm text-tinta-600" data-testid="por-cobrar">
              {enCurso.cantidad === 1 ? "Y 1 venta en curso" : `Y ${enCurso.cantidad} ventas en curso`} por {fmtBs(enCurso.netoBsCents)}, ya guardada
              {enCurso.cantidad === 1 ? "" : "s"} en el contrato: cobras cuando tu cliente confirma.
            </p>
          )}
          {enReclamo.cantidad > 0 && (
            <p className="mt-1 text-sm text-tinta-600" data-testid="en-reclamo">
              {enReclamo.cantidad === 1 ? "1 venta en reclamo" : `${enReclamo.cantidad} ventas en reclamo`}: hasta {fmtBs(enReclamo.hastaBsCents)}, según lo que
              decida el revisor.
            </p>
          )}
          {haySaldo ? (
            <button type="button" className="btn-secondary btn-sm mt-4 w-full sm:w-auto" aria-expanded={banco} onClick={() => setBanco((b) => !b)}>
              <IconoBillete className="h-4 w-4" />
              {ES_MAINNET ? "Retirar mis USDC" : "Pasar a mi banco"}
            </button>
          ) : (
            <p className="mt-1 text-sm text-tinta-500">Sin saldo por cobrar todavía.</p>
          )}
        </div>
      </section>

      {banco && ES_MAINNET && <RetirarUsdc role="vendedor" onHecho={() => load(seller.pubkey)} />}
      {ES_MAINNET && !banco && <RespaldoCuenta role="vendedor" />}
      {ES_MAINNET && info?.topeUsd && (
        <p className="caja-aviso" data-testid="tope-mainnet">
          {TEXTO.aviso} Máximo por compra: USD {info.topeUsd.toLocaleString("es-BO")} (Bs {(info.topeUsd * (info.fx ?? fx)).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}), con la protección incluida.
        </p>
      )}
      {banco && !ES_MAINNET && <PasarAMiBanco saldo={saldo} onCerrar={() => setBanco(false)} />}

      <p data-testid="antifraude-vendedor" className="flex gap-3 text-base text-tinta-700">
        <IconoInfo className="mt-0.5 h-5 w-5 flex-none text-musgo" />
        <span>
          <strong>Para cobrar no tienes que abrir ningún link.</strong> Lo que vendes te llega solo cuando el comprador confirma. Nadie de Trato te va a pedir
          códigos ni contraseñas.
        </span>
      </p>

      {created && (
        <section className="space-y-4 animate-aparecer" data-testid="link-creado">
          <div className="rounded-card border border-tinta-200 bg-white p-5 sm:p-6">
            <p className="flex items-center gap-2 text-lg font-semibold">
              <IconoCheckCirculo className="h-6 w-6 flex-none text-musgo" />
              Link listo
            </p>
            <p className="mt-1 max-w-[48ch] text-base text-tinta-600">Mándaselo a tu cliente. Cuando pague, la plata espera entre los dos hasta que confirme que recibió.</p>
            <code data-testid="link-url" className="mt-4 block truncate rounded-control bg-tinta-50 px-3.5 py-3 font-mono text-sm text-monte">
              {linkUrl(created)}
            </code>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {orders.some((x) => x.slug === created) && (
                <Compartir text={textoLink(orders.find((x) => x.slug === created)!, seller.store_name)} label="Compartir" className="btn-primary" testId="compartir-link" />
              )}
              <CopyButton text={linkUrl(created)} label="Copiar link" className="btn-secondary" testId="copiar-link" />
            </div>
          </div>
          {(() => {
            const o = orders.find((x) => x.slug === created);
            return o ? <WhatsAppBox title="Mensaje para tu cliente" text={textoLink(o, seller.store_name)} /> : null;
          })()}
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => {
              setCreated(null);
              setTimeout(() => document.getElementById("crear-link")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
            }}
          >
            <IconoMas className="h-4 w-4" />
            Crear otro link
          </button>
        </section>
      )}

      <Pendientes pedidos={orders} onIr={irAlPedido} />

      {!created && (
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
      )}

      <section className="space-y-2">
        <h2 className="text-lg">Pedidos</h2>
        {orders.length === 0 && (
          <div className="flex flex-col items-center gap-2 border-t border-tinta-200 py-10 text-center">
            <IconoBillete className="h-8 w-8 text-tinta-300" />
            <p className="text-base text-tinta-600">Todavía no tienes pedidos. Crea tu primer link y compártelo.</p>
          </div>
        )}
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

      <details className="group border-t border-tinta-200 pt-5" data-testid="kpis-vendedor" open={hayVentas}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-lg font-semibold [&::-webkit-details-marker]:hidden">
          Tus números
          <IconoChevronAbajo className="h-5 w-5 flex-none text-tinta-500 transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
          {seller.slug && (
            <Link href={`/tienda/${seller.slug}`} className="inline-flex items-center gap-1 text-sm font-semibold text-musgo" data-testid="link-mi-perfil">
              Ver y compartir mi perfil público
              <IconoChevronDerecha className="h-4 w-4" />
            </Link>
          )}
        </div>
        {!hayVentas && <p className="mt-2 text-sm text-tinta-600">Aparecen con tu primera venta protegida.</p>}
        <div className={`mt-3 grid grid-cols-3 gap-2 ${hayVentas ? "" : "hidden"}`}>
          <Stat
            testId="kpi-ventas"
            value={nfKpi(data.kpis.pagadas_al_vendedor)}
            label={rotuloVentas(data.kpis.pagadas_al_vendedor, esPiloto)}
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
        {hayVentas && <p className="mt-3 text-sm text-tinta-600">Calculados con el registro público de tus ventas: son los mismos que ven tus clientes en tu perfil.</p>}
      </details>

      {seller.slug && <Insignia slug={seller.slug} storeName={seller.store_name} kpis={data.kpis} piloto={esPiloto} />}

      <p className="text-center text-sm text-tinta-500">{TEXTO.aviso}</p>
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
  const envio = [o.ship_company, o.ship_tracking && `guía ${o.ship_tracking}`, o.ship_weight && fmtKg(`${o.ship_weight} kg`)].filter(Boolean).join(" · ");

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
    <article ref={ref} className={`scroll-mt-20 space-y-4 border-t border-tinta-200 py-6 transition-colors duration-300 ${focused || resaltado ? "rounded-card border-transparent bg-exito-50 px-4" : ""}`} data-testid={`pedido-${o.slug}`}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">{o.code}</p>
          <h3 className="truncate text-lg">{o.product}</h3>
          <p className="text-sm text-tinta-600 num">
            {fmtBs(o.price_bs_cents)} · {fmtDate(o.created_at)}
            {o.fee_payer === "vendedor" ? " · protección regalada" : ""}
          </p>
        </div>
        <div className="flex flex-none flex-col items-end gap-1.5">
          <StatusBadge status={o.status} />
          <button type="button" className="text-sm font-medium text-musgo" onClick={onDuplicar} data-testid="duplicar">
            Duplicar
          </button>
        </div>
      </header>

      {o.status === "esperando_pago" && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <code className="flex-1 truncate rounded-control bg-tinta-50 px-3 py-2.5 text-sm ring-1 ring-tinta-200">{url}</code>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <CopyButton text={url} label="Copiar link" className="btn-secondary btn-sm" />
            <Compartir text={textoLink(o, store)} className="btn-primary btn-sm" />
          </div>
        </div>
      )}

      {o.recipient_name && o.status !== "esperando_pago" && (
        <div data-testid="datos-entrega-vendedor" className="space-y-1.5 text-base text-tinta-700">
          <p className="flex items-start gap-2">
            <IconoUsuario className="mt-0.5 h-4 w-4 flex-none text-musgo" />
            <span>
              Envía a: <strong>{o.recipient_name}</strong> · {o.dest_city}
              {o.pref_agency ? ` · agencia preferida: ${o.pref_agency}` : ""}
            </span>
          </p>
          {o.pickup_phone && (
            <p className="flex items-start gap-2" data-testid="telefono-recoge">
              <IconoCelular className="mt-0.5 h-4 w-4 flex-none text-musgo" />
              <span>
                Teléfono de quien recoge:{" "}
                <a className="font-semibold text-musgo underline decoration-exito-200 underline-offset-2" href={`tel:${o.pickup_phone}`}>
                  {o.pickup_phone}
                </a>
              </span>
            </p>
          )}
          {fmtFlete(o.flete) && (
            <p className="flex items-start gap-2" data-testid="flete-pedido">
              <IconoCamion className="mt-0.5 h-4 w-4 flex-none text-musgo" />
              <span>{fmtFlete(o.flete)}</span>
            </p>
          )}
        </div>
      )}

      {o.status === "pagado" && (
        <>
          <div className="flex gap-3 text-base text-tinta-700">
            <IconoCandado className="mt-0.5 h-5 w-5 flex-none text-musgo" />
            <span>
              Tu cliente pagó y la plata espera entre los dos en el contrato. Despacha y registra el envío: cobras cuando tu cliente confirme que lo recibió
              o, si no dice nada, al terminar su tiempo de revisión.
              {focused && <span className="mt-1 block font-semibold">Vienes desde el asistente de WhatsApp: revisa la guía y confirma con tu cuenta.</span>}
            </span>
          </div>
          <EnvioForm o={o} sellerPubkey={sellerPubkey} prefill={prefill} onDone={onChange} />
          <WhatsAppBox title="Mensaje para tu cliente" text={waText("despacho", d)} />
        </>
      )}

      {o.status === "enviado" && (
        <>
          <p className="flex items-start gap-2 text-base text-tinta-600">
            <IconoCamion className="mt-0.5 h-5 w-5 flex-none text-musgo" />
            <span>
              Enviado: <strong>{envio}</strong>. Cuando tu cliente confirme, se te paga{o.deadline ? `; si no dice nada, el ${fmtDate(o.deadline)}` : ""}.
            </span>
          </p>
          <WhatsAppBox title="Avísale a tu cliente" text={waText("enviado", d)} />
        </>
      )}
      <ShipDeadline shipDeadline={o.ship_deadline} status={o.status} role="vendedor" />
      <Countdown slug={o.slug} deadline={o.deadline} status={o.status} mode={mode} onReleased={onChange} capabilities={capabilities} role="vendedor" extended={o.extended} />
      {o.status === "devuelto" && (
        <p data-testid="devuelto-vendedor" className="flex items-start gap-2 text-sm font-medium text-aviso-700">
          <IconoVolver className="mt-0.5 h-5 w-5 flex-none" />
          <span>
            No registraste el envío antes del {o.ship_deadline ? new Date(o.ship_deadline).toLocaleString("es-BO", { timeZone: "America/La_Paz" }) : "plazo"}: el pago volvió al
            comprador.
          </span>
        </p>
      )}

      {o.status === "liberado" && (
        <>
          <p className="flex items-center gap-2 text-base font-medium text-musgo">
            <IconoCheckCirculo className="h-5 w-5 flex-none" />
            Tu cliente confirmó. Ya se te pagó.
          </p>
          <Breakdown money={o} fx={o.fx} feePayer={o.fee_payer} platformBps={o.platform_bps ?? 200} />
        </>
      )}

      {o.status === "en_disputa" && (
        <>
          <div className="caja-aviso flex gap-3">
            <IconoAlerta className="mt-0.5 h-5 w-5 flex-none" />
            <div>
              <p className="font-semibold">Reclamo abierto: {o.dispute_reason}</p>
              {o.dispute_text && <p className="mt-1">“{o.dispute_text}”</p>}
              <p className="mt-1 text-xs">La plata queda congelada en el contrato hasta que decida el revisor. Responde dentro de 48 h.</p>
            </div>
          </div>
          <form onSubmit={sendReply} className="space-y-2">
            <label className="label" htmlFor={`rp-${o.slug}`}>
              Tu versión para el revisor
            </label>
            <textarea id={`rp-${o.slug}`} className="input min-h-20" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Comprobante de la empresa, foto del producto en el paquete con el código del pedido…" />
            <button className="btn-secondary w-full">{o.seller_reply ? "Actualizar mi versión" : "Enviar mi versión"}</button>
          </form>
          {!o.shipped_at && o.ship_deadline && o.ship_deadline > Date.now() && (
            <div data-testid="envio-con-reclamo" className="space-y-2">
              <p className="text-sm text-tinta-700">
                ¿Ya despachaste? Registra el envío igual: queda como prueba para el revisor y frena la devolución automática por falta de despacho.
              </p>
              <EnvioForm o={o} sellerPubkey={sellerPubkey} prefill={null} onDone={onChange} />
            </div>
          )}
        </>
      )}

      {o.status === "resuelto" && (
        <>
          <p className="flex items-center gap-2 text-sm font-medium text-info-700">
            <IconoBalanza className="h-5 w-5 flex-none" />
            El revisor resolvió el reclamo.
          </p>
          <SplitView money={o} buyerBps={o.buyer_bps} fx={o.fx} />
          <WhatsAppBox title="Mensaje para tu cliente" text={waText("resuelto", d)} />
        </>
      )}

      <ErrorBox error={error} />

      {o.txs.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-base font-medium text-tinta-600">Movimientos ({o.txs.length})</summary>
          <TxList txs={o.txs} />
        </details>
      )}
      {o.escrow_id && (
        <p className="text-sm">
          <a className="enlace" href={explorer.contract(o.escrow_id)} target="_blank" rel="noreferrer">
            Ver el registro público del pedido
          </a>
        </p>
      )}
    </article>
  );
}
