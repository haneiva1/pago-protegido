import { Account, Asset, Contract, Networks, TransactionBuilder, humanizeEvents, rpc, scValToNative, type xdr } from "@stellar/stellar-sdk";
import { createHash } from "node:crypto";

/**
 * H-9: el indexador verificado (docs/METRICAS.md §Reglas del indexador).
 *
 * pp_guardian acepta cualquier contrato que imite la interfaz del escrow de Trustless Work, así que un
 * evento `pp_funded` auténtico no prueba que hubo una compra real (PoC en
 * contracts/integration-tests/tests/hallazgos_jurado.rs). Una compra cuenta para /metricas,
 * /tienda/<slug>, la insignia y /transparencia solo si su escrow cumple las cinco reglas de abajo.
 *
 * Este archivo solo importa @stellar/stellar-sdk y node:crypto: lo usan la app, los tests unitarios
 * (`npm test`) y cualquiera que quiera repetir la verificación por su cuenta.
 */

export type Regla = "wasm" | "roles" | "moneda" | "fondeo" | "origen";

/** Orden y texto público de cada regla (el primero que falla es el motivo que se muestra). */
export const REGLAS: readonly { regla: Regla; cumple: string; falla: string }[] = [
  { regla: "wasm", cumple: "Su contrato corre el WASM del escrow de Trustless Work.", falla: "Su contrato no es el escrow de Trustless Work" },
  {
    regla: "roles",
    // Sin "árbitro": es palabra prohibida en las pantallas (e2e/pago-protegido.spec.ts, LEGALES).
    cumple: "Sus roles son los contratos de Trato (pp_guardian y pp_arbiter), la cuenta de comisiones de Trato y el vendedor.",
    falla: "Los roles del escrow no son los de Trato",
  },
  { regla: "moneda", cumple: "Su moneda es LABUSD.", falla: "No usa LABUSD" },
  { regla: "fondeo", cumple: "El pago movió LABUSD del comprador al escrow (transferencia del SAC).", falla: "El pago no movió la plata" },
  // initialize_escrow de TW no pide la firma de la plataforma ni del vendedor: sin esta regla, cualquiera arma un escrow
  // genuino con los roles de Trato y, con 1 stroop, le suma ventas o reclamos a otra tienda. La app patrocina con fee bump
  // de la cuenta plataforma solo las transacciones que ella misma armó (tabla `pending`): el `fee_account` del pago,
  // público en Horizon, prueba que el pago salió de un link de Trato. Cualquiera lo puede comprobar.
  {
    regla: "origen",
    cumple: "El pago lo hizo la app de Trato: la cuenta de Trato pagó su comisión de red (fee bump), y eso solo lo hace con los pagos que arma.",
    falla: "El pago no lo hizo la app de Trato",
  },
];

/** Lo que se espera de un escrow de Trato (valores públicos de contracts/DEPLOYED.md). */
export interface Reglas {
  wasmHash: string;
  labusdSac: string;
  platform: string;
  /** Pares guardián/árbitro aceptados: el actual y los de cada despliegue anterior (historial). */
  pares: readonly { guardian: string; arbiter: string }[];
}

/** La compra tal como la cuenta el evento `pp_funded`. */
export interface CompraFondeada {
  escrow: string;
  buyer: string;
  seller: string;
  amount: string;
  tx_fondeo: string;
}

export interface Roles {
  approver: string;
  service_provider: string;
  platform: string;
  release_signer: string;
  dispute_resolver: string;
  receiver: string;
}

export interface Transferencia {
  /** Contrato del token (SAC) que emitió el evento `transfer`. */
  token: string;
  from: string;
  to: string;
  amount: string;
}

/**
 * Lo que dice la red. `null` = no se pudo leer (404 del RPC o de Horizon, simulación fallida, instancia archivada por
 * TTL): no prueba nada, ni a favor ni en contra. `false` = `get_escrow` respondió con un dato de otro tipo: contradicción.
 * Se guardan en escrow_verificado para reevaluar sin releer la red.
 */
export interface Hechos {
  /**
   * Cuenta que pagó la comisión de la transacción del fondeo (`fee_account` en Horizon; con fee bump, la que patrocinó).
   * `false` si Horizon respondió sin ese dato.
   */
  patrocinador: string | false | null;
  wasmHash: string | null;
  roles: Roles | false | null;
  token: string | false | null;
  monto: string | false | null;
  transferencias: Transferencia[] | null;
}

