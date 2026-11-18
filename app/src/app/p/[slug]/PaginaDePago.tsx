"use client";

import QRCode from "qrcode";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ShipDeadline, Countdown, PublicRecord, fmtLeft, useNow } from "@/components/Guardian";
import { Breakdown, SplitView, Timeline, TxList } from "@/components/OrderBits";
import { ErrorBox, Progress, Spinner, StatusBadge, useProgress } from "@/components/ui";
import { NumerosTienda } from "@/components/Kpis";
import { desdeTexto } from "@/lib/kpi-format";
import { WhatsAppBox } from "@/components/WhatsAppBox";
import {
  CIUDADES,
  DOLLAR_NOTE,
  MOTIVOS,
  MOTIVOS_CON_VIDEO,
  MOTIVO_PRESION,
  PROTECCION,
  fmtBs,
  fmtBsUnits,
  fmtDate,
  unitsToNumber,
} from "@/lib/format";
import type { OrderView } from "@/lib/types";
import { activateWallet, api, getWallet, signAndSubmit, type PreparedTx } from "@/lib/wallet";
import { waLink, waText } from "@/lib/whatsapp";

const MOTIVOS_COMPRADOR = MOTIVOS.filter((m) => m !== MOTIVO_PRESION);
const nf = (n: number) => n.toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PaginaDePago() {
  const { slug } = useParams<{ slug: string }>();
  const [v, setV] = useState<OrderView | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [problem, setProblem] = useState(false);
  const [ask, setAsk] = useState(false);
  const [pressure, setPressure] = useState(false);
  const [delivery, setDelivery] = useState<Record<string, string>>({});
  const progress = useProgress();
  const now = useNow();

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
  const host = typeof window === "undefined" ? "" : window.location.host;
  const isBuyer = Boolean(me && me === o.buyer_pubkey);
  const takenByOther = Boolean(o.buyer_pubkey && !isBuyer && o.status === "esperando_pago");
  const total = fmtBsUnits(o.amount_units, o.fx);
  const d = {
    product: o.product,
    price: fmtBs(o.price_bs_cents),
    url,
    store: v.seller.store_name,
    reason: o.dispute_reason,
    buyerPct: o.buyer_bps != null ? o.buyer_bps / 100 : undefined,
    amount: v.breakdown ? fmtBsUnits(v.breakdown.seller, o.fx) : undefined,
  };

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

  const pagar = (delivery: Record<string, string>) =>
    run(async () => {
      // El comprador no ve ningún login: la cuenta se crea sola e invisible en este dispositivo.
      const wallet = getWallet("comprador");
      const LW = "Preparando tu pago en este dispositivo";
      progress.push(LW);
      const pk = await wallet.connect();
      setMe(pk);
      await activateWallet(wallet);
      progress.finish(LW);
      const L = "Banco: pago simulado y contrato del pedido creado";
      progress.push(L);
      const prepared = await api<PreparedTx>(`/api/orders/${slug}/pay`, { buyer: pk, ...delivery });
      progress.finish(L);
      await signAndSubmit(wallet, prepared, progress.push);
      setQrOpen(false);
    });

  const accion = (action: "confirm" | "dispute" | "extend", extra: Record<string, string> = {}) =>
    run(async () => {
      const wallet = getWallet("comprador");
      // "Necesito más tiempo" tiene su propia ruta (pp_guardian v2 `extend`, una sola vez).
      const path = action === "extend" ? `/api/orders/${slug}/extend` : `/api/orders/${slug}/action`;
      const prepared = await api<PreparedTx>(path, { action, signer: wallet.publicKey(), ...extra });
      await signAndSubmit(wallet, prepared, progress.push);
      setProblem(false);
      setAsk(false);
    });

  const canConfirm = o.status === "enviado" && o.confirm_after != null && now >= o.confirm_after;

  return (
    <div className="mx-auto max-w-md space-y-4">
      {o.status === "esperando_pago" ? (
        <>
          <ProductCard v={v} />
          <SellerCard v={v} />
          <Promesa v={v} />
          <ProtectionLine v={v} />
          {takenByOther ? (
            <p className="card text-center text-sm text-slate-600">Este link ya lo está pagando otra persona.</p>
          ) : !qrOpen && !busy ? (
            <DeliveryForm
              total={total}
              onSubmit={(x) => {
                setDelivery(x);
                setQrOpen(true);
              }}
            />
          ) : (
            <QrPanel v={v} busy={busy} onPay={() => pagar(delivery)} />
          )}
          <Progress steps={progress.steps} />
          <ErrorBox error={error} />
          <AntiFraud code={o.code} host={host} />
        </>
      ) : (
        <>
          <StatusHero v={v} />
          <ErrorBox error={error} />
          <Progress steps={progress.steps} />
          {pressure && (
            <div data-testid="aviso-presion" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">⚠️ Nunca pagues al vendedor porque te lo pide.</p>
              <p className="mt-1">Abrimos un reclamo por presión para confirmar y le avisamos al revisor. Tu plata sigue guardada en el contrato.</p>
            </div>
          )}
          <PublicRecord v={o.verification} escrowId={o.escrow_id} />

          {o.ship_imei && (o.status === "enviado" || o.status === "en_disputa") && (
            <div data-testid="imei" className="card space-y-1 text-sm">
              <p className="font-semibold">📱 IMEI declarado por el vendedor: <span className="font-mono">{o.ship_imei}</span></p>
              <p className="text-slate-600">Marca *#06# en el equipo y compara. Si no coincide, no pagues y abre un reclamo.</p>
            </div>
          )}

          {isBuyer && o.status === "pagado" && !problem && (
            <div className="card space-y-2 text-sm text-slate-600">
              <p>Podrás pagar al vendedor cuando registre el envío y lo tengas en tus manos.</p>
              <button className="btn-danger w-full" disabled={busy} onClick={() => setProblem(true)}>
                Tengo un problema
              </button>
            </div>
          )}

          {isBuyer && o.status === "enviado" && !problem && !ask && (
            <section className="card space-y-2" data-testid="confirmar">
              <button className="btn-primary w-full py-4 text-lg" disabled={!canConfirm || busy} onClick={() => setAsk(true)}>
                {busy ? <Spinner /> : null} Pagar al vendedor (irreversible)
              </button>
              <p className="text-center text-xs font-medium text-slate-600">Después ya no puedes reclamar.</p>
              {!canConfirm && o.confirm_after && (
                <p data-testid="espera-confirmar" className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                  Se habilita en <strong className="tabular-nums">{fmtLeft(o.confirm_after - now)}</strong>: {v.confirmDelay} después del envío, para que
                  alcances a recibir y revisar el producto.
                </p>
              )}
              <button className="btn-danger w-full" disabled={busy} onClick={() => setProblem(true)}>
                Tengo un problema
              </button>
            </section>
          )}

          {ask && (
            <section className="card space-y-3 ring-2 ring-brand-200" data-testid="pregunta-confirmar">
              <h2 className="text-lg font-bold">¿Tienes el producto en tus manos y lo revisaste?</h2>
              <button className="btn-primary w-full" disabled={busy} onClick={() => accion("confirm")}>
                {busy ? <Spinner /> : null} Sí, lo tengo y está bien
              </button>
              <button className="btn-secondary w-full" disabled={busy} onClick={() => setAsk(false)}>
                Todavía no
              </button>
              <button
                className="btn-danger w-full"
                disabled={busy}
                onClick={() => {
                  setPressure(true);
                  accion("dispute", { reason: MOTIVO_PRESION, text: "El vendedor me pide que confirme antes de tener el producto." });
                }}
              >
                El vendedor me pide que confirme
              </button>
            </section>
          )}

          {problem && <ProblemForm busy={busy} priceBsCents={o.price_bs_cents} onCancel={() => setProblem(false)} onSubmit={(x) => accion("dispute", x)} />}

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
              onReleased={load}
              capabilities={v.capabilities}
              role="comprador"
              extended={o.extended}
              onExtend={isBuyer ? () => accion("extend") : undefined}
            />
          </section>

          {o.status === "liberado" && (
            <section className="card space-y-3">
              <h2 className="font-bold">Así se repartió el pago</h2>
              <Breakdown money={v} fx={o.fx} feePayer={o.fee_payer} platformBps={v.platformFeeBps} />
            </section>
          )}
          {o.status === "resuelto" && (
            <section className="card space-y-3">
              <h2 className="font-bold">Decisión del revisor</h2>
              <SplitView money={v} buyerBps={o.buyer_bps} fx={o.fx} />
            </section>
          )}
          {o.status === "devuelto" && (
            <section className="card space-y-3" data-testid="devolucion">
              <h2 className="font-bold">Devolución por falta de despacho</h2>
              <p className="text-sm text-slate-600">El vendedor no registró el envío antes del plazo. El contrato devolvió el pago al comprador.</p>
              <SplitView money={v} buyerBps={o.buyer_bps} fx={o.fx} />
            </section>
          )}

          {isBuyer && o.status === "pagado" && <WhatsAppBox title="Avísale al vendedor" text={waText("pagado", d)} phone={v.seller.whatsapp} />}
          {isBuyer && o.status === "liberado" && <WhatsAppBox title="Avísale al vendedor" text={waText("liberado", d)} phone={v.seller.whatsapp} />}
          {isBuyer && o.status === "en_disputa" && <WhatsAppBox title="Avísale al vendedor" text={waText("disputa", d)} phone={v.seller.whatsapp} />}
          {o.status === "resuelto" && <WhatsAppBox title="Compartir la decisión" text={waText("resuelto", d)} phone={v.seller.whatsapp} />}

          <ProductCard v={v} compact />
          <SellerCard v={v} />

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
          <AntiFraud code={o.code} host={host} />
        </>
      )}
      <p className="text-center text-xs text-slate-500" data-testid="modo-practica">
        Modo práctica: no se mueve dinero real. {DOLLAR_NOTE}
      </p>
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
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-700" data-testid="codigo">
          Compra protegida · {o.code}
        </p>
        <h1 className={compact ? "mt-1 font-semibold" : "mt-1 text-2xl font-bold"} data-testid="producto">
          {o.product}
        </h1>
        {o.description && !compact && <p className="mt-1 text-slate-600">{o.description}</p>}
        <p className={compact ? "muted" : "mt-3 text-4xl font-extrabold tracking-tight"}>{fmtBs(o.price_bs_cents)}</p>
        <p className="text-sm text-slate-500">
          Entrega en {o.delivery_days} {o.delivery_days === 1 ? "día" : "días"}
          {o.category ? ` · ${o.category}` : ""}
        </p>
      </div>
    </section>
  );
}

