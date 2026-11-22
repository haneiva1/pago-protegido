"use client";

import { useEffect, useState } from "react";
import { sha256Hex } from "@/components/EvidenciaInput";
import { huellaPropia } from "@/lib/evidencia";
import { IconoDocumento } from "@/components/iconos";
import { fmtDate } from "@/lib/format";
import {
  CRITERIOS,
  REPARTO_PARCIAL,
  TEXTO_HUELLA,
  evidenciaDeLasPartes,
  huellaEnElEnvio,
  pedidosConLaMismaHuella,
  plazosDelReclamo,
  reglaDelReclamo,
  type Archivo,
} from "@/lib/revisor";
import type { DisputeItem } from "@/lib/types";

/** La regla de la política que aplica a este reclamo (M10), con los criterios en orden y el que aplica marcado. */
export function ReglaAplicada({ d, ahora }: { d: DisputeItem; ahora: number }) {
  const r = reglaDelReclamo(d, ahora);
  return (
    <div className="rounded-card border-2 border-monte bg-white p-4 text-sm" data-testid="regla-aplica">
      <p className="text-xs font-semibold uppercase tracking-wide text-musgo">Regla que aplica · motivo: {d.dispute_reason}</p>
      <p className="mt-1 font-semibold text-monte">{r.titulo}</p>
      <p className="mt-1 text-tinta-700">{r.detalle}</p>
      <p className="mt-1 font-semibold text-monte" data-testid="regla-gana">
        {r.gana ? `Según la política, gana el ${r.gana}.` : "Comprueba eso antes de decidir el reparto."}
      </p>
      <ol className="mt-3 list-decimal space-y-0.5 pl-5 text-xs text-tinta-500">
        {CRITERIOS.map((c, i) => (
          <li key={c} className={i === r.criterio || (r.criterio === 3 && i === 4) ? "font-semibold text-monte" : ""}>
            {c}
          </li>
        ))}
      </ol>
      <p className="mt-1 text-xs text-tinta-500">{REPARTO_PARCIAL}</p>
    </div>
  );
}

/** Los plazos de la política (48 h para responder y para la evidencia, 72 h para decidir), desde que se abrió el reclamo. */
export function PlazosReclamo({ d, ahora }: { d: DisputeItem; ahora: number }) {
  const plazos = plazosDelReclamo(d, ahora);
  if (!plazos.length) return null;
  return (
    <ul className="grid gap-2 text-xs sm:grid-cols-3" data-testid="plazos-revisor">
      {plazos.map((p) => (
        <li
          key={p.clave}
          className={`rounded-chip p-2.5 ring-1 ${p.hecho ? "bg-exito-50 text-monte ring-exito-200" : p.vencido ? "bg-error-50 text-error-700 ring-error-200" : "bg-white text-tinta-700 ring-tinta-200"}`}
        >
          <p className="font-semibold">
            {p.hecho ? "✓ " : ""}
            {p.texto}
          </p>
          <p>
            {p.hecho ? "Listo" : p.vencido ? "Venció" : "Hasta"} {p.hecho ? "" : `el ${fmtDate(p.hasta)}`}
          </p>
        </li>
      ))}
    </ul>
  );
}

const corta = (h: string) => `${h.slice(0, 8)}…${h.slice(-6)}`;

/**
 * Una foto o un video con su miniatura. Si viene de /api/evidencia de esta app, el navegador del revisor la descarga y
 * calcula su SHA-256: si es el del nombre, el archivo no cambió desde que se subió (no prueba que sea este paquete).
 * Las fotos del vendedor se buscan además en la evidencia de mark_shipped que guardó el contrato, y se avisa si la
 * misma huella aparece en otro pedido.
 */
