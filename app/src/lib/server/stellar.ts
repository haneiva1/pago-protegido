import {
  Address,
  Asset,
  BASE_FEE,
  Contract,
  FeeBumpTransaction,
  Keypair,
  Memo,
  Operation,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { unitsToAmountString } from "@/lib/format";
import { ES_MAINNET } from "@/lib/red";
import { FRIENDBOT_URL, HORIZON_URL, NETWORK_PASSPHRASE, RPC_URL, cfg } from "./config";

export class ChainError extends Error {
  code?: number;
  raw?: string;
  /** Código con que la red rechazó la transacción al recibirla (p. ej. `txInsufficientFee`); no la aplicó. */
  rechazo?: string;
  constructor(message: string, code?: number, raw?: string) {
    super(message);
    this.code = code;
    this.raw = raw;
  }
}

// Errores del escrow de Trustless Work (src/error.rs) traducidos para la pantalla.
const TW_ERRORS: Record<number, string> = {
  2: "Este contrato de pago ya fue creado",
  4: "Solo quien tiene el rol de liberar puede liberar la plata",
  5: "El pedido todavía no fue confirmado por el comprador",
  8: "Solo el vendedor puede marcar el envío",
  10: "El contrato no tiene fondos",
  12: "Solo el revisor designado en el contrato (pp_arbiter) puede repartir la plata",
  11: "Solo el comprador puede confirmar la entrega",
  13: "Ya hay un reclamo abierto",
  14: "El pago no está en disputa",
  16: "Hay un reclamo abierto: solo el revisor puede mover la plata",
  24: "El reclamo ya fue resuelto",
  26: "Esa cuenta no puede abrir un reclamo en este pedido",
  39: "El reparto tiene que sumar todo el saldo del contrato",
  40: "El revisor no puede abrir reclamos",
};

export function toChainError(raw: string): ChainError {
  const m = raw.match(/Error\(Contract, #(\d+)\)/);
  if (m) {
    const code = Number(m[1]);
    return new ChainError(`${TW_ERRORS[code] ?? "El contrato rechazó la operación"} (código #${code})`, code, m[0]);
  }
  if (/Error\(Auth/.test(raw)) {
    return new ChainError("El contrato rechazó la firma: esa cuenta no tiene permiso para esta operación");
  }
  return new ChainError(`La red rechazó la operación: ${raw.slice(0, 240)}`);
}

// Solo los candados viven en globalThis (los comparten todas las rutas). El cliente de red NO: Next empaqueta cada ruta por
// separado y un cliente creado por /metricas o /transparencia (otra copia del SDK) rompía los pagos hasta reiniciar.
// `__ppRpc` queda solo como sustituto para pruebas; el código de la app nunca lo escribe.
const g = globalThis as unknown as { __ppRpc?: rpc.Server; __ppLocks?: Map<string, Promise<void>> };
let propio: rpc.Server | undefined;

export function server(): rpc.Server {
  return g.__ppRpc ?? (propio ??= new rpc.Server(RPC_URL));
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

/**
 * Comisión de inclusión por operación que ofrece la plataforma (stroops) en el fee bump y en sus propias invocaciones.
 * Con `BASE_FEE` (100) la red de prueba congestionada rechazaba el registro con `txInsufficientFee`; 0,01 XLM es una
 * oferta máxima holgada (la red cobra la tarifa de inclusión vigente, no necesariamente todo) y no toca ningún monto.
 */
export const COMISION_RED = 100_000;

/** Rechazos de la red que se arreglan volviendo a enviar: comisión corta o transacción vencida. */
export const RECHAZOS_REINTENTABLES = ["txInsufficientFee", "txTooLate"] as const;

/**
 * Reintenta en silencio, hasta 3 veces y con espera creciente, cuando la red rechazó la transacción al recibirla por uno
 * de `codigos` (la rechazada no se aplicó: reenviar no duplica nada). `enviar(intento)` arma y manda una nueva en cada
 * intento; cualquier otro error, o el cuarto rechazo, sale tal cual.
 */
export async function reintentarRechazo<T>(
  enviar: (intento: number) => Promise<T>,
  codigos: readonly string[] = RECHAZOS_REINTENTABLES,
  esperaMs = 1500,
): Promise<T> {
  for (let intento = 0; ; intento++) {
    try {
      return await enviar(intento);
    } catch (e) {
      const reintentable = e instanceof ChainError && !!e.rechazo && codigos.includes(e.rechazo);
      if (!reintentable || intento >= 3) throw e;
      await sleep(esperaMs * (intento + 1));
    }
  }
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

/** Reescribe el mensaje de un error de contrato con el catálogo propio de ese contrato. */
export function remapError(e: unknown, map: Record<number, string>, contract: string): never {
  if (e instanceof ChainError && e.code != null && map[e.code]) {
    throw new ChainError(`${map[e.code]} (${contract} #${e.code})`, e.code, e.raw);
  }
  throw e;
}

export const addr = (a: string) => new Address(a).toScVal();
export const i128 = (v: bigint) => nativeToScVal(v, { type: "i128" });
export const u32 = (v: number) => nativeToScVal(v, { type: "u32" });
export const str = (v: string) => nativeToScVal(v, { type: "string" });

/** Arma, simula y ensambla una invocación con `source` como cuenta de origen. */
export async function prepareInvoke(
  source: string,
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  fee: string = BASE_FEE,
): Promise<Transaction> {
  const s = server();
  const account = await retry(() => s.getAccount(source));
  const tx = new TransactionBuilder(account, { fee, networkPassphrase: NETWORK_PASSPHRASE })
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

/** Nombre del rechazo; si el fee bump falla por la transacción de adentro, el de adentro (p. ej. `txTooLate`). */
function codigoRechazo(r: { type?: string; innerResultPair?: { result?: { result?: { type?: string } } } } | undefined): string {
  if (!r?.type) return "desconocido";
  if (r.type === "txFeeBumpInnerFailed") return r.innerResultPair?.result?.result?.type ?? r.type;
  return r.type;
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
    const code = codigoRechazo(sent.errorResult?.result);
    const err = new ChainError(`La red rechazó la transacción (${code})`);
    err.rechazo = code;
    throw err;
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
  return withLock(kp.publicKey(), () =>
    // Cada intento se arma de nuevo (secuencia y plazo frescos): así también se arregla un `txTooLate`.
    reintentarRechazo(async (intento) => {
      const tx = await prepareInvoke(kp.publicKey(), contractId, method, args, String(COMISION_RED * 2 ** intento));
      tx.sign(kp);
      return sendAndWait(tx);
    }),
  );
}

/**
 * Comisiones patrocinadas: la transacción ya viene firmada por el usuario (cuenta de origen);
 * la plataforma la envuelve en un fee bump, la firma y paga la comisión de red.
 */
export async function feeBumpAndSend(inner: Transaction): Promise<Sent> {
  const p = cfg().plataforma;
  // La de adentro ya viene firmada por el usuario y no se puede rearmar acá: solo se reenvía con una comisión mayor.
  // Un `txTooLate` de la de adentro no se arregla reenviándola; lo resuelve el chat pidiendo una nueva.
  return reintentarRechazo(
    (intento) => {
      const fb = TransactionBuilder.buildFeeBumpTransaction(p, String(COMISION_RED * 2 ** intento), inner, NETWORK_PASSPHRASE);
      fb.sign(p);
      return sendAndWait(fb);
    },
    ["txInsufficientFee"],
  );
}

// ---------- Cuentas, trustline, rampa y saldos ----------

export function labusd(): Asset {
  const c = cfg();
  return new Asset(c.labusdCode, c.emisor);
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

/**
 * Lo que la plataforma pone por cada cuenta nueva en mainnet: las reservas de la cuenta (2 × 0,5 XLM) y de la trustline
 * a USDC (0,5 XLM). Nada más: las comisiones de la cuenta las paga la plataforma con el fee bump.
 */
export const XLM_POR_CUENTA = "1.5";

/** Operación con que la plataforma activa una cuenta en mainnet (no hay friendbot). */
export function opCuentaNueva(pubkey: string): xdr.Operation {
  return Operation.createAccount({ destination: pubkey, startingBalance: XLM_POR_CUENTA });
}

async function crearCuenta(pubkey: string): Promise<void> {
  const p = cfg().plataforma;
  await withLock(p.publicKey(), () =>
    reintentarRechazo(async (intento) => {
      const account = await retry(() => server().getAccount(p.publicKey()));
      const tx = new TransactionBuilder(account, { fee: String(COMISION_RED * 2 ** intento), networkPassphrase: NETWORK_PASSPHRASE })
        .addOperation(opCuentaNueva(pubkey))
        .setTimeout(300)
        .build();
      tx.sign(p);
      return sendAndWait(tx);
    }),
  );
  // Horizon puede ir un ledger atrás del RPC; la trustline que sigue lee la cuenta por RPC.
  for (let i = 0; i < 8 && !(await horizonAccount(pubkey)); i++) await sleep(1500);
}

/** Cuenta nueva: friendbot en testnet; en mainnet la activa la plataforma. */
export async function ensureFunded(pubkey: string): Promise<void> {
  if (await horizonAccount(pubkey)) return;
  if (ES_MAINNET) return crearCuenta(pubkey);
  const res = await retry(() => fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(pubkey)}`, { cache: "no-store" }));
  for (let i = 0; i < 8; i++) {
    if (await horizonAccount(pubkey)) return;
    await sleep(1500);
  }
  throw new ChainError(`No se pudo activar la cuenta de prueba (friendbot ${res.status})`);
}

/** Retiro en mainnet: pago de USDC de la cuenta del usuario a otra suya. Lo firma el navegador; la plataforma paga la comisión. */
export async function prepareRetiro(from: string, to: string, units: bigint, memo: string): Promise<Transaction> {
  const account = await retry(() => server().getAccount(from));
  const b = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE }).addOperation(
    Operation.payment({ destination: to, asset: labusd(), amount: unitsToAmountString(units) }),
  );
  if (memo) b.addMemo(Memo.text(memo));
  return b.setTimeout(300).build();
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
  if (ES_MAINNET) throw new ChainError("En mainnet no hay rampa simulada");
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
