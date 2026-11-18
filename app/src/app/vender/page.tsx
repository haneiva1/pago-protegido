"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorBox, Progress, Spinner, useProgress } from "@/components/ui";
import { CIUDADES } from "@/lib/format";
import { WALLET_KIND, activateWallet, api, getWallet } from "@/lib/wallet";

const PASOS = ["Tu tienda", "Tu WhatsApp", "Tu cuenta de cobro"];

export default function Vender() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [store, setStore] = useState("");
  const [city, setCity] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [pilotId, setPilotId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const progress = useProgress();

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

  async function crearCuenta() {
    setBusy(true);
    setError(null);
    try {
      const wallet = getWallet("vendedor");
      const L = WALLET_KIND === "pollar" ? "Ingresando con tu cuenta" : "Creando tu cuenta de cobro en este dispositivo";
      progress.push(L);
      const pubkey = await wallet.connect();
      await activateWallet(wallet);
      progress.finish(L);
      progress.push("Guardando tu tienda");
      await api("/api/sellers", { pubkey, storeName: store, whatsapp, city, pilotId });
      progress.finish("Guardando tu tienda");
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
    <div className="mx-auto max-w-md">
      <ol className="mb-6 flex items-center gap-2" aria-label="Pasos">
        {PASOS.map((p, i) => (
          <li key={p} className="flex flex-1 flex-col gap-1.5">
            <span className={`h-1.5 rounded-full ${i <= step ? "bg-brand-600" : "bg-slate-200"}`} />
            <span className={`text-xs ${i === step ? "font-semibold text-slate-900" : "text-slate-500"}`}>
              {i + 1}. {p}
            </span>
          </li>
        ))}
      </ol>

      {pilotId && <p className="mb-4 rounded-xl bg-brand-50 p-3 text-sm text-brand-900">Vienes del piloto: tu tienda queda marcada como vendedor del piloto.</p>}

      <div className="card">
        {step === 0 && (
          <form onSubmit={next} className="space-y-4">
            <h1 className="text-2xl font-bold">¿Cómo se llama tu tienda?</h1>
            <p className="muted">Es el nombre que verán tus clientes al pagar.</p>
            <div>
              <label className="label" htmlFor="store">
                Nombre de la tienda
              </label>
              <input id="store" className="input" autoFocus value={store} onChange={(e) => setStore(e.target.value)} placeholder="Ej.: Tienda Sofi" maxLength={60} />
            </div>
            <div>
              <label className="label" htmlFor="city">
                Tu ciudad
              </label>
              <select id="city" className="input" value={city} onChange={(e) => setCity(e.target.value)}>
                <option value="">Elige…</option>
                {CIUDADES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <ErrorBox error={error} />
            <button className="btn-primary w-full">Continuar</button>
          </form>
        )}

        {step === 1 && (
          <form onSubmit={next} className="space-y-4">
            <h1 className="text-2xl font-bold">Tu WhatsApp</h1>
            <p className="muted">Para que tus clientes te escriban y para armar los mensajes listos para enviar.</p>
            <div>
              <label className="label" htmlFor="wa">
                Número de WhatsApp
              </label>
              <input id="wa" className="input" autoFocus inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="Ej.: 591 71234567" />
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
            <h1 className="text-2xl font-bold">Tu cuenta de cobro</h1>
            {WALLET_KIND === "pollar" ? (
              <p className="text-slate-600">
                Aquí recibes lo que vendes. Ingresa con Google o tu correo y la cuenta se crea sola. Las comisiones de red las pagamos nosotros.
              </p>
            ) : (
              <p className="text-slate-600">
                Aquí recibes lo que vendes. Se crea sola en este dispositivo y solo tú puedes usarla: nosotros no podemos mover tu plata. Las comisiones de red
                las pagamos nosotros.
              </p>
            )}
            <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Modo práctica: no se mueve dinero real.</p>
            <Progress steps={progress.steps} />
            <ErrorBox error={error} />
            <button className="btn-primary w-full" onClick={crearCuenta} disabled={busy}>
              {busy ? (
                <>
                  <Spinner /> Creando tu cuenta…
                </>
              ) : WALLET_KIND === "pollar" ? (
                "Ingresar con Google o correo y continuar"
              ) : (
                "Crear mi cuenta de cobro y continuar"
              )}
            </button>
            {!busy && (
              <button type="button" className="w-full text-sm text-slate-500 underline" onClick={() => setStep(1)}>
                Atrás
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