/** Motivo de una compra descartada: una regla, o una lectura que lanzó algo que no es un error de red. */
export type Motivo = Regla | "lectura";
export const FALLA_LECTURA = "La red devolvió datos que no se pudieron leer";

/** Entero en unidades (texto de dígitos). Cualquier otra cosa es `null`: un escrow falso no hace lanzar a `evaluar`. */
const entero = (x: unknown): bigint | null => (typeof x === "string" && /^-?\d+$/.test(x) ? BigInt(x) : null);

export interface Resultado {
  /** Cumple las cinco reglas: cuenta. */
  ok: boolean;
  /** Reglas con una contradicción probada (hash, roles o moneda distintos, una tx encontrada sin la transferencia). */
  fallas: Regla[];
  /** Reglas sin dato para decidir. Sin fallas, la compra queda pendiente: no cuenta y se reintenta. */
  faltan: Regla[];
}

/**
 * Aplica las cinco reglas. Sin dato no hay prueba: la compra no cuenta, pero tampoco se descarta. Solo una
 * contradicción probada la descarta, aunque falten otros datos.
 */
export function evaluar(c: CompraFondeada, h: Hechos, r: Reglas): Resultado {
  const fallas: Regla[] = [];
  const faltan: Regla[] = [];
  const regla = (nombre: Regla, cumple: boolean | null) => {
    if (cumple === null) faltan.push(nombre);
    else if (!cumple) fallas.push(nombre);
  };
  const wasm = h.wasmHash ?? null;
  regla("wasm", wasm === null ? null : String(wasm).toLowerCase() === r.wasmHash.toLowerCase());
  const ro = h.roles ?? null;
  regla(
    "roles",
    ro === null
      ? null
      : ro !== false &&
          r.pares.some((p) => ro.approver === p.guardian && ro.release_signer === p.guardian && ro.dispute_resolver === p.arbiter) &&
          ro.platform === r.platform &&
          ro.receiver === c.seller &&
          ro.service_provider === c.seller,
  );
  regla("moneda", (h.token ?? null) === null ? null : h.token === r.labusdSac);
  const monto = entero(c.amount) ?? 0n;
  const transferencias = h.transferencias ?? null;
  regla(
    "fondeo",
    monto <= 0n || (h.monto != null && entero(h.monto) !== monto)
      ? false
      : transferencias === null
        ? null
        : transferencias.some((t) => t.token === r.labusdSac && t.from === c.buyer && t.to === c.escrow && entero(t.amount) === monto),
  );
  const patrocinador = h.patrocinador ?? null;
  regla("origen", patrocinador === null ? null : patrocinador === r.platform);
  return { ok: fallas.length === 0 && faltan.length === 0, fallas, faltan };
}

/** Huella de las reglas: si cambia un valor esperado, se vuelve a verificar todo. */
export function firmaReglas(r: Reglas): string {
  const pares = r.pares.map((p) => `${p.guardian}/${p.arbiter}`).join(",");
  return createHash("sha256").update(`v3|${REGLAS.map((x) => x.regla).join(",")}|${r.wasmHash}|${r.labusdSac}|${r.platform}|${pares}`).digest("hex").slice(0, 16);
}

// ---------- Lectura de la red ----------

/** Evento de contrato ya legible (como lo devuelve `humanizeEvents` del SDK). */
export interface EventoLegible {
  type: string;
  contractId?: string;
  topics: unknown[];
  data: unknown;
}

/** Eventos `transfer` de un SAC (CAP-46-6 y CAP-67: el monto es i128 o un mapa con `amount`). */
export function transferenciasDe(events: readonly EventoLegible[]): Transferencia[] {
  const out: Transferencia[] = [];
  for (const ev of events) {
    const [nombre, from, to] = ev.topics;
    if (ev.type !== "contract" || !ev.contractId || nombre !== "transfer" || typeof from !== "string" || typeof to !== "string") continue;
    const amount = typeof ev.data === "bigint" ? ev.data : (ev.data as { amount?: unknown } | null)?.amount;
    if (typeof amount !== "bigint") continue;
    out.push({ token: ev.contractId, from, to, amount: amount.toString() });
  }
  return out;
}

/** Igual que `transferenciasDe`, desde los eventos XDR de una transacción. */
export const transferenciasDeXdr = (events: xdr.ContractEvent[]) => transferenciasDe(humanizeEvents(events));

