"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PublicRecord, useNow } from "@/components/Guardian";
import { IconoAlerta, IconoCelular, IconoWhatsApp } from "@/components/iconos";
import { ErrorBox, useProgress } from "@/components/ui";
import { WhatsAppBox } from "@/components/WhatsAppBox";
import { AvisoNavegadorInterno, CompraEnEsteNavegador, OtroNavegador } from "@/components/comprador/AccesoCompra";
import { BarraPagar, ComoFunciona, FormEntrega, PagoEmpezado, Producto, Promesa } from "@/components/comprador/Checkout";
import { ConfirmarPago, PreguntaConfirmar } from "@/components/comprador/Confirmar";
import { EsperaEnCurso } from "@/components/comprador/Espera";
import { AvisosWhatsApp } from "@/components/comprador/AvisosWhatsApp";
import { Antifraude, Esqueleto, EstadoPedido, LinkNoEncontrado } from "@/components/comprador/Estado";
import { RespaldoCuenta, RetirarUsdc } from "@/components/mainnet/CuentaUsdc";
import { PagoUsdc } from "@/components/mainnet/PagoUsdc";
import { PagoQr } from "@/components/comprador/PagoQr";
import { QrEscaneo } from "@/components/comprador/QrEscaneo";
import { canal } from "@/components/chat/pedido";
import { Reclamo } from "@/components/comprador/Reclamo";
import { Cierre, LineaDeTiempo, RegistroPedido } from "@/components/comprador/Registro";
import { Seguimiento, useRecogido } from "@/components/comprador/Seguimiento";
import { TarjetaVendedor } from "@/components/comprador/Vendedor";
import { ApiError, api } from "@/lib/api";
import { NO_CARGO_CUENTA, cargaUnaVez, mensajeDeError } from "@/lib/comprador";
import { borrarCompra, guardarCompra, intentoDePago, leerCompra, type CompraLocal, type DatosEntrega } from "@/lib/compra-local";
import { enProbar } from "@/lib/probar";
import { ES_MAINNET, TEXTO } from "@/lib/red";
import { MOTIVO_PRESION, fmtBs, fmtBsUnits } from "@/lib/format";
import type { OrderView } from "@/lib/types";
import { apiFirmada } from "@/lib/api-firmada";
import type { PreparedTx } from "@/lib/wallet";
import { hayAlgunComprador } from "@/lib/wallet/storage";
import { waLink, waText } from "@/lib/whatsapp";

// El módulo de la cuenta (SDK de la red) se carga recién al tocar "Pagar", o al abrir si este navegador ya pagó.
// Si el chunk no baja, el error lleva un texto para el comprador y la próxima llamada lo vuelve a intentar.
const cargarWallet = cargaUnaVez(() =>
  import("@/lib/wallet").catch(() => {
    throw new Error(NO_CARGO_CUENTA);
  }),
);

/** Qué espera está corriendo, para explicarla: el pago (varias transacciones) o una acción del pedido. */
type Espera = "pago" | "accion" | null;

/** Dentro de /probar el pago es el QR con "Escanear con mi banco": datos de entrega precargados, sin hoja. */
const ENTREGA_DEMO: DatosEntrega = { recipient: "Ana Pérez", city: "La Paz", agency: "" };