function SellerCard({ v }: { v: OrderView }) {
  const s = v.seller;
  // Los mismos números del perfil público /tienda/<slug>, calculados con el registro público.
  const k = s.kpis;
  const initials = s.store_name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <section className="card space-y-3" data-testid="vendedor">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-brand-600 font-bold text-white">{initials}</div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            Vendedor: {s.store_name}
            {s.city ? ` · ${s.city}` : ""}
          </p>
          <p className="text-xs text-slate-600">
            {k.pagadas_al_vendedor} {k.pagadas_al_vendedor === 1 ? "venta protegida" : "ventas protegidas"}, {k.reclamos.total} {k.reclamos.total === 1 ? "reclamo" : "reclamos"}
          </p>
        </div>
        <a className="btn-secondary flex-none !px-3 !py-2 text-sm" href={waLink("Hola, te escribo por tu link de Pago Protegido", s.whatsapp)} target="_blank" rel="noreferrer">
          Escribir
        </a>
      </div>
      <NumerosTienda k={k} compacto />
      <ul className="space-y-0.5 text-xs text-slate-600">
        <li>{desdeTexto(k, s.since)}</li>
        {k.reclamos.total > 0 && (
          <li>
            Reclamos: {k.reclamos.a_favor_comprador} a favor del comprador · {k.reclamos.a_favor_vendedor} a favor del vendedor · {k.reclamos.repartidos} repartidos
            {k.reclamos.en_revision ? ` · ${k.reclamos.en_revision} en revisión` : ""}
          </li>
        )}
        <li>Verificación de identidad: pendiente (modo práctica)</li>
        <li>WhatsApp {s.whatsapp}</li>
      </ul>
      {s.slug && (
        <a className="inline-block text-sm font-semibold text-brand-700 underline" href={`/tienda/${s.slug}`} data-testid="link-perfil-tienda">
          Ver el perfil de la tienda y su historial →
        </a>
      )}
    </section>
  );
}