/** Falla de Horizon o del RPC que se resuelve sola: la compra queda pendiente y se reintenta con espera. */
export class ErrorDeRed extends Error {}

const CODIGOS_RED = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ERR_NETWORK",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

/**
 * Separa los errores de red (se reintentan con espera) de cualquier otra excepción (se guarda como falla «lectura»):
 * conexión caída o vencida, una respuesta HTTP de error del RPC o de Horizon, o un error JSON-RPC del servidor.
 */
export function esErrorDeRed(e: unknown, profundidad = 0): boolean {
  if (e instanceof ErrorDeRed) return true;
  if (!e || typeof e !== "object" || profundidad > 3) return false;
  const x = e as { name?: unknown; code?: unknown; message?: unknown; response?: { status?: unknown }; isAxiosError?: unknown; cause?: unknown };
  if (x.isAxiosError === true || typeof x.response?.status === "number") return true; // el servidor respondió con un error HTTP
  if (typeof x.code === "string" && CODIGOS_RED.has(x.code)) return true;
  if (x.name === "TimeoutError" || x.name === "AbortError") return true;
  if (typeof x.message === "string" && (/^fetch failed$/.test(x.message) || /^timeout of \d+ms exceeded$/.test(x.message))) return true;
  // Error JSON-RPC del servidor (un objeto { code, message }, no un Error): el RPC respondió con un problema suyo.
  if (!(e instanceof Error) && typeof x.code === "number" && typeof x.message === "string") return true;
  return esErrorDeRed(x.cause, profundidad + 1);
}

/** Cuenta nula para simular lecturas sin firmar (no necesita existir). */
const NULL_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

/**
 * Hash del WASM que corre la instancia (sha256 del código). Si no es WASM propio (SAC o referencia externa), el tipo de
 * ejecutable, que nunca coincide con el hash. `null` si no se encontró la instancia (por ejemplo, archivada por TTL).
 */
async function wasmDeInstancia(s: rpc.Server, escrow: string): Promise<string | null> {
  try {
    const exe = (await s.getContractInstance(escrow)).executable as unknown as { type: string; value: { value?: Uint8Array } | Uint8Array };
    if (exe.type !== "contractExecutableWasm") return String(exe.type); // solo WASM propio (no SAC ni referencia externa)
    const v = exe.value as { value?: Uint8Array };
    return Buffer.from(v.value ?? (exe.value as Uint8Array)).toString("hex");
  } catch (e) {
    if ((e as { code?: number } | null)?.code === 404) return null;
    throw e;
  }
}

const ROLES = ["approver", "service_provider", "platform", "release_signer", "dispute_resolver", "receiver"] as const;
const esTexto = (x: unknown): x is string => typeof x === "string" && x.length > 0;

/**
 * Roles, moneda y monto del escrow (`get_escrow`). `null` si no respondió (simulación fallida, instancia archivada).
 * Si respondió, cada campo se valida: uno de otro tipo es `false`, una contradicción (el escrow de TW nunca lo devuelve).
 */
async function escrowDe(
  s: rpc.Server,
  escrow: string,
  networkPassphrase: string,
): Promise<{ roles: Roles | false; token: string | false; monto: string | false } | null> {
  const tx = new TransactionBuilder(new Account(NULL_ACCOUNT, "0"), { fee: "100", networkPassphrase })
    .addOperation(new Contract(escrow).call("get_escrow"))
    .setTimeout(60)
    .build();
  const sim = await s.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim) || !sim.result) return null;
  const nativo: unknown = scValToNative(sim.result.retval);
  const e = (nativo && typeof nativo === "object" ? nativo : {}) as { roles?: unknown; trustline?: unknown; amount?: unknown };
  const ro = (e.roles && typeof e.roles === "object" ? e.roles : {}) as Record<string, unknown>;
  const tl = (e.trustline && typeof e.trustline === "object" ? e.trustline : {}) as { address?: unknown };
  return {
    roles: ROLES.every((k) => esTexto(ro[k])) ? (Object.fromEntries(ROLES.map((k) => [k, ro[k]])) as unknown as Roles) : false,
    token: esTexto(tl.address) ? tl.address : false,
    monto: typeof e.amount === "bigint" ? e.amount.toString() : false,
  };
}

