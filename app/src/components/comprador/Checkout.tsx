"use client";

import { useEffect, useState } from "react";
import { ErrorBox } from "@/components/ui";
import { CIUDADES, PROTECCION, fmtBs, fmtBsUnits, unitsToNumber } from "@/lib/format";
import { fmtDia, fmtPlazo, plazosDelPedido } from "@/lib/comprador";
import type { OrderView } from "@/lib/types";
import { Candado } from "./Estado";
import { Reputacion } from "./Vendedor";

const nf = (n: number) => n.toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Primer pantallazo: qué compras, cuánto pagas y a quién le compras. */
export function Producto({ v, compacto }: { v: OrderView; compacto?: boolean }) {
  const o = v.order;
  return (
    <section className="card overflow-hidden !p-0">
      {o.photo_url && !compacto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={o.photo_url} alt={o.product} className="h-40 w-full object-cover" />
      ) : null}
      <div className="p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-700" data-testid="codigo">
          Compra protegida · {o.code}
        </p>
        <h1 className={compacto ? "mt-1 font-semibold" : "mt-1 text-xl font-bold leading-snug"} data-testid="producto">
          {o.product}
        </h1>
        {o.description && !compacto && <p className="mt-0.5 text-sm text-slate-600">{o.description}</p>}
        <p className={compacto ? "muted" : "mt-2 text-3xl font-extrabold tracking-tight"} data-testid="total">
          {fmtBsUnits(o.amount_units, o.fx)}
          {!compacto && <span className="ml-2 align-middle text-sm font-medium text-slate-500">total</span>}
        </p>
        {!compacto && <Reputacion v={v} />}
      </div>
    </section>
  );
}

/** "Dos salidas": a dónde puede ir la plata, entendido en 3 segundos. */
export function DosSalidas({ v }: { v: OrderView }) {
  const o = v.order;
  const { despacho, revision } = plazosDelPedido(o);
  const limite = Date.now() + despacho * 1000;
  return (
    <section className="card space-y-3" data-testid="promesa">
      <div className="flex items-center gap-2 text-brand-700">
        <Candado cerrado className="h-6 w-6 flex-none" />
        <h2 className="text-lg font-bold leading-snug text-slate-900">Tu plata queda guardada. Solo tiene dos salidas:</h2>
      </div>
      <ul className="space-y-2 text-sm">
        <li className="flex items-start gap-3 rounded-xl bg-brand-50 p-3 ring-1 ring-brand-100" data-testid="salida-tienda">
          <span aria-hidden className="text-lg leading-none text-brand-700">→</span>
          <p>
            <strong>A {v.seller.store_name}</strong>, cuando confirmes que lo recibiste bien.
          </p>
        </li>
        <li className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200" data-testid="salida-comprador">
          <span aria-hidden className="text-lg leading-none text-slate-600">↩</span>
          <p>
            <strong>De vuelta a ti</strong>, si no lo despacha hasta el <strong>{fmtDia(limite)}</strong>.
          </p>
        </li>
      </ul>
      <p className="text-xs text-slate-500">
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
    <section className="card space-y-1 text-sm" data-testid="proteccion">
      <div className="flex justify-between">
        <span>Precio</span>
        <span>{fmtBs(o.price_bs_cents)}</span>
      </div>
      {o.fee_payer === "comprador" ? (
        <div className="flex justify-between gap-3">
          <span>
            Protección ({PROTECCION.pct.toLocaleString("es-BO")}%, mín. Bs {PROTECCION.minBs}, máx. Bs {PROTECCION.maxBs})
          </span>
          <span className="flex-none">Bs {nf(prot)}</span>
        </div>
      ) : (
        <div className="flex justify-between text-slate-600">
          <span>Protección</span>
          <span>la paga el vendedor</span>
        </div>
      )}
      <div className="flex justify-between border-t border-slate-100 pt-1 text-base font-bold">
        <span>Total</span>
        <span>Bs {nf(totalNum)}</span>
      </div>
      {o.fee_payer === "comprador" && <p className="text-xs text-slate-500">El vendedor recibe el precio completo.</p>}
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
    <details className="card text-sm" data-testid="como-funciona">
      <summary className="cursor-pointer font-semibold">¿Cómo funciona?</summary>
      <ol className="mt-3 space-y-2">
        {pasos.map((s, i) => (
          <li key={s} className="flex gap-3">
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-slate-500">Si necesitas más tiempo para revisar, puedes pedirlo una vez. Te avisamos un día antes de que se le pague a la tienda.</p>
    </details>
  );
}

/** Botón de pagar fijo abajo: siempre a la vista, con el total. */
export function BarraPagar({ total, onPagar, disabled }: { total: string; onPagar: () => void; disabled?: boolean }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 pt-3 shadow-[0_-4px_16px_rgba(15,23,42,0.06)] backdrop-blur" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }} data-testid="barra-pagar">
      <div className="mx-auto max-w-md">
        <button type="button" className="btn-primary w-full py-4 text-lg" onClick={onPagar} disabled={disabled}>
          🔒 Pagar {total} con QR
        </button>
        <p className="mt-1 text-center text-[11px] text-slate-500">La tienda cobra recién cuando confirmes que te llegó.</p>
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
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40" role="dialog" aria-modal="true" aria-labelledby="hoja-entrega-titulo" onClick={onCerrar}>
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 20px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-200" aria-hidden />
        {aviso}
        <FormEntrega total={total} onCerrar={onCerrar} onContinuar={onContinuar} />
      </div>
    </div>
  );
}

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
      <h2 id="hoja-entrega-titulo" className="text-lg font-bold">
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
          Agencia preferida <span className="font-normal text-slate-400">(opcional)</span>
        </label>
        <input id="agency" className="input" value={f.agency} onChange={set("agency")} placeholder="Ej.: Trans Copacabana, terminal" />
      </div>
      <div>
        <label className="label" htmlFor="pickup-phone">
          Teléfono de quien recoge <span className="font-normal text-slate-400">(opcional)</span>
        </label>
        <input id="pickup-phone" className="input" inputMode="tel" value={f.pickupPhone} onChange={set("pickupPhone")} placeholder="Ej.: 591 70011223" />
        <p className="mt-1 text-xs text-slate-500">Las empresas de encomiendas lo piden para entregar. Solo lo ve la tienda.</p>
      </div>
      <div>
        <label className="label" htmlFor="flete">
          ¿Y el flete? <span className="font-normal text-slate-400">(opcional)</span>
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
        <p className="mt-1 text-xs text-slate-500">Es lo que acordaron; no cambia el monto que queda guardado.</p>
      </div>
      <div>
        <label className="label" htmlFor="buyer-wa">
          Tu WhatsApp para avisarte <span className="font-normal text-slate-400">(opcional)</span>
        </label>
        <input id="buyer-wa" className="input" inputMode="tel" value={f.whatsapp} onChange={set("whatsapp")} placeholder="Ej.: 591 76543210" autoComplete="tel" />
        <p className="mt-1 text-xs text-slate-500">Te avisamos cuando despachen y un día antes de que se le pague a la tienda. No se muestra a nadie.</p>
      </div>
      <ErrorBox error={error} />
      <button className="btn-primary w-full py-4 text-lg">Ver el QR para pagar {total}</button>
      <button type="button" className="btn-secondary w-full" onClick={onCerrar}>
        Cerrar
      </button>
    </form>
  );
}
