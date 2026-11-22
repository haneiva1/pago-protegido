"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui";
import { fmtBsUnits, unitsToNumber } from "@/lib/format";
import type { OrderView } from "@/lib/types";
import { Candado } from "./Estado";

/** Entidad a cuyo nombre sale el QR en producción. Sin configurar, se dice "Trato" (el QR de práctica). */
const ENTIDAD_QR = process.env.NEXT_PUBLIC_QR_ENTIDAD?.trim() || "Trato";

const PASOS = ["Guarda el QR en tu galería.", "Abre tu banco → Pagar con QR → Galería.", "Elige la imagen del QR y confirma el pago."];

/**
 * QR como se paga en Bolivia: el comprador lo escanea con el mismo celular, así que se puede guardar o compartir y
 * subir desde la galería de la app del banco. Mientras tanto, "Esperando tu pago…" con el candado abierto.
 */
export function PagoQr({ v, busy, onPay }: { v: OrderView; busy: boolean; onPay: () => void }) {
  const o = v.order;
  const [qr, setQr] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const archivo = `trato-${o.code ?? "qr"}.png`;
  const monto = (unitsToNumber(o.amount_units) * o.fx).toFixed(2);

  useEffect(() => {
    // qrcode se carga recién aquí, no en el primer pantallazo.
    import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(`PAGO-PROTEGIDO-EJEMPLO|NO-ES-UN-QR-REAL|${o.code}|BOB ${monto}`, { margin: 2, width: 600 }))
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
      <div className="space-y-2">
        <span className="chip-aviso">Simulado</span>
        <h2 className="text-2xl">Paga con el QR desde tu banco</h2>
      </div>
      <div className="flex flex-col items-center gap-2">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt={`QR de pago ${o.code}`} className="h-52 w-52 rounded-card ring-1 ring-tinta-200" data-testid="imagen-qr" />
        ) : (
          <div className="h-52 w-52 animate-pulse rounded-card bg-tinta-100" />
        )}
        <p className="text-center text-sm text-tinta-600" data-testid="qr-entidad">
          QR de ejemplo a nombre de {ENTIDAD_QR}, nunca de una persona · {o.code}
        </p>
      </div>
      <p className="text-center font-display text-5xl leading-none tracking-tight num">{fmtBsUnits(o.amount_units, o.fx)}</p>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-secondary btn-sm" onClick={guardar} disabled={!qr}>
          Guardar QR
        </button>
        <button type="button" className="btn-secondary btn-sm" onClick={compartir} disabled={!qr}>
          Compartir QR
        </button>
      </div>
      {aviso && <p className="text-center text-sm text-tinta-600">{aviso}</p>}

      <ol className="space-y-2.5 border-t border-tinta-200 pt-4 text-base" data-testid="pasos-qr">
        {PASOS.map((p, i) => (
          <li key={p} className="flex gap-2.5">
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-yungas text-xs font-semibold text-monte num">{i + 1}</span>
            <span className="text-tinta-700">{p}</span>
          </li>
        ))}
      </ol>

      <div className="flex items-center justify-center gap-2 text-base font-medium text-tinta-700" data-testid="esperando-pago" aria-live="polite">
        <span className={busy ? "text-musgo" : "text-tinta-500"}>
          <Candado cerrado={busy} className="h-5 w-5" />
        </span>
        {busy ? (
          "Guardando tu pago…"
        ) : (
          <>
            <span className="h-2.5 w-2.5 rounded-full bg-yungas animate-latido" aria-hidden />
            Esperando tu pago…
          </>
        )}
      </div>

      <p className="text-center text-sm text-tinta-600" data-testid="rampa-simulada">
        Pago simulado en la red de prueba. En producción lo hace una entidad certificada por ASFI.
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
