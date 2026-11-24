"use client";

import { useCallback, useEffect, useState } from "react";
import { IconoChevronAbajo } from "@/components/iconos";
import { CopyButton, ErrorBox } from "@/components/ui";
import { api } from "@/lib/api";
import { apiFirmada } from "@/lib/api-firmada";
import { unitsToAmountString } from "@/lib/format";
import { explorador } from "@/lib/red";
import type { PreparedTx, WalletRole } from "@/lib/wallet";

// Solo mainnet (docs/MAINNET.md): la cuenta de Trato de cada persona vive en su navegador y guarda USDC real.

const cargarWallet = () => import("@/lib/wallet");
const RUTA_SALDO = "/api/wallet/saldo";

/** Saldo de USDC de una cuenta de Trato, refrescado cada 5 segundos. `null` mientras no se sabe. */
export function useSaldoUsdc(cuenta: string | null) {
  const [saldo, setSaldo] = useState<bigint | null>(null);
  const leer = useCallback(async () => {
    if (!cuenta) return;
    try {
      setSaldo(BigInt((await api<{ saldo: string }>(`${RUTA_SALDO}?cuenta=${cuenta}`)).saldo));
    } catch {
      /* la red puede fallar un momento: queda el último saldo leído */
    }
  }, [cuenta]);
  useEffect(() => {
    void leer();
    const t = setInterval(leer, 5000);
    return () => clearInterval(t);
  }, [leer]);
  return { saldo, leer };
}

/** Clave de respaldo de la cuenta: sin ella, si el navegador borra sus datos, la plata que llegue a esa cuenta se pierde. */
export function RespaldoCuenta({ role }: { role: WalletRole }) {
  const [clave, setClave] = useState<string | null>(null);
  return (
    <details
      className="group text-sm text-tinta-600"
      data-testid="respaldo"
      onToggle={(e) => {
        if (!(e.target as HTMLDetailsElement).open) setClave(null);
      }}
    >
      <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-musgo [&::-webkit-details-marker]:hidden">
        Guardar el respaldo de mi cuenta
        <IconoChevronAbajo className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className="mt-3 space-y-3">
        <p>
          Tu cuenta de Trato vive en este navegador. Si borras sus datos, usas una ventana privada o cambias de celular, pierdes el acceso y la plata que le
          llegue. Guarda esta clave en un lugar privado y no se la mandes a nadie: Trato nunca te la va a pedir.
        </p>
        {clave ? (
          <>
            <code className="block break-all rounded-control bg-tinta-50 px-3 py-2.5 font-mono text-xs text-monte">{clave}</code>
            <CopyButton text={clave} label="Copiar la clave" className="btn-secondary btn-sm" />
          </>
        ) : (
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={async () => {
              const { getWallet } = await cargarWallet();
              const w = getWallet(role);
              setClave("respaldo" in w ? (w as { respaldo(): string | null }).respaldo() : null);
            }}
          >
            Mostrar la clave
          </button>
        )}
      </div>
    </details>
  );
}

/** Retirar todo el USDC de la cuenta de Trato a otra cuenta Stellar. La firma sale de este navegador. */
export function RetirarUsdc({ role, onHecho }: { role: WalletRole; onHecho?: () => void }) {
  const [cuenta, setCuenta] = useState<string | null>(null);
  const [destino, setDestino] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const { saldo, leer } = useSaldoUsdc(cuenta);

  useEffect(() => {
    cargarWallet()
      .then((w) => setCuenta(w.getWallet(role).publicKey()))
      .catch((e) => setError((e as Error).message));
  }, [role]);

  async function retirar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { getWallet, signAndSubmit } = await cargarWallet();
      const w = getWallet(role);
      const prepared = await apiFirmada<PreparedTx>(w, "/api/wallet/retirar", { destino: destino.trim(), memo: memo.trim() });
      const r = await signAndSubmit(w, prepared);
      setHash(r.at(-1)?.hash ?? null);
      await leer();
      onHecho?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-4 sm:p-6" data-testid="retirar-usdc">
      <div>
        <h2 className="text-2xl">Retirar mis USDC</h2>
        <p className="mt-1 text-base text-tinta-700">
          En tu cuenta de Trato: <strong className="num">{saldo === null ? "…" : `${unitsToAmountString(saldo)} USDC`}</strong>
        </p>
      </div>
      {hash && (
        <p className="caja-exito text-sm">
          Listo.{" "}
          <a className="enlace" href={`${explorador()}/tx/${hash}`} target="_blank" rel="noreferrer">
            Ver el retiro en el registro público
          </a>
        </p>
      )}
      {saldo !== null && saldo > 0n && (
        <form className="space-y-3" onSubmit={retirar}>
          <div>
            <label className="label" htmlFor="retiro-destino">
              Tu cuenta Stellar (empieza con G)
            </label>
            <input id="retiro-destino" className="input font-mono text-sm" value={destino} onChange={(e) => setDestino(e.target.value)} autoComplete="off" required />
          </div>
          <div>
            <label className="label" htmlFor="retiro-memo">
              Memo <span className="font-normal text-tinta-500">(obligatorio si es una cuenta de un exchange)</span>
            </label>
            <input id="retiro-memo" className="input" value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={28} autoComplete="off" />
          </div>
          <p className="text-sm text-tinta-600">Se retira todo el saldo. Revisa bien la cuenta: un envío en la red no se puede deshacer.</p>
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "Enviando…" : "Retirar"}
          </button>
        </form>
      )}
      <ErrorBox error={error} />
      <RespaldoCuenta role={role} />
    </section>
  );
}
