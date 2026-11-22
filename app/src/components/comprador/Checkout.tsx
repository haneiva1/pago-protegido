"use client";

import { useEffect, useState } from "react";
import { IconoCandado, IconoChevronAbajo, IconoFlechaDerecha, IconoVolver } from "@/components/iconos";
import { ErrorBox } from "@/components/ui";
import { CIUDADES, PROTECCION, fmtBs, fmtBsUnits, unitsToNumber } from "@/lib/format";
import { fmtDia, fmtPlazo, plazosDelPedido } from "@/lib/comprador";
import type { OrderView } from "@/lib/types";
import { Reputacion } from "./Vendedor";

const nf = (n: number) => n.toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Primer pantallazo: qué compras, cuánto pagas y a quién le compras. */
export function Producto({ v, compacto }: { v: OrderView; compacto?: boolean }) {
  const o = v.order;
  return (
    <section className={compacto ? "space-y-1 border-t border-tinta-200 pt-6" : "space-y-3"}>
      {o.photo_url && !compacto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={o.photo_url} alt={o.product} className="h-48 w-full rounded-card object-cover" />
      ) : null}
      <p className="eyebrow" data-testid="codigo">
        Compra protegida · {o.code}
      </p>
      <h1 className={compacto ? "font-sans text-base font-semibold" : "text-3xl leading-tight"} data-testid="producto">
        {o.product}
      </h1>
      {o.description && !compacto && <p className="text-base text-tinta-600">{o.description}</p>}
      <p className={compacto ? "text-base text-tinta-600 num" : "font-display text-5xl leading-none tracking-tight text-monte num"} data-testid="total">
        {fmtBsUnits(o.amount_units, o.fx)}
        {!compacto && <span className="ml-2 align-middle font-sans text-base font-medium tracking-normal text-tinta-600">total</span>}
      </p>
      {!compacto && <Reputacion v={v} />}
    </section>
  );
}

/** La promesa, en Monte: la plata espera entre los dos y solo tiene dos salidas. Se entiende en 3 segundos. */
export function DosSalidas({ v }: { v: OrderView }) {
  const o = v.order;
  const { despacho, revision } = plazosDelPedido(o);
  const limite = Date.now() + despacho * 1000;
  return (
    <section className="panel-oscuro space-y-3 !p-5 sm:!p-6" data-testid="promesa" data-oscuro="">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-yungas/15 text-yungas">
          <IconoCandado className="h-5 w-5" />
        </span>
        <h2 className="text-2xl leading-snug text-sal">Tu plata espera entre los dos. Solo tiene dos salidas:</h2>
      </div>
      <ul className="divide-y divide-white/10 text-base">
        <li className="flex items-start gap-3 py-3" data-testid="salida-tienda">
          <IconoFlechaDerecha className="mt-0.5 h-5 w-5 flex-none text-yungas" />
          <p className="text-sal/90">
            <strong className="text-sal">A {v.seller.store_name}</strong>, cuando confirmes que lo recibiste bien.
          </p>
        </li>
        <li className="flex items-start gap-3 py-3" data-testid="salida-comprador">
          <IconoVolver className="mt-0.5 h-5 w-5 flex-none text-yungas" />
          <p className="text-sal/90">
            <strong className="text-sal">De vuelta a ti</strong>, si no lo despacha hasta el <strong className="text-sal">{fmtDia(limite)}</strong>.
          </p>
        </li>
      </ul>
      <p className="text-sm leading-relaxed text-sal/75">
        ¿Llega mal? Abres un reclamo y un revisor decide. Si no confirmas ni reclamas, se le paga a la tienda {fmtPlazo(revision)} después del envío.
      </p>
    </section>
  );
}

