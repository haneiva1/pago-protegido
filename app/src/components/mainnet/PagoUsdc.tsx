"use client";

import { useEffect, useRef, useState } from "react";
import { IconoChevronAbajo } from "@/components/iconos";
import { CopyButton, ErrorBox, Spinner } from "@/components/ui";
import { fmtBsUnits, unitsToAmountString } from "@/lib/format";
import { AVISO_MAINNET } from "@/lib/red";
import type { OrderView } from "@/lib/types";
import { RespaldoCuenta, RetirarUsdc, useSaldoUsdc } from "./CuentaUsdc";

/**
 * Pago en mainnet (docs/MAINNET.md §Cómo paga el comprador): Trato le muestra al comprador la dirección de su cuenta de
 * Trato, él le manda el USDC desde su propia cuenta Stellar (billetera o exchange) y, cuando llega, firma el fondeo del
 * contrato como siempre. Reemplaza al QR simulado; el resto del pago no cambia.
 */
export function PagoUsdc({ v, busy, onPay }: { v: OrderView; busy: boolean; onPay: () => void }) {
  const o = v.order;
  const total = BigInt(o.amount_units);
  const monto = unitsToAmountString(total);
  const [cuenta, setCuenta] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [qr, setQr] = useState<string | null>(null);
  const activando = useRef(false);
  const { saldo } = useSaldoUsdc(cuenta);
  const llego = saldo !== null && saldo >= total;
  const falta = saldo === null || llego ? total : total - saldo;

  useEffect(() => {
    if (activando.current) return;
    activando.current = true;
    setError(null);
    import("@/lib/wallet")
      .then(({ activateWallet, getWallet }) => activateWallet(getWallet("comprador")))
      .then(setCuenta)
      .catch((e) => setError((e as Error).message))
      .finally(() => {
        activando.current = false;
      });
  }, [intento]);

  useEffect(() => {
    if (!cuenta) return;
    import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(cuenta, { margin: 2, width: 480 }))
      .then(setQr)
      .catch(() => {});
  }, [cuenta]);

  return (
    <section className="space-y-5 animate-aparecer" data-testid="pago-usdc">
      <div className="space-y-1.5">
        <p className="eyebrow">Compra protegida · {o.code}</p>
        <h2 className="text-2xl">
          Manda {monto} USDC a tu cuenta de Trato
        </h2>
        <p className="text-base text-tinta-600">
          Son {fmtBsUnits(o.amount_units, o.fx)} al cambio de este pedido. {AVISO_MAINNET}.
        </p>
      </div>
      {cuenta ? (
        <>
          <div className="flex flex-col items-center gap-3">
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="Dirección de tu cuenta de Trato" className="h-48 w-48 rounded-card ring-1 ring-tinta-200" />
            )}
            <code className="block w-full break-all rounded-control bg-tinta-50 px-3 py-2.5 text-center font-mono text-sm text-monte" data-testid="direccion-usdc">
              {cuenta}
            </code>
            <div className="grid w-full grid-cols-2 gap-2">
              <CopyButton text={cuenta} label="Copiar dirección" className="btn-secondary btn-sm" />
              <CopyButton text={unitsToAmountString(falta)} label="Copiar monto" className="btn-secondary btn-sm" />
            </div>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-tinta-700">
            <li>Solo USDC en la red Stellar (el de Circle). Otra moneda u otra red no llega.</li>
            <li>No hace falta memo. Las comisiones de red de Trato las paga Trato.</li>
            <li>La plata queda en tu cuenta hasta que toques «Pagar»: recién ahí pasa al contrato del pedido.</li>
          </ul>
          <p className={llego ? "caja-exito" : "caja-aviso"} data-testid="saldo-usdc" aria-live="polite">
            {saldo === null
              ? "Revisando tu saldo…"
              : llego
                ? `Llegaron ${unitsToAmountString(saldo)} USDC. Ya puedes pagar.`
                : `Tienes ${unitsToAmountString(saldo)} USDC. Faltan ${unitsToAmountString(falta)}. Esta página se actualiza sola.`}
          </p>
          <button className="btn-primary w-full" disabled={busy || !llego} onClick={onPay}>
            Pagar y guardar en el contrato
          </button>
          <RespaldoCuenta role="comprador" />
          {saldo !== null && saldo > 0n && (
            <details className="group text-sm text-tinta-600">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-musgo [&::-webkit-details-marker]:hidden">
                Ya no quiero pagar: devolverme el USDC
                <IconoChevronAbajo className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <div className="mt-3">
                <RetirarUsdc role="comprador" />
              </div>
            </details>
          )}
        </>
      ) : error ? (
        <>
          <ErrorBox error={error} />
          <button type="button" className="btn-secondary w-full" onClick={() => setIntento((n) => n + 1)}>
            Reintentar
          </button>
        </>
      ) : (
        <p className="flex items-center justify-center gap-2 py-8 text-sm text-tinta-600">
          <Spinner className="h-5 w-5 text-musgo" />
          Activando tu cuenta en la red…
        </p>
      )}
    </section>
  );
}
