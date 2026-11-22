"use client";

import { useEffect, useRef, useState } from "react";
import { IconoBalanza, IconoCandado, IconoCandadoAbierto, IconoCheckCirculo, IconoVolver } from "@/components/iconos";
import { cuentaRegresiva, duracion, progresoPago, resumenRed, type FilaRegistro } from "@/lib/probar";
import type { PedidoProbar, Plazos } from "./tipos";

type Variante = "vacio" | "pagando" | "esperando" | "salio" | "volvio" | "congelada" | "repartida";

/** Fondo del momento. Solo "esperando" y "salio" llevan Yungas: es el acento de la pantalla. */
const FONDO: Record<Variante, string> = {
  vacio: "text-tinta-600",
  pagando: "text-monte",
  esperando: "rounded-panel bg-yungas text-monte shadow-alzada",
  salio: "rounded-panel bg-yungas text-monte shadow-alzada",
  volvio: "rounded-panel bg-info-50 text-info-700",
  congelada: "rounded-panel bg-aviso-50 text-aviso-700",
  repartida: "rounded-panel bg-tinta-100 text-tinta-700",
};

/**
 * La plata "esperando entre los dos": lo que hay entre los dos celulares. Muestra el monto, en qué está la plata y, en
 * las esperas largas (el pago tarda unos 30 s; el cobro se habilita 1 minuto después del envío), cuánto falta. Al pagar
 * y al cobrar, un punto recorre la línea: del comprador al contrato, del contrato a la tienda.
 */
