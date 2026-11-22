"use client";

import { useEffect, useState } from "react";
import { EvidenciaInput } from "@/components/EvidenciaInput";
import { Select } from "@/components/comprador/Campos";
import { EsperaEnCurso } from "@/components/comprador/Espera";
import { IconoChevronAbajo } from "@/components/iconos";
import { ErrorBox, Spinner, useProgress } from "@/components/ui";
import { CIUDADES, EMPRESAS } from "@/lib/format";
import type { SellerOrder } from "@/lib/types";
import { registrarEnvio } from "@/lib/vendedor";

/**
 * Registrar el envío (M9) en dos campos a la vista: empresa y número de guía. El peso (prellenado), el destino (el del
 * pedido), el IMEI y las fotos de la guía y del paquete (EvidenciaInput, cada una con su huella SHA-256) van en "Más datos".
 */
export function EnvioForm({ o, sellerPubkey, prefill, onDone }: { o: SellerOrder; sellerPubkey: string; prefill: string | null; onDone: () => void }) {
  const [f, setF] = useState({ company: "", tracking: prefill ?? "", weight: "1", city: o.dest_city ?? "", imei: "" });
  const [fotoGuia, setFotoGuia] = useState("");
  const [fotoPaquete, setFotoPaquete] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const progress = useProgress();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const id = (k: string) => `${k}-${o.slug}`;

  useEffect(() => {
    if (prefill) setF((cur) => ({ ...cur, tracking: cur.tracking || prefill }));
  }, [prefill]);

  async function ship(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    progress.reset();
    try {
      await registrarEnvio({ slug: o.slug, signer: sellerPubkey, empresa: f.company, guia: f.tracking, pesoKg: f.weight, ciudad: f.city, imei: f.imei, fotoPaquete, fotoGuia, onProgress: progress.push });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={ship} className="space-y-2.5" data-testid="form-envio">
      <p className="text-base font-semibold text-monte">Registrar el envío</p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <div>
          <label className="label !mb-1" htmlFor={id("company")}>
            Empresa de envío
          </label>
          <Select id={id("company")} value={f.company} onChange={set("company")} required>
            <option value="">Elige…</option>
            {EMPRESAS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>
        <div>
          <label className="label !mb-1" htmlFor={id("tracking")}>
            Número de guía
          </label>
          <input id={id("tracking")} className="input" value={f.tracking} onChange={set("tracking")} placeholder="SRV-2026-118734" />
        </div>
      </div>
      <details className="group" data-testid="mas-datos-envio" open={o.category === "Celular"}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-1 text-sm font-medium text-tinta-700 [&::-webkit-details-marker]:hidden">
          Más datos: peso, destino y fotos
          <IconoChevronAbajo className="h-4 w-4 flex-none text-tinta-500 transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <div className="mt-2 space-y-2.5">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <div>
              <label className="label !mb-1" htmlFor={id("weight")}>
                Peso declarado (kg)
              </label>
              <input id={id("weight")} className="input num" value={f.weight} onChange={set("weight")} inputMode="decimal" placeholder="1,2" required />
            </div>
            <div>
              <label className="label !mb-1" htmlFor={id("city")}>
                Ciudad de destino
              </label>
              <Select id={id("city")} value={f.city} onChange={set("city")} required>
                <option value="">Elige…</option>
                {CIUDADES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </div>
          </div>
          {o.category === "Celular" && (
            <div>
              <label className="label !mb-1" htmlFor={id("imei")}>
                IMEI del celular <span className="font-normal text-tinta-500">(obligatorio; marca *#06# en el equipo)</span>
              </label>
              <input id={id("imei")} className="input num" value={f.imei} onChange={set("imei")} inputMode="numeric" placeholder="15 dígitos" />
            </div>
          )}
          <div className="space-y-2.5" data-testid="fotos-envio">
            <EvidenciaInput id={id("guia")} pedido={o.slug} rol="vendedor" tipo="foto" label="Foto de la guía" nota="(el comprobante de la empresa)" onChange={setFotoGuia} />
            <EvidenciaInput id={id("paquete")} pedido={o.slug} rol="vendedor" tipo="foto" label="Foto del paquete" nota={`(con el código ${o.code} escrito a mano)`} onChange={setFotoPaquete} />
            <p className="text-xs text-tinta-500">Cada foto se guarda con su huella; si hay un reclamo, el revisor ve que no cambió.</p>
          </div>
        </div>
      </details>
      <ErrorBox error={error} />
      {busy && <EsperaEnCurso titulo="Registrando el envío… unos 10 segundos" testId="espera-envio" />}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? <Spinner /> : null} Marcar como enviado
      </button>
    </form>
  );
}
