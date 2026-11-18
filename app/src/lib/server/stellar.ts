import {
  Address,
  Asset,
  BASE_FEE,
  Contract,
  FeeBumpTransaction,
  Keypair,
  Operation,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { unitsToAmountString } from "@/lib/format";
import { FRIENDBOT_URL, HORIZON_URL, NETWORK_PASSPHRASE, RPC_URL, cfg } from "./config";

export class ChainError extends Error {
  code?: number;
  constructor(message: string, code?: number) {
    super(message);
    this.code = code;
  }
}

// Errores del escrow de Trustless Work (src/error.rs) traducidos para la pantalla.
const TW_ERRORS: Record<number, string> = {
  2: "Este contrato de pago ya fue creado",
  4: "Solo quien tiene el rol de liberar puede liberar la plata",
  5: "El pedido todavía no fue confirmado por el comprador",
  8: "Solo el vendedor puede marcar el envío",
  10: "El contrato no tiene fondos",
  12: "Solo el árbitro designado en el contrato puede repartir la plata",
  11: "Solo el comprador puede confirmar la entrega",
  13: "Ya hay un reclamo abierto",
  14: "El pago no está en disputa",
  16: "Hay un reclamo abierto: solo el árbitro puede mover la plata",
  24: "El reclamo ya fue resuelto",
  26: "Esa cuenta no puede abrir un reclamo en este pedido",
  39: "El reparto tiene que sumar todo el saldo del contrato",
  40: "El árbitro no puede abrir reclamos",
};

export function toChainError(raw: string): ChainError {
  const m = raw.match(/Error\(Contract, #(\d+)\)/);
  if (m) {
    const code = Number(m[1]);
    return new ChainError(`${TW_ERRORS[code] ?? "El contrato rechazó la operación"} (código #${code})`, code);
  }
  if (/Error\(Auth/.test(raw)) {
    return new ChainError("El contrato rechazó la firma: esa cuenta no tiene permiso para esta operación");
  }
  return new ChainError(`La red rechazó la operación: ${raw.slice(0, 240)}`);
}

const g = globalThis as unknown as { __ppRpc?: rpc.Server; __ppLocks?: Map<string, Promise<void>> };

export function server(): rpc.Server {
  return (g.__ppRpc ??= new rpc.Server(RPC_URL));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Reintenta errores de red (no errores de contrato). */
export async function retry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof ChainError) throw e;
      last = e;
      await sleep(1000 * (i + 1));
    }
  }
  throw last;
}

/** Serializa las transacciones de una misma cuenta de origen (evita choques de secuencia). */
export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const locks = (g.__ppLocks ??= new Map());
  const prev = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  const chained = prev.then(() => mine);
  locks.set(key, chained);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === chained) locks.delete(key);
  }
}

export const addr = (a: string) => new Address(a).toScVal();
export const i128 = (v: bigint) => nativeToScVal(v, { type: "i128" });
export const u32 = (v: number) => nativeToScVal(v, { type: "u32" });
export const str = (v: string) => nativeToScVal(v, { type: "string" });

/** Arma, simula y ensambla una invocación con `source` como cuenta de origen. */
export async function prepareInvoke(source: string, contractId: string, method: string, args: xdr.ScVal[]): Promise<Transaction> {
  const s = server();
  const account = await retry(() => s.getAccount(source));
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(300)
    .build();
  const sim = await retry(() => s.simulateTransaction(tx));
  if (rpc.Api.isSimulationError(sim)) throw toChainError(sim.error);
  return rpc.assembleTransaction(tx, sim).build();
}

/** Prepara una operación arbitraria de Soroban (deploy) con `source` de origen. */
export async function prepareOp(source: string, op: xdr.Operation): Promise<Transaction> {
  const s = server();
  const account = await retry(() => s.getAccount(source));
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(op)
    .setTimeout(300)
    .build();
  const sim = await retry(() => s.simulateTransaction(tx));
  if (rpc.Api.isSimulationError(sim)) throw toChainError(sim.error);
  return rpc.assembleTransaction(tx, sim).build();
}

/** Solo simula (lectura). Devuelve el valor de retorno o lanza el error del contrato. */
export async function simulate(contractId: string, method: string, args: xdr.ScVal[]): Promise<xdr.ScVal> {
  const s = server();
  const source = cfg().plataforma.publicKey();
  const account = await retry(() => s.getAccount(source));
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(60)
    .build();
  const sim = await retry(() => s.simulateTransaction(tx));
  if (rpc.Api.isSimulationError(sim)) throw toChainError(sim.error);
  if (!sim.result) throw new ChainError("La simulación no devolvió resultado");
  return sim.result.retval;
}

export interface Sent {
  hash: string;
  returnValue?: xdr.ScVal;
}

