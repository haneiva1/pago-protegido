"use client";

import { useEffect, useState } from "react";
import { CopyButton } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { type AppInterna, type Plataforma, linkAbrirEnChrome, navegadorInterno, plataforma } from "@/lib/comprador";
import type { OrderView } from "@/lib/types";
import { waLink } from "@/lib/whatsapp";
import { SOPORTE_WA } from "./Estado";

/**
 * Acceso a la compra (M6). La cuenta del comprador vive en el navegador donde pagó y NO se exporta en links ni QR:
 * con ella un vendedor podría pagarse solo (`confirm` no espera las 24 h; esa espera la pone la app).
 */

/** Lee el navegador recién en el cliente (en el servidor no hay user agent del comprador). */
function useNavegador(): { app: AppInterna | null; plat: Plataforma; url: string } | null {
  const [n, setN] = useState<{ app: AppInterna | null; plat: Plataforma; url: string } | null>(null);
  useEffect(() => {
    const ua = navigator.userAgent;
    setN({ app: navegadorInterno(ua), plat: plataforma(ua), url: window.location.href.split("?")[0] });
  }, []);
  return n;
}

/** Antes de pagar: si el link se abrió dentro de Facebook, Messenger, Instagram o TikTok, pide abrirlo en Chrome o Safari. */
export function AvisoNavegadorInterno() {
  const n = useNavegador();
  if (!n?.app) return null;
  const chrome = n.plat === "android" ? linkAbrirEnChrome(n.url) : null;
  const nav = n.plat === "ios" ? "Safari" : "Chrome";
  return (
    <section className="space-y-2 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" data-testid="aviso-navegador-interno">
      <p className="font-semibold">Estás dentro de {n.app}. Abre este link en {nav} antes de pagar.</p>
      <p>
        Tu compra queda en el navegador donde pagas. Si pagas aquí y después lo abres en otro lado, no vas a poder confirmar ni reclamar.
      </p>
      <p className="text-xs">
        {n.plat === "ios"
          ? "Toca ⋯ o el ícono de compartir y elige «Abrir en Safari». O copia el link y pégalo en Safari."
          : "Toca ⋮ arriba a la derecha y elige «Abrir en el navegador». O copia el link y pégalo en Chrome."}
      </p>
      <div className="flex flex-wrap gap-2">
        <CopyButton text={n.url} label="Copiar link" className="btn-secondary !py-2 text-sm" testId="copiar-link" />
        {chrome && (
          <a className="btn-primary !py-2 text-sm" href={chrome}>
            Abrir en Chrome
          </a>
        )}
      </div>
    </section>
  );
}

/** Después de pagar: dónde quedó la compra y cómo volver a ella. */
export function CompraEnEsteNavegador() {
  const n = useNavegador();
  const [ayuda, setAyuda] = useState(false);
  if (!n) return null;
  return (
    <section className="card space-y-2 text-sm" data-testid="compra-en-este-navegador">
      <h2 className="font-bold">📌 Tu compra quedó en este navegador</h2>
      <p className="text-slate-600">
        Para confirmar o reclamar, vuelve a este link desde aquí mismo{n.app ? ` (dentro de ${n.app})` : ""}. Si borras los datos del navegador o lo abres en otro
        celular, no vas a poder hacerlo.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary !py-2 text-sm" onClick={() => setAyuda((x) => !x)} aria-expanded={ayuda}>
          Agregar a inicio
        </button>
        <CopyButton text={n.url} label="Copiar link" className="btn-secondary !py-2 text-sm" />
      </div>
      {ayuda && (
        <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700" data-testid="ayuda-inicio">
          {n.app
            ? `Dentro de ${n.app} no se puede agregar a inicio: guarda el link (Copiar link) en un chat contigo mismo y ábrelo siempre desde ${n.app}.`
            : n.plat === "ios"
              ? "En Safari, toca Compartir (el cuadrado con la flecha) y después «Agregar a inicio». El ícono abre esta compra en Safari."
              : n.plat === "android"
                ? "En Chrome, toca ⋮ arriba a la derecha y después «Agregar a la pantalla principal». El ícono abre esta compra en Chrome."
                : "Guarda esta página en tus favoritos para volver a tu compra."}
        </p>
      )}
    </section>
  );
}

/** El pedido lo pagó otra cuenta (otro navegador, otra app u otro celular): qué pasa y qué hacer, en vez de una pantalla sin botones. */
export function OtroNavegador({ v }: { v: OrderView }) {
  const n = useNavegador();
  const o = v.order;
  if (!["pagado", "enviado", "en_disputa"].includes(o.status)) return null;
  const siNada =
    o.status === "pagado"
      ? o.ship_deadline
        ? `Si la tienda no despacha hasta el ${fmtDate(o.ship_deadline)}, el pago vuelve solo a la cuenta del navegador donde pagaste.`
        : "Si la tienda no despacha a tiempo, el pago vuelve solo a la cuenta del navegador donde pagaste."
      : o.status === "enviado"
        ? o.deadline
          ? `Si nadie reclama, se le paga a la tienda el ${fmtDate(o.deadline)}.`
          : "Si nadie reclama, se le paga a la tienda cuando termine la revisión."
        : "Hay un reclamo abierto: la plata está congelada hasta que decida el revisor.";
  return (
    <section className="card space-y-2 text-sm" data-testid="otro-navegador">
      <h2 className="font-bold">¿Pagaste tú este pedido?</h2>
      <p className="text-slate-700">
        Este pedido se pagó desde otro navegador. Tu compra quedó guardada ahí (por ejemplo, dentro de Facebook, Instagram o TikTok, o en otro celular), y
        desde aquí no puedes confirmar ni reclamar.
      </p>
      <p className="font-medium text-slate-800">
        Qué hacer: abre este mismo link desde la app o el navegador donde pagaste{n?.app ? ` (si fue en ${n.app}, ábrelo desde el chat de ${n.app})` : ""}.
      </p>
      <p className="text-slate-600">{siNada}</p>
      <div className="flex flex-wrap gap-2 pt-1">
        {n && <CopyButton text={n.url} label="Copiar link" className="btn-secondary !py-2 text-sm" />}
        {SOPORTE_WA && (
          <a
            className="btn-secondary !py-2 text-sm"
            href={waLink(`Hola, pagué el pedido ${o.code ?? ""} y perdí el acceso desde mi navegador.`, SOPORTE_WA)}
            target="_blank"
            rel="noreferrer"
          >
            Perdí el acceso: escribir a soporte
          </a>
        )}
      </div>
      <p className="text-xs text-slate-500">
        ¿Eres la tienda?{" "}
        <a className="underline" href="/panel">
          Gestiona este pedido desde tu panel
        </a>
        .
      </p>
    </section>
  );
}
