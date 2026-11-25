"use client";

import { useEffect, useRef, useState } from "react";
import { IconoCandado, IconoChevronAbajo, IconoReloj } from "@/components/iconos";
import { CopyButton } from "@/components/ui";
import { CIUDADES, DOLLAR_NOTE, PROTECCION, fmtBs, fmtBsUnits, unitsToNumber } from "@/lib/format";
import { fmtDia, fmtFlete, fmtPlazo, plazosDelPedido } from "@/lib/comprador";
import { leerEntrega, type DatosEntrega } from "@/lib/compra-local";
import { ES_MAINNET } from "@/lib/red";
import type { OrderView } from "@/lib/types";
import { Select } from "./Campos";
import { VendidoPor } from "./Vendedor";

export type { DatosEntrega };

const nf = (n: number) => n.toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Qué compras, cuánto pagas (con la protección a la vista, en una línea) y a quién le compras. */
export function Producto({ v }: { v: OrderView }) {
  const o = v.order;
  const total = unitsToNumber(o.amount_units) * o.fx;
  return (
    <section className="space-y-2">
      {o.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={o.photo_url} alt={o.product} className="h-44 w-full rounded-card object-cover" />
      ) : null}
      <p className="eyebrow" data-testid="codigo">
        Pedido {o.code}
      </p>
      <h1 className="text-2xl leading-tight" data-testid="producto">
        {o.product}
      </h1>
      {o.description && <p className="text-base text-tinta-600">{o.description}</p>}
      <p className="font-display text-5xl leading-none tracking-tight text-monte num" data-testid="total">
        {fmtBsUnits(o.amount_units, o.fx)}
      </p>
      <p className="text-sm text-tinta-600 num" data-testid="proteccion">
        {o.fee_payer === "comprador" ? (
          <>
            {fmtBs(o.price_bs_cents)} + Bs {nf(total - o.price_bs_cents / 100)} de protección
          </>
        ) : (
          "Precio final: la protección la paga el vendedor"
        )}
      </p>
      <VendidoPor v={v} />
    </section>
  );
}

/** La promesa en dos líneas: a dónde puede ir la plata. Lo demás va plegado en ComoFunciona. */
export function Promesa({ v }: { v: OrderView }) {
  const { despacho } = plazosDelPedido(v.order);
  return (
    <section className="flex gap-3 rounded-card bg-exito-50 p-4 text-sm text-tinta-700" data-testid="promesa">
      <IconoCandado className="mt-0.5 h-5 w-5 flex-none text-musgo" />
      <div className="space-y-1">
        <p data-testid="salida-tienda">
          <strong className="text-monte">La tienda cobra recién cuando confirmes que te llegó.</strong>
        </p>
        <p data-testid="salida-comprador">
          Si no lo despacha hasta el <strong>{fmtDia(Date.now() + despacho * 1000)}</strong>, tu plata vuelve a ti.
        </p>
      </div>
    </section>
  );
}

/** Todo lo que se puede leer y no hace falta para pagar, plegado. */
export function ComoFunciona({ v }: { v: OrderView }) {
  const { revision } = plazosDelPedido(v.order);
  const pasos = [
    ES_MAINNET ? "Pagas con USDC desde tu cuenta Stellar." : "Pagas con QR desde tu banco.",
    "Tu plata espera entre los dos. La tienda ve que pagaste, pero no puede cobrar.",
    "Cuando te llegue, lo revisas y confirmas. Recién ahí se le paga.",
  ];
  return (
    <details className="group border-t border-tinta-200 text-base" data-testid="como-funciona">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-2 font-semibold [&::-webkit-details-marker]:hidden">
        ¿Cómo funciona? ¿Y si llega mal?
        <IconoChevronAbajo className="h-5 w-5 flex-none text-tinta-500 transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <ol className="space-y-3 pb-1">
        {pasos.map((s, i) => (
          <li key={s} className="flex gap-3">
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-yungas text-xs font-semibold text-monte num">{i + 1}</span>
            <span className="text-tinta-700">{s}</span>
          </li>
        ))}
      </ol>
      <div className="space-y-2 pb-5 pt-3 text-sm text-tinta-600">
        <p>
          <strong className="text-tinta-800">Si llega mal,</strong> abres un reclamo y un revisor decide. Solo puede repartir entre la tienda y tú.
        </p>
        <p>
          Si no confirmas ni reclamas, se le paga a la tienda {fmtPlazo(revision)} después del envío. Te avisamos un día antes y puedes pedir más tiempo una vez.
        </p>
        {v.order.fee_payer === "comprador" && (
          <p>
            La protección es el {String(PROTECCION.pct).replace(".", ",")}% del precio (mín. Bs {PROTECCION.minBs}, máx. Bs {PROTECCION.maxBs}). La tienda recibe el precio completo.
          </p>
        )}
        <p>{DOLLAR_NOTE}</p>
      </div>
    </details>
  );
}

