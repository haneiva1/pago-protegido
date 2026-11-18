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
    contractId: "CBCDVLEPJ6PN7RDC3HFGML3IUT7SOQEYSGH3LE3SWXWZJO7Z2QG2PWGU",
  }
} as const

export const Errors = {
  /**
   * `buyer_bps` > 10000.
   */
  1: {message:"InvalidBps"},
  /**
   * El escrow no está en disputa.
   */
  2: {message:"NotInDispute"},
  /**
   * pp_guardian no tiene compra registrada para ese escrow.
   */
  3: {message:"PurchaseNotFound"},
  /**
   * `roles.dispute_resolver` del escrow no es este contrato.
   */
  4: {message:"NotDisputeResolver"},
  /**
   * El escrow no tiene saldo para repartir.
   */
  5: {message:"EmptyEscrow"},
  /**
   * `Purchase.seller` no coincide con `roles.receiver` del escrow.
   */
  6: {message:"SellerMismatch"},
  /**
   * `refund_unshipped` antes del plazo de la compra.
   */
  7: {message:"DeadlineNotReached"},
  /**
   * `refund_unshipped` con el hito ya en "enviado".
   */
  8: {message:"AlreadyShipped"},
  /**
   * Comprador y vendedor son la misma dirección.
   */
  9: {message:"BuyerIsSeller"}
}


/**
 * Reparto bruto del saldo del escrow (antes de las comisiones que descuenta
 * Trustless Work). `buyer_amount + seller_amount == balance` siempre.
 */
export interface Split {
  balance: i128;
  buyer: string;
  buyer_amount: i128;
  seller: string;
  seller_amount: i128;
}




export interface ArbiterConfig {
  admin: string;
  guardian: string;
  tw_fee: string;
}


