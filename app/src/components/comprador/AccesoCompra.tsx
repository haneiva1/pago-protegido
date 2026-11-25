"use client";

import { useEffect, useState } from "react";
import { IconoAlerta, IconoMarcador, IconoUsuario } from "@/components/iconos";
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
    <section className="space-y-2 rounded-card border border-aviso-200 bg-aviso-50 p-4 text-sm text-aviso-700" data-testid="aviso-navegador-interno">
      <p className="flex items-start gap-2 font-semibold">
        <IconoAlerta className="mt-0.5 h-5 w-5 flex-none" />
        <span>
          Estás dentro de {n.app}. Abre este link en {nav} antes de pagar.
        </span>
      </p>
      <p>Tu compra queda guardada donde pagas: desde otro lado no vas a poder confirmar ni reclamar.</p>
      <p className="text-xs">
        {n.plat === "ios"
          ? "Toca ⋯ o el ícono de compartir y elige «Abrir en Safari». O copia el link y pégalo en Safari."
          : "Toca ⋮ arriba a la derecha y elige «Abrir en el navegador». O copia el link y pégalo en Chrome."}
      </p>
      <div className="flex flex-wrap gap-2">
        <CopyButton text={n.url} label="Copiar link" className="btn-secondary btn-sm" testId="copiar-link" />
        {chrome && (
          <a className="btn-primary btn-sm" href={chrome}>
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
    <section className="space-y-2 border-t border-tinta-200 pt-5 text-base" data-testid="compra-en-este-navegador">
      <h2 className="flex items-center gap-2 font-sans text-lg font-semibold">
        <IconoMarcador className="h-5 w-5 flex-none text-musgo" />
        Tu compra quedó en este navegador
      </h2>
      <p className="text-tinta-600">
        Para confirmar o reclamar, vuelve a este link desde aquí mismo{n.app ? ` (dentro de ${n.app})` : ""}. No borres los datos del navegador.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary btn-sm" onClick={() => setAyuda((x) => !x)} aria-expanded={ayuda}>
          Agregar a inicio
        </button>
        <CopyButton text={n.url} label="Copiar link" className="btn-secondary btn-sm" />
      </div>
      {ayuda && (
        <p className="text-sm text-tinta-700" data-testid="ayuda-inicio">
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
    <section className="space-y-2 rounded-card bg-tinta-50 p-4 text-base" data-testid="otro-navegador">
      <h2 className="flex items-center gap-2 text-lg">
        <IconoUsuario className="h-5 w-5 flex-none text-musgo" />
        ¿Pagaste tú este pedido?
      </h2>
      <p className="text-tinta-700">
        Se pagó desde otro navegador y la compra quedó guardada ahí. Desde aquí no puedes confirmar ni reclamar.
      </p>
      <p className="font-medium text-tinta-800">
        Qué hacer: abre este mismo link desde la app o el navegador donde pagaste{n?.app ? ` (si fue en ${n.app}, ábrelo desde el chat de ${n.app})` : ""}.
      </p>
      <p className="text-tinta-600">{siNada}</p>
      <div className="flex flex-wrap gap-2 pt-1">
        {n && <CopyButton text={n.url} label="Copiar link" className="btn-secondary btn-sm" />}
        {SOPORTE_WA && (
          <a
            className="btn-secondary btn-sm"
            href={waLink(`Hola, pagué el pedido ${o.code ?? ""} y perdí el acceso desde mi navegador.`, SOPORTE_WA)}
            target="_blank"
            rel="noreferrer"
          >
            Perdí el acceso: escribir a soporte
          </a>
        )}
      </div>
      <p className="text-sm text-tinta-600">
        ¿Eres la tienda?{" "}
        <a className="enlace" href="/panel">
          Gestiona este pedido desde tu panel
        </a>
        .
      </p>
    </section>
  );
}