export function Proteccion({ v }: { v: OrderView }) {
  const o = v.order;
  const totalNum = unitsToNumber(o.amount_units) * o.fx;
  const prot = totalNum - o.price_bs_cents / 100;
  return (
    <section className="text-base" data-testid="proteccion">
      <h2 className="font-sans text-lg font-semibold">Qué pagas</h2>
      <dl className="mt-2 divide-y divide-tinta-200/80">
        <div className="flex justify-between gap-3 py-2.5">
          <dt className="text-tinta-600">Precio</dt>
          <dd className="num">{fmtBs(o.price_bs_cents)}</dd>
        </div>
        {o.fee_payer === "comprador" ? (
          <div className="flex justify-between gap-3 py-2.5">
            <dt className="text-tinta-600">
              Protección <span className="text-sm text-tinta-500">({String(PROTECCION.pct).replace(".", ",")}%, mín. Bs {PROTECCION.minBs}, máx. Bs {PROTECCION.maxBs})</span>
            </dt>
            <dd className="flex-none num">Bs {nf(prot)}</dd>
          </div>
        ) : (
          <div className="flex justify-between gap-3 py-2.5">
            <dt className="text-tinta-600">Protección</dt>
            <dd className="text-tinta-600">la paga el vendedor</dd>
          </div>
        )}
        <div className="flex justify-between gap-3 py-2.5 font-semibold">
          <dt>Total</dt>
          <dd className="num">Bs {nf(totalNum)}</dd>
        </div>
      </dl>
      {o.fee_payer === "comprador" && <p className="mt-2 text-sm text-tinta-600">El vendedor recibe el precio completo.</p>}
    </section>
  );
}

