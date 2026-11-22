"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EsperaEnCurso } from "@/components/comprador/Espera";
import { ErrorBox } from "@/components/ui";
import { Select } from "@/components/comprador/Campos";
import { CIUDADES, fmtWhatsApp } from "@/lib/format";
import { apiFirmada } from "@/lib/api-firmada";
import { WALLET_KIND, activateWallet, api, getWallet } from "@/lib/wallet";

const PASOS = ["Tu tienda", "Tu WhatsApp", "Tu cuenta"];

export default function Vender() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [store, setStore] = useState("");
  const [city, setCity] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [pilotId, setPilotId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasos, setPasos] = useState<{ label: string; hash?: string; done: boolean }[]>([]);

  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    // El bot manda a /vender?wa=591… (APP-ENDPOINTS §5): número precargado. /piloto manda ?piloto=<id>.
    const wa = qs.get("wa");
    if (wa) setWhatsapp(wa.replace(/[^\d+ ]/g, ""));
    if (qs.get("piloto")) setPilotId(qs.get("piloto"));
  }, []);

  useEffect(() => {
    // Si ya hay tienda en este dispositivo, directo al panel.
    const pk = getWallet("vendedor").publicKey();
    if (pk) api(`/api/sellers/${pk}`).then(() => router.replace("/panel")).catch(() => {});
  }, [router]);

  const paso = (label: string, done: boolean) =>
    setPasos((prev) => {
      const i = prev.findIndex((p) => p.label === label);
      if (i >= 0) return prev.map((p, j) => (j === i ? { ...p, done } : p));
      return [...prev, { label, done }];
    });

  async function crearCuenta() {
    setBusy(true);
    setError(null);
    setPasos([]);
    try {
      const wallet = getWallet("vendedor");
      const L = WALLET_KIND === "pollar" ? "Ingresando con tu cuenta" : "Creando tu cuenta de cobro en este dispositivo";
      paso(L, false);
      const pubkey = await wallet.connect();
      await activateWallet(wallet);
      paso(L, true);
      paso("Guardando tu tienda", false);
      await apiFirmada(wallet, "/api/sellers", { pubkey, storeName: store, whatsapp, city, pilotId });
      paso("Guardando tu tienda", true);
      router.push("/panel?primer=1");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const next = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (step === 0 && store.trim().length < 2) return setError("Escribe el nombre de tu tienda");
    if (step === 0 && !city) return setError("Elige tu ciudad");
    if (step === 1 && whatsapp.replace(/\D/g, "").length < 7) return setError("Escribe tu número de WhatsApp");
    setStep(step + 1);
  };

  return (
    <div className="mx-auto min-h-[calc(100svh-18rem)] max-w-md">
      <ol className="mb-8 grid grid-cols-3 gap-2" aria-label="Pasos">
        {PASOS.map((p, i) => (
          <li key={p} className="flex flex-col gap-2">
            <span className={`h-1 rounded-full transition-colors duration-300 ${i < step ? "bg-musgo" : i === step ? "bg-yungas" : "bg-tinta-200"}`} />
            <span className={`text-xs ${i === step ? "font-semibold text-monte" : "font-medium text-tinta-500"}`} aria-current={i === step ? "step" : undefined}>
              {i + 1}. {p}
            </span>
          </li>
        ))}
      </ol>

      {pilotId && <p className="caja-exito mb-4">Vienes del piloto: tu tienda queda marcada como vendedor del piloto.</p>}

      <div className="space-y-5">
        {step === 0 && (
          <form onSubmit={next} className="space-y-4">
            <div>
              <h1 className="text-3xl">Nombre de tu tienda</h1>
              <p className="mt-1 text-base text-tinta-600">Es el nombre que verán tus clientes al pagar.</p>
            </div>
            <div>
              <label className="label" htmlFor="store">
                Nombre de la tienda
              </label>
              <input id="store" className="input" autoFocus value={store} onChange={(e) => setStore(e.target.value)} placeholder="Tienda Sofi" maxLength={60} />
            </div>
            <div>
              <label className="label" htmlFor="city">
                Tu ciudad
              </label>
              <Select id="city" value={city} onChange={(e) => setCity(e.target.value)}>
                <option value="">Elige…</option>
                {CIUDADES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </div>
            <ErrorBox error={error} />
            <button className="btn-primary w-full">Continuar</button>
          </form>
        )}

        {step === 1 && (
          <form onSubmit={next} className="space-y-4">
            <div>
              <h1 className="text-3xl">Tu WhatsApp</h1>
              <p className="mt-1 text-base text-tinta-600">Para que tus clientes te escriban y para armar los mensajes listos para enviar.</p>
            </div>
            <div>
              <label className="label" htmlFor="wa">
                Número de WhatsApp
              </label>
              <input id="wa" className="input" autoFocus inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="591 71234567" />
            </div>
            <ErrorBox error={error} />
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" onClick={() => setStep(0)}>
                Atrás
              </button>
              <button className="btn-primary flex-1">Continuar</button>
            </div>
          </form>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h1 className="text-3xl">Tu cuenta de cobro</h1>
              <p className="mt-1 text-base text-tinta-600">
                {WALLET_KIND === "pollar"
                  ? "Aquí recibes lo que vendes. Ingresa con Google o tu correo y la cuenta se crea sola. Las comisiones de red las pagamos nosotros."
                  : "Aquí recibes lo que vendes. Se crea sola en este dispositivo y solo tú puedes usarla."}
              </p>
            </div>
            <ul className="space-y-1 border-t border-tinta-200 pt-4 text-base text-tinta-700">
              <li>
                <strong>{store || "Tu tienda"}</strong>
                {city ? ` · ${city}` : ""}
              </li>
              <li>WhatsApp {whatsapp ? fmtWhatsApp(whatsapp) : "—"}</li>
              <li className="text-sm text-tinta-500">Nosotros no podemos mover tu plata; las comisiones de red las pagamos nosotros.</li>
            </ul>
            {busy && (
              <EsperaEnCurso
                titulo="Creando tu cuenta de cobro"
                nota="Suele tardar unos 10 segundos: se crea y se activa tu cuenta en la red de prueba, y después se guarda tu tienda."
                steps={pasos}
                testId="espera-cuenta"
              />
            )}
            <ErrorBox error={error} />
            <button className="btn-primary w-full" onClick={crearCuenta} disabled={busy}>
              {busy ? "Creando tu cuenta…" : WALLET_KIND === "pollar" ? "Ingresar con Google o correo y continuar" : "Crear mi cuenta de cobro y continuar"}
            </button>
            {!busy && (
              <button type="button" className="btn-ghost btn-sm w-full" onClick={() => setStep(1)}>
                Atrás
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
