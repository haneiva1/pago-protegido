import Link from "next/link";

const PASOS = [
  { n: "1", t: "Creas tu link", d: "Producto, precio en Bs y días de entrega. Listo en menos de 30 segundos." },
  { n: "2", t: "Tu cliente paga con QR", d: "Su pago queda guardado en un contrato público. Tú ves que pagó, pero todavía no cobras." },
  { n: "3", t: "Le llega y confirma", d: "Lo recibe por encomienda, lo revisa y confirma. Recién ahí se te paga." },
];

const BENEFICIOS = [
  { t: "Pago contra confirmación de entrega", d: "Como el contra entrega, pero funciona de una ciudad a otra." },
  { t: "El pago solo puede ir al vendedor o volver al comprador", d: "Nadie más puede cobrarlo, ni siquiera nosotros." },
  { t: "Reduce el riesgo de estafa", d: "Sin comprobantes editados: ves el pago antes de despachar." },
  { t: "Revisión de reclamos por un tercero", d: "Si algo sale mal, un revisor decide con reglas públicas." },
];

export default function Home() {
  return (
    <div className="space-y-14">
      <section className="grid items-center gap-10 pt-2 md:grid-cols-[1.15fr_1fr] md:pt-8">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-800 ring-1 ring-brand-200">
            Ventas entre ciudades por encomienda · Bs 300 a 3.000
          </span>
          <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl">Vende a otras ciudades sin que desconfíen de ti</h1>
          <p className="mt-4 max-w-xl text-lg text-slate-600">El contra entrega no cruza departamentos. Pago Protegido sí.</p>
          <p className="mt-2 max-w-xl text-slate-600">
            Tu cliente paga por adelantado y su plata queda guardada hasta que le llega el pedido. Tú despachas sabiendo que ya pagó.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href="/vender" className="btn-primary px-6 text-lg">
              Crear mi link
            </Link>
            <Link href="/como-funciona" className="btn-secondary px-6">
              Cómo funciona
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            La protección la paga el comprador (1,5%, mín. Bs 5, máx. Bs 50) o la regalas tú (2% de tu venta). ¿Quieres probarlo con tus ventas?{" "}
            <Link href="/piloto" className="underline">
              Únete al piloto
            </Link>
            .
          </p>
          <p className="mt-2 text-xs text-slate-500">
            <Link href="/metricas" className="font-semibold text-brand-700 underline" data-testid="link-metricas">
              Métricas en vivo
            </Link>
            : compras protegidas, reclamos y tiempos de cobro, con el registro público de cada compra.
          </p>
        </div>

        <div className="mx-auto w-full max-w-sm">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-3 shadow-xl shadow-slate-200/70">
            <div className="rounded-[1.5rem] bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Compra protegida · PP-4821</p>
              <div className="mt-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <p className="text-sm text-slate-500">Zapatillas Nike talla 40</p>
                <p className="mt-1 text-3xl font-bold">Bs 450</p>
                <p className="text-xs text-slate-500">Vendedor: Tienda Sofi · Santa Cruz · 128 ventas protegidas, 2 reclamos</p>
                <div className="mt-4 rounded-xl bg-brand-50 p-3 text-xs text-brand-900">🔒 Tu plata no llega al vendedor hasta que recibas tu pedido.</div>
                <div className="mt-4 rounded-xl bg-brand-600 py-3 text-center text-sm font-semibold text-white">Pagar Bs 456,75 con QR</div>
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

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
          <p className="text-sm text-slate-600">Nombre de tu tienda, tu ciudad y tu WhatsApp. Tu cuenta de cobro se crea sola.</p>
          <p className="mt-1 text-sm text-slate-600">
            ¿Eres comprador?{" "}
            <Link href="/pedir" className="underline">
              Pide compra protegida
            </Link>{" "}
            al vendedor.
          </p>
        </div>
        <Link href="/vender" className="btn-primary px-6">
          Crear mi link
        </Link>
      </section>
    </div>
  );
}
