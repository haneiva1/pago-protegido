import { Address, Contract, Keypair, TransactionBuilder, rpc } from "@stellar/stellar-sdk";
import { distributionsScVal } from "@/lib/server/escrow/tw";
import { NETWORK_PASSPHRASE, cfg } from "@/lib/server/config";
import { orders } from "@/lib/server/db";
import { body, handle } from "@/lib/server/http";
import { AppError } from "@/lib/server/orders";
import { exigirProbar, limitar } from "@/lib/server/probar";
import { addr, ensureFunded, server, tokenBalance, withLock } from "@/lib/server/stellar";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * "Alguien intenta llevarse la plata", en vivo (/probar, casos): la misma orden del desvío de /probar
 * (`escrow.resolve_dispute` con todo el saldo hacia otra cuenta), pero ENVIADA a la red en vez de solo simulada, para que
 * el rechazo quede en un ledger con su hash. La manda una cuenta de prueba nueva, sin ningún rol ni clave del servidor:
 * se nombra a sí misma revisora y destinataria, paga su propia comisión (XLM de friendbot) y la red la rechaza.
 * La huella de lectura sale de dos lecturas simuladas (get_escrow del escrow y balance en la moneda): así la orden llega
 * al chequeo de roles del contrato y falla ahí, no por falta de huella.
 */

const PLATA_ADENTRO = ["pagado", "enviado", "en_disputa"];
const g = globalThis as unknown as { __ppIntruso?: Keypair };
const intruso = () => (g.__ppIntruso ??= Keypair.random());

/** Recursos holgados para una orden que falla temprano: lo que no se usa no se cobra más allá de la comisión base. */
const INSTRUCCIONES = 20_000_000;
const LECTURA_BYTES = 100_000;
const COMISION_RECURSOS = 2_000_000;

async function huella(origen: string, escrowId: string) {
  const s = server();
  const leer = async (c: Contract, metodo: string, ...args: Parameters<Contract["call"]>[1][]) => {
    const tx = new TransactionBuilder(await s.getAccount(origen), { fee: "100", networkPassphrase: NETWORK_PASSPHRASE })
      .addOperation(c.call(metodo, ...args))
      .setTimeout(60)
      .build();
    const sim = await s.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(sim)) throw new AppError("La red no respondió la lectura del contrato. Prueba de nuevo.", 502);
    return sim.transactionData;
  };
  const a = await leer(new Contract(escrowId), "get_escrow");
  const b = await leer(new Contract(cfg().labusdSac), "balance", new Address(escrowId).toScVal());
  const clave = (k: unknown) => {
    const x = k as { toXDR?: (f: string) => string };
    return typeof x.toXDR === "function" ? x.toXDR("base64") : JSON.stringify(k, (_, v) => (typeof v === "bigint" ? v.toString() : v));
  };
  const ro = new Map<string, ReturnType<typeof a.getReadOnly>[number]>();
  for (const k of [...a.getReadOnly(), ...b.getReadOnly()]) ro.set(clave(k), k);
  return a.setReadOnly([...ro.values()]).setResources(INSTRUCCIONES, LECTURA_BYTES, 0).setResourceFee(COMISION_RECURSOS).build();
}

/** El código de error del contrato en los eventos de diagnóstico (p. ej. 12 → `Error(Contract, #12)`). */
function codigoContrato(eventos: unknown[] | undefined): number | null {
  for (const e of eventos ?? []) {
    const m = JSON.stringify(e, (_, v) => (typeof v === "bigint" ? v.toString() : v)).match(/"error":\{"contract":(\d+)\}/);
    if (m) return Number(m[1]);
  }
  return null;
}

async function intentar(escrowId: string) {
  const kp = intruso();
  await ensureFunded(kp.publicKey());
  const s = server();
  const data = await huella(kp.publicKey(), escrowId);
  const saldo = await tokenBalance(escrowId);
  const yo = kp.publicKey();
  const tx = new TransactionBuilder(await s.getAccount(yo), { fee: String(COMISION_RECURSOS + 100), networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(new Contract(escrowId).call("resolve_dispute", addr(yo), addr(cfg().twfee), distributionsScVal([{ address: yo, amount: saldo > 0n ? saldo : 1n }])))
    .setSorobanData(data)
    .setTimeout(60)
    .build();
  tx.sign(kp);
  const enviado = await s.sendTransaction(tx);
  if (enviado.status === "ERROR" || enviado.status === "TRY_AGAIN_LATER") throw new AppError("La red no recibió la orden. Prueba de nuevo en un momento.", 502);
  const hash = enviado.hash;
  const hasta = Date.now() + 45_000;
  while (Date.now() < hasta) {
    await new Promise((r) => setTimeout(r, 1500));
    const r = await s.getTransaction(hash).catch(() => null);
    if (!r || r.status === rpc.Api.GetTransactionStatus.NOT_FOUND) continue;
    const fallo = r.status === rpc.Api.GetTransactionStatus.FAILED;
    const eventos = (r as { diagnosticEventsXdr?: unknown[] }).diagnosticEventsXdr;
    return { rejected: fallo, hash, code: fallo ? codigoContrato(eventos) : null, ledger: r.ledger ?? null, intruso: yo };
  }
  throw new AppError("La red tardó en confirmar la orden. Prueba de nuevo.", 504);
}

export const POST = (req: Request) =>
  handle(async () => {
    exigirProbar();
    limitar(req, "desvio");
    const slug = (await body(req)).slug;
    const o = typeof slug === "string" ? orders.get(slug) : undefined;
    if (!o) throw new AppError("No encontramos ese pedido", 404);
    if (!PLATA_ADENTRO.includes(o.status) || !o.escrow_id) throw new AppError("Todavía no hay plata guardada en el contrato de este pedido", 409);
    const escrowId = o.escrow_id;
    // Una sola orden a la vez: la cuenta intrusa tiene un solo número de secuencia.
    const r = await withLock("probar-intento", () => intentar(escrowId));
    return { ...r, escrowId, at: Date.now() };
  });
