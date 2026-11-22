import Link from "next/link";
import { IconoCandado, IconoCheckCirculo } from "@/components/iconos";
import { TratoSimbolo } from "@/components/TratoLogo";

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
    <div className="space-y-16 sm:space-y-24">
      {/* Portada: una promesa, una acción. */}
      <section className="grid items-center gap-10 pt-4 md:grid-cols-[1.1fr_1fr] md:gap-12 md:pt-12">
        <div>
          <p className="eyebrow">Celulares y electrónica entre ciudades · Bs 1.000 a 7.000</p>
          <h1 className="mt-4 text-4xl leading-[1.05] sm:text-5xl lg:text-[3.5rem]">Vende a otras ciudades sin que desconfíen de ti</h1>
          <p className="mt-5 max-w-xl text-lg font-medium text-tinta-700">El contra entrega no cruza departamentos. Trato sí.</p>
          <p className="mt-2 max-w-xl text-tinta-600">
            Tu cliente paga por adelantado y su plata espera entre los dos hasta que le llega el pedido. Tú despachas sabiendo que ya pagó.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/vender" className="btn-primary px-6 text-lg">
              Crear mi link
            </Link>
            <Link href="/como-funciona" className="btn-secondary px-6">
              Cómo funciona
            </Link>
          </div>
          <p className="mt-6 max-w-xl text-sm text-tinta-500">
            La protección la paga el comprador (1,5%, mín. Bs 5, máx. Bs 50) o la regalas tú (2,3% de tu venta). ¿Quieres probarlo con tus ventas?{" "}
            <Link href="/piloto" className="enlace">
              Únete al piloto
            </Link>
            .
          </p>
          <p className="mt-2 max-w-xl text-sm text-tinta-500">
            <Link href="/metricas" className="enlace" data-testid="link-metricas">
              Métricas en vivo
            </Link>
            : compras protegidas, reclamos y tiempos de cobro, con el registro público de cada compra.
          </p>
        </div>

        {/* Maqueta de lo que ve el comprador. Es un ejemplo y lo dice. */}
        <div className="mx-auto w-full max-w-sm">
          <div className="rounded-panel bg-monte p-2.5 shadow-celular">
            <div className="rounded-[1.1rem] bg-sal p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="eyebrow">Compra protegida · PP-4821</p>
                <span className="chip-neutro" data-testid="ejemplo">
                  Ejemplo
                </span>
              </div>
              <div className="card mt-3 space-y-3 !p-4">
                <div>
                  <p className="text-sm text-tinta-600">Celular Samsung Galaxy A35</p>
                  <p className="mt-1 font-display text-3xl leading-none tracking-tight text-monte num">Bs 2.500</p>
                  <p className="mt-2 text-xs text-tinta-500">Zapatería · Santa Cruz · 128 ventas protegidas, 2 reclamos</p>
                </div>
                <div className="panel-suave flex items-start gap-2.5 !p-3 text-xs">
                  <IconoCandado className="mt-px h-4 w-4 shrink-0 text-musgo" />
                  <span>
                    <span className="font-semibold">Tu plata espera entre los dos.</span> Llega a la tienda cuando confirmes que recibiste.
                  </span>
                </div>
                <div className="btn-primary w-full text-sm" aria-hidden>
                  Pagar Bs 2.537,50 con QR
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tres pasos, sin tarjetas: número, título, una línea. */}
      <section aria-labelledby="asi-de-simple">
        <h2 id="asi-de-simple" className="text-2xl sm:text-3xl">
          Así de simple
        </h2>
        <ol className="mt-8 grid gap-8 md:grid-cols-3 md:gap-6">
          {PASOS.map((p) => (
            <li key={p.n} className="border-t border-tinta-200 pt-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-monte font-display text-base text-sal">{p.n}</span>
              <h3 className="mt-4 text-lg">{p.t}</h3>
              <p className="mt-1.5 text-tinta-600">{p.d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Lo que importa, en Monte. */}
      <section className="panel-oscuro !p-6 sm:!p-10" data-oscuro aria-labelledby="por-que">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-yungas">Por qué funciona</p>
            <h2 id="por-que" className="mt-2 max-w-2xl text-2xl text-sal sm:text-3xl">
              La plata espera entre los dos. Nadie más la toca.
            </h2>
          </div>
          <TratoSimbolo className="hidden h-12 w-12 shrink-0 text-yungas sm:block" />
        </div>
        <ul className="mt-8 grid gap-x-10 gap-y-7 sm:grid-cols-2">
          {BENEFICIOS.map((b) => (
            <li key={b.t} className="flex items-start gap-3">
              <IconoCheckCirculo className="mt-0.5 h-5 w-5 shrink-0 text-yungas" />
              <div>
                <h3 className="font-sans text-base font-semibold tracking-normal text-sal">{b.t}</h3>
                <p className="mt-1 text-sm text-sal/70">{b.d}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Cierre: la firma de la marca, una vez. */}
      <section className="panel-acento flex flex-col items-start justify-between gap-6 !p-6 sm:!p-10 md:flex-row md:items-center">
        <div>
          <h2 className="text-2xl sm:text-3xl">Tu primer link en menos de un minuto</h2>
          <p className="mt-2 max-w-xl text-monte/80">Nombre de tu tienda, tu ciudad y tu WhatsApp. Tu cuenta de cobro se crea sola.</p>
          <p className="mt-1 text-sm text-monte/80">
            ¿Eres comprador?{" "}
            <Link href="/pedir" className="font-semibold underline underline-offset-2">
              Pide compra protegida
            </Link>{" "}
            al vendedor.
          </p>
        </div>
        <Link href="/vender" className="btn-oscuro shrink-0 px-6 text-lg">
          Crear mi link
        </Link>
      </section>
    </div>
  );
}
