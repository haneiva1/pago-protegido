import { Buffer } from "buffer";
import { AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, Result } from "@stellar/stellar-sdk/contract";
import type { u32, i128, Option } from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";
export declare const ContractError: {
    1: {
        message: string;
    };
    2: {
        message: string;
    };
    3: {
        message: string;
    };
    4: {
        message: string;
    };
    5: {
        message: string;
    };
    6: {
        message: string;
    };
    7: {
        message: string;
    };
    8: {
        message: string;
    };
    9: {
        message: string;
    };
    10: {
        message: string;
    };
    11: {
        message: string;
    };
    12: {
        message: string;
    };
    13: {
        message: string;
    };
    14: {
        message: string;
    };
    15: {
        message: string;
    };
    16: {
        message: string;
    };
    17: {
        message: string;
    };
    18: {
        message: string;
    };
    19: {
        message: string;
    };
    20: {
        message: string;
    };
    21: {
        message: string;
    };
    22: {
        message: string;
    };
    23: {
        message: string;
    };
    24: {
        message: string;
    };
    25: {
        message: string;
    };
    26: {
        message: string;
    };
    27: {
        message: string;
    };
    28: {
        message: string;
    };
    38: {
        message: string;
    };
    39: {
        message: string;
    };
    29: {
        message: string;
    };
    30: {
        message: string;
    };
    31: {
        message: string;
    };
    32: {
        message: string;
    };
    33: {
        message: string;
    };
    34: {
        message: string;
    };
    35: {
        message: string;
    };
    36: {
        message: string;
    };
    37: {
        message: string;
    };
    40: {
        message: string;
    };
    41: {
        message: string;
    };
    42: {
        message: string;
    };
    43: {
        message: string;
    };
    44: {
        message: string;
    };
    45: {
        message: string;
    };
    46: {
        message: string;
    };
};
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
    get_escrow: (options?: MethodOptions) => Promise<AssembledTransaction<Result<Escrow>>>;
    /**
     * Construct and simulate a fund_escrow transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    fund_escrow: ({ signer, expected_escrow, amount }: {
        signer: string;
        expected_escrow: Escrow;
        amount: i128;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a release_funds transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    release_funds: ({ release_signer, trustless_work_address }: {
        release_signer: string;
        trustless_work_address: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a update_escrow transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    update_escrow: ({ plataform_address, escrow_properties }: {
        plataform_address: string;
        escrow_properties: Escrow;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<Escrow>>>;
    /**
     * Construct and simulate a dispute_escrow transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    dispute_escrow: ({ signer }: {
        signer: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a resolve_dispute transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    resolve_dispute: ({ dispute_resolver, trustless_work_address, distributions }: {
        dispute_resolver: string;
        trustless_work_address: string;
        distributions: Map<string, i128>;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a approve_milestone transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    approve_milestone: ({ milestone_index, approver }: {
        milestone_index: u32;
        approver: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a initialize_escrow transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    initialize_escrow: ({ escrow_properties }: {
        escrow_properties: Escrow;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<Escrow>>>;
    /**
     * Construct and simulate a extend_contract_ttl transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    extend_contract_ttl: ({ platform, ledgers_to_extend }: {
        platform: string;
        ledgers_to_extend: u32;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a change_milestone_status transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    change_milestone_status: ({ milestone_index, new_status, new_evidence, service_provider }: {
        milestone_index: u32;
        new_status: string;
        new_evidence: Option<string>;
        service_provider: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a withdraw_remaining_funds transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    withdraw_remaining_funds: ({ dispute_resolver, trustless_work_address, distributions }: {
        dispute_resolver: string;
        trustless_work_address: string;
        distributions: Map<string, i128>;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a get_escrow_by_contract_id transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    get_escrow_by_contract_id: ({ contract_id }: {
        contract_id: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<Escrow>>>;
    /**
     * Construct and simulate a get_multiple_escrow_balances transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    get_multiple_escrow_balances: ({ addresses }: {
        addresses: Array<string>;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<Array<AddressBalance>>>>;
    /**
     * Construct and simulate a tw_new_single_release_escrow transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    tw_new_single_release_escrow: ({ signer, wasm_hash, salt, init_fn, init_args, constructor_args }: {
        signer: string;
        wasm_hash: Buffer;
        salt: Buffer;
        init_fn: string;
        init_args: Array<any>;
        constructor_args: Array<any>;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<readonly [string, any]>>>;
}
export declare class Client extends ContractClient {
    readonly options: ContractClientOptions;
    static deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions & Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
    }): Promise<AssembledTransaction<T>>;
    constructor(options: ContractClientOptions);
    readonly fromJSON: {
        get_escrow: (json: string) => AssembledTransaction<Result<Escrow, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        fund_escrow: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        release_funds: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        update_escrow: (json: string) => AssembledTransaction<Result<Escrow, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        dispute_escrow: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        resolve_dispute: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        approve_milestone: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        initialize_escrow: (json: string) => AssembledTransaction<Result<Escrow, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        extend_contract_ttl: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        change_milestone_status: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        withdraw_remaining_funds: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        get_escrow_by_contract_id: (json: string) => AssembledTransaction<Result<Escrow, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        get_multiple_escrow_balances: (json: string) => AssembledTransaction<Result<AddressBalance[], import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        tw_new_single_release_escrow: (json: string) => AssembledTransaction<Result<readonly [string, any], import("@stellar/stellar-sdk/contract").ErrorMessage>>;
    };
}