/** Botón de pagar fijo abajo, con el total: envía los datos de entrega que están en la misma pantalla. */
export function BarraPagar({ total }: { total: string }) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t border-tinta-200 bg-white px-4 pt-3 shadow-[0_-8px_24px_-16px_rgb(10_42_27/0.25)]"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
      data-testid="barra-pagar"
    >
      <div className="mx-auto max-w-md">
        <button type="submit" form="form-entrega" className="btn-primary w-full py-4 text-lg">
          Pagar {total} con {ES_MAINNET ? "USDC" : "QR"}
        </button>
      </div>
    </div>
  );
}

const Opcional = () => <span className="font-normal text-tinta-500">(opcional)</span>;

type Campos = { recipient: string; city: string; agency: string; whatsapp: string; pickupPhone: string; flete: string; fleteBs: string };
const VACIO: Campos = { recipient: "", city: "", agency: "", whatsapp: "", pickupPhone: "", flete: "", fleteBs: "" };

/** A dónde va el pedido: nombre y ciudad. Lo opcional va plegado; si ya compró en este celular, viene lleno. */
export function FormEntrega({ v, inicial, onContinuar }: { v: OrderView; inicial: DatosEntrega | null; onContinuar: (x: DatosEntrega) => void }) {
  const [f, setF] = useState<Campos>(VACIO);
  const [error, setError] = useState<{ campo: "recipient" | "city" | "flete"; texto: string } | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const fleteTienda = fmtFlete(v.order.flete);
  const set = (k: keyof Campos) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setF({ ...f, [k]: e.target.value });
    setError(null);
  };

  useEffect(() => {
    const previo = inicial ?? leerEntrega();
    if (previo) setF((x) => ({ ...x, ...previo }));
  }, [inicial]);

  function falla(campo: "recipient" | "city" | "flete", texto: string) {
    setError({ campo, texto });
    const el = form.current?.querySelector<HTMLElement>(campo === "recipient" ? "#recipient" : campo === "city" ? "#dest-city" : "#flete-bs");
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  const aviso = (campo: "recipient" | "city" | "flete") =>
    error?.campo === campo ? (
      <p role="alert" className="mt-1.5 text-sm font-medium text-error-700" data-testid="error-campo">
        {error.texto}
      </p>
    ) : null;

  return (
    <form
      ref={form}
      id="form-entrega"
      className="space-y-4"
      data-testid="datos-entrega"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (f.recipient.trim().length < 2) return falla("recipient", "Escribe quién recibe el pedido");
        if (!f.city) return falla("city", "Elige la ciudad de destino");
        if (f.flete === "aparte" && !(Number(f.fleteBs.replace(",", ".")) > 0)) return falla("flete", "Escribe cuánto es el flete en Bs");
        setError(null);
        onContinuar({
          recipient: f.recipient.trim(),
          city: f.city,
          agency: f.agency,
          ...(f.whatsapp.trim() ? { whatsapp: f.whatsapp } : {}),
          ...(f.pickupPhone.trim() ? { pickupPhone: f.pickupPhone } : {}),
          ...(f.flete ? { flete: f.flete, ...(f.flete === "aparte" ? { fleteBs: f.fleteBs } : {}) } : {}),
        });
      }}
    >
      <h2 className="text-lg">¿A dónde lo envían?</h2>
      <div>
        <label className="label" htmlFor="recipient">
          Quién recibe
        </label>
        <input id="recipient" className="input" value={f.recipient} onChange={set("recipient")} placeholder="Nombre y apellido" autoComplete="name" aria-invalid={error?.campo === "recipient"} enterKeyHint="next" />
        {aviso("recipient")}
      </div>
      <div>
        <label className="label" htmlFor="dest-city">
          Ciudad de destino
        </label>
        <Select id="dest-city" value={f.city} onChange={set("city")} aria-invalid={error?.campo === "city"}>
          <option value="">Elige…</option>
          {CIUDADES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        {aviso("city")}
      </div>
      {fleteTienda && (
        <p className="text-sm text-tinta-600" data-testid="flete-tienda">
          {fleteTienda}.
        </p>
      )}
      <details className="group" data-testid="mas-datos-entrega">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-musgo [&::-webkit-details-marker]:hidden">
          Agregar WhatsApp, agencia o teléfono <span className="font-normal text-tinta-500">(opcional)</span>
          <IconoChevronAbajo className="h-4 w-4 flex-none transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <div className="mt-2 space-y-4">
          <div>
            <label className="label" htmlFor="buyer-wa">
              Tu WhatsApp para avisarte <Opcional />
            </label>
            <input id="buyer-wa" className="input" inputMode="tel" value={f.whatsapp} onChange={set("whatsapp")} placeholder="Ej.: 591 76543210" autoComplete="tel" />
            <p className="mt-1 text-xs text-tinta-500">Te avisamos cuando despachen. No se muestra a nadie.</p>
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
            <p className="mt-1 text-xs text-tinta-500">Lo piden al entregar. Solo lo ve la tienda.</p>
          </div>
          {!fleteTienda && (
            <div>
              <label className="label" htmlFor="flete">
                ¿Y el flete? <Opcional />
              </label>
              <Select id="flete" value={f.flete} onChange={set("flete")}>
                <option value="">Lo veo con la tienda</option>
                <option value="incluido">Incluido en el precio</option>
                <option value="por_pagar">Por pagar al recoger</option>
                <option value="aparte">Aparte: más Bs …</option>
              </Select>
              {f.flete === "aparte" && (
                <input id="flete-bs" aria-label="Flete en Bs" className="input mt-2" inputMode="decimal" value={f.fleteBs} onChange={set("fleteBs")} placeholder="Ej.: 25" />
              )}
              {aviso("flete")}
              <p className="mt-1 text-xs text-tinta-500">Es lo que acordaron; no cambia lo que pagas aquí.</p>
            </div>
          )}
        </div>
      </details>
    </form>
  );
}

