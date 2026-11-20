"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PublicRecord, useNow } from "@/components/Guardian";
import { ErrorBox, Progress, useProgress } from "@/components/ui";
import { WhatsAppBox } from "@/components/WhatsAppBox";
import { AvisoNavegadorInterno, CompraEnEsteNavegador, OtroNavegador } from "@/components/comprador/AccesoCompra";
import { BarraPagar, ComoFunciona, DosSalidas, HojaEntrega, Producto, Proteccion, type DatosEntrega } from "@/components/comprador/Checkout";
import { ConfirmarPago, PreguntaConfirmar } from "@/components/comprador/Confirmar";
import { Antifraude, Esqueleto, EstadoPedido, LinkNoEncontrado } from "@/components/comprador/Estado";
import { PagoQr } from "@/components/comprador/PagoQr";
import { Reclamo } from "@/components/comprador/Reclamo";
import { Cierre, LineaDeTiempo, RegistroPedido } from "@/components/comprador/Registro";
import { Seguimiento, useRecogido } from "@/components/comprador/Seguimiento";
import { TarjetaVendedor } from "@/components/comprador/Vendedor";
import { ApiError, api } from "@/lib/api";
import { DOLLAR_NOTE, MOTIVO_PRESION, fmtBs, fmtBsUnits } from "@/lib/format";
import type { OrderView } from "@/lib/types";
import type { PreparedTx } from "@/lib/wallet";
import { hayCuentaGuardada } from "@/lib/wallet/storage";
import { waText } from "@/lib/whatsapp";

// El módulo de la cuenta (SDK de la red) se carga recién al tocar "Pagar", o al abrir si este navegador ya pagó.
type WalletMod = typeof import("@/lib/wallet");
let walletMod: Promise<WalletMod> | null = null;
const cargarWallet = () => (walletMod ??= import("@/lib/wallet"));

