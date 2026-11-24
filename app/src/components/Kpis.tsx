import { explorer, unitsToNumber } from "@/lib/format";
import { DESENLACE_LABEL, fmtDiaCorto, fmtDuracion, fmtFecha, fmtProporcion, nf, plural, rotuloVentas } from "@/lib/kpi-format";
import type { CompraOnchain, Desenlace, DiaSerie, Kpis } from "@/lib/types";
import { IconoExterno } from "./iconos";

/** Piezas de presentación de los KPIs. Sin estado: sirven en páginas de servidor y de cliente. */

export function Stat({ label, value, sub, testId }: { label: string; value: string; sub?: string; testId?: string }) {
  return (
    <div className="rounded-card bg-tinta-50 px-3 py-4 text-center" data-testid={testId}>
      <p className="font-display text-2xl leading-none tracking-tight text-monte num">{value}</p>
      <p className="mt-1.5 text-xs font-medium text-tinta-700">{label}</p>
      {sub && <p className="mt-0.5 text-[11px] leading-tight text-tinta-500">{sub}</p>}
    </div>
  );
}

/** Los mismos cuatro números en el perfil público (/tienda) y en la tarjeta del vendedor de la página de pago. */
export function NumerosTienda({ k, piloto, compacto = false }: { k: Kpis; piloto: boolean; compacto?: boolean }) {
  const conDevolucion = k.reclamos.a_favor_comprador + k.reclamos.repartidos;
  return (
    <div className={compacto ? "grid grid-cols-2 gap-2" : "grid grid-cols-2 gap-2 sm:grid-cols-4"} data-testid="numeros-tienda">
      <Stat testId="num-ventas" value={nf(k.pagadas_al_vendedor)} label={rotuloVentas(k.pagadas_al_vendedor, piloto)} sub={k.en_curso ? `${k.en_curso} en curso` : undefined} />
      <Stat
        testId="num-sin-reclamo"
        value={fmtProporcion(k.ventas_sin_reclamo, k.cerradas)}
        label="sin reclamo"
        sub={k.cerradas ? `${k.ventas_sin_reclamo} de ${k.cerradas} cerradas` : "sin compras cerradas"}
      />
      <Stat
        testId="num-despacho"
        value={fmtDuracion(k.despacho_promedio_s)}
        label="despacho promedio"
        sub={k.despacho_muestras ? `desde el pago (${plural(k.despacho_muestras, "envío", "envíos")})` : "sin envíos todavía"}
      />
      <Stat
        testId="num-perdidos"
        value={nf(k.reclamos_perdidos)}
        label={k.reclamos_perdidos === 1 ? "reclamo perdido" : "reclamos perdidos"}
        sub={k.reclamos_perdidos ? `${conDevolucion} por reclamo · ${k.devoluciones_sin_despacho} por no despachar` : "ninguno"}
      />
    </div>
  );
}

const W = 600;
const H = 120;

function Barras({ valores, max, cls, titulo, etiqueta }: { valores: number[]; max: number; cls: string; titulo: string; etiqueta: (i: number) => string }) {
  const bw = W / Math.max(1, valores.length);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-28 w-full" role="img" aria-label={titulo}>
      <rect x={0} y={H - 1} width={W} height={1} className="fill-tinta-200" />
      {valores.map((v, i) => {
        if (!v) return null;
        const h = Math.max(3, (v / max) * (H - 6));
        return (
          <rect key={i} x={i * bw + 1} y={H - h} width={Math.max(1, bw - 2)} height={h} rx={1} className={cls}>
            <title>{etiqueta(i)}</title>
          </rect>
        );
      })}
    </svg>
  );
}