function Promesa({ v }: { v: OrderView }) {
  const o = v.order;
  // Plazos v2 (DECISIONES 77): despacho desde el pago y revisión desde el envío.
  const shipSecs = o.ship_secs ?? o.window_secs ?? o.delivery_days * 86400;
  const inspectSecs = o.inspect_secs ?? o.window_secs ?? (o.delivery_days + 3) * 86400;
  const shipBy = Date.now() + shipSecs * 1000;
  const dur = (s: number) => (s >= 86400 ? `${Math.round(s / 86400)} días` : `${Math.round(s / 60)} minutos`);
  const steps = [
    "Pagas con QR desde tu banco.",
    "Tu pago queda guardado. El vendedor ve que pagaste, pero no puede cobrar.",
    "Cuando te llegue, lo revisas y confirmas. Recién ahí se le paga.",
  ];
  return (
    <section className="card space-y-3" data-testid="promesa">
      <h2 className="text-lg font-bold">Tu plata no llega al vendedor hasta que recibas tu pedido.</h2>
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={s} className="flex gap-3 text-sm">
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      <div className="rounded-xl bg-slate-50 p-3 text-sm">
        <p className="font-semibold">¿Y si no llega?</p>
        <p className="text-slate-600">
          Si el vendedor no lo despacha hasta el {fmtDate(shipBy)} (aprox.), se te devuelve solo, sin que tengas que reclamar. Si llega mal, un tercero revisa el reclamo.
        </p>
      </div>
      <p className="text-xs text-slate-500">
        Si no pagas ni reclamas, se le paga al vendedor {dur(inspectSecs)} después de que registre el envío. Si necesitas más tiempo para revisar, puedes pedirlo una vez. Te avisamos un día antes.
      </p>
    </section>
  );
}

