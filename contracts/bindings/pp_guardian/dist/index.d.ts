import { Buffer } from "buffer";
import { AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, Result } from "@stellar/stellar-sdk/contract";
import type { u32, u64, i128, Option } from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";
export declare const networks: {
    readonly testnet: {
        readonly networkPassphrase: "Test SDF Network ; September 2015";
        readonly contractId: "CAOX6JZV3CJZFDD22J2XI3NKY5G4NRFOYRV7IA724MSVREYVRALW4OZU";
    };
};
export declare const Errors: {
    /**
     * Constructor: `min_window_secs` debe ser > 0 y ≤ `max_window_secs`.
     */
    1: {
        message: string;
    };
    /**
     * `set_arbiter` solo se puede llamar una vez.
     */
    2: {
        message: string;
    };
    /**
     * `fund` exige que el admin ya haya configurado el árbitro.
     */
    3: {
        message: string;
    };
    /**
     * `window_secs` fuera de [min_window_secs, max_window_secs].
     */
    4: {
        message: string;
    };
    /**
     * Ya hay una compra registrada para ese escrow.
     */
    5: {
        message: string;
    };
    /**
     * No hay compra registrada para ese escrow.
     */
    6: {
        message: string;
    };
    /**
     * Solo el comprador registrado puede confirmar.
     */
    7: {
        message: string;
    };
    /**
     * Solo el comprador o el vendedor registrados pueden abrir disputa.
     */
    8: {
        message: string;
    };
    /**
     * `roles.approver` del escrow no es este guardián.
     */
    9: {
        message: string;
    };
    /**
     * `roles.release_signer` del escrow no es este guardián.
     */
    10: {
        message: string;
    };
    /**
     * `roles.dispute_resolver` del escrow no es el pp_arbiter configurado.
     */
    11: {
        message: string;
    };
    /**
     * El escrow debe tener exactamente un hito.
     */
    12: {
        message: string;
    };
    /**
     * `amount` debe ser igual a `escrow.amount`.
     */
    13: {
        message: string;
    };
    /**
     * El escrow tiene flags activos o el hito ya está aprobado.
     */
    14: {
        message: string;
    };
    /**
     * El escrow ya tiene saldo antes del fondeo.
     */
    15: {
        message: string;
    };
    /**
     * `expected_escrow` no coincide con el escrow guardado.
     */
    16: {
        message: string;
    };
    /**
     * El comprador no puede ser el receiver del escrow.
     */
    17: {
        message: string;
    };
    /**
     * `roles.service_provider` debe ser igual a `roles.receiver` (el vendedor).
     */
    18: {
        message: string;
    };
    /**
     * `auto_release` antes del plazo.
     */
    19: {
        message: string;
    };
    /**
     * El escrow está en disputa.
     */
    20: {
        message: string;
    };
    /**
     * El escrow ya se liberó.
     */
    21: {
        message: string;
    };
    /**
     * La disputa del escrow ya se resolvió.
     */
    22: {
        message: string;
    };
    /**
     * `auto_release` exige que el hito 0 esté en "enviado".
     */
    23: {
        message: string;
    };
};
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
    fund: ({ escrow, buyer, expected_escrow, amount, window_secs }: {
        escrow: string;
        buyer: string;
        expected_escrow: Escrow;
        amount: i128;
        window_secs: u64;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<Purchase>>>;
    /**
     * Construct and simulate a config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Configuración del guardián (solo lectura).
     */
    config: (options?: MethodOptions) => Promise<AssembledTransaction<GuardianConfig>>;
    /**
     * Construct and simulate a confirm transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * "Recibí conforme": aprueba el hito 0 y libera en la misma invocación.
     * Solo el comprador registrado.
     */
    confirm: ({ escrow, buyer }: {
        escrow: string;
        buyer: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a dispute transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Abre una disputa en el escrow. Solo el comprador o el vendedor
     * registrados, con su firma.
     */
    dispute: ({ escrow, caller }: {
        escrow: string;
        caller: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a purchase transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Compra registrada para `escrow`, si existe.
     */
    purchase: ({ escrow }: {
        escrow: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Option<Purchase>>>;
    /**
     * Construct and simulate a set_arbiter transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Fija el pp_arbiter. Exige auth del admin y solo funciona una vez.
     */
    set_arbiter: ({ arbiter }: {
        arbiter: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a auto_release transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Liberación automática al vendedor. No requiere auth: cualquiera puede
     * llamarla (p. ej. un cron de la plataforma), pero solo funciona si venció
     * el plazo, no hay disputa, no está liberado/resuelto y el hito 0 está en
     * "enviado".
     */
    auto_release: ({ escrow }: {
        escrow: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
}
export declare class Client extends ContractClient {
    readonly options: ContractClientOptions;
    static deploy<T = Client>(
    /** Constructor/Initialization Args for the contract's `__constructor` method */
    { admin, tw_fee, min_window_secs, max_window_secs }: {
        admin: string;
        tw_fee: string;
        min_window_secs: u64;
        max_window_secs: u64;
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
        fund: (json: string) => AssembledTransaction<Result<Purchase, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        config: (json: string) => AssembledTransaction<GuardianConfig>;
        confirm: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        dispute: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        purchase: (json: string) => AssembledTransaction<Option<Purchase>>;
        set_arbiter: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        auto_release: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
    };
}
