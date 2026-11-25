import { ES_MAINNET, TEXTO } from "@/lib/red";
import Link from "next/link";
import { IconoAlerta, IconoCheckCirculo } from "@/components/iconos";
import { explorer } from "@/lib/format";
import { info } from "@/lib/server/orders";
import type { InfoData } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cómo funciona · Trato" };

/** Un paso de la línea de tiempo: número en Monte, título y una explicación corta. */
function Paso({ n, titulo, ultimo = false, children }: { n: string; titulo: string; ultimo?: boolean; children: React.ReactNode }) {
  return (
    <li className="relative flex gap-4 pb-8 last:pb-0">
      {!ultimo && <span aria-hidden className="absolute left-[17px] top-9 bottom-0 w-px bg-tinta-200" />}
      <span className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-monte font-display text-sm text-sal">{n}</span>
      <div className="min-w-0 flex-1 pt-1.5">
        <h3 className="font-sans text-base font-semibold tracking-normal text-monte">{titulo}</h3>
        <p className="mt-1 text-sm text-tinta-600">{children}</p>
      </div>
    </li>
  );
}

export default async function ComoFunciona() {
  let data: InfoData | null = null;
  try {
    data = (await info()) as InfoData;
  } catch {
    data = null;
  }
  const guardian = data?.mode === "guardian";
  return (
    <div className="mx-auto max-w-3xl space-y-12">
      <header className="pt-2">
        <p className="eyebrow">Pago contra confirmación de entrega</p>
        <h1 className="mt-2 text-3xl sm:text-4xl">Cómo funciona</h1>
        <p className="mt-4 text-lg text-tinta-600">
          Para ventas entre ciudades por encomienda. Cada compra tiene su propio contrato en una red pública: el pago solo puede ir al vendedor o volver al
          comprador. Nadie, ni siquiera nosotros, puede mandarlo a otro lado.
        </p>
      </header>

      <section aria-label="Paso a paso">
        <ol>
          <Paso n="1" titulo="El vendedor crea el link">
            Producto, precio en Bs, categoría, días de entrega y quién paga la protección (el comprador: 1,5%, mín. Bs 5, máx. Bs 50; o el vendedor: 2,3%).
          </Paso>
          <Paso n="2" titulo={ES_MAINNET ? "El comprador deja los datos de entrega y paga con USDC" : "El comprador deja los datos de entrega y paga con QR"}>
            Quién recibe, ciudad de destino y agencia preferida. Esos datos quedan ligados al contrato con una huella digital.{" "}
            {ES_MAINNET ? "Paga con USDC de su propia cuenta Stellar." : "En esta práctica, el pago en Bs está simulado."}
          </Paso>
          <Paso n="3" titulo="La plata espera entre los dos, en el contrato del pedido">
            Antes de pedir la firma, la app comprueba que el contrato ejecuta el código de Trustless Work y tiene los roles correctos.
            {guardian
              ? " El comprador paga a través de pp_guardian v2, que registra la compra y los dos plazos que firmó: despacho (los días de entrega) y revisión (días de entrega + 3, desde el envío)."
              : ""}
          </Paso>
          <Paso n="4" titulo="El vendedor registra el envío" ultimo>
            Empresa, número de guía, peso, destino y las fotos de la guía y del paquete desde la cámara (y el IMEI si es un celular). En el contrato queda la
            evidencia compacta: empresa, guía, peso y la huella de cada foto.
            {guardian
              ? " Se registra una sola vez con pp_guardian.mark_shipped, antes del plazo de despacho, y desde ahí corre la revisión. Si no despacha a tiempo, la plataforma abre la disputa y pp_arbiter.refund_unshipped le devuelve el pago al comprador, sin que tenga que reclamar."
              : ""}
          </Paso>
        </ol>
        <div className="ml-[17px] h-6 w-px bg-tinta-200" aria-hidden />
        <div className="grid gap-3 md:grid-cols-2">
          <div className="panel-suave">
            <div className="flex items-center gap-2">
              <IconoCheckCirculo className="h-5 w-5 shrink-0 text-musgo" />
              <h3 className="font-sans text-base font-semibold tracking-normal">5a · Lo tiene en sus manos: paga al vendedor</h3>
            </div>
            <p className="mt-2 text-sm text-tinta-600">
              Se habilita 2 h después del envío en la misma ciudad (La Paz y El Alto cuentan como una) y 24 h si es otra ciudad, y pregunta antes: «¿Tienes el
              producto en tus manos y lo revisaste?».{guardian ? " pp_guardian aprueba y paga en la misma operación." : ""} Es irreversible.
            </p>
          </div>
          <div className="rounded-card border border-aviso-200 bg-aviso-50 p-4">
            <div className="flex items-center gap-2">
              <IconoAlerta className="h-5 w-5 shrink-0 text-aviso-700" />
              <h3 className="font-sans text-base font-semibold tracking-normal text-monte">5b · Tengo un problema: lo revisa un tercero</h3>
            </div>
            <p className="mt-2 text-sm text-tinta-600">
              La plata queda congelada. El revisor solo puede repartir un porcentaje entre comprador y vendedor{guardian ? " (contrato pp_arbiter)" : ""}. El
              contrato no permite otro destino.
            </p>
          </div>
        </div>
      </section>

      <section id="reclamos" className="card space-y-3 sm:p-6" data-testid="politica-reclamos">
        <h2 className="text-xl">Política de reclamos</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-tinta-700">
          <li>Lo abre el comprador o el vendedor hasta que se ejecuta la liberación. Abrir un reclamo congela la liberación automática.</li>
          <li>
            Motivos: (a) no envió, se devuelve solo; (b) no llegó; (c) llegó vacío o con otro producto; (d) dañado o distinto a lo descrito. Arrepentirse no es
            motivo.
          </li>
          <li>Evidencia del vendedor: comprobante de la empresa (fecha, destino, receptor, peso) y foto del producto en el paquete con el código del pedido escrito a mano.</li>
          <li>Evidencia del comprador: foto del paquete cerrado. Para (c) y (d), video continuo del desempaque, obligatorio desde Bs 300.</li>
          <li>Plazos: el vendedor responde en 48 h, el comprador agrega evidencia en 48 h y el revisor decide en 72 h. Si el vendedor no responde, el comprador recupera todo su pago.</li>
          <li>
            Criterios, en este orden: sin prueba de envío, gana el comprador; entrega no registrada o dirección distinta a la del link, gana el comprador; entrega
            registrada y sin video de desempaque (desde Bs 300), gana el vendedor; peso que no coincide, gana el comprador; distinto o dañado: primero vuelve el
            producto y después el reembolso; reparto parcial solo con acuerdo de las partes o daño parcial probado.
          </li>
          <li>Si alguien te pide que confirmes antes de tener el producto, no lo hagas: responde «El vendedor me pide que confirme» y se abre un reclamo.</li>
        </ul>
      </section>

      <section className="space-y-4" data-testid="real-simulado">
        <h2 className="text-xl">Qué es real y qué es simulado</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="panel-suave text-sm">
            <p className="font-semibold text-exito-700">Real</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-tinta-700">
              <li>Contratos en la {TEXTO.redPublica} (pp_guardian, pp_arbiter)</li>
              {ES_MAINNET && <li>La plata: USDC real que el comprador manda desde su propia cuenta Stellar, con un monto máximo por compra</li>}
              <li>Contrato de Trustless Work, uno por compra</li>
              <li>Firmas de comprador y vendedor</li>
              <li>Comisiones de red pagadas por la plataforma</li>
              <li>Lógica del asistente de WhatsApp</li>
            </ul>
          </div>
          <div className="rounded-card border border-tinta-200 bg-tinta-100 p-4 text-sm">
            <p className="font-semibold text-tinta-700">Simulado</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-tinta-700">
              {ES_MAINNET ? (
                <li>No hay pago en Bs con QR: los precios en Bs son una referencia</li>
              ) : (
                <>
                  <li>El pago en Bs (QR del banco)</li>
                  <li>El dinero: dólares de prueba (en producción, USDC)</li>
                </>
              )}
              <li>El número de WhatsApp (simulador)</li>
              <li>La verificación de identidad (KYC)</li>
              {!ES_MAINNET && <li>En la red de prueba, Pollar guarda el acceso a la cuenta de los vendedores que entran con Google o correo</li>}
            </ul>
          </div>
        </div>
      </section>

      <section className="card space-y-3 sm:p-6">
        <h2 className="text-xl">Quién puede hacer qué</h2>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-tinta-500">
            <tr>
              <th className="py-2 font-medium">Rol en el contrato</th>
              <th className="py-2 font-medium">Quién</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-tinta-100 text-tinta-700">
            <tr>
              <td className="py-2.5 pr-4 font-medium text-monte">Aprueba y paga</td>
              <td className="py-2.5">{guardian ? "Contrato pp_guardian (solo cuando el comprador confirma o vence el plazo)" : "El comprador, con su cuenta"}</td>
            </tr>
            <tr>
              <td className="py-2.5 pr-4 font-medium text-monte">Resuelve reclamos</td>
              <td className="py-2.5">{guardian ? "Contrato pp_arbiter (solo reparte entre comprador y vendedor)" : "Cuenta del revisor (modo directo, temporal)"}</td>
            </tr>
            <tr>
              <td className="py-2.5 pr-4 font-medium text-monte">Registra el envío y recibe el pago</td>
              <td className="py-2.5">El vendedor</td>
            </tr>
            <tr>
              <td className="py-2.5 pr-4 font-medium text-monte">Plataforma</td>
              <td className="py-2.5">Cobra la protección y paga las comisiones de red. No puede mover la plata.</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="card space-y-3 sm:p-6">
        <h2 className="text-xl">Los contratos, en la {TEXTO.redPublica}</h2>
        {data ? (
          <ul className="space-y-3 text-sm">
            {data.contracts.map((c) => (
              <li key={c.id}>
                <span className="block text-tinta-700">{c.label}</span>
                <a className="enlace break-all font-mono text-xs" href={c.kind === "contract" ? explorer.contract(c.id) : explorer.account(c.id)} target="_blank" rel="noreferrer">
                  {c.id}
                </a>
              </li>
            ))}
            {data.factory && (
              <li>
                <span className="block text-tinta-700">Contrato de Trustless Work usado como fábrica (despliega e inicializa cada contrato de pedido)</span>
                <a className="enlace break-all font-mono text-xs" href={explorer.contract(data.factory)} target="_blank" rel="noreferrer">
                  {data.factory}
                </a>
              </li>
            )}
            <li>
              <span className="block text-tinta-700">Código del contrato de Trustless Work (huella del WASM)</span>
              <span className="break-all font-mono text-xs text-tinta-500">{data.wasmHash}</span>
            </li>
          </ul>
        ) : (
          <p className="muted">La configuración de la red no está disponible.</p>
        )}
        <p className="text-sm text-tinta-600">
          Las métricas de todas las compras con Trato se calculan con los eventos públicos de estos contratos:{" "}
          <Link href="/transparencia" className="enlace">
            Transparencia
          </Link>
          .
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
