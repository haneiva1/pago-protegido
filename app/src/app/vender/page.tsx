"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorBox, Progress, Spinner, useProgress } from "@/components/ui";
import { WALLET_KIND, activateWallet, api, getWallet } from "@/lib/wallet";

const PASOS = ["Tu tienda", "Tu WhatsApp", "Tu billetera"];

export default function Vender() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [store, setStore] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const progress = useProgress();

  useEffect(() => {
    // Si ya hay tienda en este dispositivo, directo al panel.
    const pk = getWallet("vendedor").publicKey();
    if (pk) api(`/api/sellers/${pk}`).then(() => router.replace("/panel")).catch(() => {});
  }, [router]);

  async function crearBilletera() {
    setBusy(true);
    setError(null);
    try {
      const wallet = getWallet("vendedor");
      const L = WALLET_KIND === "pollar" ? "Ingresando con tu cuenta (Pollar)" : "Creando tu billetera en este dispositivo";
      progress.push(L);
      const pubkey = await wallet.connect();
      progress.finish(L);
      await activateWallet(wallet, progress.push);
      progress.push("Guardando tu tienda");
      await api("/api/sellers", { pubkey, storeName: store, whatsapp });
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
            <h1 className="text-2xl font-bold">Tu billetera</h1>
            {WALLET_KIND === "pollar" ? (
              <p className="text-slate-600">
                Aquí recibes lo que vendes, en dólares digitales. Ingresa con Google o tu email y la billetera se crea sola, sin frases
                secretas. Las comisiones de red las pagamos nosotros.
              </p>
            ) : (
              <p className="text-slate-600">
                Aquí recibes lo que vendes, en dólares digitales. Se crea sola en este dispositivo: la llave queda solo contigo y nosotros
                nunca la vemos. Las comisiones de red las pagamos nosotros.
              </p>
            )}
            {WALLET_KIND === "local" && (
              <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                Versión de prueba: la billetera se guarda en este navegador y usa USD de prueba de Stellar testnet.
              </p>
            )}
            <Progress steps={progress.steps} />
            <ErrorBox error={error} />
            <button className="btn-primary w-full" onClick={crearBilletera} disabled={busy}>
              {busy ? (
                <>
                  <Spinner /> Creando tu billetera…
                </>
              ) : WALLET_KIND === "pollar" ? (
                "Ingresar con Google o email y continuar"
              ) : (
                "Crear mi billetera y continuar"
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
