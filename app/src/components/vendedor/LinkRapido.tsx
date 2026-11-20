"use client";

import { useState } from "react";
import { ErrorBox, Spinner } from "@/components/ui";
import { CATEGORIAS, PROTECCION, linkAmounts, unitsToNumber } from "@/lib/format";
import { LINK_VACIO, type LinkRapido as Datos, type TipoFlete } from "@/lib/vendedor";
import { apiFirmada } from "@/lib/api-firmada";
import { getWallet } from "@/lib/wallet";

const nf = (n: number) => n.toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const FLETES: { v: Exclude<TipoFlete, "">; label: string }[] = [
  { v: "incluido", label: "Incluido" },
  { v: "por_pagar", label: "Por pagar" },
  { v: "aparte", label: "Más Bs…" },
];

/**
 * Link rápido (M9): en una sola pantalla, producto, precio, días de despacho y flete. Lo demás (categoría,
 * descripción y foto) va en "Más detalles". `plantilla` llena el formulario con un link anterior ("Duplicar").
 */
export function LinkRapido({
  sellerPubkey,
  fx,
  title,
  demo,
  plantilla,
  onCreated,
}: {
  sellerPubkey: string;
  fx: number;
  title: string;
  demo: boolean;
  plantilla: (Datos & { code: string | null }) | null;
  onCreated: (slug: string) => void;
}) {
  const [f, setF] = useState<Datos>(plantilla ?? LINK_VACIO);
  const [demoWindow, setDemoWindow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof Datos) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const price = Number(f.priceBs.replace(",", "."));
  const preview = price > 0 ? linkAmounts(Math.round(price * 100), fx, f.feePayer) : null;
  const sellerGets = preview ? (f.feePayer === "comprador" ? price : unitsToNumber(preview.amount) * fx * (1 - 0.023)) : 0;
  const buyerPays = preview ? unitsToNumber(preview.amount) * fx : 0;
  const masDetalles = Boolean(plantilla && (plantilla.description || plantilla.photoUrl || plantilla.category !== "Otro"));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (f.flete === "aparte" && !(Number(f.fleteBs.replace(",", ".")) > 0)) return setError("Escribe cuánto es el flete en Bs");
    setBusy(true);
    try {
      const o = await apiFirmada<{ slug: string }>(getWallet("vendedor"), "/api/links", {
        sellerPubkey,
        product: f.product,
        description: f.description,
        photoUrl: f.photoUrl,
        priceBs: f.priceBs,
        deliveryDays: Number(f.deliveryDays),
        category: f.category,
        feePayer: f.feePayer,
        demoWindow: demo && demoWindow,
        ...(f.flete ? { flete: f.flete, ...(f.flete === "aparte" ? { fleteBs: f.fleteBs } : {}) } : {}),
      });
      setF(LINK_VACIO);
      onCreated(o.slug);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4 scroll-mt-20" data-testid="crear-link" id="crear-link">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">{title}</h2>
        <span className="text-xs text-slate-500">Listo en 30 segundos</span>
      </div>
      {plantilla && (
        <p className="rounded-xl bg-brand-50 p-3 text-sm text-brand-900 ring-1 ring-brand-100" data-testid="duplicado">
          📄 Copia de {plantilla.code ?? "un link anterior"}: revisa los datos y crea el link nuevo para tu próximo cliente.
        </p>
      )}
      <div>
        <label className="label" htmlFor="product">
          Producto
        </label>
        <input id="product" className="input" value={f.product} onChange={set("product")} placeholder="Ej.: Zapatillas Nike talla 40" maxLength={80} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="price">
            Precio en Bs
          </label>
          <input id="price" className="input" value={f.priceBs} onChange={set("priceBs")} inputMode="decimal" placeholder="450" required />
        </div>
        <div>
          <label className="label" htmlFor="days">
            Días para despachar
          </label>
          <select id="days" className="input" value={f.deliveryDays} onChange={set("deliveryDays")}>
            {Array.from({ length: 15 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d} {d === 1 ? "día" : "días"}
              </option>
            ))}
          </select>
        </div>
      </div>
      <fieldset className="space-y-2" data-testid="flete-vendedor">
        <legend className="label">
          Flete <span className="font-normal text-slate-400">(quién paga el envío)</span>
        </legend>
        <div className="grid grid-cols-3 gap-2">
          {FLETES.map((x) => (
            <label
              key={x.v}
              className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-sm font-semibold ${f.flete === x.v ? "border-brand-500 bg-brand-50 text-brand-900" : "border-slate-200 text-slate-700"}`}
            >
              <input type="radio" name="flete" className="sr-only" checked={f.flete === x.v} onChange={() => setF({ ...f, flete: x.v })} />
              {x.label}
            </label>
          ))}
        </div>
        {f.flete === "aparte" && (
          <input aria-label="Flete en Bs" className="input" inputMode="decimal" value={f.fleteBs} onChange={set("fleteBs")} placeholder="Ej.: 25" />
        )}
        <p className="text-xs text-slate-500">
          {f.flete === "incluido"
            ? "El envío ya está en el precio."
            : f.flete === "por_pagar"
              ? "Tu cliente paga el flete al recoger."
              : f.flete === "aparte"
                ? "Tu cliente paga el flete aparte, fuera de este pago."
                : "Así tu cliente sabe desde el principio quién paga el envío."}
        </p>
      </fieldset>
      <fieldset className="space-y-2" data-testid="quien-paga">
        <legend className="label">¿Quién paga la protección?</legend>
        <label className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm ${f.feePayer === "comprador" ? "border-brand-500 bg-brand-50" : "border-slate-200"}`}>
          <input type="radio" name="fee" className="mt-1" checked={f.feePayer === "comprador"} onChange={() => setF({ ...f, feePayer: "comprador" })} />
          <span>
            <strong>El comprador</strong> ({PROTECCION.pct.toLocaleString("es-BO")}%, mín. Bs {PROTECCION.minBs}, máx. Bs {PROTECCION.maxBs}). Tú recibes el precio completo.
          </span>
        </label>
        <label className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm ${f.feePayer === "vendedor" ? "border-brand-500 bg-brand-50" : "border-slate-200"}`}>
          <input type="radio" name="fee" className="mt-1" checked={f.feePayer === "vendedor"} onChange={() => setF({ ...f, feePayer: "vendedor" })} />
          <span>
            <strong>Yo la regalo</strong> (2,3% de mi venta). Tu cliente paga solo el precio.
          </span>
        </label>
        {preview && (
          <p className="text-xs text-slate-600" data-testid="vista-previa-link">
            Tu cliente paga <strong>Bs {nf(buyerPays)}</strong> y tú recibes <strong>Bs {nf(sellerGets)}</strong>
            {f.feePayer === "vendedor" ? " (descontados 2% de plataforma y 0,3% de Trustless Work)" : ""}.
          </p>
        )}
      </fieldset>
      <details className="group rounded-xl border border-slate-200 p-3" open={masDetalles} data-testid="mas-detalles">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">Más detalles (opcional): categoría, descripción y foto</summary>
        <div className="mt-3 space-y-3">
          <div>
            <label className="label" htmlFor="category">
              Categoría <span className="font-normal text-slate-400">(si es celular, al despachar se pide el IMEI)</span>
            </label>
            <select id="category" className="input" value={f.category} onChange={set("category")}>
              {CATEGORIAS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="description">
              Descripción corta
            </label>
            <textarea id="description" className="input min-h-20" value={f.description} onChange={set("description")} maxLength={280} placeholder="Color, estado, qué incluye…" />
          </div>
          <div>
            <label className="label" htmlFor="photo">
              Foto <span className="font-normal text-slate-400">(link https://…)</span>
            </label>
            <input id="photo" className="input" value={f.photoUrl} onChange={set("photoUrl")} inputMode="url" placeholder="https://…" />
          </div>
        </div>
      </details>
      {demo && (
        <label className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          <input type="checkbox" className="mt-1" checked={demoWindow} onChange={(e) => setDemoWindow(e.target.checked)} />
          <span>
            <strong>Plazo corto de demo:</strong> liberación automática a los 2 minutos del pago.
          </span>
        </label>
      )}
      <ErrorBox error={error} />
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? <Spinner /> : null} Crear link
      </button>
    </form>
  );
}
