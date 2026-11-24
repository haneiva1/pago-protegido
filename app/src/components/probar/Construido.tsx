import { IconoExterno } from "@/components/iconos";
import { Resumen, legible } from "@/components/probar/Resumen";

/** Lo que ya está construido: evidencia sobria con links, para el cierre de /probar. Datos del README; nada inventado. */
const PUNTOS: { texto: string; links: { label: string; href: string }[] }[] = [
  {
    texto: "Contratos propios pp_guardian y pp_arbiter (Soroban, v2 en la red de prueba), verificables; los hashes se reproducen con contracts/scripts/verify-wasm.sh.",
    links: [
      { label: "pp_guardian", href: "https://stellar.expert/explorer/testnet/contract/CDKYF7OAJTACP4JNJSGGXDRA3DHE442R26CT5ZE5DJHNSHH7XJUOATOT" },
      { label: "pp_arbiter", href: "https://stellar.expert/explorer/testnet/contract/CDTEA424AWSIIHEQ4FIQHFQOTWS3XAVLQHX7FI3MU6JZP4OPMTEVU5UA" },
    ],
  },
  {
    texto: "Escrow de Trustless Work (single-release v1, commit f0b706e, sin modificar); la app verifica el WASM antes de pedir la firma.",
    links: [],
  },
  {
    texto: "Tests: 47 de contratos contra el WASM real (invariantes, red team y 200 secuencias aleatorias), 171 de la app, 241 unitarios y 4 e2e del bot, y 12 de punta a punta contra la red de prueba (6 con pagos).",
    links: [{ label: "Repositorio", href: "https://github.com/haneiva1/pago-protegido" }],
  },
  {
    texto: "CI pública en verde en cada cambio.",
    links: [{ label: "CI", href: "https://github.com/haneiva1/pago-protegido/actions/workflows/ci.yml?query=branch%3Amain" }],
  },
  {
    texto: "Deploy público en Railway con el proceso que libera y devuelve los pedidos vencidos (hoy corre cada vez que alguien abre un pedido o el panel, o el bot consulta).",
    links: [{ label: "Demo pública", href: "https://app-production-d0fc8f63.up.railway.app" }],
  },
  {
    texto: "Bot de WhatsApp sobre la API oficial de WhatsApp Cloud (carpeta bot/), con simulador para las pruebas.",
    links: [{ label: "bot/", href: "https://github.com/haneiva1/pago-protegido/tree/main/bot" }],
  },
  {
    texto: "9 desvíos rechazados en la red de prueba sin que el tercero recibiera nada; evidencia on-chain en el README.",
    links: [{ label: "Evidencia on-chain", href: "https://github.com/haneiva1/pago-protegido#evidencia-on-chain" }],
  },
];

export function Construido({ resumen }: { resumen: { transacciones: number; duracionMs: number } | null }) {
  return (
    <section data-testid="construido" className="seccion mx-auto max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="eyebrow">Cierre</p>
          <h2 className="mt-1 text-2xl lg:text-3xl">Lo que ya está construido</h2>
        </div>
        {resumen && (
          <p className="text-sm text-tinta-600" data-testid="construido-resumen">
            En esta prueba: <strong className="num text-monte">{resumen.transacciones}</strong> transacciones públicas en{" "}
            <strong className="num text-monte">{legible(resumen.duracionMs)}</strong>, del link al cobro.
          </p>
        )}
      </div>
      <ol className="mt-5 space-y-3 text-base leading-relaxed text-tinta-700">
        {PUNTOS.map((p, i) => (
          <li key={i} className="flex gap-3">
            <span className="num mt-0.5 w-5 shrink-0 text-sm font-semibold text-musgo">{i + 1}</span>
            <span>
              {p.texto}
              {p.links.map((l) => (
                <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="enlace ml-2 inline-flex items-center gap-1 whitespace-nowrap text-sm">
                  {l.label}
                  <IconoExterno className="h-3.5 w-3.5" />
                </a>
              ))}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** La misma evidencia como una línea de links para el pie de /probar (con el resumen de esta prueba cuando termina). */
export function ConstruidoLinea({ resumen }: { resumen: { transacciones: number; duracionMs: number } | null }) {
  const links = PUNTOS.flatMap((p) => p.links);
  return (
    <p data-testid="construido" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-tinta-600">
      <span className="font-semibold text-monte">Lo que ya está construido:</span>
      {links.map((l) => (
        <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="enlace inline-flex items-center gap-1 whitespace-nowrap">
          {l.label}
          <IconoExterno className="h-3 w-3" />
        </a>
      ))}
      {resumen && <Resumen resumen={resumen} />}
    </p>
  );
}