function ArchivoVerificado({ a, d }: { a: Archivo; d: DisputeItem }) {
  const huella = huellaPropia(a.url, typeof window === "undefined" ? null : window.location.host);
  const src = huella ? new URL(a.url, "http://x").pathname : a.url;
  const [estado, setEstado] = useState<"verificando" | "coincide" | "no-coincide" | "error">("verificando");

  useEffect(() => {
    if (!huella) return;
    let vivo = true;
    fetch(src)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.arrayBuffer();
      })
      .then((buf) => sha256Hex(buf))
      .then((h) => vivo && setEstado(h === huella ? "coincide" : "no-coincide"))
      .catch(() => vivo && setEstado("error"));
    return () => {
      vivo = false;
    };
  }, [huella, src]);

  const envio = huella && a.parte === "vendedor" ? huellaEnElEnvio(huella, d) : null;
  const otros = huella ? pedidosConLaMismaHuella(huella, d.huellas_en_otros) : [];
  return (
    <li className="flex gap-3 rounded-chip bg-white p-2 ring-1 ring-tinta-200" data-testid="archivo-evidencia">
      <a href={src} target="_blank" rel="noreferrer" className="flex-none" aria-label={`Abrir ${a.etiqueta}`}>
        {huella ? (
          a.tipo === "foto" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={a.etiqueta} className="h-16 w-16 rounded-lg object-cover" data-testid="miniatura" />
          ) : (
            <video src={src} muted preload="metadata" className="h-16 w-16 rounded-lg object-cover" data-testid="miniatura" />
          )
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-chip bg-tinta-100 text-tinta-400">
            <IconoDocumento className="h-7 w-7" />
          </span>
        )}
      </a>
      <div className="min-w-0 flex-1 text-xs">
        <p className="font-semibold text-monte">{a.etiqueta}</p>
        {huella ? (
          <>
            {estado === "coincide" && (
              <p className="font-semibold text-musgo" data-testid="sin-cambios">
                {TEXTO_HUELLA.sinCambios}
              </p>
            )}
            {estado === "no-coincide" && <p className="font-semibold text-error-700">{TEXTO_HUELLA.cambio}</p>}
            {estado === "verificando" && <p className="text-tinta-500">Comprobando la huella…</p>}
            {estado === "error" && <p className="text-aviso-700">No se pudo descargar para comprobarla</p>}
            <p className="truncate font-mono text-tinta-500" title={huella}>
              SHA-256 {corta(huella)}
            </p>
            {envio && (
              <p className={envio.esta ? "text-tinta-600" : "font-semibold text-error-700"} data-testid="huella-en-envio">
                {envio.fuente === "contrato"
                  ? envio.esta
                    ? TEXTO_HUELLA.enContrato
                    : TEXTO_HUELLA.noEnContrato
                  : envio.esta
                    ? TEXTO_HUELLA.enApp
                    : TEXTO_HUELLA.noEnApp}
              </p>
            )}
            {otros.length > 0 && (
              <p className="font-semibold text-aviso-700" data-testid="huella-repetida">
                El mismo archivo aparece en otro pedido ({otros.join(", ")}): puede ser una foto reutilizada.
              </p>
            )}
          </>
        ) : (
          <p className="text-tinta-600">
            Link externo, sin huella: no se puede comprobar.{" "}
            <a className="enlace" href={a.url} target="_blank" rel="noreferrer">
              Abrir
            </a>
          </p>
        )}
      </div>
    </li>
  );
}

/** Evidencia de las dos partes, lado a lado, con miniaturas y la comprobación de la huella. */
export function EvidenciaPartes({ d }: { d: DisputeItem }) {
  const e = evidenciaDeLasPartes(d.evidence);
  const lado = (titulo: string, lista: Archivo[], tono: string) => (
    <div className={`space-y-2 rounded-card p-3 ring-1 ${tono}`}>
      <p className="text-xs font-semibold uppercase tracking-wide">{titulo}</p>
      {lista.length ? (
        <ul className="space-y-2">
          {lista.map((a) => (
            <ArchivoVerificado key={a.url} a={a} d={d} />
          ))}
        </ul>
      ) : (
        <p className="text-xs text-tinta-500">Sin fotos ni videos.</p>
      )}
    </div>
  );
  return (
    <div className="grid gap-3 md:grid-cols-2" data-testid="evidencia-partes">
      {lado("Fotos y videos del comprador", e.comprador, "bg-tinta-50 text-tinta-700 ring-tinta-200/60")}
      {lado("Fotos del vendedor", e.vendedor, "bg-tinta-50 text-tinta-700 ring-tinta-200/60")}
    </div>
  );
}