export function PlataEntreLosDos({
  pedido,
  tienda,
  filas,
  plazos,
  ahora,
  className = "",
}: {
  pedido: PedidoProbar | null;
  tienda: string | null;
  filas: FilaRegistro[];
  plazos: Plazos;
  ahora: number;
  className?: string;
}) {
  const status = pedido?.status ?? null;
  const pago = progresoPago(filas);
  const fondeo = filas.find((f) => f.kind === "fondeo");
  const envio = filas.find((f) => f.paso === "envio");

  let variante: Variante = "vacio";
  if (pedido) {
    if (status === "esperando_pago") variante = pago.hechos > 0 ? "pagando" : "vacio";
    else if (status === "pagado" || status === "enviado") variante = "esperando";
    else if (status === "liberado") variante = "salio";
    else if (status === "devuelto") variante = "volvio";
    else if (status === "en_disputa") variante = "congelada";
    else variante = "repartida";
  }

  // La plata viaja una sola vez por la línea: entra al contrato al pagar; sale a la tienda al cobrar.
  const [viaje, setViaje] = useState<"entra" | "sale" | null>(null);
  const anterior = useRef<Variante>(variante);
  useEffect(() => {
    const antes = anterior.current;
    anterior.current = variante;
    if (antes === variante) return;
    if (variante === "esperando" && (antes === "pagando" || antes === "vacio")) setViaje("entra");
    else if (variante === "salio") setViaje("sale");
    else return;
    const t = setTimeout(() => setViaje(null), 1400);
    return () => clearTimeout(t);
  }, [variante]);

  // Qué está pasando y cuánto falta.
  let titulo = "La plata espera entre los dos";
  let detalle: string | null = null;
  let contador: string | null = null;
  let avance: number | null = null;
  switch (variante) {
    case "vacio":
      titulo = pedido ? "Todavía no hay plata en el contrato" : "Aquí espera la plata";
      detalle = pedido ? "Cuando el comprador pague, queda aquí: entre los dos." : "Entre la tienda y el comprador, hasta que el pedido llegue.";
      break;
    case "pagando":
      titulo = "El comprador está pagando";
      detalle = `${pago.haciendo ?? "Guardando la plata"}. Suele tardar unos 30 segundos.`;
      contador = `${pago.hechos} de ${pago.total}`;
      avance = pago.hechos / pago.total;
      break;
    case "esperando":
      if (status === "pagado") {
        const hasta = (fondeo?.at ?? ahora) + plazos.despachoSegundos * 1000;
        contador = cuentaRegresiva(hasta, ahora);
        detalle = hasta > ahora ? "para que la tienda registre el envío. Si no lo hace, la plata vuelve sola al comprador." : "Plazo vencido: la plata vuelve sola al comprador.";
      } else {
        const hasta = (envio?.at ?? ahora) + plazos.confirmarSegundos * 1000;
        if (hasta > ahora) {
          contador = cuentaRegresiva(hasta, ahora);
          detalle = "para que el comprador pueda confirmar que recibió y pagar a la tienda.";
        } else {
          detalle = "El comprador ya puede confirmar que recibió y pagar a la tienda.";
        }
      }
      break;
    case "salio": {
      const r = resumenRed(filas, pedido!.created_at);
      titulo = tienda ? `La plata llegó a ${tienda}` : "La plata llegó a la tienda";
      detalle = `${duracion(r.duracionMs)} desde el link hasta el cobro, con ${r.transacciones} transacciones públicas.`;
      break;
    }
    case "volvio":
      titulo = "La plata volvió al comprador";
      detalle = "La tienda no despachó a tiempo: la otra salida del contrato.";
      break;
    case "congelada":
      titulo = "La plata está congelada";
      detalle = "Hay un reclamo abierto: espera hasta que decida el revisor.";
      break;
    case "repartida":
      titulo = "El revisor repartió la plata";
      detalle = "Entre el comprador y la tienda, según las reglas públicas.";
      break;
  }

  const CORTO: Record<Variante, string> = {
    vacio: pedido ? "Sin plata todavía" : "Aquí espera la plata",
    pagando: "Pagando…",
    esperando: "Espera entre los dos",
    salio: "Llegó a la tienda",
    volvio: "Volvió al comprador",
    congelada: "Congelada por un reclamo",
    repartida: "Repartida por el revisor",
  };
  const corto = CORTO[variante];
  const Icono = variante === "salio" ? IconoCheckCirculo : variante === "volvio" ? IconoVolver : variante === "repartida" ? IconoBalanza : variante === "vacio" ? IconoCandadoAbierto : IconoCandado;
  const monto = pedido?.total ?? "—";
  const sobreAcento = variante === "esperando" || variante === "salio";
  const conFondo = sobreAcento || variante === "volvio" || variante === "congelada" || variante === "repartida";
  const suave = sobreAcento ? "text-monte/75" : conFondo ? "opacity-80" : "text-tinta-600";
  const circulo = sobreAcento ? "bg-monte text-yungas" : variante === "vacio" ? "bg-tinta-100 text-tinta-400" : variante === "pagando" ? "bg-exito-100 text-musgo" : "bg-current/10";

  return (
    <div data-testid="plata" data-variante={variante} className={className}>
      {/* Escritorio: entre los dos celulares, unido a cada uno por una línea. */}
      <div className={`relative hidden flex-col items-center gap-3 px-4 py-6 text-center transition-colors duration-300 lg:flex ${FONDO[variante]}`}>
        <span aria-hidden className="absolute -left-8 top-1/2 h-px w-8 bg-tinta-300">
          {viaje === "sale" && <i className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 animate-viaje rounded-full bg-yungas ring-2 ring-monte" />}
        </span>
        <span aria-hidden className="absolute -right-8 top-1/2 h-px w-8 bg-tinta-300">
          {viaje === "entra" && <i className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 animate-viaje rounded-full bg-yungas ring-2 ring-monte" />}
        </span>
        <span className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors duration-300 ${circulo}`}>
          <Icono className="h-6 w-6" />
        </span>
        <p className={`font-display text-3xl font-extrabold num ${variante === "vacio" ? "text-tinta-400" : ""}`}>{monto}</p>
        <p className="text-sm font-semibold leading-snug">{titulo}</p>
        {contador && <p className="font-display text-2xl font-extrabold num">{contador}</p>}
        {detalle && <p className={`max-w-[18ch] text-sm leading-snug ${suave}`}>{detalle}</p>}
        {avance !== null && <Barra avance={avance} />}
      </div>

      {/* Celular: una franja arriba de las pestañas (el detalle solo cuando hay una espera que contar). */}
      <div className={`relative flex items-center gap-2.5 overflow-hidden rounded-control px-3 py-2 lg:hidden ${sobreAcento ? "bg-yungas text-monte" : conFondo ? FONDO[variante].replace("rounded-panel", "") : "bg-white text-monte shadow-card"}`}>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${circulo}`}>
          <Icono className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold">
            {pedido && <span className="num">{monto} · </span>}
            {corto}
          </p>
          {(contador || avance !== null) && detalle && <p className={`truncate text-xs ${suave}`}>{detalle}</p>}
        </div>
        {contador && <span className="shrink-0 font-display text-lg font-extrabold num">{contador}</span>}
        {avance !== null && (
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-tinta-100">
            <span className="block h-full bg-yungas transition-[width] duration-500" style={{ width: `${Math.round(avance * 100)}%` }} />
          </span>
        )}
      </div>
    </div>
  );
}

/** Barra de avance del pago: lo hecho en Yungas y, lo que sigue, una franja que recorre la barra. */
function Barra({ avance }: { avance: number }) {
  return (
    <div className="relative mt-1 h-1.5 w-full overflow-hidden rounded-full bg-tinta-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(avance * 100)}>
      <div className="h-full rounded-full bg-yungas transition-[width] duration-500" style={{ width: `${Math.round(avance * 100)}%` }} />
      <div className="absolute inset-y-0 left-0 w-1/3 animate-barra rounded-full bg-musgo/40" />
    </div>
  );
}
