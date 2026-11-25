"use client";

import { useState } from "react";
import { IconoCopiar } from "@/components/iconos";
import { Select } from "@/components/comprador/Campos";
import { ErrorBox, Spinner } from "@/components/ui";
import { CATEGORIAS, PROTECCION, linkAmounts, unitsToNumber } from "@/lib/format";
import { mensajeDeError, parseFlete } from "@/lib/comprador";
import { LINK_VACIO, resumenLink, type LinkRapido as Datos, type TipoFlete } from "@/lib/vendedor";
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

/** El link recién creado, con lo justo para armar el mensaje del cliente sin esperar a que recargue el panel. */
export interface LinkCreado {
  slug: string;
  product: string;
  price_bs_cents: number;
  flete: string | null;
}

/**
 * Crear link: a la vista, producto, precio y el botón. Días de despacho, flete y quién paga la protección van con sus
 * valores por defecto en una línea de resumen con "Cambiar" (ahí también están categoría, descripción y foto).
 * `plantilla` llena el formulario con un link anterior ("Duplicar").
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
  onCreated: (link: LinkCreado) => void;
}) {
  const [f, setF] = useState<Datos>(plantilla ?? LINK_VACIO);
  const [opciones, setOpciones] = useState(false);
  const [demoWindow, setDemoWindow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof Datos) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const price = Number(f.priceBs.replace(",", "."));
  const preview = price > 0 ? linkAmounts(Math.round(price * 100), fx, f.feePayer) : null;
  const sellerGets = preview ? (f.feePayer === "comprador" ? price : unitsToNumber(preview.amount) * fx * (1 - 0.023)) : 0;
  const buyerPays = preview ? unitsToNumber(preview.amount) * fx : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (f.product.trim().length < 2) return setError("Escribe qué vendes");
    if (!(price > 0)) return setError("Escribe el precio en Bs");
    if (f.flete === "aparte" && !(Number(f.fleteBs.replace(",", ".")) > 0)) {
      setOpciones(true);
      return setError("Escribe cuánto es el flete en Bs");
    }
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
      onCreated({ slug: o.slug, product: f.product.trim(), price_bs_cents: Math.round(price * 100), flete: parseFlete(f.flete, f.fleteBs) });
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="card space-y-4 scroll-mt-20 sm:p-6" data-testid="crear-link" id="crear-link">
      <h2 className="text-2xl">{title}</h2>
      {plantilla && (
        <p className="caja-exito flex items-start gap-2" data-testid="duplicado">
          <IconoCopiar className="mt-0.5 h-4 w-4 flex-none text-musgo" />
          <span>Copia de {plantilla.code ?? "un link anterior"}. Revisa y crea el link.</span>
        </p>
      )}
      <div>
        <label className="label" htmlFor="product">
          Producto
        </label>
        <input id="product" className="input" value={f.product} onChange={set("product")} placeholder="Ej.: Zapatillas Nike talla 40" maxLength={80} enterKeyHint="next" />
      </div>
      <div>
        <label className="label" htmlFor="price">
          Precio en Bs
        </label>
        <input id="price" className="input num" value={f.priceBs} onChange={set("priceBs")} inputMode="decimal" placeholder="450" enterKeyHint="done" />
        {preview && (
          <p className="mt-2 text-base text-tinta-700" data-testid="vista-previa-link">
            Tu cliente paga <strong className="num">Bs {nf(buyerPays)}</strong> y tú recibes <strong className="num">Bs {nf(sellerGets)}</strong>.
          </p>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 rounded-control bg-tinta-50 py-1 pl-3.5 pr-1.5">
        <p className="min-w-0 py-2 text-sm text-tinta-600" data-testid="resumen-link">
          {resumenLink(f)}
        </p>
        <button type="button" className="btn-ghost btn-sm flex-none text-musgo" aria-expanded={opciones} aria-controls="opciones-link" onClick={() => setOpciones((x) => !x)} data-testid="cambiar-opciones">
          {opciones ? "Listo" : "Cambiar"}
        </button>
      </div>
      {opciones && (
        <div className="space-y-4 animate-aparecer" id="opciones-link" data-testid="opciones-link">
          <div>
            <label className="label" htmlFor="days">
              Días para despachar
            </label>
            <Select id="days" value={f.deliveryDays} onChange={set("deliveryDays")}>
              {Array.from({ length: 15 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d} {d === 1 ? "día" : "días"}
                </option>
              ))}
            </Select>
          </div>
          <fieldset className="space-y-2" data-testid="flete-vendedor">
            <legend className="label">Flete</legend>
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
          </fieldset>
          <fieldset className="space-y-2" data-testid="quien-paga">
            <legend className="label">¿Quién paga la protección?</legend>
            <label className={`flex min-h-11 cursor-pointer items-start gap-2.5 rounded-control border p-3 text-sm transition-colors duration-150 ${f.feePayer === "comprador" ? OPCION_ACTIVA : OPCION}`}>
              <input type="radio" name="fee" className="mt-1 accent-monte" checked={f.feePayer === "comprador"} onChange={() => setF({ ...f, feePayer: "comprador" })} />
              <span>
                <strong>El comprador</strong> ({String(PROTECCION.pct).replace(".", ",")}%, mín. Bs {PROTECCION.minBs}, máx. Bs {PROTECCION.maxBs})
              </span>
            </label>
            <label className={`flex min-h-11 cursor-pointer items-start gap-2.5 rounded-control border p-3 text-sm transition-colors duration-150 ${f.feePayer === "vendedor" ? OPCION_ACTIVA : OPCION}`}>
              <input type="radio" name="fee" className="mt-1 accent-monte" checked={f.feePayer === "vendedor"} onChange={() => setF({ ...f, feePayer: "vendedor" })} />
              <span>
                <strong>Yo la regalo</strong> (2,3% de mi venta: 2% de plataforma y 0,3% de Trustless Work)
              </span>
            </label>
          </fieldset>
          <div>
            <label className="label" htmlFor="category">
              Categoría <span className="font-normal text-tinta-500">(si es celular, al despachar se pide el IMEI)</span>
            </label>
            <Select id="category" value={f.category} onChange={set("category")}>
              {CATEGORIAS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="label" htmlFor="description">
              Descripción corta <span className="font-normal text-tinta-500">(opcional)</span>
            </label>
            <textarea id="description" className="input min-h-20" value={f.description} onChange={set("description")} maxLength={280} placeholder="Color, estado, qué incluye…" />
          </div>
          <div>
            <label className="label" htmlFor="photo">
              Foto <span className="font-normal text-tinta-500">(link https://…, opcional)</span>
            </label>
            <input id="photo" className="input" value={f.photoUrl} onChange={set("photoUrl")} inputMode="url" placeholder="https://…" />
          </div>
        </div>
      )}
      {demo && (
        <label className="caja-aviso flex items-start gap-2.5">
          <input type="checkbox" className="mt-1 accent-monte" checked={demoWindow} onChange={(e) => setDemoWindow(e.target.checked)} />
          <span>
            <strong>Plazo corto de demo:</strong> liberación automática a los 2 minutos del pago.
          </span>
        </label>
      )}
      <ErrorBox error={error} />
      <button className="btn-primary w-full py-4 text-lg" disabled={busy}>
        {busy ? <Spinner /> : null} Crear link
      </button>
    </form>
  );
}
