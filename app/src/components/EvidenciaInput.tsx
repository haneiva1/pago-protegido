"use client";

import { useRef, useState } from "react";
import { headerFirma } from "@/lib/api-firmada";
import { NO_CARGO_CUENTA } from "@/lib/comprador";
import type { WalletProvider, WalletRole } from "@/lib/wallet/types";
import { Spinner } from "./ui";

/**
 * Evidencia con cámara o galería (M5). En el navegador: comprime la foto (JPEG, lado mayor 1600 px), calcula su SHA-256
 * y la sube a /api/evidencia?pedido=<slug>, con la firma de la cuenta de `rol` (solo suben el comprador y el vendedor
 * del pedido). La ruta la guarda con la huella como nombre y devuelve el link. Ese link es lo que va al reclamo (o al
 * envío): el contrato guarda el hash del link, y el link lleva la huella de la imagen.
 *
 * En el envío del vendedor y en el reclamo del comprador: <EvidenciaInput id="foto" pedido={slug} rol="vendedor" tipo="foto" onChange={setUrl} />
 */

/** El módulo de la cuenta (SDK de la red) se carga recién al subir: la página del comprador no lo trae al abrir. */
async function cuentaDe(rol: WalletRole): Promise<WalletProvider> {
  try {
    return (await import("@/lib/wallet")).getWallet(rol);
  } catch {
    throw new Error(NO_CARGO_CUENTA);
  }
}

export async function sha256Hex(data: Blob | ArrayBuffer): Promise<string> {
  const buf = data instanceof Blob ? await data.arrayBuffer() : data;
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** JPEG con el lado mayor en `max` px. Si el navegador no puede decodificarla, se sube tal cual. */
export async function comprimirFoto(file: File, max = 1600, calidad = 0.82): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * k);
    canvas.height = Math.round(bmp.height * k);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const out = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", calidad));
    return out && out.size < file.size ? out : file;
  } catch {
    return file;
  }
}

export interface EvidenciaSubida {
  url: string;
  sha256: string;
  bytes: number;
  tipo: string;
}

export async function subirEvidencia(pedido: string, archivo: Blob, wallet: WalletProvider): Promise<EvidenciaSubida> {
  const sha256 = await sha256Hex(archivo);
  const path = `/api/evidencia?pedido=${encodeURIComponent(pedido)}`;
  const firma = await headerFirma(wallet, "POST", path);
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": archivo.type || "application/octet-stream", "x-sha256": sha256, "x-trato-firma": firma },
    body: archivo,
  });
  const json = await res.json().catch(() => ({ error: `Error ${res.status}` }));
  if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
  if (json.sha256 !== sha256) throw new Error("La huella no coincide: vuelve a subir el archivo.");
  return json as EvidenciaSubida;
}

const corta = (h: string) => `${h.slice(0, 8)}…${h.slice(-6)}`;

export function EvidenciaInput({
  id,
  pedido,
  rol,
  tipo,
  label,
  nota,
  onChange,
}: {
  id: string;
  /** Slug del pedido: la ruta solo acepta evidencia de pedidos en curso. */
  pedido: string;
  /** Con la cuenta de qué rol se firma la subida: la del comprador o la del vendedor de este pedido. */
  rol: WalletRole;
  tipo: "foto" | "video";
  label: string;
  nota?: string;
  /** Link con la huella (o el link pegado a mano); "" si se quita. */
  onChange: (url: string) => void;
}) {
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<"vacio" | "subiendo" | "listo" | "error">("vacio");
  const [sub, setSub] = useState<EvidenciaSubida | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const accept = tipo === "foto" ? "image/*" : "video/*";

  async function elegir(f: File | undefined) {
    if (!f) return;
    setEstado("subiendo");
    setError(null);
    try {
      const archivo = tipo === "foto" ? await comprimirFoto(f) : f;
      const r = await subirEvidencia(pedido, archivo, await cuentaDe(rol));
      if (vista) URL.revokeObjectURL(vista);
      setVista(URL.createObjectURL(archivo));
      setSub(r);
      setEstado("listo");
      setLink("");
      onChange(r.url);
    } catch (e) {
      setEstado("error");
      setError((e as Error).message);
      onChange("");
    }
  }

  function quitar() {
    if (vista) URL.revokeObjectURL(vista);
    setVista(null);
    setSub(null);
    setEstado("vacio");
    onChange("");
  }

  return (
    <div className="space-y-2" data-testid={`evidencia-${id}`}>
      <p className="label !mb-0">
        {label} {nota && <span className="font-normal text-slate-400">{nota}</span>}
      </p>
      <input ref={camara} type="file" accept={accept} capture="environment" className="hidden" onChange={(e) => elegir(e.target.files?.[0])} aria-label={`${label}: cámara`} />
      <input ref={galeria} id={id} type="file" accept={accept} className="hidden" onChange={(e) => elegir(e.target.files?.[0])} aria-label={`${label}: galería`} />

      {estado === "listo" && sub ? (
        <div className="flex items-center gap-3 rounded-xl bg-brand-50 p-2.5 ring-1 ring-brand-100">
          {vista &&
            (tipo === "foto" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={vista} alt="" className="h-14 w-14 flex-none rounded-lg object-cover" />
            ) : (
              <video src={vista} className="h-14 w-14 flex-none rounded-lg object-cover" muted />
            ))}
          <div className="min-w-0 flex-1 text-xs">
            <p className="font-semibold text-brand-900">✓ {tipo === "foto" ? "Foto" : "Video"} subido con su huella</p>
            <p className="truncate font-mono text-brand-800" data-testid="huella" title={sub.sha256}>
              {corta(sub.sha256)}
            </p>
          </div>
          <button type="button" className="text-xs font-semibold text-slate-600 underline" onClick={quitar}>
            Cambiar
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn-secondary !py-2.5 text-sm" disabled={estado === "subiendo"} onClick={() => camara.current?.click()}>
            📷 {tipo === "foto" ? "Sacar foto" : "Grabar video"}
          </button>
          <button type="button" className="btn-secondary !py-2.5 text-sm" disabled={estado === "subiendo"} onClick={() => galeria.current?.click()}>
            🖼️ Desde la galería
          </button>
        </div>
      )}
      {estado === "subiendo" && (
        <p className="flex items-center gap-2 text-xs text-slate-600">
          <Spinner className="h-3.5 w-3.5" /> {tipo === "foto" ? "Comprimiendo y subiendo…" : "Subiendo el video…"}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-rose-700">
          {error}
        </p>
      )}
      {estado !== "listo" && (
        <details className="text-xs text-slate-600">
          <summary className="cursor-pointer">¿Ya lo tienes en un link?</summary>
          <input
            className="input mt-1.5"
            value={link}
            inputMode="url"
            placeholder="https://…"
            aria-label={`${label}: link`}
            onChange={(e) => {
              setLink(e.target.value);
              onChange(e.target.value.trim());
            }}
          />
        </details>
      )}
    </div>
  );
}
