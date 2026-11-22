import { PROBAR_HEADER } from "@/lib/probar";
import { Limitador, ipDe, minutosDe, type LimiteTipo } from "@/lib/probar-limite";
import { fmtBsUnits } from "@/lib/format";
import { orders, sellers, txs } from "./db";
import { AppError, DEMO_WINDOW_SECS, demoTimers, isPubkey, probarActivo, probeForeign } from "./orders";

/**
 * /probar (PP_PROBAR=1): la tienda y quien compra en dos marcos de celular, el registro en vivo y el intento de desvío.
 * No hay claves nuevas ni rutas que firmen: las cuentas son locales del navegador, y el desvío es una simulación.
 */

const limitador = new Limitador();

/** Sin PP_PROBAR=1, /probar y sus rutas no existen (404). */
export function exigirProbar() {
  if (!probarActivo()) throw new AppError("No encontrado", 404);
}

/** ¿La llamada sale de un marco de /probar? Solo cuenta con PP_PROBAR=1. */
export const desdeProbar = (req: Request) => probarActivo() && req.headers.get(PROBAR_HEADER) === "1";

export function limitar(req: Request, tipo: LimiteTipo) {
  const espera = limitador.intentar(tipo, ipDe(req.headers));
  if (espera !== null) {
    const min = minutosDe(espera);
    throw new AppError(`Llegaste al límite de pruebas por hora desde tu conexión. Vuelve a intentar en ${min} ${min === 1 ? "minuto" : "minutos"}.`, 429);
  }
}

/** Los plazos de demo que usa /probar (DECISIONES 77 y 63). */
export function plazosProbar() {
  return { despachoSegundos: DEMO_WINDOW_SECS, confirmarSegundos: 10, demoTimers: demoTimers() };
}

/** Prueba nueva (al entrar o con "Empezar de nuevo"): cuenta para el límite por IP. */
export function inicioProbar(req: Request) {
  exigirProbar();
  limitar(req, "inicio");
  return { ok: true, plazos: plazosProbar() };
}

/** Registro en vivo: la tienda, su último pedido y cada transacción con su hash. Solo lecturas de la base. */
export function registroProbar(vendedor: string | null) {
  exigirProbar();
  if (!isPubkey(vendedor)) throw new AppError("Cuenta inválida");
  const tienda = sellers.get(vendedor);
  const o = orders.bySeller(vendedor)[0];
  const activaciones = [txs.activation(vendedor), o?.buyer_pubkey ? txs.activation(o.buyer_pubkey) : undefined].filter((t) => t !== undefined);
  const movimientos = [...activaciones, ...(o ? txs.forOrder(o.slug) : [])].map((t) => ({
    kind: t.kind,
    actor: t.actor,
    hash: t.hash || null,
    created_at: t.created_at,
  }));
  return {
    tienda: tienda ? { nombre: tienda.store_name, pubkey: tienda.pubkey } : null,
    pedido: o
      ? {
          slug: o.slug,
          code: o.code,
          product: o.product,
          status: o.status,
          total: fmtBsUnits(o.amount_units, o.fx),
          escrow_id: o.escrow_id,
          created_at: o.created_at,
          demo: o.window_secs === DEMO_WINDOW_SECS,
        }
      : null,
    movimientos,
  };
}

/** "Intenta desviar la plata": la misma simulación del revisor, con la plata todavía en el contrato. */
export async function desvioProbar(req: Request, slug: unknown) {
  exigirProbar();
  limitar(req, "desvio");
  const o = typeof slug === "string" ? orders.get(slug) : undefined;
  if (!o) throw new AppError("No encontramos ese pedido", 404);
  const r = await probeForeign(slug, ["pagado", "enviado", "en_disputa"]);
  return { ...r, escrowId: o.escrow_id };
}
