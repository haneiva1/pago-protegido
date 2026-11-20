"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui";
import { fmtBsUnits, unitsToNumber } from "@/lib/format";
import type { OrderView } from "@/lib/types";

export function PagoQr({ v, busy, onPay }: { v: OrderView; busy: boolean; onPay: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const o = v.order;
  useEffect(() => {
    // qrcode se carga recién aquí, no en el primer pantallazo.
    import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(`PAGO-PROTEGIDO-EJEMPLO|NO-ES-UN-QR-REAL|${o.code}|BOB ${(unitsToNumber(o.amount_units) * o.fx).toFixed(2)}`, { margin: 1, width: 220 }),
      )
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
        <p className="text-xs text-slate-500">QR de ejemplo a nombre de Trato · {o.code}</p>
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