/**
 * El link tiene un pago empezado desde otro navegador. Puede ser la misma persona (abrió el link dentro de otra app), así
 * que dice cómo seguir y a qué hora se libera, en vez de "lo está pagando otra persona".
 */
export function PagoEmpezado({ v, now }: { v: OrderView; now: number }) {
  const hasta = v.order.buyer_lease_until ?? null;
  const falta = hasta ? Math.max(0, hasta - now) : 0;
  const hora = hasta ? new Intl.DateTimeFormat("es-BO", { hour: "2-digit", minute: "2-digit", timeZone: "America/La_Paz" }).format(new Date(hasta)) : null;
  const url = typeof window === "undefined" ? "" : window.location.href.split("?")[0];
  return (
    <section className="card space-y-3 text-base" data-testid="pago-empezado">
      <h2 className="flex items-center gap-2 text-lg">
        <IconoReloj className="h-5 w-5 flex-none text-musgo" />
        Ya hay un pago empezado
      </h2>
      <p className="text-tinta-700">
        ¿Fuiste tú? Abre este link <strong>en la app o el navegador donde empezaste</strong> y sigue desde ahí.
      </p>
      {hora && (
        <p className="text-tinta-600">
          Si nadie lo termina, puedes pagar desde aquí a las <strong className="num">{hora}</strong> (en {Math.max(1, Math.ceil(falta / 60_000))} min). Esta página se actualiza sola.
        </p>
      )}
      <CopyButton text={url} label="Copiar link" className="btn-secondary w-full" />
    </section>
  );
}