function ProtectionLine({ v }: { v: OrderView }) {
  const o = v.order;
  const totalNum = unitsToNumber(o.amount_units) * o.fx;
  const prot = totalNum - o.price_bs_cents / 100;
  return (
    <section className="card space-y-1 text-sm" data-testid="proteccion">
      <div className="flex justify-between">
        <span>Precio</span>
        <span>{fmtBs(o.price_bs_cents)}</span>
      </div>
      {o.fee_payer === "comprador" ? (
        <div className="flex justify-between">
          <span>
            Protección ({PROTECCION.pct.toLocaleString("es-BO")}%, mín. Bs {PROTECCION.minBs}, máx. Bs {PROTECCION.maxBs})
          </span>
          <span>Bs {nf(prot)}</span>
        </div>
      ) : (
        <div className="flex justify-between text-slate-600">
          <span>Protección</span>
          <span>la paga el vendedor</span>
        </div>
      )}
      <div className="flex justify-between border-t border-slate-100 pt-1 text-base font-bold">
        <span>Total</span>
        <span>Bs {nf(totalNum)}</span>
      </div>
      {o.fee_payer === "comprador" && <p className="text-xs text-slate-500">El vendedor recibe el precio completo.</p>}
    </section>
  );
}

function DeliveryForm({ total, onSubmit }: { total: string; onSubmit: (x: Record<string, string>) => void }) {
  const [f, setF] = useState({ recipient: "", city: "", agency: "", whatsapp: "" });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="card space-y-3"
      data-testid="datos-entrega"
      onSubmit={(e) => {
        e.preventDefault();
        if (f.recipient.trim().length < 2) return setError("Escribe quién recibe el pedido");
        if (!f.city) return setError("Elige la ciudad de destino");
        setError(null);
        onSubmit({ recipient: f.recipient, city: f.city, agency: f.agency, ...(f.whatsapp.trim() ? { whatsapp: f.whatsapp } : {}) });
      }}
    >
      <h2 className="font-bold">¿A dónde lo envían?</h2>
      <div>
        <label className="label" htmlFor="recipient">
          Quién recibe
        </label>
        <input id="recipient" className="input" value={f.recipient} onChange={set("recipient")} placeholder="Nombre y apellido" />
      </div>
      <div>
        <label className="label" htmlFor="dest-city">
          Ciudad de destino
        </label>
        <select id="dest-city" className="input" value={f.city} onChange={set("city")}>
          <option value="">Elige…</option>
          {CIUDADES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="agency">
          Agencia preferida <span className="font-normal text-slate-400">(opcional)</span>
        </label>
        <input id="agency" className="input" value={f.agency} onChange={set("agency")} placeholder="Ej.: Trans Copacabana, terminal" />
      </div>
      <div>
        <label className="label" htmlFor="buyer-wa">
          Tu WhatsApp para avisarte <span className="font-normal text-slate-400">(opcional)</span>
        </label>
        <input id="buyer-wa" className="input" inputMode="tel" value={f.whatsapp} onChange={set("whatsapp")} placeholder="Ej.: 591 76543210" />
        <p className="mt-1 text-xs text-slate-500">Te avisamos cuando despachen y un día antes de la liberación. No se muestra a nadie.</p>
      </div>
      <ErrorBox error={error} />
      <button className="btn-primary w-full py-4 text-lg">🔒 Pagar {total} con QR</button>
    </form>
  );
}

