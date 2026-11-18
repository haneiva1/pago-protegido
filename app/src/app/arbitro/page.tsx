"use client";

import { useCallback, useEffect, useState } from "react";
import { SplitView, TxList } from "@/components/OrderBits";
import { ErrorBox, ExplorerLink, Spinner, StatusBadge, TxLink } from "@/components/ui";
import { explorer, fmtBs, fmtDate, fmtUsd, shortAddr, splitPreview } from "@/lib/format";
import type { ArbitroData, DisputeItem } from "@/lib/types";
import { api } from "@/lib/wallet";

const KEY = "pp.arbitro.clave";

export default function Arbitro() {
  const [key, setKey] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [data, setData] = useState<ArbitroData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (k: string) => {
    try {
      setData(await api<ArbitroData>("/api/arbitro", undefined, { "x-arbitro-key": k }));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      if ((e as Error).message.includes("Clave")) {
        sessionStorage.removeItem(KEY);
        setKey(null);
      }
    }
  }, []);

  useEffect(() => {
    const k = sessionStorage.getItem(KEY);
    if (k) setKey(k);
  }, []);

  useEffect(() => {
    if (!key) return;
    load(key);
    const t = setInterval(() => load(key), 10000);
    return () => clearInterval(t);
  }, [key, load]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Panel del árbitro</h1>
        <div className="mt-3 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-violet-900" data-testid="texto-fijo">
          <p className="font-semibold">⚖️ El árbitro solo puede repartir entre comprador y vendedor. El contrato no permite otro destino.</p>
          {data?.mode === "direct" && (
            <p className="mt-1 text-xs text-violet-800">
              Modo directo (temporal): hasta que se active el contrato pp_arbiter, esta regla la aplica el servidor, que solo arma repartos
              entre comprador y vendedor.
            </p>
          )}
        </div>
      </header>

      {!key ? (
        <form
          className="card max-w-sm space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            sessionStorage.setItem(KEY, input);
            setKey(input);
          }}
        >
          <label className="label" htmlFor="clave">
            Clave del árbitro
          </label>
          <input id="clave" type="password" className="input" value={input} onChange={(e) => setInput(e.target.value)} />
          <ErrorBox error={error} />
          <button className="btn-primary w-full">Entrar</button>
        </form>
      ) : !data ? (
        <div className="flex justify-center py-16">{error ? <ErrorBox error={error} /> : <Spinner className="h-6 w-6" />}</div>
      ) : (
        <>
          <section className="space-y-4">
            <h2 className="text-lg font-bold">Disputas abiertas ({data.open.length})</h2>
            {data.open.length === 0 && <p className="card muted">No hay disputas abiertas.</p>}
            {data.open.map((d) => (
              <DisputeCard key={d.slug} d={d} arbKey={key} platformFeeBps={data.platformFeeBps} onDone={() => load(key)} />
            ))}
          </section>
          {data.resolved.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-bold">Resueltas recientemente</h2>
              {data.resolved.map((r) => (
                <article key={r.slug} className="card space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold">{r.product}</h3>
                    <StatusBadge status={r.status} />
                  </div>
                  <SplitView money={r} buyerBps={r.buyer_bps} />
                  {r.txs.filter((t) => t.kind === "resolucion").map((t) => (
                    <TxLink key={t.id} hash={t.hash} label="Ver la resolución en Stellar" />
                  ))}
                </article>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function DisputeCard({ d, arbKey, platformFeeBps, onDone }: { d: DisputeItem; arbKey: string; platformFeeBps: number; onDone: () => void }) {
  const [pct, setPct] = useState(50);
  const [busy, setBusy] = useState<"resolver" | "probar" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [probe, setProbe] = useState<{ rejected: boolean; by: string; detail: string; foreign: string; call?: string; code?: number; raw?: string } | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [quote, setQuote] = useState<{ pct: number; source: string; buyer_net: string; seller_net: string; platform: string; tw: string } | null>(null);
  const balance = BigInt(d.onchain?.balance ?? d.amount_units);
  const local = splitPreview(balance, pct * 100, platformFeeBps);
  const h = { "x-arbitro-key": arbKey };

  // Vista previa del slider: pp_arbiter.quote (simulación de solo lectura), con un respiro de 300 ms.
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      api<{ source: string; buyer_net: string; seller_net: string; platform: string; tw: string }>("/api/arbitro/quote", { slug: d.slug, buyerBps: pct * 100 }, { "x-arbitro-key": arbKey })
        .then((q) => alive && setQuote({ pct, ...q }))
        .catch(() => {});
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [pct, d.slug, arbKey]);
  const fresh = quote && quote.pct === pct ? quote : null;
  const prev = fresh
    ? { buyer: BigInt(fresh.buyer_net), seller: BigInt(fresh.seller_net), platform: BigInt(fresh.platform), tw: BigInt(fresh.tw) }
    : { buyer: local.buyer.net, seller: local.seller.net, platform: local.buyer.platform + local.seller.platform, tw: local.buyer.tw + local.seller.tw };

  async function resolver() {
    setBusy("resolver");
    setError(null);
    try {
      const r = await api<{ hash: string }>("/api/arbitro/resolve", { slug: d.slug, buyerBps: pct * 100 }, h);
      setHash(r.hash);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function probar() {
    setBusy("probar");
    setError(null);
    try {
      setProbe(await api("/api/arbitro/probe", { slug: d.slug }, h));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="card space-y-5" data-testid={`disputa-${d.slug}`}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{d.product}</h3>
          <p className="muted">
            {fmtBs(d.price_bs_cents)} · {fmtUsd(d.amount_units)} USD de prueba · tienda {d.seller?.store_name} · reclamo del {d.dispute_by} el {fmtDate(d.disputed_at)}
          </p>
        </div>
        <StatusBadge status={d.status} />
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl bg-amber-50 p-4 text-sm ring-1 ring-amber-100">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Comprador</p>
          <p className="mt-1 font-semibold">{d.dispute_reason}</p>
          {d.dispute_text ? <p className="mt-1 text-slate-700">“{d.dispute_text}”</p> : <p className="mt-1 text-slate-400">Sin detalle</p>}
          {d.dispute_photo && (
            <a className="mt-1 inline-block text-amber-800 underline" href={d.dispute_photo} target="_blank" rel="noreferrer">
              Ver foto
            </a>
          )}
          {d.buyer_pubkey && <p className="mt-2 text-xs text-slate-500">Cuenta: <ExplorerLink href={explorer.account(d.buyer_pubkey)}>{shortAddr(d.buyer_pubkey)}</ExplorerLink></p>}
        </div>
        <div className="rounded-xl bg-sky-50 p-4 text-sm ring-1 ring-sky-100">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">Vendedor</p>
          <p className="mt-1">
            Evidencia de envío: <strong>{d.shipped_evidence ?? "no marcó envío"}</strong>
          </p>
          {d.seller_reply ? <p className="mt-1 text-slate-700">“{d.seller_reply}”</p> : <p className="mt-1 text-slate-400">Todavía no envió su versión</p>}
          <p className="mt-2 text-xs text-slate-500">Cuenta: <ExplorerLink href={explorer.account(d.seller_pubkey)}>{shortAddr(d.seller_pubkey)}</ExplorerLink></p>
        </div>
      </div>

      <div className="rounded-xl bg-slate-50 p-4 text-sm" data-testid="estado-onchain">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Estado en el contrato</p>
        {d.onchain ? (
          <ul className="mt-1 space-y-0.5 text-slate-700">
            <li>
              Saldo: <strong>{fmtUsd(d.onchain.balance)} USD de prueba</strong>
            </li>
            <li>En disputa: {d.onchain.flags.disputed ? "sí" : "no"} · Liberado: {d.onchain.flags.released ? "sí" : "no"} · Resuelto: {d.onchain.flags.resolved ? "sí" : "no"}</li>
            {d.onchain.milestone && (
              <li>
                Hito: “{d.onchain.milestone.status}” {d.onchain.milestone.evidence && `· evidencia: ${d.onchain.milestone.evidence}`}
              </li>
            )}
            {d.onchain.roles && <li>Árbitro designado: {shortAddr(d.onchain.roles.dispute_resolver)}</li>}
          </ul>
        ) : (
          <p className="text-slate-500">No se pudo leer el contrato.</p>
        )}
        {d.escrow_id && (
          <p className="mt-1 text-xs">
            <ExplorerLink href={explorer.contract(d.escrow_id)}>{d.escrow_id}</ExplorerLink>
          </p>
        )}
      </div>

      <div className="space-y-3">
        <label className="label flex items-center justify-between" htmlFor={`pct-${d.slug}`}>
          <span>% para el comprador</span>
          <span className="text-lg font-bold text-violet-800" data-testid="pct">
            {pct}%
          </span>
        </label>
        <input id={`pct-${d.slug}`} data-testid="slider" type="range" min={0} max={100} step={1} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="w-full" />
        <div className="grid grid-cols-2 gap-2 text-center text-sm" data-testid="vista-previa">
          <div className="rounded-xl bg-violet-50 p-3">
            <p className="text-xs text-violet-800">Comprador recibe ({pct}%)</p>
            <p className="text-xl font-bold text-violet-900">{fmtUsd(prev.buyer)}</p>
          </div>
          <div className="rounded-xl bg-violet-50 p-3">
            <p className="text-xs text-violet-800">Vendedor recibe ({100 - pct}%)</p>
            <p className="text-xl font-bold text-violet-900">{fmtUsd(prev.seller)}</p>
          </div>
          <p className="col-span-2 text-xs text-slate-500">
            USD de prueba netos. Comisiones descontadas por el contrato: plataforma {fmtUsd(prev.platform)} · Trustless Work {fmtUsd(prev.tw)}.{" "}
            <span data-testid="fuente-vista-previa">
              {fresh ? `Vista previa: ${fresh.source === "pp_arbiter.quote" ? "pp_arbiter.quote (simulación, sin firma)" : "calculada en el servidor"}` : "Calculando…"}
            </span>
          </p>
        </div>
      </div>

      {probe && (
        <div className={`rounded-xl p-4 text-sm ${probe.rejected ? "bg-rose-50 text-rose-900 ring-1 ring-rose-200" : "bg-amber-50 text-amber-900"}`} data-testid="resultado-desvio">
          <p className="font-semibold">
            {probe.rejected ? `🚫 Rechazado por el ${probe.by}` : "Atención"}: intento de mandar toda la plata a otra cuenta ({shortAddr(probe.foreign)})
          </p>
          {probe.call && <p className="mt-1 font-mono text-xs">{probe.call}</p>}
          {probe.raw && (
            <p className="mt-1 text-xs">
              Respuesta del contrato (simulación RPC, no se envió nada): <code className="font-mono font-semibold">{probe.raw}</code>
            </p>
          )}
          <p className="mt-1">{probe.detail}</p>
        </div>
      )}
      <ErrorBox error={error} />
      {hash && <TxLink hash={hash} label="Ver la resolución en Stellar" />}
      <TxList txs={d.txs} />

      <div className="flex flex-col gap-2 sm:flex-row">
        <button className="btn-secondary sm:flex-1" onClick={probar} disabled={busy !== null}>
          {busy === "probar" ? <Spinner /> : null} Probar: mandar la plata a otra cuenta
        </button>
        <button className="btn sm:flex-1 bg-violet-600 text-white hover:bg-violet-700" onClick={resolver} disabled={busy !== null}>
          {busy === "resolver" ? <Spinner /> : null} Resolver
        </button>
      </div>
    </article>
  );
}
