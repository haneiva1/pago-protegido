"use client";

import { useEffect, useState } from "react";
import { explorer, fmtDate, type OrderStatus } from "@/lib/format";
import type { Verification } from "@/lib/types";
import { api } from "@/lib/wallet";
import { ErrorBox, Spinner, TxLink } from "./ui";

export function fmtLeft(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min ${String(s % 60).padStart(2, "0")} s`;
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/**
 * Cuenta regresiva de la liberación automática (pp_guardian.auto_release). Al vencer, con el pedido
 * en "enviado", aparece "Liberar ahora (plazo vencido)": cualquiera puede llamarlo, sin firmas.
 * Con pp_guardian v2 (capabilities.extend / clockFromShipping) se suma "Necesito más tiempo" y el reloj corre desde el envío.
 */
export function Countdown({
  slug,
  deadline,
  status,
  mode,
  onReleased,
  capabilities,
  role,
}: {
  slug: string;
  deadline: number | null;
  status: OrderStatus;
  mode: "direct" | "guardian";
  onReleased: () => void;
  capabilities?: { extend: boolean; clockFromShipping: boolean };
  role?: "comprador" | "vendedor";
}) {
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  if (!deadline || (status !== "pagado" && status !== "enviado")) return null;
  const left = deadline - now;
  const expired = left <= 0;
  // Margen de 5 s: el plazo on-chain usa la hora del ledger.
  const canRelease = expired && now >= deadline + 5000 && status === "enviado" && mode === "guardian";

  async function call(path: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ hash: string }>(path, {});
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
          ⏱️ Se libera sola en{" "}
          <strong data-testid="cuenta-regresiva" className="tabular-nums">
            {fmtLeft(left)}
          </strong>{" "}
          <span className="text-xs text-slate-500">({fmtDate(deadline)})</span>
        </p>
      )}
      <p className="text-xs text-slate-500">
        {status === "enviado"
          ? "Si para entonces el comprador no confirma ni reclama, se le paga al vendedor. Te avisamos un día antes."
          : "La liberación automática solo corre si el vendedor registró el envío."}
        {mode === "direct" && " En modo directo la liberación automática no está activa."}
      </p>
      {capabilities?.extend && role === "comprador" && !expired && (
        <button className="btn-secondary w-full" disabled={busy} onClick={() => call(`/api/orders/${slug}/extend`)}>
          Necesito más tiempo
        </button>
      )}
      {canRelease && (
        <button className="btn-primary w-full" disabled={busy} onClick={() => call(`/api/orders/${slug}/auto-release`)}>
          {busy ? <Spinner /> : "⏱️"} Liberar ahora (plazo vencido)
        </button>
      )}
      <ErrorBox error={error} />
      {hash && <TxLink hash={hash} />}
    </div>
  );
}

/**
 * H-2 en pantalla: el pago está bloqueado en un contrato público. La verificación técnica (WASM y roles)
 * queda detrás de "Ver registro público".
 */
export function PublicRecord({ v, escrowId }: { v: Verification | null; escrowId: string | null }) {
  const id = v?.escrowId ?? escrowId;
  if (!id) return null;
  return (
    <div data-testid="registro-publico" className="rounded-xl bg-brand-50 p-3 text-sm text-brand-900 ring-1 ring-brand-200">
      <p className="font-semibold">🔒 Pago bloqueado en un contrato público: solo puede ir al vendedor o volver a ti.</p>
      <a className="mt-1 inline-block text-xs font-medium underline" href={explorer.contract(id)} target="_blank" rel="noreferrer">
        Ver registro público ↗
      </a>
      {v && (
        <details className="mt-1 text-xs text-brand-800">
          <summary className="cursor-pointer">Qué se revisó antes de que pagaras</summary>
          <ul className="mt-1 space-y-0.5">
            {v.checks.map((c) => (
              <li key={c.label}>
                {c.ok ? "✓" : "✗"} {c.label}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
