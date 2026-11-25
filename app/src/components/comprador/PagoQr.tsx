"use client";

import { useEffect, useState } from "react";
import { IconoChevronAbajo } from "@/components/iconos";
import { ErrorBox } from "@/components/ui";
import { fmtBsUnits, unitsToNumber } from "@/lib/format";
import type { OrderView } from "@/lib/types";

/** Entidad a cuyo nombre sale el QR en producción. Sin configurar, se dice "Trato" (el QR de práctica). */
const ENTIDAD_QR = process.env.NEXT_PUBLIC_QR_ENTIDAD?.trim() || "Trato";

const PASOS = ["Guarda el QR en tu galería.", "Abre tu banco → Pagar con QR → Galería.", "Elige la imagen del QR y confirma el pago."];

/**
 * QR como se paga en Bolivia: el QR, una línea y el botón de pago. Cómo guardarlo o compartirlo para subirlo desde la
 * galería del banco queda plegado en "¿Cómo pago con este QR?".
 */
export function PagoQr({
  v,
  busy,
  espera,
  error,
  aMedias,
  onPay,
  onCambiar,
}: {
  v: OrderView;
  busy: boolean;
  /** Mientras se paga, la espera va en el lugar del botón: sigue siendo la misma pantalla, con el monto a la vista. */
  espera: React.ReactNode;
  error: string | null;
  /** El pago ya se había empezado en este navegador. */
  aMedias: boolean;
  onPay: () => void;
  onCambiar: () => void;
}) {
  const o = v.order;
  const [qr, setQr] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const archivo = `trato-${o.code ?? "qr"}.png`;
  const monto = (unitsToNumber(o.amount_units) * o.fx).toFixed(2);

  useEffect(() => {
    // qrcode se carga recién aquí, no en el primer pantallazo.
    import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(`TRATO-EJEMPLO|NO-ES-UN-QR-REAL|${o.code}|BOB ${monto}`, { margin: 2, width: 600 }))
      .then(setQr)
      .catch(() => {});
  }, [o.code, monto]);

  function guardar() {
    if (!qr) return;
    const a = document.createElement("a");
    a.href = qr;
    a.download = archivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setAviso("Listo. Si no aparece en tu galería, mantén presionado el QR y elige «Guardar imagen».");
  }

  async function compartir() {
    if (!qr) return;
    try {
      const blob = await (await fetch(qr)).blob();
      const file = new File([blob], archivo, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: `QR de pago ${o.code}` });
        setAviso(null);
        return;
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return; // cerró el menú de compartir
    }
    guardar();
  }

  return (
    <section className="space-y-5 animate-aparecer" data-testid="qr">
      <div className="space-y-1.5">
        <p className="eyebrow">
          {o.product} · {o.code}
        </p>
        <h1 className="text-3xl">
          Paga <span className="num">{fmtBsUnits(o.amount_units, o.fx)}</span>
        </h1>
        <p className="text-base text-tinta-600">{busy ? "Estamos guardando tu pago." : "Con este QR, desde la app de tu banco."}</p>
      </div>
      <div className="flex flex-col items-center gap-2">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt={`QR de pago ${o.code}`} className={`h-56 w-56 rounded-card ring-1 ring-tinta-200 transition-opacity ${busy ? "opacity-20" : ""}`} data-testid="imagen-qr" />
        ) : (
          <div className="h-56 w-56 animate-pulse rounded-card bg-tinta-100" />
        )}
        <p className="text-center text-sm text-tinta-600" data-testid="qr-entidad">
          QR de ejemplo a nombre de {ENTIDAD_QR}, nunca de una persona
        </p>
      </div>
      <p className="sr-only" data-testid="esperando-pago" aria-live="polite">
        Esperando tu pago…
      </p>
      {aMedias && !busy && (
        <p className="caja-info" data-testid="pago-a-medias">
          Tu pago quedó a medias. Termínalo aquí: no se cobra dos veces.
        </p>
      )}
      <ErrorBox error={busy ? null : error} />
      {busy ? (
        espera
      ) : (
        <button className="btn-primary w-full py-4" onClick={onPay}>
          Simular pago del banco (modo práctica)
        </button>
      )}

      <details className={`group text-sm text-tinta-600 ${busy ? "hidden" : ""}`}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-1.5 font-medium text-musgo [&::-webkit-details-marker]:hidden">
          ¿Cómo pago con este QR?
          <IconoChevronAbajo className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <div className="mt-3 space-y-3">
          <p data-testid="rampa-simulada">Pago simulado en la red de prueba. En producción lo hace una entidad certificada por ASFI.</p>
          <ol className="space-y-2" data-testid="pasos-qr">
            {PASOS.map((p, i) => (
              <li key={p} className="flex gap-2.5">
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-semibold text-monte ring-1 ring-monte/30 num">{i + 1}</span>
                <span className="text-tinta-700">{p}</span>
              </li>
            ))}
          </ol>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-secondary btn-sm" onClick={guardar} disabled={!qr}>
              Guardar QR
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={compartir} disabled={!qr}>
              Compartir QR
            </button>
          </div>
          {aviso && <p className="text-center">{aviso}</p>}
        </div>
      </details>
      {!busy && !aMedias && (
        <button type="button" className="btn-ghost btn-sm w-full" onClick={onCambiar}>
          Cambiar mis datos de entrega
        </button>
      )}
    </section>
  );
}