export default function PaginaDePago() {
  const { slug } = useParams<{ slug: string }>();
  const [v, setV] = useState<OrderView | null>(null);
  const [noExiste, setNoExiste] = useState(false);
  /** undefined: todavía no se sabe; null: este navegador no tiene cuenta de comprador. */
  const [me, setMe] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hoja, setHoja] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [problem, setProblem] = useState(false);
  const [ask, setAsk] = useState(false);
  const [pressure, setPressure] = useState(false);
  const [delivery, setDelivery] = useState<DatosEntrega | null>(null);
  const progress = useProgress();
  const now = useNow();
  const [recogido, marcarRecogido] = useRecogido(slug);

  const load = useCallback(async () => {
    try {
      setV(await api<OrderView>(`/api/orders/${slug}?onchain=1`));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setNoExiste(true);
      else setError((e as Error).message);
    }
  }, [slug]);

  useEffect(() => {
    if (hayCuentaGuardada("comprador")) cargarWallet().then((w) => setMe(w.getWallet("comprador").publicKey()));
    else setMe(null);
    load();
  }, [load]);

  useEffect(() => {
    if (busy) return;
    const t = setInterval(load, 7000);
    return () => clearInterval(t);
  }, [busy, load]);

  const cerrarHoja = useCallback(() => setHoja(false), []);

  if (noExiste) return <LinkNoEncontrado />;
  if (!v) return error ? <div className="mx-auto max-w-md"><ErrorBox error={error} /></div> : <Esqueleto />;

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

  const pagar = (datos: DatosEntrega) =>
    run(async () => {
      // El comprador no ve ningún login: la cuenta se crea sola e invisible en este dispositivo.
      const { activateWallet, getWallet, signAndSubmit } = await cargarWallet();
      const wallet = getWallet("comprador");
      const LW = "Preparando tu pago en este dispositivo";
      progress.push(LW);
      const pk = await wallet.connect();
      setMe(pk);
      await activateWallet(wallet);
      progress.finish(LW);
      const L = "Banco: pago simulado y contrato del pedido creado";
      progress.push(L);
      const prepared = await api<PreparedTx>(`/api/orders/${slug}/pay`, { buyer: pk, ...datos });
      progress.finish(L);
      await signAndSubmit(wallet, prepared, progress.push);
      setQrOpen(false);
    });

  const accion = (action: "confirm" | "dispute" | "extend", extra: Record<string, string> = {}) =>
    run(async () => {
      const { getWallet, signAndSubmit } = await cargarWallet();
      const wallet = getWallet("comprador");
      // "Necesito más tiempo" tiene su propia ruta (pp_guardian v2 `extend`, una sola vez).
      const path = action === "extend" ? `/api/orders/${slug}/extend` : `/api/orders/${slug}/action`;
      const prepared = await api<PreparedTx>(path, { action, signer: wallet.publicKey(), ...extra });
      await signAndSubmit(wallet, prepared, progress.push);
      setProblem(false);
      setAsk(false);
    });

  if (o.status === "esperando_pago") {
    return (
      <div className="mx-auto max-w-md space-y-4 pb-28">
        <AvisoNavegadorInterno />
        <Producto v={v} compacto={qrOpen} />
        {takenByOther ? (
          <p className="card text-center text-sm text-slate-600" data-testid="tomado">
            Este link ya lo está pagando otra persona.
          </p>
        ) : qrOpen || busy ? (
          <PagoQr v={v} busy={busy} onPay={() => delivery && pagar(delivery)} />
        ) : null}
        <Progress steps={progress.steps} />
        <ErrorBox error={error} />
        {!qrOpen && (
          <>
            <DosSalidas v={v} />
            <Proteccion v={v} />
            <ComoFunciona />
            <TarjetaVendedor v={v} />
          </>
        )}
        <Antifraude code={o.code} host={host} />
        <ModoPractica />
        {!takenByOther && !qrOpen && !busy && (
          <BarraPagar
            total={total}
            onPagar={() => {
              cargarWallet(); // se adelanta la descarga mientras llena los datos de entrega
              setHoja(true);
            }}
          />
        )}
        <HojaEntrega
          total={total}
          abierta={hoja}
          aviso={<AvisoNavegadorInterno />}
          onCerrar={cerrarHoja}
          onContinuar={(x) => {
            setDelivery(x);
            setHoja(false);
            setQrOpen(true);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <EstadoPedido v={v} />
      {me !== undefined && !isBuyer && <OtroNavegador v={v} />}
      <ErrorBox error={error} />
      <Progress steps={progress.steps} />
      {pressure && (
        <div data-testid="aviso-presion" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">⚠️ Nunca pagues al vendedor porque te lo pide.</p>
          <p className="mt-1">Abrimos un reclamo por presión para confirmar y le avisamos al revisor. Tu plata sigue guardada en el contrato.</p>
        </div>
      )}
      <Seguimiento v={v} esComprador={isBuyer} recogido={recogido} busy={busy} onRecogido={marcarRecogido} onNoLlego={() => accion("extend")} />
      <PublicRecord v={o.verification} escrowId={o.escrow_id} status={o.status} role="comprador" />
      {isBuyer && (o.status === "pagado" || o.status === "enviado" || o.status === "en_disputa") && <CompraEnEsteNavegador />}

      {o.ship_imei && (o.status === "enviado" || o.status === "en_disputa") && (
        <div data-testid="imei" className="card space-y-1 text-sm">
          <p className="font-semibold">
            📱 IMEI declarado por el vendedor: <span className="font-mono">{o.ship_imei}</span>
          </p>
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
        <ConfirmarPago v={v} now={now} busy={busy} onPagar={() => setAsk(true)} onProblema={() => setProblem(true)} />
      )}

      {ask && (
        <PreguntaConfirmar
          busy={busy}
          onSi={() => accion("confirm")}
          onTodaviaNo={() => setAsk(false)}
          onPresion={() => {
            setPressure(true);
            accion("dispute", { reason: MOTIVO_PRESION, text: "El vendedor me pide que confirme antes de tener el producto." });
          }}
        />
      )}

      {problem && <Reclamo order={o} busy={busy} onCancel={() => setProblem(false)} onSubmit={(x) => accion("dispute", x)} />}

      <LineaDeTiempo v={v} onReload={load} onExtend={isBuyer ? () => accion("extend") : undefined} />
      <Cierre v={v} />

      {isBuyer && o.status === "pagado" && <WhatsAppBox title="Avísale al vendedor" text={waText("pagado", d)} phone={v.seller.whatsapp} />}
      {isBuyer && o.status === "liberado" && <WhatsAppBox title="Avísale al vendedor" text={waText("liberado", d)} phone={v.seller.whatsapp} />}
      {isBuyer && o.status === "en_disputa" && <WhatsAppBox title="Avísale al vendedor" text={waText("disputa", d)} phone={v.seller.whatsapp} />}
      {o.status === "resuelto" && <WhatsAppBox title="Compartir la decisión" text={waText("resuelto", d)} phone={v.seller.whatsapp} />}

      <Producto v={v} compacto />
      <TarjetaVendedor v={v} />
      <RegistroPedido v={v} />
      <Antifraude code={o.code} host={host} />
      <ModoPractica />
    </div>
  );
}

function ModoPractica() {
  return (
    <p className="text-center text-xs text-slate-500" data-testid="modo-practica">
      Modo práctica: no se mueve dinero real. {DOLLAR_NOTE}
    </p>
  );
}
