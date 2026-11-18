import { Buffer } from "buffer";
import { Client as ContractClient, Spec as ContractSpec, } from "@stellar/stellar-sdk/contract";
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
        contractId: "CDTEA424AWSIIHEQ4FIQHFQOTWS3XAVLQHX7FI3MU6JZP4OPMTEVU5UA",
    }
};
export const Errors = {
    /**
     * `buyer_bps` > 10000.
     */
    1: { message: "InvalidBps" },
    /**
     * El escrow no está en disputa.
     */
    2: { message: "NotInDispute" },
    /**
     * pp_guardian no tiene compra registrada para ese escrow.
     */
    3: { message: "PurchaseNotFound" },
    /**
     * `roles.dispute_resolver` del escrow no es este contrato.
     */
    4: { message: "NotDisputeResolver" },
    /**
     * El escrow no tiene saldo para repartir.
     */
    5: { message: "EmptyEscrow" },
    /**
     * `Purchase.seller` no coincide con `roles.receiver` del escrow.
     */
    6: { message: "SellerMismatch" },
    /**
     * `refund_unshipped` antes del plazo de la compra.
     */
    7: { message: "DeadlineNotReached" },
    /**
     * `refund_unshipped` con el hito ya en "enviado".
     */
    8: { message: "AlreadyShipped" },
    /**
     * Comprador y vendedor son la misma dirección.
     */
    9: { message: "BuyerIsSeller" }
};
export class Client extends ContractClient {
    options;
    static async deploy(
    /** Constructor/Initialization Args for the contract's `__constructor` method */
    { admin, guardian, tw_fee }, 
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options) {
        return ContractClient.deploy({ admin, guardian, tw_fee }, options);
    }
    constructor(options) {
        super(new ContractSpec(["AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAACQAAABRgYnV5ZXJfYnBzYCA+IDEwMDAwLgAAAApJbnZhbGlkQnBzAAAAAAABAAAAHkVsIGVzY3JvdyBubyBlc3TDoSBlbiBkaXNwdXRhLgAAAAAADE5vdEluRGlzcHV0ZQAAAAIAAAA3cHBfZ3VhcmRpYW4gbm8gdGllbmUgY29tcHJhIHJlZ2lzdHJhZGEgcGFyYSBlc2UgZXNjcm93LgAAAAAQUHVyY2hhc2VOb3RGb3VuZAAAAAMAAAA4YHJvbGVzLmRpc3B1dGVfcmVzb2x2ZXJgIGRlbCBlc2Nyb3cgbm8gZXMgZXN0ZSBjb250cmF0by4AAAASTm90RGlzcHV0ZVJlc29sdmVyAAAAAAAEAAAAJ0VsIGVzY3JvdyBubyB0aWVuZSBzYWxkbyBwYXJhIHJlcGFydGlyLgAAAAALRW1wdHlFc2Nyb3cAAAAABQAAAD5gUHVyY2hhc2Uuc2VsbGVyYCBubyBjb2luY2lkZSBjb24gYHJvbGVzLnJlY2VpdmVyYCBkZWwgZXNjcm93LgAAAAAADlNlbGxlck1pc21hdGNoAAAAAAAGAAAAMGByZWZ1bmRfdW5zaGlwcGVkYCBhbnRlcyBkZWwgcGxhem8gZGUgbGEgY29tcHJhLgAAABJEZWFkbGluZU5vdFJlYWNoZWQAAAAAAAcAAAAvYHJlZnVuZF91bnNoaXBwZWRgIGNvbiBlbCBoaXRvIHlhIGVuICJlbnZpYWRvIi4AAAAADkFscmVhZHlTaGlwcGVkAAAAAAAIAAAALUNvbXByYWRvciB5IHZlbmRlZG9yIHNvbiBsYSBtaXNtYSBkaXJlY2Npw7NuLgAAAAAAAA1CdXllcklzU2VsbGVyAAAAAAAACQ==",
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
            "AAAAAAAAAPtEZXZ1ZWx2ZSBlbCAxMDAlIGRlbCBzYWxkbyBhbCBjb21wcmFkb3Igc2luIGludGVydmVuY2nDs24gZGVsIGFkbWluCihubyByZXF1aWVyZSBhdXRoKSBzaTogZWwgZXNjcm93IGVzdMOhIGVuIGRpc3B1dGEsIHZlbmNpw7MgZWwgcGxhem8gZGUKZGVzcGFjaG8gKGBmdW5kZWRfYXQgKyBzaGlwX3NlY3NgKSB5IGVsIHZlbmRlZG9yIG51bmNhIHJlZ2lzdHLDsyBlbCBlbnbDrW8KZW4gcHBfZ3VhcmRpYW4gKGBzaGlwcGVkX2F0YCB2YWPDrW8pLgAAAAAQcmVmdW5kX3Vuc2hpcHBlZAAAAAEAAAAAAAAABmVzY3JvdwAAAAAAEwAAAAEAAAPpAAAH0AAAAAVTcGxpdAAAAAAAAAM="]), options);
        this.options = options;
    }
    fromJSON = {
        quote: (this.txFromJSON),
        config: (this.txFromJSON),
        resolve: (this.txFromJSON),
        set_admin: (this.txFromJSON),
        refund_unshipped: (this.txFromJSON)
    };
}