export default function PaginaDePago() {
  const { slug } = useParams<{ slug: string }>();
  const [v, setV] = useState<OrderView | null>(null);
  const [noExiste, setNoExiste] = useState(false);
  /** undefined: todavía no se sabe; null: este navegador no tiene cuenta de comprador. */
  const [me, setMe] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [espera, setEspera] = useState<Espera>(null);
  const [qrOpen, setQrOpen] = useState(false);
  /** Pago a medias guardado en este navegador: al volver al link, sigue en el QR. */
  const [guardada, setGuardada] = useState<CompraLocal | null>(null);
  const [problem, setProblem] = useState(false);
  const [ask, setAsk] = useState(false);
  const [pressure, setPressure] = useState(false);
  const [delivery, setDelivery] = useState<DatosEntrega | null>(null);
  const [demo, setDemo] = useState(false);
  const progress = useProgress();
  const now = useNow();
  const [recogido, marcarRecogido] = useRecogido(slug);

  const load = useCallback(async () => {
    try {
      setV(await api<OrderView>(`/api/orders/${slug}?onchain=1`));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setNoExiste(true);
      else setError(mensajeDeError(e));
    }
  }, [slug]);

  useEffect(() => setDemo(enProbar()), []);
  // Dentro de /probar: le cuenta a la página que el QR está a la vista (la línea de ayuda dice "Toca Escanear con mi banco").
  const qrDemo = demo && v?.order.status === "esperando_pago";
  useEffect(() => {
    if (qrDemo) canal()?.postMessage({ tipo: "sub", valor: "qr" });
  }, [qrDemo]);

  useEffect(() => {
    const c = enProbar() ? null : leerCompra(slug);
    if (c) {
      setGuardada(c);
      setDelivery(c.datos);
      setQrOpen(true);
    }
    load();
  }, [load, slug]);

  // Qué cuenta de comprador hay en este navegador. Depende de quién empezó a pagar el pedido: si fue la de /probar en este
  // mismo celular, sigue con esa.
  const cargado = v !== null;
  const comprador = v?.order.buyer_pubkey ?? null;
  useEffect(() => {
    if (!cargado) return;
    if (!hayAlgunComprador()) return setMe(null);
    let vivo = true;
    cargarWallet()
      .then((w) => vivo && setMe(w.cuentaDelComprador(comprador)))
      .catch(() => vivo && setError(NO_CARGO_CUENTA));
    return () => {
      vivo = false;
    };
  }, [cargado, comprador]);

  // Pagado: el pago a medias ya no hace falta.
  const pagado = cargado && v?.order.status !== "esperando_pago";
  useEffect(() => {
    if (pagado) borrarCompra(slug);
  }, [pagado, slug]);

  useEffect(() => {
    if (busy) return;
    const t = setInterval(load, 7000);
    return () => clearInterval(t);
  }, [busy, load]);

  if (noExiste) return <LinkNoEncontrado />;
  if (!v)
    return error ? (
      <div className="mx-auto max-w-md">
        <ErrorBox error={error} />
      </div>
    ) : (
      <Esqueleto />
    );

  const o = v.order;
  const url = typeof window === "undefined" ? "" : window.location.href.split("?")[0];
  const host = typeof window === "undefined" ? "" : window.location.host;
  const isBuyer = Boolean(me && me === o.buyer_pubkey);
  const intento =
    o.status === "esperando_pago"
      ? intentoDePago({ comprador: o.buyer_pubkey, yo: me, guardada: guardada?.cuenta, hasta: o.buyer_lease_until, ahora: now })
      : "libre";
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

  /** Mensaje listo para la tienda en los momentos en que le toca enterarse. */
  const avisar =
    isBuyer && o.status === "pagado" ? waText("pagado", d) : isBuyer && o.status === "liberado" ? waText("liberado", d) : isBuyer && o.status === "en_disputa" ? waText("disputa", d) : null;

  async function run(tipo: Exclude<Espera, null>, fn: () => Promise<void>) {
    setBusy(true);
    setEspera(tipo);
    setError(null);
    progress.reset();
    try {
      await fn();
      await load();
    } catch (e) {
      setError(mensajeDeError(e));
      await load();
    } finally {
      setBusy(false);
      setEspera(null);
    }
  }

  const pagar = (datos: DatosEntrega) =>
    run("pago", async () => {
      // El comprador no ve ningún login: la cuenta se crea sola e invisible en este dispositivo.
      const { activateWallet, getWallet, signAndSubmit } = await cargarWallet();
      const wallet = getWallet("comprador");
      const LW = "Preparando tu pago en este dispositivo";
      progress.push(LW);
      const pk = await wallet.connect();
      setMe(pk);
      if (!demo) {
        guardarCompra(slug, datos, pk);
        setGuardada({ datos, cuenta: pk, t: Date.now() });
      }
      await activateWallet(wallet);
      progress.finish(LW);
      const L = ES_MAINNET ? "Contrato del pedido creado" : "Banco: pago simulado y contrato del pedido creado";
      progress.push(L);
      const prepared = await apiFirmada<PreparedTx>(wallet, `/api/orders/${slug}/pay`, { buyer: pk, ...datos });
      progress.finish(L);
      await signAndSubmit(wallet, prepared, progress.push);
      setQrOpen(false);
    });

  const accion = (action: "confirm" | "dispute" | "extend", extra: Record<string, string> = {}) =>
    run("accion", async () => {
      const { getWallet, signAndSubmit } = await cargarWallet();
      const wallet = getWallet("comprador");
      // "Necesito más tiempo" tiene su propia ruta (pp_guardian v2 `extend`, una sola vez).
      const path = action === "extend" ? `/api/orders/${slug}/extend` : `/api/orders/${slug}/action`;
      const prepared = await api<PreparedTx>(path, { action, signer: wallet.publicKey(), ...extra });
      await signAndSubmit(wallet, prepared, progress.push);
      setProblem(false);
      setAsk(false);
    });

  // La espera explicada: el pago encadena varias transacciones (unos 30 s); una acción del pedido, una sola.
  const hechos = progress.steps.filter((s) => s.done).length;
  const esperando =
    busy && espera === "pago" ? (
      <EsperaEnCurso
        titulo={demo ? `Guardando tu pago… ${Math.min(hechos + 1, 4)} de 4` : "Guardando tu pago… unos 30 segundos"}
        nota="No cierres esta página."
        steps={progress.steps}
        testId="espera-pago"
      />
    ) : busy && espera === "accion" ? (
      <EsperaEnCurso titulo="Enviando tu confirmación… unos segundos" steps={progress.steps} testId="espera-accion" />
    ) : null;

  if (o.status === "esperando_pago" && demo && intento !== "ajeno") {
    return (
      <div className="mx-auto max-w-md space-y-4 pb-10">
        <QrEscaneo v={v} busy={busy} hechos={hechos} error={error} onEscanear={() => void pagar(ENTREGA_DEMO)} />
        <ErrorBox error={error} />
      </div>
    );
  }

  if (o.status === "esperando_pago") {
    if (intento === "cargando")
      return error ? (
        <div className="mx-auto max-w-md space-y-4">
          <ErrorBox error={error} />
          <button type="button" className="btn-primary w-full" onClick={() => window.location.reload()}>
            Recargar
          </button>
        </div>
      ) : (
        <Esqueleto />
      );
    if (intento === "ajeno")
      return (
        <div className="mx-auto max-w-md space-y-6 pb-10">
          <Producto v={v} />
          <PagoEmpezado v={v} now={now} />
          <ComoFunciona v={v} />
        </div>
      );
    if (qrOpen && delivery)
      return (
        <div className="mx-auto max-w-md space-y-6 pb-10">
          {ES_MAINNET ? (
            <>
              {!busy && <PagoUsdc v={v} busy={busy} onPay={() => pagar(delivery)} />}
              {esperando}
              <ErrorBox error={error} />
            </>
          ) : (
            <PagoQr
              v={v}
              busy={busy}
              espera={esperando}
              error={error}
              aMedias={intento === "mio"}
              onPay={() => pagar(delivery)}
              onCambiar={() => setQrOpen(false)}
            />
          )}
        </div>
      );
    return (
      <div className="mx-auto max-w-md space-y-5 pb-28">
        <AvisoNavegadorInterno />
        <Producto v={v} />
        <Promesa v={v} />
        <FormEntrega
          v={v}
          inicial={delivery}
          onContinuar={(x) => {
            guardarCompra(slug, x, guardada?.cuenta ?? null);
            setDelivery(x);
            setError(null);
            setQrOpen(true);
            cargarWallet().catch(() => {}); // se adelanta la descarga mientras mira el QR; si falla, al pagar reintenta
            window.scrollTo({ top: 0 });
          }}
        />
        <ErrorBox error={error} />
        <div>
          <ComoFunciona v={v} />
          <TarjetaVendedor v={v} />
          <Antifraude code={o.code} host={host} />
        </div>
        <ModoPractica />
        <BarraPagar total={total} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <EstadoPedido v={v} />
      {me !== undefined && !isBuyer && <OtroNavegador v={v} />}
      <ErrorBox error={error} />
      {esperando}
      {pressure && (
        <div data-testid="aviso-presion" className="flex gap-3 rounded-card border border-aviso-200 bg-aviso-50 p-4 text-sm text-aviso-700">
          <IconoAlerta className="mt-0.5 h-5 w-5 flex-none" />
          <div>
            <p className="font-semibold">Nunca pagues al vendedor porque te lo pide.</p>
            <p className="mt-1">Abrimos un reclamo por presión para confirmar y le avisamos al revisor. Tu plata sigue guardada en el contrato.</p>
          </div>
        </div>
      )}
      <Seguimiento v={v} esComprador={isBuyer} recogido={recogido} busy={busy} onRecogido={marcarRecogido} onNoLlego={() => accion("extend")} />
      {isBuyer && (o.status === "pagado" || o.status === "enviado" || o.status === "en_disputa") && <AvisosWhatsApp code={o.code} />}
      {avisar && (
        <a className="btn-primary w-full" href={waLink(avisar, v.seller.whatsapp)} target="_blank" rel="noreferrer" data-testid="avisar-tienda">
          <IconoWhatsApp className="h-5 w-5" />
          Avisar a la tienda por WhatsApp
        </a>
      )}
      {isBuyer && (o.status === "pagado" || o.status === "enviado" || o.status === "en_disputa") && <CompraEnEsteNavegador />}
      {ES_MAINNET && isBuyer && (o.status === "resuelto" || o.status === "devuelto" ? <RetirarUsdc role="comprador" /> : <RespaldoCuenta role="comprador" />)}

      {o.ship_imei && (o.status === "enviado" || o.status === "en_disputa") && (
        <div data-testid="imei" className="flex gap-3 text-base">
          <IconoCelular className="mt-0.5 h-5 w-5 flex-none text-musgo" />
          <div className="space-y-1">
            <p className="font-semibold">
              IMEI declarado por el vendedor: <span className="font-mono">{o.ship_imei}</span>
            </p>
            <p className="text-tinta-600">Marca *#06# en el equipo y compara. Si no coincide, no pagues y abre un reclamo.</p>
          </div>
        </div>
      )}

      {isBuyer && o.status === "pagado" && !problem && (
        <div className="space-y-3 text-base text-tinta-600">
          <p>Podrás pagar al vendedor cuando registre el envío y lo tengas en tus manos.</p>
          <button className="btn-ghost w-full text-error-700 hover:bg-error-50" disabled={busy} onClick={() => setProblem(true)}>
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

      <LineaDeTiempo v={v} plegada={o.status === "pagado"} onReload={load} onExtend={isBuyer ? () => accion("extend") : undefined} />
      <Cierre v={v} />

      {o.status === "resuelto" && <WhatsAppBox title="Compartir la decisión" text={waText("resuelto", d)} phone={v.seller.whatsapp} />}

      <PublicRecord v={o.verification} escrowId={o.escrow_id} status={o.status} role="comprador" />
      <TarjetaVendedor v={v} />
      <RegistroPedido v={v} />
      <Antifraude code={o.code} host={host} />
      <ModoPractica />
    </div>
  );
}

function ModoPractica() {
  return (
    <p className="text-center text-sm text-tinta-500" data-testid="modo-practica">
      {TEXTO.aviso}
    </p>
  );
}