function QrPanel({ v, busy, onPay }: { v: OrderView; busy: boolean; onPay: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const o = v.order;
  useEffect(() => {
    QRCode.toDataURL(`PAGO-PROTEGIDO-EJEMPLO|NO-ES-UN-QR-REAL|${o.code}|BOB ${(unitsToNumber(o.amount_units) * o.fx).toFixed(2)}`, { margin: 1, width: 220 })
      .then(setQr)
      .catch(() => {});
  }, [o.code, o.amount_units, o.fx]);
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
        <p className="text-xs text-slate-500">QR de ejemplo a nombre de Pago Protegido · {o.code}</p>
      </div>
      <p className="text-center text-2xl font-extrabold">{fmtBsUnits(o.amount_units, o.fx)}</p>
      <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900" data-testid="rampa-simulada">
        Rampa simulada en testnet. En producción la hace una entidad certificada por ASFI.
      </p>
      <button className="btn-primary w-full" disabled={busy} onClick={onPay}>
        {busy ? (
          <>
            <Spinner /> Procesando pago…
          </>
        ) : (
          "Simular pago del banco (modo práctica)"
        )}
      </button>
    </section>
  );
}

function AntiFraud({ code, host }: { code: string | null; host: string }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600" data-testid="antifraude">
      <p className="font-semibold text-slate-800">🛡️ Señales de confianza</p>
      <p className="mt-1">Si un QR de Pago Protegido está a nombre de una persona, es estafa.</p>
      <p className="mt-1">
        Verifica este link en{" "}
        <a className="underline" href={`/verificar?codigo=${code ?? ""}`}>
          {host}/verificar
        </a>{" "}
        con el código <strong>{code}</strong>.
      </p>
      <p className="mt-1">¿Dudas? Reenvía este link a nuestro WhatsApp y te decimos si es auténtico.</p>
    </section>
  );
}