/** Gráfico simple por día (SVG sin dependencias): compras arriba y monto abajo, con el mismo eje de días. */
export function GraficoDiario({ serie, compras, monto, testId }: { serie: DiaSerie[]; compras: string; monto: string; testId?: string }) {
  const maxC = Math.max(1, ...serie.map((d) => d.compras));
  const maxM = Math.max(1, ...serie.map((d) => d.monto_bs));
  const conDatos = serie.filter((d) => d.compras > 0);
  return (
    <div className="card space-y-4" data-testid={testId}>
      <h3 className="text-lg">Por día · {serie.length === 1 ? "último día" : `últimos ${serie.length} días`}</h3>
      <div>
        <div className="flex items-baseline justify-between text-xs text-tinta-500">
          <span className="font-medium text-tinta-700">{compras}</span>
          <span className="num">máx. {nf(maxC)} por día</span>
        </div>
        <Barras
          valores={serie.map((d) => d.compras)}
          max={maxC}
          cls="fill-yungas"
          titulo={`${compras} por día`}
          etiqueta={(i) => `${fmtDiaCorto(serie[i].dia)}: ${plural(serie[i].compras, "compra", "compras")}`}
        />
      </div>
      <div>
        <div className="flex items-baseline justify-between text-xs text-tinta-500">
          <span className="font-medium text-tinta-700">{monto} (Bs)</span>
          <span className="num">máx. Bs {nf(maxM)} por día</span>
        </div>
        <Barras
          valores={serie.map((d) => d.monto_bs)}
          max={maxM}
          cls="fill-monte"
          titulo={`${monto} por día`}
          etiqueta={(i) => `${fmtDiaCorto(serie[i].dia)}: Bs ${nf(serie[i].monto_bs)}`}
        />
      </div>
      <div className="flex justify-between text-xs text-tinta-500">
        <span>{serie.length ? fmtDiaCorto(serie[0].dia) : ""}</span>
        <span>hoy</span>
      </div>
      <details className="text-xs text-tinta-600">
        <summary className="cursor-pointer font-medium text-musgo">Ver los datos por día ({plural(conDatos.length, "día con compras", "días con compras")})</summary>
        <table className="mt-2 w-full text-left num">
          <thead>
            <tr className="text-tinta-500">
              <th className="py-1 font-medium">Día</th>
              <th className="py-1 font-medium">Compras</th>
              <th className="py-1 font-medium">Monto</th>
            </tr>
          </thead>
          <tbody>
            {conDatos.map((d) => (
              <tr key={d.dia} className="border-t border-tinta-100">
                <td className="py-1">{fmtDiaCorto(d.dia)}</td>
                <td className="py-1">{nf(d.compras)}</td>
                <td className="py-1">Bs {nf(d.monto_bs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/** Chip por desenlace de la compra, con la paleta de estados de la marca. */
const DESENLACE_CHIP: Record<Desenlace, string> = {
  confirmada: "chip-exito",
  plazo: "chip-exito",
  resuelta: "chip-neutro",
  devuelta: "chip-aviso",
  en_reclamo: "chip-aviso",
  en_curso: "chip-info",
};

const Reg = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a className="inline-flex items-center gap-0.5 font-medium text-musgo underline decoration-exito-200 underline-offset-2 hover:decoration-musgo" href={href} target="_blank" rel="noreferrer">
    {children}
    <IconoExterno className="h-3 w-3" />
  </a>
);

/** Lista de compras con un link al registro público por cada paso (pago, envío, más tiempo, reclamo y cierre). */
export function ListaOperaciones({ compras, fx, extra }: { compras: CompraOnchain[]; fx: number; extra?: (c: CompraOnchain) => string | null }) {
  if (!compras.length) return <p className="py-2 text-sm text-tinta-500">Todavía no hay operaciones.</p>;
  return (
    <ul className="divide-y divide-tinta-100" data-testid="lista-operaciones">
      {compras.map((c) => {
        const ex = extra?.(c);
        return (
          <li key={c.escrow} className="flex flex-col gap-1.5 py-3 text-sm" data-testid="operacion">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-monte num">Bs {nf(unitsToNumber(c.amount) * fx, 2)}</span>
              <span className={DESENLACE_CHIP[c.desenlace]}>
                {DESENLACE_LABEL[c.desenlace]}
                {c.desenlace === "resuelta" && c.buyer_bps != null ? ` (${c.buyer_bps / 100}/${100 - c.buyer_bps / 100})` : ""}
              </span>
              <span className="text-xs text-tinta-500">
                {fmtFecha(c.funded_at)}
                {ex ? ` · ${ex}` : ""}
              </span>
            </span>
            <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <Reg href={explorer.tx(c.tx_fondeo)}>Pago</Reg>
              {c.tx_envio && <Reg href={explorer.tx(c.tx_envio)}>Envío</Reg>}
              {c.tx_extension && <Reg href={explorer.tx(c.tx_extension)}>Más tiempo</Reg>}
              {c.tx_reclamo && <Reg href={explorer.tx(c.tx_reclamo)}>Reclamo</Reg>}
              {c.tx_cierre && <Reg href={explorer.tx(c.tx_cierre)}>Cierre</Reg>}
              <Reg href={explorer.contract(c.escrow)}>Contrato de la compra</Reg>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
