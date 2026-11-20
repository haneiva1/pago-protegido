import Link from "next/link";
import { explorer } from "@/lib/format";
import { info } from "@/lib/server/orders";
import type { InfoData } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cómo funciona · Trato" };

function Node({ n, title, children, tone = "brand" }: { n: string; title: string; children: React.ReactNode; tone?: "brand" | "amber" | "violet" | "slate" }) {
  const ring = { brand: "ring-brand-200 bg-brand-50", amber: "ring-amber-200 bg-amber-50", violet: "ring-violet-200 bg-violet-50", slate: "ring-slate-200 bg-white" }[tone];
  return (
    <div className={`relative rounded-2xl p-4 ring-1 ${ring}`}>
      <span className="absolute -top-3 left-4 rounded-full bg-slate-900 px-2 py-0.5 text-xs font-bold text-white">{n}</span>
      <p className="mt-1 font-semibold">{title}</p>
      <div className="mt-1 text-sm text-slate-600">{children}</div>
    </div>
  );
}

const Arrow = () => (
  <div className="flex justify-center text-slate-400" aria-hidden>
    <svg viewBox="0 0 24 24" className="h-6 w-6">
      <path d="M12 4v16m0 0-6-6m6 6 6-6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>
);

export default async function ComoFunciona() {
  let data: InfoData | null = null;
  try {
    data = (await info()) as InfoData;
  } catch {
    data = null;
  }
  const guardian = data?.mode === "guardian";
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Cómo funciona</h1>
        <p className="mt-2 text-slate-600">
          Pago contra confirmación de entrega para ventas entre ciudades por encomienda. Cada compra tiene su propio contrato en la red Stellar (un escrow de
          Trustless Work). El pago solo puede ir al vendedor o volver al comprador: nadie, ni siquiera nosotros, puede mandarlo a otro lado.
        </p>
      </header>

      <section aria-label="Diagrama del flujo" className="space-y-3">
        <Node n="1" title="El vendedor crea el link" tone="slate">
          Producto, precio en Bs, categoría, días de entrega y quién paga la protección (el comprador: 1,5%, mín. Bs 5, máx. Bs 50; o el vendedor: 2,3%).
        </Node>
        <Arrow />
        <Node n="2" title="El comprador deja los datos de entrega y paga con QR" tone="slate">
          Quién recibe, ciudad de destino y agencia preferida. Esos datos quedan ligados al contrato con un hash. En esta práctica la rampa de Bs está simulada.
        </Node>
        <Arrow />
        <Node n="3" title="El pago queda guardado en el contrato del pedido">
          Antes de pedir la firma, la app verifica que el contrato ejecuta el código de Trustless Work y tiene los roles correctos.
          {guardian ? " El comprador paga a través de pp_guardian v2, que registra la compra y los dos plazos que firmó: despacho (los días de entrega) y revisión (días de entrega + 3, desde el envío)." : ""}
        </Node>
        <Arrow />
        <Node n="4" title="El vendedor registra el envío" tone="slate">
          Empresa, número de guía, peso, foto y destino (y el IMEI si es un celular). En el contrato queda la evidencia compacta: empresa|guía|peso|hash de la foto.
          {guardian
            ? " Se registra una sola vez con pp_guardian.mark_shipped, antes del plazo de despacho, y desde ahí corre la revisión. Si no despacha a tiempo, la plataforma abre la disputa y pp_arbiter.refund_unshipped le devuelve el pago al comprador, sin que tenga que reclamar."
            : ""}
        </Node>
        <Arrow />
        <div className="grid gap-3 md:grid-cols-2">
          <Node n="5a" title="Lo tiene en sus manos → paga al vendedor">
            Se habilita 2 h después del envío en la misma ciudad y 24 h si es otra ciudad, y pregunta antes: «¿Tienes el producto en tus manos y lo revisaste?».
            {guardian ? " pp_guardian aprueba y paga en la misma operación." : ""} Es irreversible.
          </Node>
          <Node n="5b" title="Tengo un problema → revisión de reclamos por un tercero" tone="violet">
            La plata queda congelada. El revisor solo puede repartir un porcentaje entre comprador y vendedor{guardian ? " (contrato pp_arbiter)" : ""}. El contrato no
            permite otro destino.
          </Node>
        </div>
      </section>

      <section id="reclamos" className="card space-y-3" data-testid="politica-reclamos">
        <h2 className="text-lg font-bold">Política de reclamos</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
          <li>Lo abre el comprador o el vendedor hasta que se ejecuta la liberación. Abrir un reclamo congela la liberación automática.</li>
          <li>
            Motivos: (a) no envió → se devuelve solo; (b) no llegó; (c) llegó vacío o con otro producto; (d) dañado o distinto a lo descrito. Arrepentirse no es
            motivo.
          </li>
          <li>Evidencia del vendedor: comprobante de la empresa (fecha, destino, receptor, peso) y foto del producto en el paquete con el código del pedido escrito a mano.</li>
          <li>Evidencia del comprador: foto del paquete cerrado. Para (c) y (d), video continuo del desempaque, obligatorio desde Bs 300.</li>
          <li>Plazos: el vendedor responde en 48 h, el comprador agrega evidencia en 48 h y el revisor decide en 72 h. Si el vendedor no responde, el comprador recupera todo su pago.</li>
          <li>
            Criterios, en este orden: sin prueba de envío, gana el comprador → entrega no registrada o dirección distinta a la del link, gana el comprador → entrega
            registrada y sin video de desempaque, gana el vendedor → peso que no coincide, gana el comprador → distinto o dañado: primero vuelve el producto y después
            el reembolso → reparto parcial solo con acuerdo de las partes o daño parcial probado.
          </li>
          <li>Si alguien te pide que confirmes antes de tener el producto, no lo hagas: responde «El vendedor me pide que confirme» y se abre un reclamo.</li>
        </ul>
      </section>

      <section className="card space-y-3" data-testid="real-simulado">
        <h2 className="text-lg font-bold">Qué es real y qué es simulado</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl bg-brand-50 p-3 text-sm">
            <p className="font-semibold text-brand-900">Real</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-brand-900">
              <li>Contratos en Stellar testnet (pp_guardian, pp_arbiter)</li>
              <li>Escrow de Trustless Work (un contrato por compra)</li>
              <li>Firmas de comprador y vendedor</li>
              <li>Comisiones de red pagadas por la plataforma (fee bump)</li>
              <li>Lógica del asistente de WhatsApp</li>
            </ul>
          </div>
          <div className="rounded-xl bg-amber-50 p-3 text-sm">
            <p className="font-semibold text-amber-900">Simulado</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-900">
              <li>La rampa en Bs (QR del banco)</li>
              <li>El dinero: dólares de prueba (en producción, USDC)</li>
              <li>El número de WhatsApp (simulador)</li>
              <li>La verificación de identidad (KYC)</li>
              <li>En testnet, Pollar guarda las llaves de los vendedores que entran con Google o correo</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-bold">Quién puede hacer qué</h2>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="py-1.5">Rol en el contrato</th>
              <th className="py-1.5">Quién</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="py-2">Aprueba y paga</td>
              <td>{guardian ? "Contrato pp_guardian (solo cuando el comprador confirma o vence el plazo)" : "El comprador, con su cuenta"}</td>
            </tr>
            <tr>
              <td className="py-2">Resuelve reclamos</td>
              <td>{guardian ? "Contrato pp_arbiter (solo reparte entre comprador y vendedor)" : "Cuenta del revisor (modo directo, temporal)"}</td>
            </tr>
            <tr>
              <td className="py-2">Registra el envío y recibe el pago</td>
              <td>El vendedor</td>
            </tr>
            <tr>
              <td className="py-2">Plataforma</td>
              <td>Cobra la protección y paga las comisiones de red (fee bump). No puede mover la plata.</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-bold">Los contratos en Stellar (testnet)</h2>
        {data ? (
          <ul className="space-y-2 text-sm">
            {data.contracts.map((c) => (
              <li key={c.id}>
                <span className="block text-slate-700">{c.label}</span>
                <a className="break-all font-mono text-xs text-brand-700 underline" href={c.kind === "contract" ? explorer.contract(c.id) : explorer.account(c.id)} target="_blank" rel="noreferrer">
                  {c.id}
                </a>
              </li>
            ))}
            {data.factory && (
              <li>
                <span className="block text-slate-700">Escrow de Trustless Work usado como fábrica (despliega e inicializa cada contrato de pedido)</span>
                <a className="break-all font-mono text-xs text-brand-700 underline" href={explorer.contract(data.factory)} target="_blank" rel="noreferrer">
                  {data.factory}
                </a>
              </li>
            )}
            <li>
              <span className="block text-slate-700">Código del escrow de Trustless Work (hash del WASM)</span>
              <span className="break-all font-mono text-xs text-slate-500">{data.wasmHash}</span>
            </li>
          </ul>
        ) : (
          <p className="muted">La configuración de la red no está disponible.</p>
        )}
        <p className="text-sm">
          📊 Métricas en vivo de todas las compras protegidas, calculadas con eventos públicos de estos contratos:{" "}
          <Link href="/transparencia" className="font-semibold text-brand-700 underline">
            Transparencia
          </Link>
        </p>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/vender" className="btn-primary sm:flex-1">
          Crear mi link
        </Link>
        <Link href="/" className="btn-secondary sm:flex-1">
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
