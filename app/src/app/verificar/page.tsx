"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IconoBuscar, IconoCheckCirculo } from "@/components/iconos";
import { ErrorBox, ExplorerLink, Spinner } from "@/components/ui";
import { explorer } from "@/lib/format";
import { api } from "@/lib/wallet";

interface Result {
  code: string;
  store: string;
  city: string | null;
  product: string;
  price: string;
  total: string;
  status: string;
  statusLabel: string;
  slug: string | null;
  escrowId: string | null;
}

/** Verificar un link: con el código del pedido (PP-7KM4Q9TX) muestra tienda, producto, monto y estado. */
export default function Verificar() {
  const [code, setCode] = useState("");
  const [r, setR] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function check(c: string) {
    setBusy(true);
    setError(null);
    setR(null);
    try {
      setR(await api<Result>(`/api/verificar?codigo=${encodeURIComponent(c)}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("codigo");
    if (c) {
      setCode(c);
      check(c);
    }
  }, []);

  const filas: [string, string][] = r
    ? [
        ["Tienda", r.city ? `${r.store} · ${r.city}` : r.store],
        ["Producto", `${r.product} · ${r.price}`],
        ["Monto a pagar", r.total],
        ["Estado", r.statusLabel],
      ]
    : [];

  return (
    <div className="mx-auto max-w-md space-y-5 pt-2">
      <header>
        <p className="eyebrow">Antes de pagar</p>
        <h1 className="mt-2 text-3xl">Verificar un link de pago</h1>
        <p className="mt-3 text-tinta-600">Escribe el código del pedido (por ejemplo PP-7KM4Q9TX). Si los datos no coinciden con lo que te mandaron, no pagues.</p>
      </header>
      <form
        className="card flex gap-2 !p-3"
        onSubmit={(e) => {
          e.preventDefault();
          check(code);
        }}
      >
        <label className="sr-only" htmlFor="codigo">
          Código del pedido
        </label>
        <input id="codigo" className="input font-mono uppercase placeholder:normal-case" value={code} onChange={(e) => setCode(e.target.value)} placeholder="PP-7KM4Q9TX" autoComplete="off" />
        <button className="btn-primary shrink-0" disabled={busy}>
          {busy ? <Spinner /> : <IconoBuscar className="h-5 w-5" />}
          Verificar
        </button>
      </form>
      <ErrorBox error={error} />
      {r && (
        <section className="card space-y-4 animate-aparecer" data-testid="resultado-verificar">
          <p className="flex items-center gap-2 text-sm font-semibold text-exito-700">
            <IconoCheckCirculo className="h-5 w-5 shrink-0" />
            Link auténtico de Trato · <span className="num">{r.code}</span>
          </p>
          <dl className="divide-y divide-tinta-100 text-sm">
            {filas.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4 py-2">
                <dt className="shrink-0 text-tinta-500">{k}</dt>
                <dd className="text-right font-semibold text-monte">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {r.slug && (
              <Link className="btn-oscuro btn-sm" href={`/p/${r.slug}`}>
                Abrir el link auténtico
              </Link>
            )}
            {r.escrowId && <ExplorerLink href={explorer.contract(r.escrowId)}>Ver registro público</ExplorerLink>}
          </div>
        </section>
      )}
      <p className="text-xs text-tinta-500">Si un QR de Trato está a nombre de una persona, es estafa.</p>
    </div>
  );
}
