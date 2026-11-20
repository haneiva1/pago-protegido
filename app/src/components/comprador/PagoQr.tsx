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
    <section className="card space-y-4" data-testid="qr">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">Paga con el QR desde tu banco</h2>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">SIMULADO</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt={`QR de pago ${o.code}`} className="h-52 w-52 rounded-xl ring-1 ring-slate-200" data-testid="imagen-qr" />
        ) : (
          <div className="h-52 w-52 animate-pulse rounded-xl bg-slate-100" />
        )}
        <p className="text-center text-xs text-slate-500" data-testid="qr-entidad">
          QR de ejemplo a nombre de {ENTIDAD_QR}, nunca de una persona · {o.code}
        </p>
      </div>
      <p className="text-center text-2xl font-extrabold">{fmtBsUnits(o.amount_units, o.fx)}</p>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-secondary !py-2.5 text-sm" onClick={guardar} disabled={!qr}>
          ⬇️ Guardar QR
        </button>
        <button type="button" className="btn-secondary !py-2.5 text-sm" onClick={compartir} disabled={!qr}>
          ↗️ Compartir QR
        </button>
      </div>
      {aviso && <p className="text-center text-xs text-slate-600">{aviso}</p>}

      <ol className="space-y-1.5 rounded-xl bg-slate-50 p-3 text-sm" data-testid="pasos-qr">
        {PASOS.map((p, i) => (
          <li key={p} className="flex gap-2">
            <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">{i + 1}</span>
            <span>{p}</span>
          </li>
        ))}
      </ol>

      <div className="flex items-center justify-center gap-2 text-sm font-medium text-slate-700" data-testid="esperando-pago" aria-live="polite">
        <span className={busy ? "text-brand-700" : "text-slate-500"}>
          <Candado cerrado={busy} className="h-5 w-5" />
        </span>
        {busy ? (
          "Guardando tu pago…"
        ) : (
          <>
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-600" />
            </span>
            Esperando tu pago…
          </>
        )}
      </div>

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