/** Cómo funciona, en tres pasos, plegado para no empujar el botón de pagar. */
export function ComoFunciona() {
  const pasos = [
    "Pagas con QR desde tu banco.",
    "Tu pago queda guardado. El vendedor ve que pagaste, pero no puede cobrar.",
    "Cuando te llegue, lo revisas y confirmas. Recién ahí se le paga.",
  ];
  return (
    <details className="group border-t border-tinta-200 pt-5 text-base" data-testid="como-funciona">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-lg font-semibold [&::-webkit-details-marker]:hidden">
        ¿Cómo funciona?
        <IconoChevronAbajo className="h-5 w-5 flex-none text-tinta-500 transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <ol className="mt-4 space-y-3">
        {pasos.map((s, i) => (
          <li key={s} className="flex gap-3">
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-yungas text-xs font-semibold text-monte num">{i + 1}</span>
            <span className="text-tinta-700">{s}</span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm text-tinta-600">Si necesitas más tiempo para revisar, puedes pedirlo una vez. Te avisamos un día antes de que se le pague a la tienda.</p>
    </details>
  );
}

/** Botón de pagar fijo abajo: siempre a la vista, con el total. */
export function BarraPagar({ total, onPagar, disabled }: { total: string; onPagar: () => void; disabled?: boolean }) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t border-tinta-200 bg-white px-4 pt-3 shadow-[0_-8px_24px_-16px_rgb(10_42_27/0.25)]"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
      data-testid="barra-pagar"
    >
      <div className="mx-auto max-w-md">
        <button type="button" className="btn-primary w-full py-4 text-lg" onClick={onPagar} disabled={disabled}>
          <IconoCandado className="h-5 w-5" />
          Pagar {total} con QR
        </button>
        <p className="mt-2 text-center text-sm text-tinta-600">La tienda cobra recién cuando confirmes que te llegó.</p>
      </div>
    </div>
  );
}

export interface DatosEntrega {
  recipient: string;
  city: string;
  agency: string;
  whatsapp?: string;
  /** Teléfono de quien recoge (las empresas lo piden para entregar). */
  pickupPhone?: string;
  /** "incluido" | "por_pagar" | "aparte" (con fleteBs). */
  flete?: string;
  fleteBs?: string;
}

/** Hoja que sube desde abajo con los datos de entrega. Al continuar se muestra el QR. */
export function HojaEntrega({
  total,
  abierta,
  onCerrar,
  onContinuar,
  aviso,
}: {
  total: string;
  abierta: boolean;
  onCerrar: () => void;
  onContinuar: (x: DatosEntrega) => void;
  aviso?: React.ReactNode;
}) {
  useEffect(() => {
    if (!abierta) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [abierta, onCerrar]);
  if (!abierta) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-monte/50" role="dialog" aria-modal="true" aria-labelledby="hoja-entrega-titulo" onClick={onCerrar}>
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-panel bg-white p-5 shadow-alzada animate-aparecer"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 20px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-tinta-200" aria-hidden />
        {aviso}
        <FormEntrega total={total} onCerrar={onCerrar} onContinuar={onContinuar} />
      </div>
    </div>
  );
}

const Opcional = () => <span className="font-normal text-tinta-500">(opcional)</span>;

function FormEntrega({ total, onCerrar, onContinuar }: { total: string; onCerrar: () => void; onContinuar: (x: DatosEntrega) => void }) {
  const [f, setF] = useState({ recipient: "", city: "", agency: "", whatsapp: "", pickupPhone: "", flete: "", fleteBs: "" });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="space-y-3"
      data-testid="datos-entrega"
      onSubmit={(e) => {
        e.preventDefault();
        if (f.recipient.trim().length < 2) return setError("Escribe quién recibe el pedido");
        if (!f.city) return setError("Elige la ciudad de destino");
        if (f.flete === "aparte" && !(Number(f.fleteBs.replace(",", ".")) > 0)) return setError("Escribe cuánto es el flete en Bs");
        setError(null);
        onContinuar({
          recipient: f.recipient,
          city: f.city,
          agency: f.agency,
          ...(f.whatsapp.trim() ? { whatsapp: f.whatsapp } : {}),
          ...(f.pickupPhone.trim() ? { pickupPhone: f.pickupPhone } : {}),
          ...(f.flete ? { flete: f.flete, ...(f.flete === "aparte" ? { fleteBs: f.fleteBs } : {}) } : {}),
        });
      }}
    >
      <h2 id="hoja-entrega-titulo" className="text-2xl">
        ¿A dónde lo envían?
      </h2>
      <div>
        <label className="label" htmlFor="recipient">
          Quién recibe
        </label>
        <input id="recipient" className="input" value={f.recipient} onChange={set("recipient")} placeholder="Nombre y apellido" autoComplete="name" />
      </div>
      <div>
        <label className="label" htmlFor="dest-city">
          Ciudad de destino
        </label>
        <select id="dest-city" className="input" value={f.city} onChange={set("city")}>
          <option value="">Elige…</option>
          {CIUDADES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="agency">
          Agencia preferida <Opcional />
        </label>
        <input id="agency" className="input" value={f.agency} onChange={set("agency")} placeholder="Ej.: Trans Copacabana, terminal" />
      </div>
      <div>
        <label className="label" htmlFor="pickup-phone">
          Teléfono de quien recoge <Opcional />
        </label>
        <input id="pickup-phone" className="input" inputMode="tel" value={f.pickupPhone} onChange={set("pickupPhone")} placeholder="Ej.: 591 70011223" />
        <p className="mt-1 text-xs text-tinta-500">Las empresas de encomiendas lo piden para entregar. Solo lo ve la tienda.</p>
      </div>
      <div>
        <label className="label" htmlFor="flete">
          ¿Y el flete? <Opcional />
        </label>
        <select id="flete" className="input" value={f.flete} onChange={set("flete")}>
          <option value="">Lo veo con la tienda</option>
          <option value="incluido">Incluido en el precio</option>
          <option value="por_pagar">Por pagar al recoger</option>
          <option value="aparte">Aparte: más Bs …</option>
        </select>
        {f.flete === "aparte" && (
          <input id="flete-bs" aria-label="Flete en Bs" className="input mt-2" inputMode="decimal" value={f.fleteBs} onChange={set("fleteBs")} placeholder="Ej.: 25" />
        )}
        <p className="mt-1 text-xs text-tinta-500">Es lo que acordaron; no cambia el monto que queda guardado.</p>
      </div>
      <div>
        <label className="label" htmlFor="buyer-wa">
          Tu WhatsApp para avisarte <Opcional />
        </label>
        <input id="buyer-wa" className="input" inputMode="tel" value={f.whatsapp} onChange={set("whatsapp")} placeholder="Ej.: 591 76543210" autoComplete="tel" />
        <p className="mt-1 text-xs text-tinta-500">Te avisamos cuando despachen y un día antes de que se le pague a la tienda. No se muestra a nadie.</p>
      </div>
      <ErrorBox error={error} />
      <button className="btn-primary w-full py-4 text-lg">Ver el QR para pagar {total}</button>
      <button type="button" className="btn-secondary w-full" onClick={onCerrar}>
        Cerrar
      </button>
    </form>
  );
}
