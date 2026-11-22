"use client";

import { useState } from "react";
import { IconoChevronAbajo, IconoCopiar } from "@/components/iconos";
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

const OPCION_ACTIVA = "border-musgo bg-exito-50 text-monte";
const OPCION = "border-tinta-200 bg-white text-tinta-700 hover:bg-tinta-50";

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
    <form onSubmit={submit} className="card space-y-4 scroll-mt-20 sm:p-6" data-testid="crear-link" id="crear-link">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl">{title}</h2>
        <span className="text-sm text-tinta-500">Listo en 30 segundos</span>
      </div>
      {plantilla && (
        <p className="caja-exito flex items-start gap-2" data-testid="duplicado">
          <IconoCopiar className="mt-0.5 h-4 w-4 flex-none text-musgo" />
          <span>Copia de {plantilla.code ?? "un link anterior"}: revisa los datos y crea el link nuevo para tu próximo cliente.</span>
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
          <input id="price" className="input num" value={f.priceBs} onChange={set("priceBs")} inputMode="decimal" placeholder="450" required />
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
          Flete <span className="font-normal text-tinta-500">(quién paga el envío)</span>
        </legend>
        <div className="grid grid-cols-3 gap-2">
          {FLETES.map((x) => (
            <label
              key={x.v}
              className={`flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-control border px-2 py-2.5 text-sm font-semibold transition-colors duration-150 ${f.flete === x.v ? OPCION_ACTIVA : OPCION}`}
            >
              <input type="radio" name="flete" className="sr-only" checked={f.flete === x.v} onChange={() => setF({ ...f, flete: x.v })} />
              {x.label}
            </label>
          ))}
        </div>
        {f.flete === "aparte" && (
          <input aria-label="Flete en Bs" className="input" inputMode="decimal" value={f.fleteBs} onChange={set("fleteBs")} placeholder="Ej.: 25" />
        )}
        <p className="text-xs text-tinta-500">
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
        <label className={`flex cursor-pointer items-start gap-2.5 rounded-control border p-3 text-sm transition-colors duration-150 ${f.feePayer === "comprador" ? OPCION_ACTIVA : OPCION}`}>
          <input type="radio" name="fee" className="mt-1 accent-monte" checked={f.feePayer === "comprador"} onChange={() => setF({ ...f, feePayer: "comprador" })} />
          <span>
            <strong>El comprador</strong> ({String(PROTECCION.pct).replace(".", ",")}%, mín. Bs {PROTECCION.minBs}, máx. Bs {PROTECCION.maxBs}). Tú recibes el precio completo.
          </span>
        </label>
        <label className={`flex cursor-pointer items-start gap-2.5 rounded-control border p-3 text-sm transition-colors duration-150 ${f.feePayer === "vendedor" ? OPCION_ACTIVA : OPCION}`}>
          <input type="radio" name="fee" className="mt-1 accent-monte" checked={f.feePayer === "vendedor"} onChange={() => setF({ ...f, feePayer: "vendedor" })} />
          <span>
            <strong>Yo la regalo</strong> (2,3% de mi venta). Tu cliente paga solo el precio.
          </span>
        </label>
        {preview && (
          <p className="text-base text-tinta-700" data-testid="vista-previa-link">
            Tu cliente paga <strong className="num">Bs {nf(buyerPays)}</strong> y tú recibes <strong className="num">Bs {nf(sellerGets)}</strong>
            {f.feePayer === "vendedor" ? " (descontados 2% de plataforma y 0,3% de Trustless Work)" : ""}.
          </p>
        )}
      </fieldset>
      <details className="group border-t border-tinta-200 pt-3" open={masDetalles} data-testid="mas-detalles">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-base font-semibold text-tinta-700 [&::-webkit-details-marker]:hidden">
          Más detalles (opcional): categoría, descripción y foto
          <IconoChevronAbajo className="h-5 w-5 flex-none text-tinta-500 transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <div className="mt-3 space-y-3">
          <div>
            <label className="label" htmlFor="category">
              Categoría <span className="font-normal text-tinta-500">(si es celular, al despachar se pide el IMEI)</span>
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
              Foto <span className="font-normal text-tinta-500">(link https://…)</span>
            </label>
            <input id="photo" className="input" value={f.photoUrl} onChange={set("photoUrl")} inputMode="url" placeholder="https://…" />
          </div>
        </div>
      </details>
      {demo && (
        <label className="caja-aviso flex items-start gap-2.5">
          <input type="checkbox" className="mt-1 accent-monte" checked={demoWindow} onChange={(e) => setDemoWindow(e.target.checked)} />
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
