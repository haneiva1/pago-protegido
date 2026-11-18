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




export const ContractError = {
  1: {message:"AmountCannotBeZero"},
  2: {message:"EscrowAlreadyInitialized"},
  3: {message:"EscrowNotFound"},
  4: {message:"OnlyReleaseSignerCanReleaseEarnings"},
  5: {message:"EscrowNotCompleted"},
  6: {message:"EscrowBalanceNotEnoughToSendEarnings"},
  7: {message:"OnlyPlatformAddressExecuteThisFunction"},
  8: {message:"OnlyServiceProviderChangeMilstoneStatus"},
  9: {message:"NoMilestoneDefined"},
  10: {message:"InvalidMileStoneIndex"},
  11: {message:"OnlyApproverChangeMilstoneFlag"},
  12: {message:"OnlyDisputeResolverCanExecuteThisFunction"},
  13: {message:"EscrowAlreadyInDispute"},
  14: {message:"EscrowNotInDispute"},
  15: {message:"InsufficientFundsForResolution"},
  16: {message:"EscrowOpenedForDisputeResolution"},
  17: {message:"Overflow"},
  18: {message:"Underflow"},
  19: {message:"DivisionError"},
  20: {message:"InsufficientApproverFundsForCommissions"},
  21: {message:"InsufficientServiceProviderFundsForCommissions"},
  22: {message:"MilestoneApprovedCantChangeEscrowProperties"},
  23: {message:"EscrowHasFunds"},
  24: {message:"EscrowAlreadyResolved"},
  25: {message:"TooManyEscrowsRequested"},
  26: {message:"UnauthorizedToChangeDisputeFlag"},
  27: {message:"TooManyMilestones"},
  28: {message:"ReceiverAndApproverFundsNotEqual"},
  38: {message:"AmountsToBeTransferredShouldBePositive"},
  39: {message:"DistributionsMustEqualEscrowBalance"},
  29: {message:"MilestoneHasAlreadyBeenApproved"},
  30: {message:"EmptyMilestoneStatus"},
  31: {message:"PlatformFeeTooHigh"},
  32: {message:"FlagsMustBeFalse"},
  33: {message:"EscrowPropertiesMismatch"},
  34: {message:"ApproverOrReceiverFundsLessThanZero"},
  35: {message:"EscrowAlreadyReleased"},
  36: {message:"IncompatibleEscrowWasmHash"},
  37: {message:"PlatformAddressCannotBeChanged"},
  40: {message:"DisputeResolverCannotDisputeTheEscrow"},
  41: {message:"TotalAmountCannotBeZero"},
  42: {message:"InsufficientFundsForEscrowFunding"},
  43: {message:"MilestoneToApproveDoesNotExist"},
  44: {message:"EscrowNotFullyProcessed"},
  45: {message:"TooManyDistributions"},
  46: {message:"MilestoneToUpdateDoesNotExist"}
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


export interface Milestone {
  approved: boolean;
  description: string;
  evidence: string;
  status: string;
}


export interface Trustline {
  address: string;
}


export interface AddressBalance {
  address: string;
  balance: i128;
  trustline_decimals: u32;
}

export interface Client {
  /**
   * Construct and simulate a get_escrow transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_escrow: (options?: MethodOptions) => Promise<AssembledTransaction<Result<Escrow>>>

  /**
   * Construct and simulate a fund_escrow transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  fund_escrow: ({signer, expected_escrow, amount}: {signer: string, expected_escrow: Escrow, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a release_funds transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  release_funds: ({release_signer, trustless_work_address}: {release_signer: string, trustless_work_address: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a update_escrow transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  update_escrow: ({plataform_address, escrow_properties}: {plataform_address: string, escrow_properties: Escrow}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Escrow>>>

  /**
   * Construct and simulate a dispute_escrow transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  dispute_escrow: ({signer}: {signer: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a resolve_dispute transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  resolve_dispute: ({dispute_resolver, trustless_work_address, distributions}: {dispute_resolver: string, trustless_work_address: string, distributions: Map<string, i128>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a approve_milestone transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  approve_milestone: ({milestone_index, approver}: {milestone_index: u32, approver: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a initialize_escrow transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize_escrow: ({escrow_properties}: {escrow_properties: Escrow}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Escrow>>>

  /**
   * Construct and simulate a extend_contract_ttl transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  extend_contract_ttl: ({platform, ledgers_to_extend}: {platform: string, ledgers_to_extend: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a change_milestone_status transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  change_milestone_status: ({milestone_index, new_status, new_evidence, service_provider}: {milestone_index: u32, new_status: string, new_evidence: Option<string>, service_provider: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a withdraw_remaining_funds transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  withdraw_remaining_funds: ({dispute_resolver, trustless_work_address, distributions}: {dispute_resolver: string, trustless_work_address: string, distributions: Map<string, i128>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_escrow_by_contract_id transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_escrow_by_contract_id: ({contract_id}: {contract_id: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Escrow>>>

  /**
   * Construct and simulate a get_multiple_escrow_balances transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_multiple_escrow_balances: ({addresses}: {addresses: Array<string>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Array<AddressBalance>>>>

  /**
   * Construct and simulate a tw_new_single_release_escrow transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  tw_new_single_release_escrow: ({signer, wasm_hash, salt, init_fn, init_args, constructor_args}: {signer: string, wasm_hash: Buffer, salt: Buffer, init_fn: string, init_args: Array<any>, constructor_args: Array<any>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<readonly [string, any]>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
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
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAADUNvbnRyYWN0RXJyb3IAAAAAAAAuAAAAAAAAABJBbW91bnRDYW5ub3RCZVplcm8AAAAAAAEAAAAAAAAAGEVzY3Jvd0FscmVhZHlJbml0aWFsaXplZAAAAAIAAAAAAAAADkVzY3Jvd05vdEZvdW5kAAAAAAADAAAAAAAAACNPbmx5UmVsZWFzZVNpZ25lckNhblJlbGVhc2VFYXJuaW5ncwAAAAAEAAAAAAAAABJFc2Nyb3dOb3RDb21wbGV0ZWQAAAAAAAUAAAAAAAAAJEVzY3Jvd0JhbGFuY2VOb3RFbm91Z2hUb1NlbmRFYXJuaW5ncwAAAAYAAAAAAAAAJk9ubHlQbGF0Zm9ybUFkZHJlc3NFeGVjdXRlVGhpc0Z1bmN0aW9uAAAAAAAHAAAAAAAAACdPbmx5U2VydmljZVByb3ZpZGVyQ2hhbmdlTWlsc3RvbmVTdGF0dXMAAAAACAAAAAAAAAASTm9NaWxlc3RvbmVEZWZpbmVkAAAAAAAJAAAAAAAAABVJbnZhbGlkTWlsZVN0b25lSW5kZXgAAAAAAAAKAAAAAAAAAB5Pbmx5QXBwcm92ZXJDaGFuZ2VNaWxzdG9uZUZsYWcAAAAAAAsAAAAAAAAAKU9ubHlEaXNwdXRlUmVzb2x2ZXJDYW5FeGVjdXRlVGhpc0Z1bmN0aW9uAAAAAAAADAAAAAAAAAAWRXNjcm93QWxyZWFkeUluRGlzcHV0ZQAAAAAADQAAAAAAAAASRXNjcm93Tm90SW5EaXNwdXRlAAAAAAAOAAAAAAAAAB5JbnN1ZmZpY2llbnRGdW5kc0ZvclJlc29sdXRpb24AAAAAAA8AAAAAAAAAIEVzY3Jvd09wZW5lZEZvckRpc3B1dGVSZXNvbHV0aW9uAAAAEAAAAAAAAAAIT3ZlcmZsb3cAAAARAAAAAAAAAAlVbmRlcmZsb3cAAAAAAAASAAAAAAAAAA1EaXZpc2lvbkVycm9yAAAAAAAAEwAAAAAAAAAnSW5zdWZmaWNpZW50QXBwcm92ZXJGdW5kc0ZvckNvbW1pc3Npb25zAAAAABQAAAAAAAAALkluc3VmZmljaWVudFNlcnZpY2VQcm92aWRlckZ1bmRzRm9yQ29tbWlzc2lvbnMAAAAAABUAAAAAAAAAK01pbGVzdG9uZUFwcHJvdmVkQ2FudENoYW5nZUVzY3Jvd1Byb3BlcnRpZXMAAAAAFgAAAAAAAAAORXNjcm93SGFzRnVuZHMAAAAAABcAAAAAAAAAFUVzY3Jvd0FscmVhZHlSZXNvbHZlZAAAAAAAABgAAAAAAAAAF1Rvb01hbnlFc2Nyb3dzUmVxdWVzdGVkAAAAABkAAAAAAAAAH1VuYXV0aG9yaXplZFRvQ2hhbmdlRGlzcHV0ZUZsYWcAAAAAGgAAAAAAAAARVG9vTWFueU1pbGVzdG9uZXMAAAAAAAAbAAAAAAAAACBSZWNlaXZlckFuZEFwcHJvdmVyRnVuZHNOb3RFcXVhbAAAABwAAAAAAAAAJkFtb3VudHNUb0JlVHJhbnNmZXJyZWRTaG91bGRCZVBvc2l0aXZlAAAAAAAmAAAAAAAAACNEaXN0cmlidXRpb25zTXVzdEVxdWFsRXNjcm93QmFsYW5jZQAAAAAnAAAAAAAAAB9NaWxlc3RvbmVIYXNBbHJlYWR5QmVlbkFwcHJvdmVkAAAAAB0AAAAAAAAAFEVtcHR5TWlsZXN0b25lU3RhdHVzAAAAHgAAAAAAAAASUGxhdGZvcm1GZWVUb29IaWdoAAAAAAAfAAAAAAAAABBGbGFnc011c3RCZUZhbHNlAAAAIAAAAAAAAAAYRXNjcm93UHJvcGVydGllc01pc21hdGNoAAAAIQAAAAAAAAAjQXBwcm92ZXJPclJlY2VpdmVyRnVuZHNMZXNzVGhhblplcm8AAAAAIgAAAAAAAAAVRXNjcm93QWxyZWFkeVJlbGVhc2VkAAAAAAAAIwAAAAAAAAAaSW5jb21wYXRpYmxlRXNjcm93V2FzbUhhc2gAAAAAACQAAAAAAAAAHlBsYXRmb3JtQWRkcmVzc0Nhbm5vdEJlQ2hhbmdlZAAAAAAAJQAAAAAAAAAlRGlzcHV0ZVJlc29sdmVyQ2Fubm90RGlzcHV0ZVRoZUVzY3JvdwAAAAAAACgAAAAAAAAAF1RvdGFsQW1vdW50Q2Fubm90QmVaZXJvAAAAACkAAAAAAAAAIUluc3VmZmljaWVudEZ1bmRzRm9yRXNjcm93RnVuZGluZwAAAAAAACoAAAAAAAAAHk1pbGVzdG9uZVRvQXBwcm92ZURvZXNOb3RFeGlzdAAAAAAAKwAAAAAAAAAXRXNjcm93Tm90RnVsbHlQcm9jZXNzZWQAAAAALAAAAAAAAAAUVG9vTWFueURpc3RyaWJ1dGlvbnMAAAAtAAAAAAAAAB1NaWxlc3RvbmVUb1VwZGF0ZURvZXNOb3RFeGlzdAAAAAAAAC4=",
        "AAAABQAAAAAAAAAAAAAABkNoZ0VzYwAAAAAAAQAAAAl0d191cGRhdGUAAAAAAAADAAAAAAAAAAhwbGF0Zm9ybQAAABMAAAAAAAAAAAAAAA1lbmdhZ2VtZW50X2lkAAAAAAAAEAAAAAAAAAAAAAAAFW5ld19lc2Nyb3dfcHJvcGVydGllcwAAAAAAB9AAAAAGRXNjcm93AAAAAAAAAAAAAQ==",
        "AAAABQAAAAAAAAAAAAAABkRpc0VzYwAAAAAAAQAAAAp0d19yZWxlYXNlAAAAAAABAAAAAAAAAA5yZWxlYXNlX3NpZ25lcgAAAAAAEwAAAAAAAAAA",
        "AAAABQAAAAAAAAAAAAAAB0Z1bmRFc2MAAAAAAQAAAAd0d19mdW5kAAAAAAIAAAAAAAAABnNpZ25lcgAAAAAAEwAAAAAAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAB",
        "AAAABQAAAAAAAAAAAAAAB0luaXRFc2MAAAAAAQAAAAd0d19pbml0AAAAAAEAAAAAAAAABmVzY3JvdwAAAAAH0AAAAAZFc2Nyb3cAAAAAAAAAAAAB",
        "AAAABQAAAAAAAAAAAAAACUV4dFR0bEV2dAAAAAAAAAEAAAANdHdfdHRsX2V4dGVuZAAAAAAAAAIAAAAAAAAACHBsYXRmb3JtAAAAEwAAAAAAAAAAAAAAEWxlZGdlcnNfdG9fZXh0ZW5kAAAAAAAABAAAAAAAAAAB",
        "AAAABQAAAAAAAAAAAAAADkVzY3Jvd0Rpc3B1dGVkAAAAAAABAAAACnR3X2Rpc3B1dGUAAAAAAAEAAAAAAAAABmVzY3JvdwAAAAAH0AAAAAZFc2Nyb3cAAAAAAAAAAAAB",
        "AAAABQAAAAAAAAAAAAAAD0Rpc3B1dGVSZXNvbHZlZAAAAAABAAAAD3R3X2Rpc3BfcmVzb2x2ZQAAAAABAAAAAAAAAAZlc2Nyb3cAAAAAB9AAAAAGRXNjcm93AAAAAAAAAAAAAQ==",
        "AAAABQAAAAAAAAAAAAAAEU1pbGVzdG9uZUFwcHJvdmVkAAAAAAAAAQAAAA10d19tc19hcHByb3ZlAAAAAAAAAQAAAAAAAAAGZXNjcm93AAAAAAfQAAAABkVzY3JvdwAAAAAAAAAAAAE=",
        "AAAABQAAAAAAAAAAAAAAFk1pbGVzdG9uZVN0YXR1c0NoYW5nZWQAAAAAAAEAAAAMdHdfbXNfY2hhbmdlAAAAAQAAAAAAAAAGZXNjcm93AAAAAAfQAAAABkVzY3JvdwAAAAAAAAAAAAE=",
        "AAAAAQAAAAAAAAAAAAAABUZsYWdzAAAAAAAAAwAAAAAAAAAIZGlzcHV0ZWQAAAABAAAAAAAAAAhyZWxlYXNlZAAAAAEAAAAAAAAACHJlc29sdmVkAAAAAQ==",
        "AAAAAQAAAAAAAAAAAAAABVJvbGVzAAAAAAAABgAAAAAAAAAIYXBwcm92ZXIAAAATAAAAAAAAABBkaXNwdXRlX3Jlc29sdmVyAAAAEwAAAAAAAAAIcGxhdGZvcm0AAAATAAAAAAAAAAhyZWNlaXZlcgAAABMAAAAAAAAADnJlbGVhc2Vfc2lnbmVyAAAAAAATAAAAAAAAABBzZXJ2aWNlX3Byb3ZpZGVyAAAAEw==",
        "AAAAAQAAAAAAAAAAAAAABkVzY3JvdwAAAAAACgAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAtkZXNjcmlwdGlvbgAAAAAQAAAAAAAAAA1lbmdhZ2VtZW50X2lkAAAAAAAAEAAAAAAAAAAFZmxhZ3MAAAAAAAfQAAAABUZsYWdzAAAAAAAAAAAAAAptaWxlc3RvbmVzAAAAAAPqAAAH0AAAAAlNaWxlc3RvbmUAAAAAAAAAAAAADHBsYXRmb3JtX2ZlZQAAAAQAAAAAAAAADXJlY2VpdmVyX21lbW8AAAAAAAAEAAAAAAAAAAVyb2xlcwAAAAAAB9AAAAAFUm9sZXMAAAAAAAAAAAAABXRpdGxlAAAAAAAAEAAAAAAAAAAJdHJ1c3RsaW5lAAAAAAAH0AAAAAlUcnVzdGxpbmUAAAA=",
        "AAAAAQAAAAAAAAAAAAAACU1pbGVzdG9uZQAAAAAAAAQAAAAAAAAACGFwcHJvdmVkAAAAAQAAAAAAAAALZGVzY3JpcHRpb24AAAAAEAAAAAAAAAAIZXZpZGVuY2UAAAAQAAAAAAAAAAZzdGF0dXMAAAAAABA=",
        "AAAAAQAAAAAAAAAAAAAACVRydXN0bGluZQAAAAAAAAEAAAAAAAAAB2FkZHJlc3MAAAAAEw==",
        "AAAAAQAAAAAAAAAAAAAADkFkZHJlc3NCYWxhbmNlAAAAAAADAAAAAAAAAAdhZGRyZXNzAAAAABMAAAAAAAAAB2JhbGFuY2UAAAAACwAAAAAAAAASdHJ1c3RsaW5lX2RlY2ltYWxzAAAAAAAE",
        "AAAAAAAAAAAAAAAKZ2V0X2VzY3JvdwAAAAAAAAAAAAEAAAPpAAAH0AAAAAZFc2Nyb3cAAAAAB9AAAAANQ29udHJhY3RFcnJvcgAAAA==",
        "AAAAAAAAAAAAAAALZnVuZF9lc2Nyb3cAAAAAAwAAAAAAAAAGc2lnbmVyAAAAAAATAAAAAAAAAA9leHBlY3RlZF9lc2Nyb3cAAAAH0AAAAAZFc2Nyb3cAAAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAQAAA+kAAAACAAAH0AAAAA1Db250cmFjdEVycm9yAAAA",
        "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAAAAAAA",
        "AAAAAAAAAAAAAAANcmVsZWFzZV9mdW5kcwAAAAAAAAIAAAAAAAAADnJlbGVhc2Vfc2lnbmVyAAAAAAATAAAAAAAAABZ0cnVzdGxlc3Nfd29ya19hZGRyZXNzAAAAAAATAAAAAQAAA+kAAAACAAAH0AAAAA1Db250cmFjdEVycm9yAAAA",
        "AAAAAAAAAAAAAAANdXBkYXRlX2VzY3JvdwAAAAAAAAIAAAAAAAAAEXBsYXRhZm9ybV9hZGRyZXNzAAAAAAAAEwAAAAAAAAARZXNjcm93X3Byb3BlcnRpZXMAAAAAAAfQAAAABkVzY3JvdwAAAAAAAQAAA+kAAAfQAAAABkVzY3JvdwAAAAAH0AAAAA1Db250cmFjdEVycm9yAAAA",
        "AAAAAAAAAAAAAAAOZGlzcHV0ZV9lc2Nyb3cAAAAAAAEAAAAAAAAABnNpZ25lcgAAAAAAEwAAAAEAAAPpAAAAAgAAB9AAAAANQ29udHJhY3RFcnJvcgAAAA==",
        "AAAAAAAAAAAAAAAPcmVzb2x2ZV9kaXNwdXRlAAAAAAMAAAAAAAAAEGRpc3B1dGVfcmVzb2x2ZXIAAAATAAAAAAAAABZ0cnVzdGxlc3Nfd29ya19hZGRyZXNzAAAAAAATAAAAAAAAAA1kaXN0cmlidXRpb25zAAAAAAAD7AAAABMAAAALAAAAAQAAA+kAAAACAAAH0AAAAA1Db250cmFjdEVycm9yAAAA",
        "AAAAAAAAAAAAAAARYXBwcm92ZV9taWxlc3RvbmUAAAAAAAACAAAAAAAAAA9taWxlc3RvbmVfaW5kZXgAAAAABAAAAAAAAAAIYXBwcm92ZXIAAAATAAAAAQAAA+kAAAACAAAH0AAAAA1Db250cmFjdEVycm9yAAAA",
        "AAAAAAAAAAAAAAARaW5pdGlhbGl6ZV9lc2Nyb3cAAAAAAAABAAAAAAAAABFlc2Nyb3dfcHJvcGVydGllcwAAAAAAB9AAAAAGRXNjcm93AAAAAAABAAAD6QAAB9AAAAAGRXNjcm93AAAAAAfQAAAADUNvbnRyYWN0RXJyb3IAAAA=",
        "AAAAAAAAAAAAAAATZXh0ZW5kX2NvbnRyYWN0X3R0bAAAAAACAAAAAAAAAAhwbGF0Zm9ybQAAABMAAAAAAAAAEWxlZGdlcnNfdG9fZXh0ZW5kAAAAAAAABAAAAAEAAAPpAAAAAgAAB9AAAAANQ29udHJhY3RFcnJvcgAAAA==",
        "AAAAAAAAAAAAAAAXY2hhbmdlX21pbGVzdG9uZV9zdGF0dXMAAAAABAAAAAAAAAAPbWlsZXN0b25lX2luZGV4AAAAAAQAAAAAAAAACm5ld19zdGF0dXMAAAAAABAAAAAAAAAADG5ld19ldmlkZW5jZQAAA+gAAAAQAAAAAAAAABBzZXJ2aWNlX3Byb3ZpZGVyAAAAEwAAAAEAAAPpAAAAAgAAB9AAAAANQ29udHJhY3RFcnJvcgAAAA==",
        "AAAAAAAAAAAAAAAYd2l0aGRyYXdfcmVtYWluaW5nX2Z1bmRzAAAAAwAAAAAAAAAQZGlzcHV0ZV9yZXNvbHZlcgAAABMAAAAAAAAAFnRydXN0bGVzc193b3JrX2FkZHJlc3MAAAAAABMAAAAAAAAADWRpc3RyaWJ1dGlvbnMAAAAAAAPsAAAAEwAAAAsAAAABAAAD6QAAAAIAAAfQAAAADUNvbnRyYWN0RXJyb3IAAAA=",
        "AAAAAAAAAAAAAAAZZ2V0X2VzY3Jvd19ieV9jb250cmFjdF9pZAAAAAAAAAEAAAAAAAAAC2NvbnRyYWN0X2lkAAAAABMAAAABAAAD6QAAB9AAAAAGRXNjcm93AAAAAAfQAAAADUNvbnRyYWN0RXJyb3IAAAA=",
        "AAAAAAAAAAAAAAAcZ2V0X211bHRpcGxlX2VzY3Jvd19iYWxhbmNlcwAAAAEAAAAAAAAACWFkZHJlc3NlcwAAAAAAA+oAAAATAAAAAQAAA+kAAAPqAAAH0AAAAA5BZGRyZXNzQmFsYW5jZQAAAAAH0AAAAA1Db250cmFjdEVycm9yAAAA",
        "AAAAAAAAAAAAAAAcdHdfbmV3X3NpbmdsZV9yZWxlYXNlX2VzY3JvdwAAAAYAAAAAAAAABnNpZ25lcgAAAAAAEwAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACAAAAAAAAAABHNhbHQAAAPuAAAAIAAAAAAAAAAHaW5pdF9mbgAAAAARAAAAAAAAAAlpbml0X2FyZ3MAAAAAAAPqAAAAAAAAAAAAAAAQY29uc3RydWN0b3JfYXJncwAAA+oAAAAAAAAAAQAAA+kAAAPtAAAAAgAAABMAAAAAAAAH0AAAAA1Db250cmFjdEVycm9yAAAA" ]),
      options
    )
  }
  public readonly fromJSON = {
    get_escrow: this.txFromJSON<Result<Escrow>>,
        fund_escrow: this.txFromJSON<Result<void>>,
        release_funds: this.txFromJSON<Result<void>>,
        update_escrow: this.txFromJSON<Result<Escrow>>,
        dispute_escrow: this.txFromJSON<Result<void>>,
        resolve_dispute: this.txFromJSON<Result<void>>,
        approve_milestone: this.txFromJSON<Result<void>>,
        initialize_escrow: this.txFromJSON<Result<Escrow>>,
        extend_contract_ttl: this.txFromJSON<Result<void>>,
        change_milestone_status: this.txFromJSON<Result<void>>,
        withdraw_remaining_funds: this.txFromJSON<Result<void>>,
        get_escrow_by_contract_id: this.txFromJSON<Result<Escrow>>,
        get_multiple_escrow_balances: this.txFromJSON<Result<Array<AddressBalance>>>,
        tw_new_single_release_escrow: this.txFromJSON<Result<readonly [string, any]>>
  }
}