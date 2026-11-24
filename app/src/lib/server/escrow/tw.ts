import { Address, Operation, contract, scValToNative, xdr } from "@stellar/stellar-sdk";
import { randomBytes, createHash } from "node:crypto";
import { cfg } from "../config";
import { kv } from "../db";
import {
  ChainError,
  addr,
  i128,
  invokeAs,
  prepareInvoke,
  prepareOp,
  sendAndWait,
  server,
  simulate,
  str,
  tokenBalance,
  u32,
  withLock,
} from "../stellar";
import type { EscrowProps, OnchainState, Roles, Verification } from "./types";

const g = globalThis as unknown as { __ppSpecs?: Map<string, contract.Spec> };
const specs = () => (g.__ppSpecs ??= new Map());

/** Spec del escrow de Trustless Work, leído del WASM subido a testnet. */
export async function escrowSpec(): Promise<contract.Spec> {
  const hash = cfg().wasmHash;
  const hit = specs().get(hash);
  if (hit) return hit;
  const wasm = await server().getContractWasmByHash(hash, "hex");
  const spec = contract.Spec.fromWasm(Buffer.from(wasm));
  specs().set(hash, spec);
  return spec;
}

/** Spec de un contrato desplegado (pp_guardian, pp_arbiter), leído de la red. */
export async function contractSpec(contractId: string): Promise<contract.Spec> {
  const hit = specs().get(contractId);
  if (hit) return hit;
  const wasm = await server().getContractWasmByContractId(contractId);
  const spec = contract.Spec.fromWasm(Buffer.from(wasm));
  specs().set(contractId, spec);
  return spec;
}

export function propsToNative(p: EscrowProps) {
  return { ...p, amount: BigInt(p.amount) };
}

export async function escrowScVal(p: EscrowProps): Promise<xdr.ScVal> {
  const spec = await escrowSpec();
  const ty = spec.getFunc("initialize_escrow").inputs[0].type;
  return spec.nativeToScVal(propsToNative(p), ty);
}

/**
 * Instancia "fábrica": un escrow sin inicializar que solo se usa para llamar
 * tw_new_single_release_escrow (deploy + initialize en la misma transacción).
 * Se despliega una vez y su ID queda en la tabla kv.
 */
export async function factoryId(): Promise<string> {
  const key = `factory:${cfg().wasmHash}`;
  const known = kv.get(key);
  if (known) return known;
  return withLock("factory", async () => {
    const again = kv.get(key);
    if (again) return again;
    const p = cfg().plataforma;
    const op = Operation.createCustomContract({
      address: new Address(p.publicKey()),
      wasmHash: Buffer.from(cfg().wasmHash, "hex"),
      salt: randomBytes(32),
      constructorArgs: [],
    });
    const sent = await withLock(p.publicKey(), async () => {
      const tx = await prepareOp(p.publicKey(), op);
      tx.sign(p);
      return sendAndWait(tx);
    });
    if (!sent.returnValue) throw new ChainError("El deploy de la fábrica no devolvió dirección");
    const id = scValToNative(sent.returnValue) as string;
    kv.set(key, id);
    return id;
  });
}

export async function createEscrowTx(props: EscrowProps): Promise<{ escrowId: string; hash: string }> {
  const p = cfg().plataforma;
  const factory = await factoryId();
  const salt = createHash("sha256").update(props.engagement_id).update(randomBytes(16)).digest();
  const args = [
    addr(p.publicKey()),
    xdr.ScVal.scvBytes(Buffer.from(cfg().wasmHash, "hex")),
    xdr.ScVal.scvBytes(salt),
    xdr.ScVal.scvSymbol("initialize_escrow"),
    xdr.ScVal.scvVec([await escrowScVal(props)]),
    xdr.ScVal.scvVec([]),
  ];
  const sent = await invokeAs(p, factory, "tw_new_single_release_escrow", args);
  if (!sent.returnValue) throw new ChainError("El deploy del escrow no devolvió dirección");
  const [escrowId] = scValToNative(sent.returnValue) as [string, unknown];
  return { escrowId, hash: sent.hash };
}

export async function readEscrowState(escrowId: string): Promise<OnchainState> {
  const [raw, balance] = await Promise.all([simulate(escrowId, "get_escrow", []), tokenBalance(escrowId)]);
  const e = scValToNative(raw) as {
    flags: OnchainState["flags"];
    milestones: { status: string; evidence: string; approved: boolean }[];
    roles: Roles;
  };
  return {
    balance: balance.toString(),
    flags: e.flags,
    milestone: e.milestones?.[0] ?? null,
    roles: e.roles,
  };
}

/** El vendedor marca el hito 0 como "enviado" con la evidencia (igual en los dos modos). */
export function prepareShip(escrowId: string, seller: string, evidence: string) {
  return prepareInvoke(seller, escrowId, "change_milestone_status", [u32(0), str("enviado"), str(evidence), addr(seller)]);
}

/** Map<Address, i128> ordenado por llave, como exige Soroban. */
export function distributionsScVal(entries: { address: string; amount: bigint }[]): xdr.ScVal {
  const items = entries
    .filter((e) => e.amount > 0n)
    .map((e) => ({ key: addr(e.address), val: i128(e.amount) }))
    .sort((a, b) => Buffer.compare(a.key.toXDR(), b.key.toXDR()));
  return xdr.ScVal.scvMap(items.map((i) => new xdr.ScMapEntry({ key: i.key, val: i.val })));
}

export { tokenBalance };

/** ¿El WASM leído de la red es el publicado? (contracts/wasm/mainnet.sha256). */
export function revisarWasm(nombre: string, wasm: Uint8Array, esperado: string) {
  const h = createHash("sha256").update(Buffer.from(wasm)).digest("hex");
  return { label: `${nombre} ejecuta el código publicado de mainnet`, ok: h === esperado, detail: `WASM ${h.slice(0, 12)}…` };
}

/**
 * H-2: antes de pedirle al comprador que firme el fondeo, se verifica por RPC que la instancia
 * ejecuta el WASM auditado de Trustless Work y que sus roles son los esperados.
 */
export async function verifyEscrowInstance(escrowId: string, expected: Roles, labels: { approver: string; resolver: string }): Promise<Verification> {
  const [wasm, st] = await Promise.all([server().getContractWasmByContractId(escrowId), readEscrowState(escrowId)]);
  const wasmHash = createHash("sha256").update(Buffer.from(wasm)).digest("hex");
  const r = st.roles;
  const checks = [
    { label: "Ejecuta el código del escrow de Trustless Work", ok: wasmHash === cfg().wasmHash, detail: `WASM ${wasmHash.slice(0, 12)}…` },
    { label: `Aprueba y libera: ${labels.approver}`, ok: r?.approver === expected.approver && r?.release_signer === expected.release_signer },
    { label: `Resuelve reclamos: ${labels.resolver}`, ok: r?.dispute_resolver === expected.dispute_resolver },
    { label: "Cobra: el vendedor", ok: r?.receiver === expected.receiver && r?.service_provider === expected.service_provider },
    { label: "Comisión de la plataforma: la cuenta de Trato", ok: r?.platform === expected.platform },
  ];
  return { ok: checks.every((c) => c.ok), escrowId, wasmHash, checks, at: Date.now() };
}
