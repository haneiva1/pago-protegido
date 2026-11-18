import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CAOX6JZV3CJZFDD22J2XI3NKY5G4NRFOYRV7IA724MSVREYVRALW4OZU",
  }
} as const

export const Errors = {
  /**
   * Constructor: `min_window_secs` debe ser > 0 y ≤ `max_window_secs`.
   */
  1: {message:"InvalidWindowConfig"},
  /**
   * `set_arbiter` solo se puede llamar una vez.
   */
  2: {message:"ArbiterAlreadySet"},
  /**
   * `fund` exige que el admin ya haya configurado el árbitro.
   */
  3: {message:"ArbiterNotSet"},
  /**
   * `window_secs` fuera de [min_window_secs, max_window_secs].
   */
  4: {message:"WindowOutOfRange"},
  /**
   * Ya hay una compra registrada para ese escrow.
   */
  5: {message:"PurchaseAlreadyExists"},
  /**
   * No hay compra registrada para ese escrow.
   */
  6: {message:"PurchaseNotFound"},
  /**
   * Solo el comprador registrado puede confirmar.
   */
  7: {message:"NotBuyer"},
  /**
   * Solo el comprador o el vendedor registrados pueden abrir disputa.
   */
  8: {message:"NotBuyerOrSeller"},
  /**
   * `roles.approver` del escrow no es este guardián.
   */
  9: {message:"ApproverNotGuardian"},
  /**
   * `roles.release_signer` del escrow no es este guardián.
   */
  10: {message:"ReleaseSignerNotGuardian"},
  /**
   * `roles.dispute_resolver` del escrow no es el pp_arbiter configurado.
   */
  11: {message:"DisputeResolverNotArbiter"},
  /**
   * El escrow debe tener exactamente un hito.
   */
  12: {message:"NotSingleMilestone"},
  /**
   * `amount` debe ser igual a `escrow.amount`.
   */
  13: {message:"AmountMismatch"},
  /**
   * El escrow tiene flags activos o el hito ya está aprobado.
   */
  14: {message:"EscrowNotPristine"},
  /**
   * El escrow ya tiene saldo antes del fondeo.
   */
  15: {message:"EscrowAlreadyFunded"},
  /**
   * `expected_escrow` no coincide con el escrow guardado.
   */
  16: {message:"EscrowMismatch"},
  /**
   * El comprador no puede ser el receiver del escrow.
   */
  17: {message:"BuyerIsSeller"},
  /**
   * `roles.service_provider` debe ser igual a `roles.receiver` (el vendedor).
   */
  18: {message:"ServiceProviderNotReceiver"},
  /**
   * `auto_release` antes del plazo.
   */
  19: {message:"DeadlineNotReached"},
  /**
   * El escrow está en disputa.
   */
  20: {message:"EscrowDisputed"},
  /**
   * El escrow ya se liberó.
   */
  21: {message:"EscrowAlreadyReleased"},
  /**
   * La disputa del escrow ya se resolvió.
   */
  22: {message:"EscrowAlreadyResolved"},
  /**
   * `auto_release` exige que el hito 0 esté en "enviado".
   */
  23: {message:"NotShipped"}
}







export interface GuardianConfig {
  admin: string;
  /**
 * pp_arbiter que debe figurar como `dispute_resolver`. `None` hasta que el
 * admin llame `set_arbiter` (una sola vez).
 */
arbiter: Option<string>;
  max_window_secs: u64;
  min_window_secs: u64;
  tw_fee: string;
}


export interface Flags {
  disputed: boolean;
  released: boolean;
  resolved: boolean;
}


export interface Roles {
  approver: string;
  dispute_resolver: string;
  platform: string;
  receiver: string;
  release_signer: string;
  service_provider: string;
}


/**
 * Estado completo de un escrow single-release (igual a `Escrow` de TW).
 */
export interface Escrow {
  amount: i128;
  description: string;
  engagement_id: string;
  flags: Flags;
  milestones: Array<Milestone>;
  platform_fee: u32;
  receiver_memo: u32;
  roles: Roles;
  title: string;
  trustline: Trustline;
}