function StatusHero({ v }: { v: OrderView }) {
  const o = v.order;
  const map = {
    pagado: { t: "Tu pago está guardado", d: "El vendedor ve que pagaste, pero no puede cobrar hasta que confirmes.", c: "bg-brand-600" },
    enviado: { t: "Tu pedido está en camino", d: "Tu pago sigue guardado. Cuando te llegue, revísalo y recién ahí paga al vendedor.", c: "bg-brand-600" },
    liberado: { t: "Se pagó al vendedor", d: "Confirmaste que lo recibiste bien. ¡Gracias por comprar protegido!", c: "bg-brand-700" },
    en_disputa: { t: "Reclamo abierto", d: "La plata quedó congelada en el contrato. Un revisor va a ver el caso.", c: "bg-amber-500" },
    resuelto: { t: "Reclamo resuelto", d: "El revisor repartió la plata entre comprador y vendedor.", c: "bg-violet-600" },
    devuelto: { t: "Te devolvimos tu pago", d: "El vendedor no despachó a tiempo, así que el contrato te devolvió la plata.", c: "bg-rose-600" },
    esperando_pago: { t: "", d: "", c: "" },
  }[o.status];
  return (
    <section className={`rounded-2xl p-5 text-white ${map.c}`} data-testid="estado-pedido">
      <p className="text-xs uppercase tracking-wide text-white/80">
        {o.code} · {o.product}
      </p>
      <h1 className="mt-1 text-2xl font-bold">{map.t}</h1>
      <p className="mt-1 text-sm text-white/90">{map.d}</p>
      <p className="mt-3 text-3xl font-extrabold">{fmtBsUnits(o.amount_units, o.fx)}</p>
    </section>
  );
}

function ProblemForm({
  busy,
  priceBsCents,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  priceBsCents: number;
  onCancel: () => void;
  onSubmit: (x: Record<string, string>) => void;
}) {
  const [reason, setReason] = useState<string>(MOTIVOS_COMPRADOR[1]);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState("");
  const [video, setVideo] = useState("");
  const needsVideo = MOTIVOS_CON_VIDEO.includes(reason) && priceBsCents >= 30000;
  return (
    <form
      className="card space-y-3 ring-2 ring-amber-200"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ reason, text, photo, video });
      }}
    >
      <h2 className="font-bold">¿Qué pasó?</h2>
      <p className="muted">Al enviar, la plata queda congelada y un revisor ve la evidencia de los dos lados. Arrepentirse no es motivo de reclamo.</p>
      <div>
        <label className="label" htmlFor="motivo">
          Motivo
        </label>
        <select id="motivo" className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
          {MOTIVOS_COMPRADOR.map((m) => (
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
          Foto del paquete cerrado <span className="font-normal text-slate-400">(link https://…)</span>
        </label>
        <input id="foto" className="input" value={photo} onChange={(e) => setPhoto(e.target.value)} inputMode="url" placeholder="https://…" />
      </div>
      <div>
        <label className="label" htmlFor="video">
          Video continuo del desempaque{" "}
          <span className="font-normal text-slate-400">{needsVideo ? "(obligatorio para este motivo desde Bs 300)" : "(opcional)"}</span>
        </label>
        <input id="video" className="input" value={video} onChange={(e) => setVideo(e.target.value)} inputMode="url" placeholder="https://…" />
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button className="btn flex-1 bg-amber-500 text-white hover:bg-amber-600" disabled={busy}>
          {busy ? <Spinner /> : null} Enviar reclamo
        </button>
      </div>
      <p className="text-xs text-slate-500">
        Política de reclamos completa en <a className="underline" href="/como-funciona#reclamos">Cómo funciona</a>.
      </p>
    </form>
  );
}
