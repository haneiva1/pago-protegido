import { Buffer } from "buffer";
import { AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, Result } from "@stellar/stellar-sdk/contract";
import type { u32, u64, i128, Option } from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";
export declare const networks: {
    readonly testnet: {
        readonly networkPassphrase: "Test SDF Network ; September 2015";
        readonly contractId: "CDKYF7OAJTACP4JNJSGGXDRA3DHE442R26CT5ZE5DJHNSHH7XJUOATOT";
    };
};
export declare const Errors: {
    /**
     * Constructor: mínimos > 0 y mínimo ≤ máximo en ambas ventanas.
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
     * `ship_secs` fuera de [min_ship_secs, max_ship_secs].
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
     * Solo el comprador registrado (confirm, extend).
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
     * Al fondear, el escrow debe tener exactamente un hito.
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
     * `auto_release` antes de `release_at`.
     */
    19: {
        message: string;
    };
    /**
     * El escrow de TW está en disputa (la haya abierto quien sea).
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
     * Falta `mark_shipped` (confirm, auto_release, extend).
     */
    23: {
        message: string;
    };
    /**
     * Solo el vendedor registrado puede `mark_shipped`.
     */
    24: {
        message: string;
    };
    /**
     * `mark_shipped` solo una vez.
     */
    25: {
        message: string;
    };
    /**
     * `mark_shipped` después de `ship_deadline`.
     */
    26: {
        message: string;
    };
    /**
     * `extend` solo una vez.
     */
    27: {
        message: string;
    };
    /**
     * `extend` después de `release_at`.
     */
    28: {
        message: string;
    };
    /**
     * Hay un hito con status vacío: TW no permite aprobarlo (#30). Queda la
     * vía de disputa y árbitro.
     */
    29: {
        message: string;
    };
    /**
     * `inspect_secs` fuera de [min_inspect_secs, max_inspect_secs].
     */
    30: {
        message: string;
    };
    /**
     * La evidencia de envío está vacía o supera `MAX_EVIDENCE_LEN`.
     */
    31: {
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
    max_inspect_secs: u64;
    max_ship_secs: u64;
    min_inspect_secs: u64;
    min_ship_secs: u64;
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
 * Compra registrada por `pp_guardian` (v2) para un escrow. Tiempos en
 * segundos (timestamp del ledger).
 */
export interface Purchase {
    /**
   * Monto fondeado (= `escrow.amount`).
   */
    amount: i128;
    /**
   * Quien fondeó el escrow a través del guardián.
   */
    buyer: string;
    /**
   * Evidencia de envío registrada por el guardián (inmutable, TW-3).
   */
    evidence: Option<string>;
    /**
   * `extend` ya se usó.
   */
    extended: boolean;
    funded_at: u64;
    /**
   * Ventana de revisión después del envío, firmada por el comprador.
   */
    inspect_secs: u64;
    /**
   * `shipped_at + inspect_secs` (+ `inspect_secs` si el comprador extendió).
   * Desde aquí procede `auto_release`.
   */
    release_at: Option<u64>;
    /**
   * `roles.receiver` del escrow en el momento del fondeo.
   */
    seller: string;
    /**
   * `funded_at + ship_secs`: después de esto ya no se puede `mark_shipped`
   * y, con disputa, procede `refund_unshipped`.
   */
    ship_deadline: u64;
    /**
   * Plazo máximo para despachar, firmado por el comprador al fondear.
   */
    ship_secs: u64;
    /**
   * Momento de `mark_shipped` (una sola vez).
   */
    shipped_at: Option<u64>;
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
     * El comprador fondea `escrow` a través del guardián y firma los plazos.
     * Árbol de auth del comprador: `fund` → `fund_escrow` → `transfer`.
     */
    fund: ({ escrow, buyer, expected_escrow, amount, ship_secs, inspect_secs }: {
        escrow: string;
        buyer: string;
        expected_escrow: Escrow;
        amount: i128;
        ship_secs: u64;
        inspect_secs: u64;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<Purchase>>>;
    /**
     * Construct and simulate a config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Configuración del guardián (solo lectura).
     */
    config: (options?: MethodOptions) => Promise<AssembledTransaction<GuardianConfig>>;
    /**
     * Construct and simulate a extend transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * El comprador alarga una vez la ventana de revisión (`release_at +=
     * inspect_secs`), antes de `release_at` y sin disputa.
     */
    extend: ({ escrow, buyer }: {
        escrow: string;
        buyer: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<Purchase>>>;
    /**
     * Construct and simulate a confirm transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * "Recibí conforme": exige envío registrado; aprueba TODOS los hitos
     * pendientes (TW-2) y libera en la misma invocación.
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
     * Compra registrada para `escrow`, si existe (solo lectura).
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
     * Liberación automática al vendedor. Sin auth (la puede disparar un cron),
     * solo con envío registrado, `now >= release_at` y el escrow de TW sin
     * disputa, sin liberar y sin resolver. Aprueba todos los hitos y libera.
     */
    auto_release: ({ escrow }: {
        escrow: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a mark_shipped transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * El vendedor registra el envío con evidencia (código de encomienda, URL de
     * foto o "entregado en persona"). Una sola vez y antes de `ship_deadline`.
     * Escribe "enviado" + evidencia en el hito 0 de TW (auth anidada del
     * vendedor como service_provider) y fija `release_at`.
     */
    mark_shipped: ({ escrow, seller, evidence }: {
        escrow: string;
        seller: string;
        evidence: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<Purchase>>>;
}
export declare class Client extends ContractClient {
    readonly options: ContractClientOptions;
    static deploy<T = Client>(
    /** Constructor/Initialization Args for the contract's `__constructor` method */
    { admin, tw_fee, min_ship_secs, max_ship_secs, min_inspect_secs, max_inspect_secs }: {
        admin: string;
        tw_fee: string;
        min_ship_secs: u64;
        max_ship_secs: u64;
        min_inspect_secs: u64;
        max_inspect_secs: u64;
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
        extend: (json: string) => AssembledTransaction<Result<Purchase, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        confirm: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        dispute: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        purchase: (json: string) => AssembledTransaction<Option<Purchase>>;
        set_arbiter: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        auto_release: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        mark_shipped: (json: string) => AssembledTransaction<Result<Purchase, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
    };
}
