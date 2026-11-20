"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  slug: string;
  escrowId: string | null;
}

/** Verificar un link: con el código del pedido (PP-4821) muestra tienda, producto, monto y estado. */
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

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Verificar un link de pago</h1>
      <p className="text-slate-600">Escribe el código del pedido (por ejemplo PP-4821). Si los datos no coinciden con lo que te mandaron, no pagues.</p>
      <form
        className="card flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          check(code);
        }}
      >
        <label className="sr-only" htmlFor="codigo">
          Código del pedido
        </label>
        <input id="codigo" className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="PP-4821" />
        <button className="btn-primary" disabled={busy}>
          {busy ? <Spinner /> : "Verificar"}
        </button>
      </form>
      <ErrorBox error={error} />
      {r && (
        <section className="card space-y-2" data-testid="resultado-verificar">
          <p className="text-sm font-semibold text-brand-700">✔ Link auténtico de Trato · {r.code}</p>
          <p>
            Tienda: <strong>{r.store}</strong>
            {r.city ? ` · ${r.city}` : ""}
          </p>
          <p>
            Producto: <strong>{r.product}</strong> · {r.price}
          </p>
          <p>
            Monto a pagar: <strong>{r.total}</strong>
          </p>
          <p>
            Estado: <strong>{r.statusLabel}</strong>
          </p>
          <div className="flex flex-wrap gap-3 pt-1 text-sm">
            <Link className="font-medium text-brand-700 underline" href={`/p/${r.slug}`}>
              Abrir el link auténtico
            </Link>
            {r.escrowId && <ExplorerLink href={explorer.contract(r.escrowId)}>Ver registro público</ExplorerLink>}
          </div>
        </section>
      )}
      <p className="text-xs text-slate-500">Si un QR de Trato está a nombre de una persona, es estafa.</p>
    </div>
  );
}
