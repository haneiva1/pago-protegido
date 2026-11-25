"use client";

import { useEffect, useRef, useState } from "react";
import { CheckTrazo } from "@/components/probar/CheckTrazo";
import { Spinner } from "@/components/ui";
import { fmtBsUnits, unitsToNumber } from "@/lib/format";
import type { OrderView } from "@/lib/types";

type Fase = "qr" | "escaneando" | "recibido";
const ESCANEO_MS = 1700;

/**
 * El pago con QR dentro de /probar: el QR grande con el monto y "Escanear con mi banco". Al tocarlo, el visor de la cámara
 * se cierra sobre el QR, una línea lo barre y aparece el check; el pago real en la red de prueba corre por detrás, igual
 * que antes. Es una simulación del QR (modo práctica): nunca dice que Trato ya está integrado con bancos.
 */
export function QrEscaneo({ v, busy, hechos, error, onEscanear }: { v: OrderView; busy: boolean; hechos: number; error: string | null; onEscanear: () => void }) {
  const o = v.order;
  const [qr, setQr] = useState<string | null>(null);
  const [fase, setFase] = useState<Fase>("qr");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const total = fmtBsUnits(o.amount_units, o.fx);
  const monto = (unitsToNumber(o.amount_units) * o.fx).toFixed(2);

  useEffect(() => {
    import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(`TRATO-EJEMPLO|NO-ES-UN-QR-REAL|${o.code}|BOB ${monto}`, { margin: 1, width: 560, color: { dark: "#0A2A1B", light: "#FFFFFF" } }))
      .then(setQr)
      .catch(() => {});
  }, [o.code, monto]);

  // Si el pago falló en la red, el QR vuelve a estar listo para escanear otra vez.
  useEffect(() => {
    if (!busy && error) {
      if (timer.current) clearTimeout(timer.current);
      setFase("qr");
    }
  }, [busy, error]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  function escanear() {
    if (fase !== "qr") return;
    setFase("escaneando");
    onEscanear();
    timer.current = setTimeout(() => setFase("recibido"), ESCANEO_MS);
  }

  const camara = fase !== "qr";
  return (
    <section className="flex flex-col items-center gap-4 pt-2 text-center animate-[paso_280ms_var(--ease-suave)_both]" data-testid="qr-demo" data-fase={fase}>
      <div className="space-y-1">
        <p className="text-sm text-tinta-600">
          {v.seller.store_name} · <span className="num">{o.code}</span>
        </p>
        <p className="num text-3xl font-semibold text-monte" data-testid="qr-monto">
          {total}
        </p>
      </div>

      {/* El visor: el QR sobre blanco; al escanear, el fondo pasa a cámara y las esquinas se cierran sobre él. */}
      <div className={`relative rounded-card p-4 transition-colors duration-300 ease-[var(--ease-suave)] ${camara ? "bg-monte" : "bg-white ring-1 ring-tinta-200"}`}>
        <div className="relative h-56 w-56 overflow-hidden rounded-lg bg-white" style={{ "--barrido": "216px" } as React.CSSProperties}>
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={`QR de pago ${o.code} por ${total}`} className={`h-full w-full transition-opacity duration-300 ${fase === "recibido" ? "opacity-15" : "opacity-100"}`} data-testid="imagen-qr" />
          ) : (
            <div className="h-full w-full animate-pulse bg-tinta-100" />
          )}
          {fase === "escaneando" && <span aria-hidden className="absolute inset-x-2 top-1 h-0.5 rounded-full bg-yungas shadow-[0_0_12px_2px_rgb(80_222_80/0.7)] animate-[barrido_1600ms_ease-in-out_both]" />}
          {fase === "recibido" && (
            <span className="absolute inset-0 flex items-center justify-center text-musgo animate-[sello-check_360ms_var(--ease-suave)_both]">
              <CheckTrazo circulo className="h-24 w-24" />
            </span>
          )}
        </div>
        {camara &&
          (["left-1 top-1 border-l-4 border-t-4 rounded-tl-xl", "right-1 top-1 border-r-4 border-t-4 rounded-tr-xl", "bottom-1 left-1 border-b-4 border-l-4 rounded-bl-xl", "bottom-1 right-1 border-b-4 border-r-4 rounded-br-xl"] as const).map((c) => (
            <span key={c} aria-hidden className={`absolute h-9 w-9 border-yungas animate-[visor_260ms_var(--ease-suave)_both] ${c}`} />
          ))}
      </div>

      <div className="min-h-14 w-full" aria-live="polite">
        {fase === "qr" && (
          <button type="button" className="btn-primary w-full" disabled={!qr || busy} onClick={escanear} data-testid="escanear">
            Escanear con mi banco
          </button>
        )}
        {fase === "escaneando" && <p className="py-3 text-base font-semibold text-monte animate-[paso_260ms_var(--ease-suave)_both]">Escaneando el QR…</p>}
        {fase === "recibido" && (
          <div className="space-y-1 animate-[paso_260ms_var(--ease-suave)_both]" data-testid="pago-recibido">
            <p className="text-xl font-semibold text-monte">Pago recibido</p>
            <p className="flex items-center justify-center gap-1.5 text-sm text-tinta-600">
              {busy && <Spinner className="h-3.5 w-3.5 text-musgo" />}
              La plata va al centro, a esperar entre los dos{busy ? ` · ${Math.min(hechos + 1, 4)} de 4` : ""}
            </p>
          </div>
        )}
      </div>

      <p className="text-xs text-tinta-500" data-testid="rotulo-qr">
        Simulación del pago con QR (modo práctica)
      </p>
    </section>
  );
}