/** Envía y espera la confirmación. */
export async function sendAndWait(tx: Transaction | FeeBumpTransaction): Promise<Sent> {
  const s = server();
  const hash = Buffer.from(tx.hash()).toString("hex");
  let sent = await retry(() => s.sendTransaction(tx));
  for (let i = 0; sent.status === "TRY_AGAIN_LATER" && i < 6; i++) {
    await sleep(2500);
    sent = await retry(() => s.sendTransaction(tx));
  }
  if (sent.status === "ERROR") {
    const code = sent.errorResult?.result.type ?? "desconocido";
    throw new ChainError(`La red rechazó la transacción (${code})`);
  }
  const until = Date.now() + 120_000;
  while (Date.now() < until) {
    await sleep(1500);
    let res: rpc.Api.GetTransactionResponse;
    try {
      res = await s.getTransaction(hash);
    } catch {
      continue;
    }
    if (res.status === rpc.Api.GetTransactionStatus.SUCCESS) return { hash, returnValue: res.returnValue };
    if (res.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new ChainError(`La transacción falló en la red (${hash.slice(0, 10)}…)`);
    }
  }
  throw new ChainError(`La red tardó demasiado en confirmar. Revisa la transacción ${hash}`);
}

/** Invocación firmada por una llave del servidor (plataforma, árbitro). */
export async function invokeAs(kp: Keypair, contractId: string, method: string, args: xdr.ScVal[]): Promise<Sent> {
  return withLock(kp.publicKey(), async () => {
    const tx = await prepareInvoke(kp.publicKey(), contractId, method, args);
    tx.sign(kp);
    return sendAndWait(tx);
  });
}

/**
 * Comisiones patrocinadas: la transacción ya viene firmada por el usuario (cuenta de origen);
 * la plataforma la envuelve en un fee bump, la firma y paga la comisión de red.
 */
export async function feeBumpAndSend(inner: Transaction): Promise<Sent> {
  const p = cfg().plataforma;
  const fb = TransactionBuilder.buildFeeBumpTransaction(p, BASE_FEE, inner, NETWORK_PASSPHRASE);
  fb.sign(p);
  return sendAndWait(fb);
}

// ---------- Cuentas, trustline, rampa y saldos ----------

export function labusd(): Asset {
  const c = cfg();
  return new Asset(c.labusdCode, c.lab.publicKey());
}

interface HorizonBalance {
  asset_code?: string;
  asset_issuer?: string;
  balance: string;
}

export async function horizonAccount(pubkey: string): Promise<{ balances: HorizonBalance[] } | null> {
  const res = await retry(() => fetch(`${HORIZON_URL}/accounts/${pubkey}`, { cache: "no-store" }));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Horizon respondió ${res.status}`);
  return res.json();
}

export function hasTrustline(acc: { balances: HorizonBalance[] } | null): boolean {
  if (!acc) return false;
  const a = labusd();
  return acc.balances.some((b) => b.asset_code === a.getCode() && b.asset_issuer === a.getIssuer());
}

/** Cuenta nueva de testnet: friendbot. */
export async function ensureFunded(pubkey: string): Promise<void> {
  if (await horizonAccount(pubkey)) return;
  const res = await retry(() => fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(pubkey)}`, { cache: "no-store" }));
  for (let i = 0; i < 8; i++) {
    if (await horizonAccount(pubkey)) return;
    await sleep(1500);
  }
  throw new ChainError(`No se pudo activar la cuenta de prueba (friendbot ${res.status})`);
}

/** Transacción de trustline a LABUSD con el usuario como origen (la firma el navegador). */
export async function prepareTrustline(pubkey: string): Promise<Transaction> {
  const account = await retry(() => server().getAccount(pubkey));
  return new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(Operation.changeTrust({ asset: labusd() }))
    .setTimeout(300)
    .build();
}

/** Rampa simulada: el emisor `lab` envía (emite) LABUSD al comprador. */
export async function mintLabusd(to: string, units: bigint): Promise<Sent> {
  const lab = cfg().lab;
  return withLock(lab.publicKey(), async () => {
    const account = await retry(() => server().getAccount(lab.publicKey()));
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
      .addOperation(Operation.payment({ destination: to, asset: labusd(), amount: unitsToAmountString(units) }))
      .setTimeout(300)
      .build();
    tx.sign(lab);
    return sendAndWait(tx);
  });
}

/** Saldo de LABUSD (unidades base) de una cuenta G o de un contrato C, leído del SAC. */
export async function tokenBalance(address: string): Promise<bigint> {
  try {
    const v = await simulate(cfg().labusdSac, "balance", [addr(address)]);
    return BigInt(scValToNative(v));
  } catch {
    return 0n;
  }
}

export { scValToNative };
