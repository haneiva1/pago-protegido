"use client";

import { useEffect, useState } from "react";
import { EvidenciaInput } from "@/components/EvidenciaInput";
import { ErrorBox, Progress, Spinner, useProgress } from "@/components/ui";
import { CIUDADES, EMPRESAS } from "@/lib/format";
import type { SellerOrder } from "@/lib/types";
import { api, getWallet, signAndSubmit, type PreparedTx } from "@/lib/wallet";

/**
 * Registrar el envío (M9): empresa, guía, peso y destino, y las fotos de la guía y del paquete desde la cámara
 * (EvidenciaInput). Cada foto se sube con su huella SHA-256 y esa huella va en la evidencia de mark_shipped.
 */
export function EnvioForm({ o, sellerPubkey, prefill, onDone }: { o: SellerOrder; sellerPubkey: string; prefill: string | null; onDone: () => void }) {
  const [f, setF] = useState({ company: "", tracking: prefill ?? "", weight: "", city: o.dest_city ?? "", imei: "" });
  const [fotoGuia, setFotoGuia] = useState("");
  const [fotoPaquete, setFotoPaquete] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const progress = useProgress();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const id = (k: string) => `${k}-${o.slug}`;

  useEffect(() => {
    if (prefill) setF((cur) => ({ ...cur, tracking: cur.tracking || prefill }));
  }, [prefill]);

  async function ship(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    progress.reset();
    try {
      const body = { action: "ship", signer: sellerPubkey, ...f, photo: fotoPaquete, ...(fotoGuia ? { photoGuia: fotoGuia } : {}) };
      const prepared = await api<PreparedTx>(`/api/orders/${o.slug}/action`, body);
      await signAndSubmit(getWallet("vendedor"), prepared, progress.push);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={ship} className="space-y-3" data-testid="form-envio">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={id("company")}>
            Empresa de envío
          </label>
          <select id={id("company")} className="input" value={f.company} onChange={set("company")} required>
            <option value="">Elige…</option>
            {EMPRESAS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={id("tracking")}>
            Número de guía
          </label>
          <input id={id("tracking")} className="input" value={f.tracking} onChange={set("tracking")} placeholder="Ej.: SRV-2026-118734" />
        </div>
        <div>
          <label className="label" htmlFor={id("weight")}>
            Peso declarado (kg)
          </label>
          <input id={id("weight")} className="input" value={f.weight} onChange={set("weight")} inputMode="decimal" placeholder="1,2" required />
        </div>
        <div>
          <label className="label" htmlFor={id("city")}>
            Ciudad de destino
          </label>
          <select id={id("city")} className="input" value={f.city} onChange={set("city")} required>
            <option value="">Elige…</option>
            {CIUDADES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-3 rounded-xl bg-slate-50 p-3" data-testid="fotos-envio">
        <p className="text-xs text-slate-600">
          📷 Saca las fotos desde aquí. Cada una se guarda con su huella y la huella queda en el registro del envío: si hay un reclamo, el revisor
          comprueba que son las mismas.
        </p>
        <EvidenciaInput id={id("guia")} pedido={o.slug} tipo="foto" label="Foto de la guía" nota="(el comprobante de la empresa)" onChange={setFotoGuia} />
        <EvidenciaInput id={id("paquete")} pedido={o.slug} tipo="foto" label="Foto del paquete" nota={`(con el código ${o.code} escrito a mano)`} onChange={setFotoPaquete} />
      </div>
      {o.category === "Celular" && (
        <div>
          <label className="label" htmlFor={id("imei")}>
            IMEI del celular <span className="font-normal text-slate-400">(obligatorio; marca *#06# en el equipo)</span>
          </label>
          <input id={id("imei")} className="input" value={f.imei} onChange={set("imei")} inputMode="numeric" placeholder="15 dígitos" />
        </div>
      )}
      <ErrorBox error={error} />
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? <Spinner /> : null} Marcar como enviado
      </button>
      <Progress steps={progress.steps} />
    </form>
  );
}