/**
 * Compra registrada por `pp_guardian` para un escrow.
 */
export interface Purchase {
  /**
 * Quien fondeó el escrow a través del guardián.
 */
buyer: string;
  /**
 * `funded_at + window_secs`: desde aquí se puede llamar `auto_release`.
 */
deadline: u64;
  /**
 * Timestamp del ledger (segundos) en que se fondeó.
 */
funded_at: u64;
  /**
 * `roles.receiver` del escrow en el momento del fondeo.
 */
seller: string;
}


export interface Milestone {
  approved: boolean;
  description: string;
  evidence: string;
  status: string;
}


export interface Trustline {
  address: string;
}

export interface Client {
  /**
   * Construct and simulate a fund transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * El comprador fondea `escrow` a través del guardián.
   * 
   * Valida la ventana y los roles del modo guardián, registra la compra y
   * llama `escrow.fund_escrow(buyer, expected_escrow, amount)`. El árbol de
   * auth que firma el comprador es: `fund` → `fund_escrow` → `transfer`.
   */
  fund: ({escrow, buyer, expected_escrow, amount, window_secs}: {escrow: string, buyer: string, expected_escrow: Escrow, amount: i128, window_secs: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Purchase>>>

  /**
   * Construct and simulate a config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Configuración del guardián (solo lectura).
   */
  config: (options?: MethodOptions) => Promise<AssembledTransaction<GuardianConfig>>

  /**
   * Construct and simulate a confirm transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * "Recibí conforme": aprueba el hito 0 y libera en la misma invocación.
   * Solo el comprador registrado.
   */
  confirm: ({escrow, buyer}: {escrow: string, buyer: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a dispute transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Abre una disputa en el escrow. Solo el comprador o el vendedor
   * registrados, con su firma.
   */
  dispute: ({escrow, caller}: {escrow: string, caller: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a purchase transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Compra registrada para `escrow`, si existe.
   */
  purchase: ({escrow}: {escrow: string}, options?: MethodOptions) => Promise<AssembledTransaction<Option<Purchase>>>

  /**
   * Construct and simulate a set_arbiter transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Fija el pp_arbiter. Exige auth del admin y solo funciona una vez.
   */
  set_arbiter: ({arbiter}: {arbiter: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a auto_release transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Liberación automática al vendedor. No requiere auth: cualquiera puede
   * llamarla (p. ej. un cron de la plataforma), pero solo funciona si venció
   * el plazo, no hay disputa, no está liberado/resuelto y el hito 0 está en
   * "enviado".
   */
  auto_release: ({escrow}: {escrow: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin, tw_fee, min_window_secs, max_window_secs}: {admin: string, tw_fee: string, min_window_secs: u64, max_window_secs: u64},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({admin, tw_fee, min_window_secs, max_window_secs}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAAFwAAAERDb25zdHJ1Y3RvcjogYG1pbl93aW5kb3dfc2Vjc2AgZGViZSBzZXIgPiAwIHkg4omkIGBtYXhfd2luZG93X3NlY3NgLgAAABNJbnZhbGlkV2luZG93Q29uZmlnAAAAAAEAAAArYHNldF9hcmJpdGVyYCBzb2xvIHNlIHB1ZWRlIGxsYW1hciB1bmEgdmV6LgAAAAARQXJiaXRlckFscmVhZHlTZXQAAAAAAAACAAAAOmBmdW5kYCBleGlnZSBxdWUgZWwgYWRtaW4geWEgaGF5YSBjb25maWd1cmFkbyBlbCDDoXJiaXRyby4AAAAAAA1BcmJpdGVyTm90U2V0AAAAAAAAAwAAADpgd2luZG93X3NlY3NgIGZ1ZXJhIGRlIFttaW5fd2luZG93X3NlY3MsIG1heF93aW5kb3dfc2Vjc10uAAAAAAAQV2luZG93T3V0T2ZSYW5nZQAAAAQAAAAtWWEgaGF5IHVuYSBjb21wcmEgcmVnaXN0cmFkYSBwYXJhIGVzZSBlc2Nyb3cuAAAAAAAAFVB1cmNoYXNlQWxyZWFkeUV4aXN0cwAAAAAAAAUAAAApTm8gaGF5IGNvbXByYSByZWdpc3RyYWRhIHBhcmEgZXNlIGVzY3Jvdy4AAAAAAAAQUHVyY2hhc2VOb3RGb3VuZAAAAAYAAAAtU29sbyBlbCBjb21wcmFkb3IgcmVnaXN0cmFkbyBwdWVkZSBjb25maXJtYXIuAAAAAAAACE5vdEJ1eWVyAAAABwAAAEFTb2xvIGVsIGNvbXByYWRvciBvIGVsIHZlbmRlZG9yIHJlZ2lzdHJhZG9zIHB1ZWRlbiBhYnJpciBkaXNwdXRhLgAAAAAAABBOb3RCdXllck9yU2VsbGVyAAAACAAAADFgcm9sZXMuYXBwcm92ZXJgIGRlbCBlc2Nyb3cgbm8gZXMgZXN0ZSBndWFyZGnDoW4uAAAAAAAAE0FwcHJvdmVyTm90R3VhcmRpYW4AAAAACQAAADdgcm9sZXMucmVsZWFzZV9zaWduZXJgIGRlbCBlc2Nyb3cgbm8gZXMgZXN0ZSBndWFyZGnDoW4uAAAAABhSZWxlYXNlU2lnbmVyTm90R3VhcmRpYW4AAAAKAAAARGByb2xlcy5kaXNwdXRlX3Jlc29sdmVyYCBkZWwgZXNjcm93IG5vIGVzIGVsIHBwX2FyYml0ZXIgY29uZmlndXJhZG8uAAAAGURpc3B1dGVSZXNvbHZlck5vdEFyYml0ZXIAAAAAAAALAAAAKUVsIGVzY3JvdyBkZWJlIHRlbmVyIGV4YWN0YW1lbnRlIHVuIGhpdG8uAAAAAAAAEk5vdFNpbmdsZU1pbGVzdG9uZQAAAAAADAAAACpgYW1vdW50YCBkZWJlIHNlciBpZ3VhbCBhIGBlc2Nyb3cuYW1vdW50YC4AAAAAAA5BbW91bnRNaXNtYXRjaAAAAAAADQAAADpFbCBlc2Nyb3cgdGllbmUgZmxhZ3MgYWN0aXZvcyBvIGVsIGhpdG8geWEgZXN0w6EgYXByb2JhZG8uAAAAAAARRXNjcm93Tm90UHJpc3RpbmUAAAAAAAAOAAAAKkVsIGVzY3JvdyB5YSB0aWVuZSBzYWxkbyBhbnRlcyBkZWwgZm9uZGVvLgAAAAAAE0VzY3Jvd0FscmVhZHlGdW5kZWQAAAAADwAAADVgZXhwZWN0ZWRfZXNjcm93YCBubyBjb2luY2lkZSBjb24gZWwgZXNjcm93IGd1YXJkYWRvLgAAAAAAAA5Fc2Nyb3dNaXNtYXRjaAAAAAAAEAAAADFFbCBjb21wcmFkb3Igbm8gcHVlZGUgc2VyIGVsIHJlY2VpdmVyIGRlbCBlc2Nyb3cuAAAAAAAADUJ1eWVySXNTZWxsZXIAAAAAAAARAAAASWByb2xlcy5zZXJ2aWNlX3Byb3ZpZGVyYCBkZWJlIHNlciBpZ3VhbCBhIGByb2xlcy5yZWNlaXZlcmAgKGVsIHZlbmRlZG9yKS4AAAAAAAAaU2VydmljZVByb3ZpZGVyTm90UmVjZWl2ZXIAAAAAABIAAAAfYGF1dG9fcmVsZWFzZWAgYW50ZXMgZGVsIHBsYXpvLgAAAAASRGVhZGxpbmVOb3RSZWFjaGVkAAAAAAATAAAAG0VsIGVzY3JvdyBlc3TDoSBlbiBkaXNwdXRhLgAAAAAORXNjcm93RGlzcHV0ZWQAAAAAABQAAAAYRWwgZXNjcm93IHlhIHNlIGxpYmVyw7MuAAAAFUVzY3Jvd0FscmVhZHlSZWxlYXNlZAAAAAAAABUAAAAmTGEgZGlzcHV0YSBkZWwgZXNjcm93IHlhIHNlIHJlc29sdmnDsy4AAAAAABVFc2Nyb3dBbHJlYWR5UmVzb2x2ZWQAAAAAAAAWAAAANmBhdXRvX3JlbGVhc2VgIGV4aWdlIHF1ZSBlbCBoaXRvIDAgZXN0w6kgZW4gImVudmlhZG8iLgAAAAAACk5vdFNoaXBwZWQAAAAAABc=",
        "AAAABQAAAAAAAAAAAAAABkZ1bmRlZAAAAAAAAQAAAAlwcF9mdW5kZWQAAAAAAAAFAAAAAAAAAAZlc2Nyb3cAAAAAABMAAAABAAAAAAAAAAVidXllcgAAAAAAABMAAAAAAAAAAAAAAAZzZWxsZXIAAAAAABMAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAAAAAAhkZWFkbGluZQAAAAYAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAACERpc3B1dGVkAAAAAQAAAAtwcF9kaXNwdXRlZAAAAAACAAAAAAAAAAZlc2Nyb3cAAAAAABMAAAABAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAACUNvbmZpcm1lZAAAAAAAAAEAAAAMcHBfY29uZmlybWVkAAAAAgAAAAAAAAAGZXNjcm93AAAAAAATAAAAAQAAAAAAAAAFYnV5ZXIAAAAAAAATAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAACkFyYml0ZXJTZXQAAAAAAAEAAAAOcHBfYXJiaXRlcl9zZXQAAAAAAAEAAAAAAAAAB2FyYml0ZXIAAAAAEwAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAADEF1dG9SZWxlYXNlZAAAAAEAAAAQcHBfYXV0b19yZWxlYXNlZAAAAAEAAAAAAAAABmVzY3JvdwAAAAAAEwAAAAEAAAAC",
        "AAAAAQAAAAAAAAAAAAAADkd1YXJkaWFuQ29uZmlnAAAAAAAFAAAAAAAAAAVhZG1pbgAAAAAAABMAAABycHBfYXJiaXRlciBxdWUgZGViZSBmaWd1cmFyIGNvbW8gYGRpc3B1dGVfcmVzb2x2ZXJgLiBgTm9uZWAgaGFzdGEgcXVlIGVsCmFkbWluIGxsYW1lIGBzZXRfYXJiaXRlcmAgKHVuYSBzb2xhIHZleikuAAAAAAAHYXJiaXRlcgAAAAPoAAAAEwAAAAAAAAAPbWF4X3dpbmRvd19zZWNzAAAAAAYAAAAAAAAAD21pbl93aW5kb3dfc2VjcwAAAAAGAAAAAAAAAAZ0d19mZWUAAAAAABM=",
        "AAAAAQAAAAAAAAAAAAAABUZsYWdzAAAAAAAAAwAAAAAAAAAIZGlzcHV0ZWQAAAABAAAAAAAAAAhyZWxlYXNlZAAAAAEAAAAAAAAACHJlc29sdmVkAAAAAQ==",
        "AAAAAQAAAAAAAAAAAAAABVJvbGVzAAAAAAAABgAAAAAAAAAIYXBwcm92ZXIAAAATAAAAAAAAABBkaXNwdXRlX3Jlc29sdmVyAAAAEwAAAAAAAAAIcGxhdGZvcm0AAAATAAAAAAAAAAhyZWNlaXZlcgAAABMAAAAAAAAADnJlbGVhc2Vfc2lnbmVyAAAAAAATAAAAAAAAABBzZXJ2aWNlX3Byb3ZpZGVyAAAAEw==",
        "AAAAAQAAAEVFc3RhZG8gY29tcGxldG8gZGUgdW4gZXNjcm93IHNpbmdsZS1yZWxlYXNlIChpZ3VhbCBhIGBFc2Nyb3dgIGRlIFRXKS4AAAAAAAAAAAAABkVzY3JvdwAAAAAACgAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAtkZXNjcmlwdGlvbgAAAAAQAAAAAAAAAA1lbmdhZ2VtZW50X2lkAAAAAAAAEAAAAAAAAAAFZmxhZ3MAAAAAAAfQAAAABUZsYWdzAAAAAAAAAAAAAAptaWxlc3RvbmVzAAAAAAPqAAAH0AAAAAlNaWxlc3RvbmUAAAAAAAAAAAAADHBsYXRmb3JtX2ZlZQAAAAQAAAAAAAAADXJlY2VpdmVyX21lbW8AAAAAAAAEAAAAAAAAAAVyb2xlcwAAAAAAB9AAAAAFUm9sZXMAAAAAAAAAAAAABXRpdGxlAAAAAAAAEAAAAAAAAAAJdHJ1c3RsaW5lAAAAAAAH0AAAAAlUcnVzdGxpbmUAAAA=",
        "AAAAAQAAADNDb21wcmEgcmVnaXN0cmFkYSBwb3IgYHBwX2d1YXJkaWFuYCBwYXJhIHVuIGVzY3Jvdy4AAAAAAAAAAAhQdXJjaGFzZQAAAAQAAAAwUXVpZW4gZm9uZGXDsyBlbCBlc2Nyb3cgYSB0cmF2w6lzIGRlbCBndWFyZGnDoW4uAAAABWJ1eWVyAAAAAAAAEwAAAEZgZnVuZGVkX2F0ICsgd2luZG93X3NlY3NgOiBkZXNkZSBhcXXDrSBzZSBwdWVkZSBsbGFtYXIgYGF1dG9fcmVsZWFzZWAuAAAAAAAIZGVhZGxpbmUAAAAGAAAAMlRpbWVzdGFtcCBkZWwgbGVkZ2VyIChzZWd1bmRvcykgZW4gcXVlIHNlIGZvbmRlw7MuAAAAAAAJZnVuZGVkX2F0AAAAAAAABgAAADVgcm9sZXMucmVjZWl2ZXJgIGRlbCBlc2Nyb3cgZW4gZWwgbW9tZW50byBkZWwgZm9uZGVvLgAAAAAAAAZzZWxsZXIAAAAAABM=",
        "AAAAAQAAAAAAAAAAAAAACU1pbGVzdG9uZQAAAAAAAAQAAAAAAAAACGFwcHJvdmVkAAAAAQAAAAAAAAALZGVzY3JpcHRpb24AAAAAEAAAAAAAAAAIZXZpZGVuY2UAAAAQAAAAAAAAAAZzdGF0dXMAAAAAABA=",
        "AAAAAQAAAAAAAAAAAAAACVRydXN0bGluZQAAAAAAAAEAAAAAAAAAB2FkZHJlc3MAAAAAEw==",
        "AAAAAAAAAQ9FbCBjb21wcmFkb3IgZm9uZGVhIGBlc2Nyb3dgIGEgdHJhdsOpcyBkZWwgZ3VhcmRpw6FuLgoKVmFsaWRhIGxhIHZlbnRhbmEgeSBsb3Mgcm9sZXMgZGVsIG1vZG8gZ3VhcmRpw6FuLCByZWdpc3RyYSBsYSBjb21wcmEgeQpsbGFtYSBgZXNjcm93LmZ1bmRfZXNjcm93KGJ1eWVyLCBleHBlY3RlZF9lc2Nyb3csIGFtb3VudClgLiBFbCDDoXJib2wgZGUKYXV0aCBxdWUgZmlybWEgZWwgY29tcHJhZG9yIGVzOiBgZnVuZGAg4oaSIGBmdW5kX2VzY3Jvd2Ag4oaSIGB0cmFuc2ZlcmAuAAAAAARmdW5kAAAABQAAAAAAAAAGZXNjcm93AAAAAAATAAAAAAAAAAVidXllcgAAAAAAABMAAAAAAAAAD2V4cGVjdGVkX2VzY3JvdwAAAAfQAAAABkVzY3JvdwAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAC3dpbmRvd19zZWNzAAAAAAYAAAABAAAD6QAAB9AAAAAIUHVyY2hhc2UAAAAD",
        "AAAAAAAAACxDb25maWd1cmFjacOzbiBkZWwgZ3VhcmRpw6FuIChzb2xvIGxlY3R1cmEpLgAAAAZjb25maWcAAAAAAAAAAAABAAAH0AAAAA5HdWFyZGlhbkNvbmZpZwAA",
        "AAAAAAAAAGUiUmVjaWLDrSBjb25mb3JtZSI6IGFwcnVlYmEgZWwgaGl0byAwIHkgbGliZXJhIGVuIGxhIG1pc21hIGludm9jYWNpw7NuLgpTb2xvIGVsIGNvbXByYWRvciByZWdpc3RyYWRvLgAAAAAAAAdjb25maXJtAAAAAAIAAAAAAAAABmVzY3JvdwAAAAAAEwAAAAAAAAAFYnV5ZXIAAAAAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAFlBYnJlIHVuYSBkaXNwdXRhIGVuIGVsIGVzY3Jvdy4gU29sbyBlbCBjb21wcmFkb3IgbyBlbCB2ZW5kZWRvcgpyZWdpc3RyYWRvcywgY29uIHN1IGZpcm1hLgAAAAAAAAdkaXNwdXRlAAAAAAIAAAAAAAAABmVzY3JvdwAAAAAAEwAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAACtDb21wcmEgcmVnaXN0cmFkYSBwYXJhIGBlc2Nyb3dgLCBzaSBleGlzdGUuAAAAAAhwdXJjaGFzZQAAAAEAAAAAAAAABmVzY3JvdwAAAAAAEwAAAAEAAAPoAAAH0AAAAAhQdXJjaGFzZQ==",
        "AAAAAAAAAEFGaWphIGVsIHBwX2FyYml0ZXIuIEV4aWdlIGF1dGggZGVsIGFkbWluIHkgc29sbyBmdW5jaW9uYSB1bmEgdmV6LgAAAAAAAAtzZXRfYXJiaXRlcgAAAAABAAAAAAAAAAdhcmJpdGVyAAAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAOZMaWJlcmFjacOzbiBhdXRvbcOhdGljYSBhbCB2ZW5kZWRvci4gTm8gcmVxdWllcmUgYXV0aDogY3VhbHF1aWVyYSBwdWVkZQpsbGFtYXJsYSAocC4gZWouIHVuIGNyb24gZGUgbGEgcGxhdGFmb3JtYSksIHBlcm8gc29sbyBmdW5jaW9uYSBzaSB2ZW5jacOzCmVsIHBsYXpvLCBubyBoYXkgZGlzcHV0YSwgbm8gZXN0w6EgbGliZXJhZG8vcmVzdWVsdG8geSBlbCBoaXRvIDAgZXN0w6EgZW4KImVudmlhZG8iLgAAAAAADGF1dG9fcmVsZWFzZQAAAAEAAAAAAAAABmVzY3JvdwAAAAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAG9gYWRtaW5gIHNvbG8gc2lydmUgcGFyYSBgc2V0X2FyYml0ZXJgICh1bmEgdmV6KS4gYHR3X2ZlZWAgcmVjaWJlIGVsIDAsMyUKZGUgVHJ1c3RsZXNzIFdvcmsgZW4gY2FkYSBsaWJlcmFjacOzbi4AAAAADV9fY29uc3RydWN0b3IAAAAAAAAEAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAABnR3X2ZlZQAAAAAAEwAAAAAAAAAPbWluX3dpbmRvd19zZWNzAAAAAAYAAAAAAAAAD21heF93aW5kb3dfc2VjcwAAAAAGAAAAAQAAA+kAAAACAAAAAw==" ]),
      options
    )
  }
  public readonly fromJSON = {
    fund: this.txFromJSON<Result<Purchase>>,
        config: this.txFromJSON<GuardianConfig>,
        confirm: this.txFromJSON<Result<void>>,
        dispute: this.txFromJSON<Result<void>>,
        purchase: this.txFromJSON<Option<Purchase>>,
        set_arbiter: this.txFromJSON<Result<void>>,
        auto_release: this.txFromJSON<Result<void>>
  }
}