import Link from "next/link";

const PASOS = [
  { n: "1", t: "Creas tu link", d: "Producto, precio en Bs y días de entrega. Listo en menos de 30 segundos." },
  { n: "2", t: "Tu cliente paga protegido", d: "La plata queda guardada en un contrato que nadie puede tocar, ni siquiera nosotros." },
  { n: "3", t: "Cobras cuando recibe", d: "Confirma que le llegó y la plata se libera a tu cuenta al instante." },
];

const BENEFICIOS = [
  { t: "Sin comprobantes falsos", d: "Ves el pago en el contrato antes de despachar. Nada de capturas editadas." },
  { t: "Tu cliente confía", d: "Sabe que si no recibe, no pierde su plata. Te compra más rápido." },
  { t: "Si hay problema, decide un árbitro", d: "Solo puede repartir entre comprador y vendedor. Nadie más puede cobrar." },
];

export default function Home() {
  return (
    <div className="space-y-14">
      <section className="grid items-center gap-10 pt-2 md:grid-cols-[1.15fr_1fr] md:pt-8">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-800 ring-1 ring-brand-200">
            Para ventas por Instagram, TikTok, Facebook y WhatsApp
          </span>
          <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl">
            Vende por redes sin que desconfíen de ti.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-slate-600">
            Tu cliente paga por adelantado y su plata queda protegida hasta que recibe. Tú cobras seguro y sin comprobantes falsos.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href="/vender" className="btn-primary px-6 text-lg">
              Crear mi link
            </Link>
            <Link href="/como-funciona" className="btn-secondary px-6">
              Cómo funciona
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate-500">Sin costo de apertura. Comisión de 2% solo cuando vendes.</p>
        </div>

        <div className="mx-auto w-full max-w-sm">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-3 shadow-xl shadow-slate-200/70">
            <div className="rounded-[1.5rem] bg-slate-50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">TS</div>
                <div>
                  <p className="text-sm font-semibold">Tienda Sofi</p>
                  <p className="text-xs text-slate-500">128 ventas completadas</p>
                </div>
              </div>
              <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <p className="text-sm text-slate-500">Zapatillas Nike talla 40</p>
                <p className="mt-1 text-3xl font-bold">Bs 450</p>
                <p className="text-xs text-slate-500">≈ 38,46 USD de prueba · entrega en 3 días</p>
                <div className="mt-4 rounded-xl bg-brand-50 p-3 text-xs text-brand-900">
                  🔒 Tu plata queda guardada hasta que confirmes que recibiste.
                </div>
                <div className="mt-4 rounded-xl bg-brand-600 py-3 text-center text-sm font-semibold text-white">Pagar protegido</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold tracking-tight">Así de simple</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {PASOS.map((p) => (
            <div key={p.n} className="card">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">{p.n}</span>
              <h3 className="mt-3 font-semibold">{p.t}</h3>
              <p className="mt-1 text-sm text-slate-600">{p.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {BENEFICIOS.map((b) => (
          <div key={b.t} className="rounded-2xl bg-slate-900 p-5 text-white">
            <h3 className="font-semibold">{b.t}</h3>
            <p className="mt-1 text-sm text-slate-300">{b.d}</p>
          </div>
        ))}
      </section>

      <section className="card flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h2 className="text-xl font-bold">Tu primer link en menos de un minuto</h2>
          <p className="text-sm text-slate-600">Nombre de tu tienda, tu WhatsApp y listo. La billetera se crea sola.</p>
        </div>
        <Link href="/vender" className="btn-primary px-6">
          Crear mi link
        </Link>
      </section>
    </div>
  );
}
