// Devolución completa: la parte que habla con la red y lo que usa orders.ts. La lógica que evita pagar dos veces está
// en reintegro.ts. Con PP_DEVOLUCION_COMPLETA distinto de "1" (apagado, por defecto) nada de esto hace algo: no
// escribe en la base, no envía transacciones y no agrega campos a las vistas.
import { BASE_FEE, Operation, TransactionBuilder, rpc } from "@stellar/stellar-sdk";
import { fmtBsUnits, unitsToAmountString } from "@/lib/format";
import type { ReintegroView } from "@/lib/types";
import { HORIZON_URL, NETWORK_PASSPHRASE, cfg } from "./config";
import { db, orders, txs, type OrderRow } from "./db";
import { pagarReintegro, reintegros, type FilaReintegro, type RedReintegro } from "./reintegro";
import { horizonAccount, labusd, retry, sendAndWait, server, withLock } from "./stellar";

/** Interruptor de la devolución completa (H-4). Apagado salvo PP_DEVOLUCION_COMPLETA=1. */
export const devolucionCompleta = () => process.env.PP_DEVOLUCION_COMPLETA === "1";

/** Cuánto tiempo acepta la red el sobre del reintegro: si no entra en ese plazo, se puede armar otro sin duplicar. */
const VIGENCIA_S = 180;

const red: RedReintegro = {
  async consultar(hash) {
    const res = await retry(() => server().getTransaction(hash));
    if (res.status === rpc.Api.GetTransactionStatus.SUCCESS) return "confirmada";
    if (res.status === rpc.Api.GetTransactionStatus.FAILED) return "fallida";
    // El RPC guarda pocos días de historial: Horizon confirma que de verdad no está.
    const h = await retry(() => fetch(`${HORIZON_URL}/transactions/${hash}`, { cache: "no-store" }));
    if (h.status === 404) return "no_encontrada";
    if (!h.ok) throw new Error(`Horizon respondió ${h.status}`);
    return ((await h.json()) as { successful?: boolean }).successful ? "confirmada" : "fallida";
  },

  async armar(buyer, monto) {
    const p = cfg().plataforma;
    const asset = labusd();
    // Sin saldo no se envía nada: un pago sin fondos fallaría en la red y gastaría la comisión de red en cada reintento.
    const acc = await horizonAccount(p.publicKey());
    const bal = acc?.balances.find((b) => b.asset_code === asset.getCode() && b.asset_issuer === asset.getIssuer());
    if (!bal || Number(bal.balance) < Number(unitsToAmountString(monto))) {
      throw new Error(`La cuenta de la plataforma no tiene saldo para el reintegro (${bal?.balance ?? "sin LABUSD"})`);
    }
    const account = await retry(() => server().getAccount(p.publicKey()));
    const inner = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
      .addOperation(Operation.payment({ destination: buyer, asset, amount: unitsToAmountString(monto) }))
      .setTimeout(VIGENCIA_S)
      .build();
    inner.sign(p);
    // Fee bump, como las demás operaciones del servidor: la plataforma paga la comisión de red.
    const fb = TransactionBuilder.buildFeeBumpTransaction(p, BASE_FEE, inner, NETWORK_PASSPHRASE);
    fb.sign(p);
    return { hash: Buffer.from(fb.hash()).toString("hex"), xdr: fb.toXDR(), vence: Number(inner.timeBounds!.maxTime) * 1000 };
  },

  async enviar(xdr) {
    await sendAndWait(TransactionBuilder.fromXDR(xdr, NETWORK_PASSPHRASE));
  },

  serializar: (fn) => withLock(cfg().plataforma.publicKey(), fn),
};

function alConfirmar(f: FilaReintegro) {
  const fx = orders.get(f.order_slug)?.fx ?? cfg().fx;
  txs.add({
    order_slug: f.order_slug,
    actor: "plataforma",
    kind: "reintegro",
    label: `Trato te devolvió las comisiones (${fmtBsUnits(f.monto_units, fx)}): recibiste todo lo que pagaste`,
    hash: f.tx_hash!,
  });
  // El feed del bot (/api/bot/changes) vuelve a mostrar el pedido para mandar el aviso con el reintegro.
  db().prepare(`UPDATE orders SET updated_at = ? WHERE slug = ?`).run(Date.now(), f.order_slug);
}

/** Paga (o termina de pagar) el reintegro de un pedido. Idempotente y en orden por pedido. */
export async function intentarReintegro(slug: string) {
  if (!devolucionCompleta()) return undefined;
  return withLock(`reintegro:${slug}`, () => pagarReintegro(db(), slug, red, { alConfirmar }));
}

/**
 * Después de una devolución total confirmada en la red (refund_unshipped, o resolve con todo para el comprador):
 * registra el reintegro y lo paga sin bloquear la respuesta. Nunca lanza: la devolución ya ocurrió.
 */
export function reintegroTrasDevolucion(o: OrderRow, devolucionHash: string): void {
  if (!devolucionCompleta() || !o.buyer_pubkey) return;
  try {
    reintegros.registrar(
      db(),
      { slug: o.slug, buyer: o.buyer_pubkey, pagado: BigInt(o.amount_units), platformBps: o.platform_bps ?? cfg().platformFeeBps, devolucionHash },
      Date.now(),
    );
  } catch (e) {
    console.error(`[reintegro] ${o.slug}: no se pudo registrar: ${(e as Error).message}`);
    return;
  }
  void intentarReintegro(o.slug).catch((e) => console.error(`[reintegro] ${o.slug}: ${(e as Error).message}`));
}

/** Reintenta los reintegros que quedaron a medias (red caída, reinicio). Lo llama el barrido de sweepOverdue. */
export async function reintentarReintegros() {
  if (!devolucionCompleta()) return;
  for (const f of reintegros.pendientes(db())) {
    await intentarReintegro(f.order_slug).catch((e) => console.error(`[reintegro] ${f.order_slug}: ${(e as Error).message}`));
  }
}

/** Campo `reintegro` de la vista del pedido. Con el interruptor apagado (o sin reintegro) no agrega nada. */
export function vistaReintegro(slug: string): { reintegro?: ReintegroView } {
  if (!devolucionCompleta()) return {};
  const f = reintegros.get(db(), slug);
  if (!f) return {};
  return {
    reintegro: {
      estado: f.estado,
      pagado: f.pagado_units,
      recibido: f.recibido_units,
      monto: f.monto_units,
      devolucion_hash: f.devolucion_hash,
      hash: f.estado === "confirmado" ? f.tx_hash : null,
    },
  };
}
