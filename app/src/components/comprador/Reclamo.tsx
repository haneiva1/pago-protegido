"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui";
import { MOTIVOS, MOTIVOS_CON_VIDEO, MOTIVO_PRESION } from "@/lib/format";

const MOTIVOS_COMPRADOR = MOTIVOS.filter((m) => m !== MOTIVO_PRESION);

export function Reclamo({
  busy,
  priceBsCents,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  priceBsCents: number;
  onCancel: () => void;
  onSubmit: (x: Record<string, string>) => void;
}) {
  const [reason, setReason] = useState<string>(MOTIVOS_COMPRADOR[1]);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState("");
  const [video, setVideo] = useState("");
  const needsVideo = MOTIVOS_CON_VIDEO.includes(reason) && priceBsCents >= 30000;
  return (
    <form
      className="card space-y-3 ring-2 ring-amber-200"
      data-testid="reclamo"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ reason, text, photo, video });
      }}
    >
      <h2 className="font-bold">¿Qué pasó?</h2>
      <p className="muted">Al enviar, la plata queda congelada y un revisor ve la evidencia de los dos lados. Arrepentirse no es motivo de reclamo.</p>
      <div>
        <label className="label" htmlFor="motivo">
          Motivo
        </label>
        <select id="motivo" className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
          {MOTIVOS_COMPRADOR.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="detalle">
          Cuéntanos más
        </label>
        <textarea id="detalle" className="input min-h-24" value={text} onChange={(e) => setText(e.target.value)} maxLength={600} placeholder="Describe el problema" />
      </div>
      <div>
        <label className="label" htmlFor="foto">
          Foto del paquete cerrado <span className="font-normal text-slate-400">(link https://…)</span>
        </label>
        <input id="foto" className="input" value={photo} onChange={(e) => setPhoto(e.target.value)} inputMode="url" placeholder="https://…" />
      </div>
      <div>
        <label className="label" htmlFor="video">
          Video continuo del desempaque{" "}
          <span className="font-normal text-slate-400">{needsVideo ? "(obligatorio para este motivo desde Bs 300)" : "(opcional)"}</span>
        </label>
        <input id="video" className="input" value={video} onChange={(e) => setVideo(e.target.value)} inputMode="url" placeholder="https://…" />
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button className="btn flex-1 bg-amber-500 text-white hover:bg-amber-600" disabled={busy}>
          {busy ? <Spinner /> : null} Enviar reclamo
        </button>
      </div>
      <p className="text-xs text-slate-500">
        Política de reclamos completa en <a className="underline" href="/como-funciona#reclamos">Cómo funciona</a>.
      </p>
    </form>
  );
}
