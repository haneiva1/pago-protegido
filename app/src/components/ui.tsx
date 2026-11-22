"use client";

import { useState, type ReactNode } from "react";
import { STATUS_LABEL, explorer, type OrderStatus } from "@/lib/format";
import { IconoAlerta, IconoCheck, IconoCheckCirculo, IconoCopiar, IconoExterno } from "./iconos";

/** Un chip por estado del pedido, con la paleta de estados de la marca (SISTEMA.md). */
const STATUS_STYLE: Record<OrderStatus, string> = {
  esperando_pago: "chip-neutro",
  pagado: "chip-info",
  enviado: "chip-oscuro",
  liberado: "chip-exito",
  en_disputa: "chip-aviso",
  resuelto: "chip-neutro",
  devuelto: "chip-aviso",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span data-testid="estado" className={STATUS_STYLE[status]}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function TxLink({ hash, label = "Ver registro público" }: { hash: string; label?: string }) {
  return (
    <a href={explorer.tx(hash)} target="_blank" rel="noreferrer" className="enlace inline-flex items-center gap-1 text-sm">
      {label}
      <IconoExterno className="h-3.5 w-3.5 shrink-0" />
    </a>
  );
}

export function ExplorerLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="enlace break-all font-mono text-xs">
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
    <div role="alert" data-testid="error" className="caja-error flex items-start gap-2.5">
      <IconoAlerta className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">{error}</span>
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
      {ok ? <IconoCheck className="h-4 w-4 shrink-0 text-musgo" /> : <IconoCopiar className="h-4 w-4 shrink-0" />}
      {ok ? "¡Copiado!" : label}
    </button>
  );
}

export interface ProgressStep {
  label: string;
  hash?: string;
  done: boolean;
}

/** Lista de pasos en curso, cada uno con su link al registro público cuando termina. */
export function Progress({ steps }: { steps: ProgressStep[] }) {
  if (!steps.length) return null;
  return (
    <ol className="space-y-2" aria-live="polite">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-3 text-sm animate-aparecer">
          <span className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full ${s.done ? "bg-yungas text-monte" : "bg-tinta-100 text-musgo"}`}>
            {s.done ? <IconoCheck className="h-3.5 w-3.5" strokeWidth={2.5} /> : <Spinner className="h-3 w-3" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className={s.done ? "text-monte" : "font-medium text-tinta-700"}>{s.label}</span>
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

/**
 * Barra de avance. Sin `valor`, es indeterminada (la espera no tiene un plazo conocido);
 * con `valor` entre 0 y 1, muestra cuánto falta.
 */
export function Barra({ valor, className = "", oscura = false }: { valor?: number; className?: string; oscura?: boolean }) {
  const pista = oscura ? "bg-sal/15" : "bg-tinta-200";
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full ${pista} ${className}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={valor == null ? undefined : Math.round(Math.min(1, Math.max(0, valor)) * 100)}>
      {valor == null ? (
        <div className="h-full w-1/3 rounded-full bg-yungas animate-barra" />
      ) : (
        <div className="h-full rounded-full bg-yungas transition-[width] duration-500 ease-out" style={{ width: `${Math.min(100, Math.max(0, valor * 100))}%` }} />
      )}
    </div>
  );
}

/** Estado de carga que cuenta qué está pasando (y cuánto suele tardar). Nadie debe pensar que se colgó. */
export function Cargando({ texto, tarda, className = "", testId }: { texto: string; tarda?: string; className?: string; testId?: string }) {
  return (
    <div role="status" aria-live="polite" data-testid={testId} className={`flex items-start gap-3 rounded-control bg-tinta-100 px-4 py-3 text-sm ${className}`}>
      <Spinner className="mt-0.5 h-4 w-4 shrink-0 text-musgo" />
      <span className="min-w-0">
        <span className="block font-medium text-monte">{texto}</span>
        {tarda && <span className="block text-tinta-600">{tarda}</span>}
      </span>
    </div>
  );
}

/** Estado vacío: un ícono apagado, una línea y, si hay, una acción. */
export function Vacio({ icono, titulo, texto, accion, testId, className = "" }: { icono?: ReactNode; titulo: string; texto?: string; accion?: ReactNode; testId?: string; className?: string }) {
  return (
    <div data-testid={testId} className={`flex flex-col items-center justify-center gap-2 px-6 py-10 text-center ${className}`}>
      {icono && <span className="mb-1 text-tinta-300 [&>svg]:h-10 [&>svg]:w-10">{icono}</span>}
      <p className="font-semibold text-monte">{titulo}</p>
      {texto && <p className="max-w-xs text-sm text-tinta-600">{texto}</p>}
      {accion && <div className="mt-2">{accion}</div>}
    </div>
  );
}

/** Estado de éxito: panel suave con la marca. */
export function Exito({ titulo, children, testId, className = "" }: { titulo: ReactNode; children?: ReactNode; testId?: string; className?: string }) {
  return (
    <div data-testid={testId} className={`panel-suave flex items-start gap-3 animate-aparecer ${className}`}>
      <IconoCheckCirculo className="mt-0.5 h-5 w-5 shrink-0 text-musgo" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-monte">{titulo}</p>
        {children && <div className="mt-0.5 text-tinta-600">{children}</div>}
      </div>
    </div>
  );
}
