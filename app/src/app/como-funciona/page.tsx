import Link from "next/link";
import { explorer } from "@/lib/format";
import { info } from "@/lib/server/orders";
import type { InfoData } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cómo funciona · Pago Protegido" };

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
  <div className="flex justify-center text-slate-400 md:rotate-0" aria-hidden>
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
          Cada compra tiene su propio contrato en la red Stellar (un escrow de Trustless Work). La plata entra al contrato y solo puede salir
          hacia el vendedor, o repartida entre comprador y vendedor si hay un reclamo. Nadie, ni siquiera la plataforma, puede mandarla a otro
          lado.
        </p>
      </header>

      <section aria-label="Diagrama del flujo" className="space-y-3">
        <Node n="1" title="El vendedor crea el link" tone="slate">
          Producto, precio en Bs y días de entrega. Lo comparte por WhatsApp o redes.
        </Node>
        <Arrow />
        <Node n="2" title="El comprador paga con QR" tone="slate">
          El banco convierte los Bs en dólares digitales (en esta prueba: <strong>rampa simulada</strong> que emite USD de prueba).
        </Node>
        <Arrow />
        <Node n="3" title="La plata queda en el contrato del pedido">
          La plataforma despliega el contrato con los roles de la compra y el comprador lo fondea con su billetera.
          {guardian ? " Fondea a través de pp_guardian, que registra la compra y el plazo." : ""}
        </Node>
        <Arrow />
        <Node n="4" title="El vendedor marca “enviado”" tone="slate">
          Con el código de encomienda o una foto, que quedan registrados en el contrato.
        </Node>
        <Arrow />
        <div className="grid gap-3 md:grid-cols-2">
          <Node n="5a" title="Recibí conforme → se libera">
            El comprador confirma y la plata va al vendedor{guardian ? " (pp_guardian aprueba y libera en la misma operación)" : ""}. Se descuentan
            2% de la plataforma y 0,3% de Trustless Work.
          </Node>
          <Node n="5b" title="Tengo un problema → decide el árbitro" tone="violet">
            La plata queda congelada. El árbitro solo puede repartir un porcentaje entre comprador y vendedor
            {guardian ? " (contrato pp_arbiter)" : ""}. El contrato no permite otro destino.
          </Node>
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
              <td className="py-2">Aprueba y libera</td>
              <td>{guardian ? "Contrato pp_guardian (solo cuando el comprador confirma)" : "El comprador, con su billetera"}</td>
            </tr>
            <tr>
              <td className="py-2">Resuelve reclamos</td>
              <td>{guardian ? "Contrato pp_arbiter (solo reparte entre comprador y vendedor)" : "Cuenta del árbitro (modo directo, temporal)"}</td>
            </tr>
            <tr>
              <td className="py-2">Marca el envío y recibe la plata</td>
              <td>El vendedor</td>
            </tr>
            <tr>
              <td className="py-2">Plataforma</td>
              <td>Cobra 2% y paga las comisiones de red (fee bump). No puede mover la plata.</td>
            </tr>
          </tbody>
        </table>
        {!guardian && (
          <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
            Esta versión corre en <strong>modo directo</strong> mientras se terminan los contratos pp_guardian y pp_arbiter. El cambio es una
            configuración (PP_MODE=guardian).
          </p>
        )}
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
        <p className="text-xs text-slate-500">Cada pedido muestra además el link a su propio contrato y a cada transacción.</p>
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
