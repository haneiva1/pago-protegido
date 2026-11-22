"use client";

import { useState } from "react";
import { EvidenciaInput } from "@/components/EvidenciaInput";
import { ErrorBox, Spinner } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { DESCRIPCION_MOTIVO, evidenciaPedida, motivosReclamo } from "@/lib/comprador";
import type { PublicOrder } from "@/lib/types";

/** Foto o video desde la cámara o la galería, con su huella (EvidenciaInput); o un link pegado a mano. */
function CampoEvidencia(p: { id: string; label: string; nota: string; value: string; onChange: (url: string) => void; pedido: string; tipo: "foto" | "video" }) {
  return <EvidenciaInput id={p.id} pedido={p.pedido} rol="comprador" tipo={p.tipo} label={p.label} nota={p.nota} onChange={p.onChange} />;
}

/**
 * Reclamo guiado (M8): motivos según el estado, qué evidencia hace falta y los plazos. Al enviar, la plata queda
 * congelada y decide un revisor.
 */
export function Reclamo({
  order,
  busy,
  onCancel,
  onSubmit,
}: {
  order: PublicOrder;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (x: Record<string, string>) => void;
}) {
  const motivos = motivosReclamo(order.status);
  const [reason, setReason] = useState<string>(motivos[0] ?? "");
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState("");
  const [video, setVideo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ev = evidenciaPedida(reason, order.price_bs_cents);
  if (!motivos.length) return null;
  return (
    <form
      className="card space-y-4 ring-2 ring-aviso-200 animate-aparecer"
      data-testid="reclamo"
      onSubmit={(e) => {
        e.preventDefault();
        if (ev.video === "obligatorio" && !video) return setError("Para este motivo, desde Bs 300, el video continuo del desempaque es obligatorio.");
        if (text.trim().length < 5) return setError("Cuéntanos en una frase qué pasó.");
        setError(null);
        onSubmit({ reason, text, photo: ev.foto === "no" ? "" : photo, video: ev.video === "no" ? "" : video });
      }}
    >
      <div>
        <h2 className="text-xl">¿Qué pasó?</h2>
        <p className="muted mt-1">Al enviar, la plata queda congelada y un revisor ve la evidencia de los dos lados. Arrepentirse no es motivo de reclamo.</p>
      </div>

      <fieldset className="space-y-2" data-testid="motivos">
        <legend className="label">Motivo</legend>
        {motivos.map((m) => (
          <label
            key={m}
            className={`flex cursor-pointer gap-3 rounded-control border p-3 transition-colors duration-150 ${reason === m ? "border-monte bg-tinta-50" : "border-tinta-200 bg-white hover:bg-tinta-50"}`}
          >
            <input type="radio" name="motivo" value={m} checked={reason === m} onChange={() => setReason(m)} className="mt-1 accent-monte" />
            <span className="text-sm">
              <span className="block font-semibold">{m}</span>
              <span className="text-tinta-600">{DESCRIPCION_MOTIVO[m]}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {reason === "No envió" && (
        <p className="caja-exito" data-testid="no-envio-solo">
          Si la tienda no despacha {order.ship_deadline ? `hasta el ${fmtDate(order.ship_deadline)}` : "a tiempo"}, el pago vuelve a ti solo, sin reclamo. Reclama
          ahora solo si te dijo que no lo va a enviar.
        </p>
      )}

      <div className="rounded-control bg-tinta-50 p-3 text-sm" data-testid="evidencia-pedida">
        <p className="font-semibold">Qué evidencia hace falta</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-tinta-700">
          {ev.pasos.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>

      <div>
        <label className="label" htmlFor="detalle">
          Cuéntanos qué pasó
        </label>
        <textarea id="detalle" className="input min-h-24" value={text} onChange={(e) => setText(e.target.value)} maxLength={600} placeholder="Ej.: abrí el paquete y venía otro modelo" />
      </div>
      {ev.foto !== "no" && (
        <CampoEvidencia id="foto" tipo="foto" pedido={order.slug} label="Foto del paquete" nota={ev.foto === "pedida" ? "(pedida)" : "(opcional)"} value={photo} onChange={setPhoto} />
      )}
      {ev.video !== "no" && (
        <CampoEvidencia
          id="video"
          tipo="video"
          pedido={order.slug}
          label="Video continuo del desempaque"
          nota={ev.video === "obligatorio" ? "(obligatorio para este motivo desde Bs 300)" : "(opcional)"}
          value={video}
          onChange={setVideo}
        />
      )}

      <p className="text-xs text-tinta-600" data-testid="plazos-reclamo">
        <strong>Plazos:</strong> la tienda responde en 48 h, tú puedes sumar evidencia en 48 h y el revisor decide en 72 h. Mientras tanto, nadie puede mover la
        plata.
      </p>
      <ErrorBox error={error} />
      <div className="flex gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button className="btn-oscuro flex-1" disabled={busy}>
          {busy ? <Spinner /> : null} Enviar reclamo
        </button>
      </div>
      <p className="text-xs text-tinta-500">
        Política de reclamos completa en{" "}
        <a className="enlace" href="/como-funciona#reclamos">
          Cómo funciona
        </a>
        .
      </p>
    </form>
  );
}
