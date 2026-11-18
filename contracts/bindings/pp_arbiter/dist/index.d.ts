import { Buffer } from "buffer";
import { AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, Result } from "@stellar/stellar-sdk/contract";
import type { u32, i128 } from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";
export declare const networks: {
    readonly testnet: {
        readonly networkPassphrase: "Test SDF Network ; September 2015";
        readonly contractId: "CBCDVLEPJ6PN7RDC3HFGML3IUT7SOQEYSGH3LE3SWXWZJO7Z2QG2PWGU";
    };
};
export declare const Errors: {
    /**
     * `buyer_bps` > 10000.
     */
    1: {
        message: string;
    };
    /**
     * El escrow no está en disputa.
     */
    2: {
        message: string;
    };
    /**
     * pp_guardian no tiene compra registrada para ese escrow.
     */
    3: {
        message: string;
    };
    /**
     * `roles.dispute_resolver` del escrow no es este contrato.
     */
    4: {
        message: string;
    };
    /**
     * El escrow no tiene saldo para repartir.
     */
    5: {
        message: string;
    };
    /**
     * `Purchase.seller` no coincide con `roles.receiver` del escrow.
     */
    6: {
        message: string;
    };
    /**
     * `refund_unshipped` antes del plazo de la compra.
     */
    7: {
        message: string;
    };
    /**
     * `refund_unshipped` con el hito ya en "enviado".
     */
    8: {
        message: string;
    };
    /**
     * Comprador y vendedor son la misma dirección.
     */
    9: {
        message: string;
    };
};
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
    quote: ({ escrow, buyer_bps }: {
        escrow: string;
        buyer_bps: u32;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<Split>>>;
    /**
     * Construct and simulate a config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Configuración del árbitro (solo lectura).
     */
    config: (options?: MethodOptions) => Promise<AssembledTransaction<ArbiterConfig>>;
    /**
     * Construct and simulate a resolve transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Resuelve la disputa: `buyer_bps` del saldo al comprador y el resto al
     * vendedor. Solo el admin y solo con el escrow en disputa.
     *
     * Redondeo: `seller_amount = floor(balance * (10000 - buyer_bps) / 10000)`
     * y `buyer_amount = balance - seller_amount`; la unidad sobrante (si la
     * hay) queda para el comprador, nunca para un tercero.
     */
    resolve: ({ escrow, buyer_bps }: {
        escrow: string;
        buyer_bps: u32;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<Split>>>;
    /**
     * Construct and simulate a set_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Cambia el admin. Exige auth del admin actual.
     */
    set_admin: ({ new_admin }: {
        new_admin: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a refund_unshipped transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Devuelve el 100% del saldo al comprador sin intervención del admin
     * (no requiere auth) si: el escrow está en disputa, el plazo de la compra
     * venció y el vendedor nunca marcó el hito como "enviado".
     */
    refund_unshipped: ({ escrow }: {
        escrow: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<Split>>>;
}
export declare class Client extends ContractClient {
    readonly options: ContractClientOptions;
    static deploy<T = Client>(
    /** Constructor/Initialization Args for the contract's `__constructor` method */
    { admin, guardian, tw_fee }: {
        admin: string;
        guardian: string;
        tw_fee: string;
    }, 
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
        quote: (json: string) => AssembledTransaction<Result<Split, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        config: (json: string) => AssembledTransaction<ArbiterConfig>;
        resolve: (json: string) => AssembledTransaction<Result<Split, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        set_admin: (json: string) => AssembledTransaction<null>;
        refund_unshipped: (json: string) => AssembledTransaction<Result<Split, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
    };
}
