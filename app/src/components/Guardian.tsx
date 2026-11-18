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

type Caps = { extend: boolean; clockFromShipping: boolean; refundUnshipped?: boolean };

/**
 * v2: plazo de despacho (`ship_deadline` de pp_guardian). Si vence sin envío registrado, la app abre la
 * devolución automática (refund_unshipped): el pago vuelve al comprador.
 */
export function ShipDeadline({ shipDeadline, status, role }: { shipDeadline: number | null; status: OrderStatus; role: "comprador" | "vendedor" }) {
  const now = useNow();
  if (!shipDeadline || status !== "pagado") return null;
  const left = shipDeadline - now;
  return (
    <div data-testid="plazo-despacho" className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm text-slate-700 ring-1 ring-slate-200">
      {left > 0 ? (
        <p>
          📦 {role === "vendedor" ? "Despacha antes del" : "El vendedor tiene que despachar antes del"} <strong>{fmtDate(shipDeadline)}</strong>{" "}
          <span className="text-xs text-slate-500 tabular-nums">(faltan {fmtLeft(left)})</span>
        </p>
      ) : (
        <p>
          📦 <strong>Venció el plazo de despacho</strong> ({fmtDate(shipDeadline)}). Estamos devolviendo el pago al comprador.
        </p>
      )}
      <p className="text-xs text-slate-500">
        {role === "vendedor"
          ? "Si no registras el envío a tiempo, el pago vuelve automáticamente al comprador."
          : "Si no lo despacha a tiempo, te devolvemos el pago automáticamente."}
      </p>
    </div>
  );
}

/**
 * Cuenta regresiva de la revisión (pp_guardian v2: `release_at`, contado desde el envío). Al vencer, con el
 * pedido en "enviado" y sin reclamo, aparece "Liberar ahora (plazo vencido)": cualquiera puede llamarlo, sin firmas.
 * El comprador puede pedir más tiempo una sola vez (`extend`): suma otra ventana de revisión igual.
 */
export function Countdown({
  slug,
  deadline,
  status,
  mode,
  onReleased,
  capabilities,
  role,
  extended,
  onExtend,
}: {
  slug: string;
  deadline: number | null;
  status: OrderStatus;
  mode: "direct" | "guardian";
  onReleased: () => void;
  capabilities?: Caps;
  role?: "comprador" | "vendedor";
  /** El comprador ya usó "Necesito más tiempo". */
  extended?: boolean | number;
  /** Firma de `extend` con la cuenta del comprador (la arma /api/orders/:slug/extend). */
  onExtend?: () => void;
}) {
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  if (!deadline || status !== "enviado") return null;
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
        Si para entonces el comprador no paga ni reclama, se le paga al vendedor. El plazo corre desde que se registró el envío. Te avisamos un día antes.
        {mode === "direct" && " En modo directo la liberación automática no está activa."}
      </p>
      {Boolean(extended) && (
        <p data-testid="extendido" className="text-xs font-medium text-slate-600">
          ⏳ El comprador ya pidió más tiempo una vez.
        </p>
      )}
      {capabilities?.extend && role === "comprador" && !expired && !extended && onExtend && (
        <button className="btn-secondary w-full" disabled={busy} onClick={onExtend}>
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
