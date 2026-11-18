"use client";

import { useEffect, useState } from "react";
import { explorer, fmtDate, type OrderStatus } from "@/lib/format";
import type { Verification } from "@/lib/types";
import { api } from "@/lib/wallet";
import { ErrorBox, Spinner, TxLink } from "./ui";

function fmtLeft(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min ${String(s % 60).padStart(2, "0")} s`;
}

/**
 * Cuenta regresiva de la liberación automática (pp_guardian.auto_release). Al vencer, con el pedido
 * en "enviado", aparece "Liberar ahora (plazo vencido)": cualquiera puede llamarlo, sin firmas.
 */
export function Countdown({
  slug,
  deadline,
  status,
  mode,
  onReleased,
}: {
  slug: string;
  deadline: number | null;
  status: OrderStatus;
  mode: "direct" | "guardian";
  onReleased: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!deadline || (status !== "pagado" && status !== "enviado")) return null;
  const left = deadline - now;
  const expired = left <= 0;
  // Margen de 5 s: el plazo on-chain usa la hora del ledger.
  const canRelease = expired && now >= deadline + 5000 && status === "enviado" && mode === "guardian";

  async function release() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ hash: string }>(`/api/orders/${slug}/auto-release`, {});
      setHash(r.hash);
      onReleased();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="plazo" className="space-y-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700 ring-1 ring-slate-200">
      {expired ? (
        <p>
          ⏱️ <strong>Plazo vencido</strong> ({fmtDate(deadline)}).
        </p>
      ) : (
        <p>
          ⏱️ Liberación automática en{" "}
          <strong data-testid="cuenta-regresiva" className="tabular-nums">
            {fmtLeft(left)}
          </strong>{" "}
          <span className="text-xs text-slate-500">({fmtDate(deadline)})</span>
        </p>
      )}
      <p className="text-xs text-slate-500">
        {status === "enviado"
          ? "Si para entonces el comprador no confirma ni reporta un problema, cualquiera puede liberar el pago al vendedor."
          : "La liberación automática solo corre si el vendedor marcó el pedido como enviado."}
        {mode === "direct" && " En modo directo la liberación automática no está activa."}
      </p>
      {canRelease && (
        <button className="btn-primary w-full" disabled={busy} onClick={release}>
          {busy ? <Spinner /> : "⏱️"} Liberar ahora (plazo vencido)
        </button>
      )}
      <ErrorBox error={error} />
      {hash && <TxLink hash={hash} label="Ver la liberación en Stellar" />}
    </div>
  );
}

/** H-2: sello "Contrato verificado" (WASM de Trustless Work + roles), con link a stellar.expert. */
export function VerifiedSeal({ v }: { v: Verification | null }) {
  if (!v) return null;
  return (
    <div
      data-testid={v.ok ? "sello-verificado" : "sello-fallido"}
      className={`rounded-xl p-3 text-sm ring-1 ${v.ok ? "bg-brand-50 text-brand-900 ring-brand-200" : "bg-rose-50 text-rose-900 ring-rose-200"}`}
    >
      <p className="font-semibold">{v.ok ? "✔ Contrato verificado" : "✖ Contrato NO verificado: pago bloqueado"}</p>
      <ul className="mt-1 space-y-0.5 text-xs">
        {v.checks.map((c) => (
          <li key={c.label}>
            {c.ok ? "✓" : "✗"} {c.label}
            {c.detail ? <span className="text-slate-500"> · {c.detail}</span> : null}
          </li>
        ))}
      </ul>
      <a className="mt-1 inline-block text-xs font-medium underline" href={explorer.contract(v.escrowId)} target="_blank" rel="noreferrer">
        Ver el contrato en stellar.expert ↗
      </a>
    </div>
  );
}
