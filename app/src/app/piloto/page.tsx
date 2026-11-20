"use client";

import Link from "next/link";
import { useState } from "react";
import { ErrorBox, Spinner } from "@/components/ui";
import { CIUDADES } from "@/lib/format";
import { api } from "@/lib/wallet";

/** Lista de espera del piloto con vendedores reales. Se guarda en SQLite; `npm run piloto:csv` la exporta. */
export default function Piloto() {
  const [f, setF] = useState({ name: "", store: "", city: "", sells: "", shipsTo: "", avgTicket: "", whatsapp: "" });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; whatsapp: string } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setDone(await api<{ id: string; whatsapp: string }>("/api/piloto", { ...f, consent }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <div className="card mx-auto max-w-md space-y-3 text-center" data-testid="piloto-listo">
        <h1 className="text-2xl font-bold">¡Estás en la lista! 🙌</h1>
        <p className="text-slate-600">Te escribimos por WhatsApp para empezar el piloto. Si quieres, crea tu tienda ahora: quedará marcada como vendedor del piloto.</p>
        <Link className="btn-primary w-full" href={`/vender?piloto=${done.id}&wa=${done.whatsapp}`}>
          Crear mi tienda ahora
        </Link>
      </div>
    );

  const field = (k: keyof typeof f, label: string, placeholder: string, extra: Record<string, string> = {}) => (
    <div>
      <label className="label" htmlFor={`p-${k}`}>
        {label}
      </label>
      <input id={`p-${k}`} className="input" value={f[k]} onChange={set(k)} placeholder={placeholder} {...extra} />
    </div>
  );

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Piloto con vendedores reales</h1>
      <p className="text-slate-600">
        Buscamos tiendas de celulares y electrónica que vendan a otras ciudades por encomienda (tickets de Bs 1.000 a 7.000). Anótate y te acompañamos en tus primeras ventas protegidas.
      </p>
      <form className="card space-y-3" onSubmit={submit} data-testid="form-piloto">
        {field("name", "Tu nombre", "Nombre y apellido")}
        {field("store", "Nombre de la tienda", "Ej.: Tienda Sofi")}
        <div>
          <label className="label" htmlFor="p-city">
            Ciudad
          </label>
          <select id="p-city" className="input" value={f.city} onChange={set("city")}>
            <option value="">Elige…</option>
            {CIUDADES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        {field("sells", "¿Qué vendes?", "Ej.: zapatillas, celulares, ropa")}
        {field("shipsTo", "¿A qué ciudades envías?", "Ej.: La Paz, Cochabamba, Santa Cruz")}
        {field("avgTicket", "Ticket promedio (Bs)", "Ej.: 450", { inputMode: "decimal" })}
        {field("whatsapp", "WhatsApp", "Ej.: 591 71234567", { inputMode: "tel" })}
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>Acepto que Trato guarde estos datos y me escriba por WhatsApp sobre el piloto.</span>
        </label>
        <ErrorBox error={error} />
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? <Spinner /> : null} Quiero entrar al piloto
        </button>
      </form>
    </div>
  );
}
