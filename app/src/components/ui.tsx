"use client";

import { useState } from "react";
import { STATUS_LABEL, explorer, type OrderStatus } from "@/lib/format";

const STATUS_STYLE: Record<OrderStatus, string> = {
  esperando_pago: "bg-slate-100 text-slate-700 ring-slate-200",
  pagado: "bg-sky-50 text-sky-800 ring-sky-200",
  enviado: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  liberado: "bg-brand-50 text-brand-800 ring-brand-200",
  en_disputa: "bg-amber-50 text-amber-800 ring-amber-200",
  resuelto: "bg-violet-50 text-violet-800 ring-violet-200",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span data-testid="estado" className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function TxLink({ hash, label = "Ver registro público" }: { hash: string; label?: string }) {
  return (
    <a
      href={explorer.tx(hash)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 underline decoration-brand-200 underline-offset-2 hover:decoration-brand-600"
    >
      {label}
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" aria-hidden>
        <path d="M7 3h10v10M17 3 8 12M13 17H3V7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}

export function ExplorerLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="font-mono text-xs text-brand-700 underline decoration-brand-200 underline-offset-2 break-all">
      {children}
    </a>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.25" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div role="alert" data-testid="error" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      {error}
    </div>
  );
}

export function CopyButton({ text, label = "Copiar", className = "btn-secondary", testId }: { text: string; label?: string; className?: string; testId?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      data-testid={testId}
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          /* sin permiso de portapapeles: el texto igual está visible */
        }
        setOk(true);
        setTimeout(() => setOk(false), 1800);
      }}
    >
      {ok ? "¡Copiado!" : label}
    </button>
  );
}

export interface ProgressStep {
  label: string;
  hash?: string;
  done: boolean;
}

/** Lista de pasos en curso, cada uno con su "Ver en Stellar" cuando termina. */
export function Progress({ steps }: { steps: ProgressStep[] }) {
  if (!steps.length) return null;
  return (
    <ol className="space-y-2" aria-live="polite">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-3 text-sm">
          <span className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full ${s.done ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-600"}`}>
            {s.done ? (
              <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" aria-hidden>
                <path d="m5 10 3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <Spinner className="h-3.5 w-3.5" />
            )}
          </span>
          <span className="flex-1">
            <span className={s.done ? "text-slate-800" : "text-slate-600"}>{s.label}</span>
            {s.hash && (
              <span className="ml-2">
                <TxLink hash={s.hash} />
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Hook para ir acumulando pasos de progreso (label + hash). */
export function useProgress() {
  const [steps, setSteps] = useState<ProgressStep[]>([]);
  const push = (label: string, hash?: string) =>
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.label === label && !s.done);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { label, hash, done: Boolean(hash) || copy[idx].done };
        return copy;
      }
      return [...prev, { label, hash, done: Boolean(hash) }];
    });
  const finish = (label: string) => setSteps((prev) => prev.map((s) => (s.label === label ? { ...s, done: true } : s)));
  return { steps, push, finish, reset: () => setSteps([]) };
}