export interface Client {
  /**
   * Construct and simulate a quote transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Vista previa del reparto (solo lectura, mismas validaciones que
   * `resolve` salvo la auth). Útil para el slider del panel del árbitro.
   */
  quote: ({escrow, buyer_bps}: {escrow: string, buyer_bps: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Split>>>

  /**
   * Construct and simulate a config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Configuración del árbitro (solo lectura).
   */
  config: (options?: MethodOptions) => Promise<AssembledTransaction<ArbiterConfig>>

  /**
   * Construct and simulate a resolve transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Resuelve la disputa: `buyer_bps` del saldo al comprador y el resto al
   * vendedor. Solo el admin y solo con el escrow en disputa.
   * 
   * Redondeo: `seller_amount = floor(balance * (10000 - buyer_bps) / 10000)`
   * y `buyer_amount = balance - seller_amount`; la unidad sobrante (si la
   * hay) queda para el comprador, nunca para un tercero.
   */
  resolve: ({escrow, buyer_bps}: {escrow: string, buyer_bps: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Split>>>

  /**
   * Construct and simulate a set_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Cambia el admin. Exige auth del admin actual.
   */
  set_admin: ({new_admin}: {new_admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a refund_unshipped transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Devuelve el 100% del saldo al comprador sin intervención del admin
   * (no requiere auth) si: el escrow está en disputa, el plazo de la compra
   * venció y el vendedor nunca marcó el hito como "enviado".
   */
  refund_unshipped: ({escrow}: {escrow: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Split>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin, guardian, tw_fee}: {admin: string, guardian: string, tw_fee: string},
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
    return ContractClient.deploy({admin, guardian, tw_fee}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAACQAAABRgYnV5ZXJfYnBzYCA+IDEwMDAwLgAAAApJbnZhbGlkQnBzAAAAAAABAAAAHkVsIGVzY3JvdyBubyBlc3TDoSBlbiBkaXNwdXRhLgAAAAAADE5vdEluRGlzcHV0ZQAAAAIAAAA3cHBfZ3VhcmRpYW4gbm8gdGllbmUgY29tcHJhIHJlZ2lzdHJhZGEgcGFyYSBlc2UgZXNjcm93LgAAAAAQUHVyY2hhc2VOb3RGb3VuZAAAAAMAAAA4YHJvbGVzLmRpc3B1dGVfcmVzb2x2ZXJgIGRlbCBlc2Nyb3cgbm8gZXMgZXN0ZSBjb250cmF0by4AAAASTm90RGlzcHV0ZVJlc29sdmVyAAAAAAAEAAAAJ0VsIGVzY3JvdyBubyB0aWVuZSBzYWxkbyBwYXJhIHJlcGFydGlyLgAAAAALRW1wdHlFc2Nyb3cAAAAABQAAAD5gUHVyY2hhc2Uuc2VsbGVyYCBubyBjb2luY2lkZSBjb24gYHJvbGVzLnJlY2VpdmVyYCBkZWwgZXNjcm93LgAAAAAADlNlbGxlck1pc21hdGNoAAAAAAAGAAAAMGByZWZ1bmRfdW5zaGlwcGVkYCBhbnRlcyBkZWwgcGxhem8gZGUgbGEgY29tcHJhLgAAABJEZWFkbGluZU5vdFJlYWNoZWQAAAAAAAcAAAAvYHJlZnVuZF91bnNoaXBwZWRgIGNvbiBlbCBoaXRvIHlhIGVuICJlbnZpYWRvIi4AAAAADkFscmVhZHlTaGlwcGVkAAAAAAAIAAAALUNvbXByYWRvciB5IHZlbmRlZG9yIHNvbiBsYSBtaXNtYSBkaXJlY2Npw7NuLgAAAAAAAA1CdXllcklzU2VsbGVyAAAAAAAACQ==",
        "AAAAAQAAAI1SZXBhcnRvIGJydXRvIGRlbCBzYWxkbyBkZWwgZXNjcm93IChhbnRlcyBkZSBsYXMgY29taXNpb25lcyBxdWUgZGVzY3VlbnRhClRydXN0bGVzcyBXb3JrKS4gYGJ1eWVyX2Ftb3VudCArIHNlbGxlcl9hbW91bnQgPT0gYmFsYW5jZWAgc2llbXByZS4AAAAAAAAAAAAABVNwbGl0AAAAAAAABQAAAAAAAAAHYmFsYW5jZQAAAAALAAAAAAAAAAVidXllcgAAAAAAABMAAAAAAAAADGJ1eWVyX2Ftb3VudAAAAAsAAAAAAAAABnNlbGxlcgAAAAAAEwAAAAAAAAANc2VsbGVyX2Ftb3VudAAAAAAAAAs=",
        "AAAABQAAAAAAAAAAAAAACFJlc29sdmVkAAAAAQAAAAtwcF9yZXNvbHZlZAAAAAAEAAAAAAAAAAZlc2Nyb3cAAAAAABMAAAABAAAAAAAAAAlidXllcl9icHMAAAAAAAAEAAAAAAAAAAAAAAAMYnV5ZXJfYW1vdW50AAAACwAAAAAAAAAAAAAADXNlbGxlcl9hbW91bnQAAAAAAAALAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAADEFkbWluQ2hhbmdlZAAAAAEAAAAQcHBfYWRtaW5fY2hhbmdlZAAAAAIAAAAAAAAACW9sZF9hZG1pbgAAAAAAABMAAAAAAAAAAAAAAAluZXdfYWRtaW4AAAAAAAATAAAAAAAAAAI=",
        "AAAAAQAAAAAAAAAAAAAADUFyYml0ZXJDb25maWcAAAAAAAADAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAACGd1YXJkaWFuAAAAEwAAAAAAAAAGdHdfZmVlAAAAAAAT",
        "AAAABQAAAAAAAAAAAAAAEVJlZnVuZGVkVW5zaGlwcGVkAAAAAAAAAQAAABVwcF9yZWZ1bmRlZF91bnNoaXBwZWQAAAAAAAACAAAAAAAAAAZlc2Nyb3cAAAAAABMAAAABAAAAAAAAAAxidXllcl9hbW91bnQAAAALAAAAAAAAAAI=",
        "AAAAAAAAAIZWaXN0YSBwcmV2aWEgZGVsIHJlcGFydG8gKHNvbG8gbGVjdHVyYSwgbWlzbWFzIHZhbGlkYWNpb25lcyBxdWUKYHJlc29sdmVgIHNhbHZvIGxhIGF1dGgpLiDDmnRpbCBwYXJhIGVsIHNsaWRlciBkZWwgcGFuZWwgZGVsIMOhcmJpdHJvLgAAAAAABXF1b3RlAAAAAAAAAgAAAAAAAAAGZXNjcm93AAAAAAATAAAAAAAAAAlidXllcl9icHMAAAAAAAAEAAAAAQAAA+kAAAfQAAAABVNwbGl0AAAAAAAAAw==",
        "AAAAAAAAACtDb25maWd1cmFjacOzbiBkZWwgw6FyYml0cm8gKHNvbG8gbGVjdHVyYSkuAAAAAAZjb25maWcAAAAAAAAAAAABAAAH0AAAAA1BcmJpdGVyQ29uZmlnAAAA",
        "AAAAAAAAAUNSZXN1ZWx2ZSBsYSBkaXNwdXRhOiBgYnV5ZXJfYnBzYCBkZWwgc2FsZG8gYWwgY29tcHJhZG9yIHkgZWwgcmVzdG8gYWwKdmVuZGVkb3IuIFNvbG8gZWwgYWRtaW4geSBzb2xvIGNvbiBlbCBlc2Nyb3cgZW4gZGlzcHV0YS4KClJlZG9uZGVvOiBgc2VsbGVyX2Ftb3VudCA9IGZsb29yKGJhbGFuY2UgKiAoMTAwMDAgLSBidXllcl9icHMpIC8gMTAwMDApYAp5IGBidXllcl9hbW91bnQgPSBiYWxhbmNlIC0gc2VsbGVyX2Ftb3VudGA7IGxhIHVuaWRhZCBzb2JyYW50ZSAoc2kgbGEKaGF5KSBxdWVkYSBwYXJhIGVsIGNvbXByYWRvciwgbnVuY2EgcGFyYSB1biB0ZXJjZXJvLgAAAAAHcmVzb2x2ZQAAAAACAAAAAAAAAAZlc2Nyb3cAAAAAABMAAAAAAAAACWJ1eWVyX2JwcwAAAAAAAAQAAAABAAAD6QAAB9AAAAAFU3BsaXQAAAAAAAAD",
        "AAAAAAAAAC1DYW1iaWEgZWwgYWRtaW4uIEV4aWdlIGF1dGggZGVsIGFkbWluIGFjdHVhbC4AAAAAAAAJc2V0X2FkbWluAAAAAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAMAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAIZ3VhcmRpYW4AAAATAAAAAAAAAAZ0d19mZWUAAAAAABMAAAAA",
        "AAAAAAAAAMdEZXZ1ZWx2ZSBlbCAxMDAlIGRlbCBzYWxkbyBhbCBjb21wcmFkb3Igc2luIGludGVydmVuY2nDs24gZGVsIGFkbWluCihubyByZXF1aWVyZSBhdXRoKSBzaTogZWwgZXNjcm93IGVzdMOhIGVuIGRpc3B1dGEsIGVsIHBsYXpvIGRlIGxhIGNvbXByYQp2ZW5jacOzIHkgZWwgdmVuZGVkb3IgbnVuY2EgbWFyY8OzIGVsIGhpdG8gY29tbyAiZW52aWFkbyIuAAAAABByZWZ1bmRfdW5zaGlwcGVkAAAAAQAAAAAAAAAGZXNjcm93AAAAAAATAAAAAQAAA+kAAAfQAAAABVNwbGl0AAAAAAAAAw==" ]),
      options
    )
  }
  public readonly fromJSON = {
    quote: this.txFromJSON<Result<Split>>,
        config: this.txFromJSON<ArbiterConfig>,
        resolve: this.txFromJSON<Result<Split>>,
        set_admin: this.txFromJSON<null>,
        refund_unshipped: this.txFromJSON<Result<Split>>
  }
}