interface EfectoHorizon {
  type: string;
  account?: string;
  contract?: string;
  asset_type?: string;
  asset_code?: string;
  asset_issuer?: string;
  amount?: string;
}

const unidades = (amount: string) => {
  const [ent, dec = ""] = amount.split(".");
  return (BigInt(ent) * 10_000_000n + BigInt((dec + "0000000").slice(0, 7))).toString();
};

/**
 * Respaldo para pagos fuera de la ventana del RPC (unos 7 días): Horizon guarda el historial y
 * traduce cada `transfer` del SAC en un par `account_debited` / `contract_credited`.
 */
export function transferenciasDeEfectos(efectos: readonly EfectoHorizon[], networkPassphrase: string): Transferencia[] {
  const sac = (e: EfectoHorizon) =>
    e.asset_type === "native" ? Asset.native().contractId(networkPassphrase) : new Asset(e.asset_code!, e.asset_issuer!).contractId(networkPassphrase);
  const debitos = efectos.filter((e) => e.type === "account_debited" && e.account && e.amount);
  const out: Transferencia[] = [];
  for (const c of efectos) {
    if (c.type !== "contract_credited" || !c.contract || !c.amount) continue;
    const d = debitos.find((x) => x.amount === c.amount && x.asset_code === c.asset_code && x.asset_issuer === c.asset_issuer);
    if (!d) continue;
    out.push({ token: sac(c), from: d.account!, to: c.contract, amount: unidades(c.amount) });
  }
  return out;
}

async function transferenciasDelPago(s: rpc.Server, hash: string, horizonUrl: string, networkPassphrase: string): Promise<Transferencia[] | null> {
  const tx = await s.getTransaction(hash);
  if (tx.status === rpc.Api.GetTransactionStatus.FAILED) return [];
  if (tx.status === rpc.Api.GetTransactionStatus.SUCCESS) {
    const evs = tx.events?.contractEventsXdr?.flat();
    if (evs) return transferenciasDeXdr(evs);
  }
  const res = await fetch(`${horizonUrl}/transactions/${hash}/effects?limit=200`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new ErrorDeRed(`Horizon respondió ${res.status}`);
  const body = (await res.json().catch((e: Error) => {
    throw new ErrorDeRed(`Horizon no devolvió JSON: ${e.message}`);
  })) as { _embedded?: { records?: EfectoHorizon[] } };
  return transferenciasDeEfectos(body._embedded?.records ?? [], networkPassphrase);
}

/** Quién pagó la comisión de red del fondeo (Horizon guarda el historial completo). `null` si Horizon todavía no la tiene. */
async function patrocinadorDelPago(hash: string, horizonUrl: string): Promise<string | false | null> {
  const res = await fetch(`${horizonUrl}/transactions/${hash}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new ErrorDeRed(`Horizon respondió ${res.status}`);
  const body = (await res.json().catch((e: Error) => {
    throw new ErrorDeRed(`Horizon no devolvió JSON: ${e.message}`);
  })) as { fee_account?: unknown };
  return esTexto(body.fee_account) ? body.fee_account : false;
}

/**
 * Lee de la red lo necesario para `evaluar`. Los hechos ya conocidos (`previos`) no se vuelven a leer: una instancia
 * archivada después de verificarse no pierde lo que ya se leyó. Lanza solo ante errores transitorios.
 */
export async function hechosDe(
  c: CompraFondeada,
  s: rpc.Server,
  opts: { horizonUrl: string; networkPassphrase?: string; previos?: Hechos | null },
): Promise<Hechos> {
  const np = opts.networkPassphrase ?? Networks.TESTNET;
  const p = opts.previos;
  const [wasmHash, escrow, transferencias, patrocinador] = await Promise.all([
    p?.wasmHash ?? wasmDeInstancia(s, c.escrow),
    p?.roles != null && p.token != null && p.monto != null ? { roles: p.roles, token: p.token, monto: p.monto } : escrowDe(s, c.escrow, np),
    p?.transferencias ?? transferenciasDelPago(s, c.tx_fondeo, opts.horizonUrl, np),
    p?.patrocinador ?? patrocinadorDelPago(c.tx_fondeo, opts.horizonUrl),
  ]);
  return { patrocinador, wasmHash, roles: escrow?.roles ?? null, token: escrow?.token ?? null, monto: escrow?.monto ?? null, transferencias };
}
