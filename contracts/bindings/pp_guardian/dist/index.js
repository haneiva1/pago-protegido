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
        contractId: "CDKYF7OAJTACP4JNJSGGXDRA3DHE442R26CT5ZE5DJHNSHH7XJUOATOT",
    }
};
export const Errors = {
    /**
     * Constructor: mínimos > 0 y mínimo ≤ máximo en ambas ventanas.
     */
    1: { message: "InvalidWindowConfig" },
    /**
     * `set_arbiter` solo se puede llamar una vez.
     */
    2: { message: "ArbiterAlreadySet" },
    /**
     * `fund` exige que el admin ya haya configurado el árbitro.
     */
    3: { message: "ArbiterNotSet" },
    /**
     * `ship_secs` fuera de [min_ship_secs, max_ship_secs].
     */
    4: { message: "ShipWindowOutOfRange" },
    /**
     * Ya hay una compra registrada para ese escrow.
     */
    5: { message: "PurchaseAlreadyExists" },
    /**
     * No hay compra registrada para ese escrow.
     */
    6: { message: "PurchaseNotFound" },
    /**
     * Solo el comprador registrado (confirm, extend).
     */
    7: { message: "NotBuyer" },
    /**
     * Solo el comprador o el vendedor registrados pueden abrir disputa.
     */
    8: { message: "NotBuyerOrSeller" },
    /**
     * `roles.approver` del escrow no es este guardián.
     */
    9: { message: "ApproverNotGuardian" },
    /**
     * `roles.release_signer` del escrow no es este guardián.
     */
    10: { message: "ReleaseSignerNotGuardian" },
    /**
     * `roles.dispute_resolver` del escrow no es el pp_arbiter configurado.
     */
    11: { message: "DisputeResolverNotArbiter" },
    /**
     * Al fondear, el escrow debe tener exactamente un hito.
     */
    12: { message: "NotSingleMilestone" },
    /**
     * `amount` debe ser igual a `escrow.amount`.
     */
    13: { message: "AmountMismatch" },
    /**
     * El escrow tiene flags activos o el hito ya está aprobado.
     */
    14: { message: "EscrowNotPristine" },
    /**
     * El escrow ya tiene saldo antes del fondeo.
     */
    15: { message: "EscrowAlreadyFunded" },
    /**
     * `expected_escrow` no coincide con el escrow guardado.
     */
    16: { message: "EscrowMismatch" },
    /**
     * El comprador no puede ser el receiver del escrow.
     */
    17: { message: "BuyerIsSeller" },
    /**
     * `roles.service_provider` debe ser igual a `roles.receiver` (el vendedor).
     */
    18: { message: "ServiceProviderNotReceiver" },
    /**
     * `auto_release` antes de `release_at`.
     */
    19: { message: "DeadlineNotReached" },
    /**
     * El escrow de TW está en disputa (la haya abierto quien sea).
     */
    20: { message: "EscrowDisputed" },
    /**
     * El escrow ya se liberó.
     */
    21: { message: "EscrowAlreadyReleased" },
    /**
     * La disputa del escrow ya se resolvió.
     */
    22: { message: "EscrowAlreadyResolved" },
    /**
     * Falta `mark_shipped` (confirm, auto_release, extend).
     */
    23: { message: "NotShipped" },
    /**
     * Solo el vendedor registrado puede `mark_shipped`.
     */
    24: { message: "NotSeller" },
    /**
     * `mark_shipped` solo una vez.
     */
    25: { message: "AlreadyShipped" },
    /**
     * `mark_shipped` después de `ship_deadline`.
     */
    26: { message: "ShipDeadlinePassed" },
    /**
     * `extend` solo una vez.
     */
    27: { message: "AlreadyExtended" },
    /**
     * `extend` después de `release_at`.
     */
    28: { message: "ReleaseWindowClosed" },
    /**
     * Hay un hito con status vacío: TW no permite aprobarlo (#30). Queda la
     * vía de disputa y árbitro.
     */
    29: { message: "MilestoneNotApprovable" },
    /**
     * `inspect_secs` fuera de [min_inspect_secs, max_inspect_secs].
     */
    30: { message: "InspectWindowOutOfRange" },
    /**
     * La evidencia de envío está vacía o supera `MAX_EVIDENCE_LEN`.
     */
    31: { message: "InvalidEvidence" }
};
export class Client extends ContractClient {
    options;
    static async deploy(
    /** Constructor/Initialization Args for the contract's `__constructor` method */
    { admin, tw_fee, min_ship_secs, max_ship_secs, min_inspect_secs, max_inspect_secs }, 
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options) {
        return ContractClient.deploy({ admin, tw_fee, min_ship_secs, max_ship_secs, min_inspect_secs, max_inspect_secs }, options);
    }
    constructor(options) {
        super(new ContractSpec(["AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAAHwAAAEJDb25zdHJ1Y3RvcjogbcOtbmltb3MgPiAwIHkgbcOtbmltbyDiiaQgbcOheGltbyBlbiBhbWJhcyB2ZW50YW5hcy4AAAAAABNJbnZhbGlkV2luZG93Q29uZmlnAAAAAAEAAAArYHNldF9hcmJpdGVyYCBzb2xvIHNlIHB1ZWRlIGxsYW1hciB1bmEgdmV6LgAAAAARQXJiaXRlckFscmVhZHlTZXQAAAAAAAACAAAAOmBmdW5kYCBleGlnZSBxdWUgZWwgYWRtaW4geWEgaGF5YSBjb25maWd1cmFkbyBlbCDDoXJiaXRyby4AAAAAAA1BcmJpdGVyTm90U2V0AAAAAAAAAwAAADRgc2hpcF9zZWNzYCBmdWVyYSBkZSBbbWluX3NoaXBfc2VjcywgbWF4X3NoaXBfc2Vjc10uAAAAFFNoaXBXaW5kb3dPdXRPZlJhbmdlAAAABAAAAC1ZYSBoYXkgdW5hIGNvbXByYSByZWdpc3RyYWRhIHBhcmEgZXNlIGVzY3Jvdy4AAAAAAAAVUHVyY2hhc2VBbHJlYWR5RXhpc3RzAAAAAAAABQAAAClObyBoYXkgY29tcHJhIHJlZ2lzdHJhZGEgcGFyYSBlc2UgZXNjcm93LgAAAAAAABBQdXJjaGFzZU5vdEZvdW5kAAAABgAAAC9Tb2xvIGVsIGNvbXByYWRvciByZWdpc3RyYWRvIChjb25maXJtLCBleHRlbmQpLgAAAAAITm90QnV5ZXIAAAAHAAAAQVNvbG8gZWwgY29tcHJhZG9yIG8gZWwgdmVuZGVkb3IgcmVnaXN0cmFkb3MgcHVlZGVuIGFicmlyIGRpc3B1dGEuAAAAAAAAEE5vdEJ1eWVyT3JTZWxsZXIAAAAIAAAAMWByb2xlcy5hcHByb3ZlcmAgZGVsIGVzY3JvdyBubyBlcyBlc3RlIGd1YXJkacOhbi4AAAAAAAATQXBwcm92ZXJOb3RHdWFyZGlhbgAAAAAJAAAAN2Byb2xlcy5yZWxlYXNlX3NpZ25lcmAgZGVsIGVzY3JvdyBubyBlcyBlc3RlIGd1YXJkacOhbi4AAAAAGFJlbGVhc2VTaWduZXJOb3RHdWFyZGlhbgAAAAoAAABEYHJvbGVzLmRpc3B1dGVfcmVzb2x2ZXJgIGRlbCBlc2Nyb3cgbm8gZXMgZWwgcHBfYXJiaXRlciBjb25maWd1cmFkby4AAAAZRGlzcHV0ZVJlc29sdmVyTm90QXJiaXRlcgAAAAAAAAsAAAA1QWwgZm9uZGVhciwgZWwgZXNjcm93IGRlYmUgdGVuZXIgZXhhY3RhbWVudGUgdW4gaGl0by4AAAAAAAASTm90U2luZ2xlTWlsZXN0b25lAAAAAAAMAAAAKmBhbW91bnRgIGRlYmUgc2VyIGlndWFsIGEgYGVzY3Jvdy5hbW91bnRgLgAAAAAADkFtb3VudE1pc21hdGNoAAAAAAANAAAAOkVsIGVzY3JvdyB0aWVuZSBmbGFncyBhY3Rpdm9zIG8gZWwgaGl0byB5YSBlc3TDoSBhcHJvYmFkby4AAAAAABFFc2Nyb3dOb3RQcmlzdGluZQAAAAAAAA4AAAAqRWwgZXNjcm93IHlhIHRpZW5lIHNhbGRvIGFudGVzIGRlbCBmb25kZW8uAAAAAAATRXNjcm93QWxyZWFkeUZ1bmRlZAAAAAAPAAAANWBleHBlY3RlZF9lc2Nyb3dgIG5vIGNvaW5jaWRlIGNvbiBlbCBlc2Nyb3cgZ3VhcmRhZG8uAAAAAAAADkVzY3Jvd01pc21hdGNoAAAAAAAQAAAAMUVsIGNvbXByYWRvciBubyBwdWVkZSBzZXIgZWwgcmVjZWl2ZXIgZGVsIGVzY3Jvdy4AAAAAAAANQnV5ZXJJc1NlbGxlcgAAAAAAABEAAABJYHJvbGVzLnNlcnZpY2VfcHJvdmlkZXJgIGRlYmUgc2VyIGlndWFsIGEgYHJvbGVzLnJlY2VpdmVyYCAoZWwgdmVuZGVkb3IpLgAAAAAAABpTZXJ2aWNlUHJvdmlkZXJOb3RSZWNlaXZlcgAAAAAAEgAAACVgYXV0b19yZWxlYXNlYCBhbnRlcyBkZSBgcmVsZWFzZV9hdGAuAAAAAAAAEkRlYWRsaW5lTm90UmVhY2hlZAAAAAAAEwAAAD1FbCBlc2Nyb3cgZGUgVFcgZXN0w6EgZW4gZGlzcHV0YSAobGEgaGF5YSBhYmllcnRvIHF1aWVuIHNlYSkuAAAAAAAADkVzY3Jvd0Rpc3B1dGVkAAAAAAAUAAAAGEVsIGVzY3JvdyB5YSBzZSBsaWJlcsOzLgAAABVFc2Nyb3dBbHJlYWR5UmVsZWFzZWQAAAAAAAAVAAAAJkxhIGRpc3B1dGEgZGVsIGVzY3JvdyB5YSBzZSByZXNvbHZpw7MuAAAAAAAVRXNjcm93QWxyZWFkeVJlc29sdmVkAAAAAAAAFgAAADVGYWx0YSBgbWFya19zaGlwcGVkYCAoY29uZmlybSwgYXV0b19yZWxlYXNlLCBleHRlbmQpLgAAAAAAAApOb3RTaGlwcGVkAAAAAAAXAAAAMVNvbG8gZWwgdmVuZGVkb3IgcmVnaXN0cmFkbyBwdWVkZSBgbWFya19zaGlwcGVkYC4AAAAAAAAJTm90U2VsbGVyAAAAAAAAGAAAABxgbWFya19zaGlwcGVkYCBzb2xvIHVuYSB2ZXouAAAADkFscmVhZHlTaGlwcGVkAAAAAAAZAAAAK2BtYXJrX3NoaXBwZWRgIGRlc3B1w6lzIGRlIGBzaGlwX2RlYWRsaW5lYC4AAAAAElNoaXBEZWFkbGluZVBhc3NlZAAAAAAAGgAAABZgZXh0ZW5kYCBzb2xvIHVuYSB2ZXouAAAAAAAPQWxyZWFkeUV4dGVuZGVkAAAAABsAAAAiYGV4dGVuZGAgZGVzcHXDqXMgZGUgYHJlbGVhc2VfYXRgLgAAAAAAE1JlbGVhc2VXaW5kb3dDbG9zZWQAAAAAHAAAAGJIYXkgdW4gaGl0byBjb24gc3RhdHVzIHZhY8OtbzogVFcgbm8gcGVybWl0ZSBhcHJvYmFybG8gKCMzMCkuIFF1ZWRhIGxhCnbDrWEgZGUgZGlzcHV0YSB5IMOhcmJpdHJvLgAAAAAAFk1pbGVzdG9uZU5vdEFwcHJvdmFibGUAAAAAAB0AAAA9YGluc3BlY3Rfc2Vjc2AgZnVlcmEgZGUgW21pbl9pbnNwZWN0X3NlY3MsIG1heF9pbnNwZWN0X3NlY3NdLgAAAAAAABdJbnNwZWN0V2luZG93T3V0T2ZSYW5nZQAAAAAeAAAAQExhIGV2aWRlbmNpYSBkZSBlbnbDrW8gZXN0w6EgdmFjw61hIG8gc3VwZXJhIGBNQVhfRVZJREVOQ0VfTEVOYC4AAAAPSW52YWxpZEV2aWRlbmNlAAAAAB8=",
            "AAAABQAAAAAAAAAAAAAABkZ1bmRlZAAAAAAAAQAAAAlwcF9mdW5kZWQAAAAAAAAGAAAAAAAAAAZlc2Nyb3cAAAAAABMAAAABAAAAAAAAAAVidXllcgAAAAAAABMAAAAAAAAAAAAAAAZzZWxsZXIAAAAAABMAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAAAAAA1zaGlwX2RlYWRsaW5lAAAAAAAABgAAAAAAAAAAAAAADGluc3BlY3Rfc2VjcwAAAAYAAAAAAAAAAg==",
            "AAAABQAAAAAAAAAAAAAAB1NoaXBwZWQAAAAAAQAAAApwcF9zaGlwcGVkAAAAAAADAAAAAAAAAAZlc2Nyb3cAAAAAABMAAAABAAAAAAAAAAhldmlkZW5jZQAAABAAAAAAAAAAAAAAAApyZWxlYXNlX2F0AAAAAAAGAAAAAAAAAAI=",
            "AAAABQAAAAAAAAAAAAAACERpc3B1dGVkAAAAAQAAAAtwcF9kaXNwdXRlZAAAAAACAAAAAAAAAAZlc2Nyb3cAAAAAABMAAAABAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAAAAAAAg==",
            "AAAABQAAAAAAAAAAAAAACEV4dGVuZGVkAAAAAQAAAAtwcF9leHRlbmRlZAAAAAACAAAAAAAAAAZlc2Nyb3cAAAAAABMAAAABAAAAAAAAAApyZWxlYXNlX2F0AAAAAAAGAAAAAAAAAAI=",
            "AAAABQAAAAAAAAAAAAAACUNvbmZpcm1lZAAAAAAAAAEAAAAMcHBfY29uZmlybWVkAAAAAgAAAAAAAAAGZXNjcm93AAAAAAATAAAAAQAAAAAAAAAFYnV5ZXIAAAAAAAATAAAAAAAAAAI=",
            "AAAABQAAAAAAAAAAAAAACkFyYml0ZXJTZXQAAAAAAAEAAAAOcHBfYXJiaXRlcl9zZXQAAAAAAAEAAAAAAAAAB2FyYml0ZXIAAAAAEwAAAAAAAAAC",
            "AAAABQAAAAAAAAAAAAAADEF1dG9SZWxlYXNlZAAAAAEAAAAQcHBfYXV0b19yZWxlYXNlZAAAAAEAAAAAAAAABmVzY3JvdwAAAAAAEwAAAAEAAAAC",
            "AAAAAQAAAAAAAAAAAAAADkd1YXJkaWFuQ29uZmlnAAAAAAAHAAAAAAAAAAVhZG1pbgAAAAAAABMAAABycHBfYXJiaXRlciBxdWUgZGViZSBmaWd1cmFyIGNvbW8gYGRpc3B1dGVfcmVzb2x2ZXJgLiBgTm9uZWAgaGFzdGEgcXVlIGVsCmFkbWluIGxsYW1lIGBzZXRfYXJiaXRlcmAgKHVuYSBzb2xhIHZleikuAAAAAAAHYXJiaXRlcgAAAAPoAAAAEwAAAAAAAAAQbWF4X2luc3BlY3Rfc2VjcwAAAAYAAAAAAAAADW1heF9zaGlwX3NlY3MAAAAAAAAGAAAAAAAAABBtaW5faW5zcGVjdF9zZWNzAAAABgAAAAAAAAANbWluX3NoaXBfc2VjcwAAAAAAAAYAAAAAAAAABnR3X2ZlZQAAAAAAEw==",
            "AAAAAQAAAAAAAAAAAAAABUZsYWdzAAAAAAAAAwAAAAAAAAAIZGlzcHV0ZWQAAAABAAAAAAAAAAhyZWxlYXNlZAAAAAEAAAAAAAAACHJlc29sdmVkAAAAAQ==",
            "AAAAAQAAAAAAAAAAAAAABVJvbGVzAAAAAAAABgAAAAAAAAAIYXBwcm92ZXIAAAATAAAAAAAAABBkaXNwdXRlX3Jlc29sdmVyAAAAEwAAAAAAAAAIcGxhdGZvcm0AAAATAAAAAAAAAAhyZWNlaXZlcgAAABMAAAAAAAAADnJlbGVhc2Vfc2lnbmVyAAAAAAATAAAAAAAAABBzZXJ2aWNlX3Byb3ZpZGVyAAAAEw==",
            "AAAAAQAAAEVFc3RhZG8gY29tcGxldG8gZGUgdW4gZXNjcm93IHNpbmdsZS1yZWxlYXNlIChpZ3VhbCBhIGBFc2Nyb3dgIGRlIFRXKS4AAAAAAAAAAAAABkVzY3JvdwAAAAAACgAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAtkZXNjcmlwdGlvbgAAAAAQAAAAAAAAAA1lbmdhZ2VtZW50X2lkAAAAAAAAEAAAAAAAAAAFZmxhZ3MAAAAAAAfQAAAABUZsYWdzAAAAAAAAAAAAAAptaWxlc3RvbmVzAAAAAAPqAAAH0AAAAAlNaWxlc3RvbmUAAAAAAAAAAAAADHBsYXRmb3JtX2ZlZQAAAAQAAAAAAAAADXJlY2VpdmVyX21lbW8AAAAAAAAEAAAAAAAAAAVyb2xlcwAAAAAAB9AAAAAFUm9sZXMAAAAAAAAAAAAABXRpdGxlAAAAAAAAEAAAAAAAAAAJdHJ1c3RsaW5lAAAAAAAH0AAAAAlUcnVzdGxpbmUAAAA=",
            "AAAAAQAAAGRDb21wcmEgcmVnaXN0cmFkYSBwb3IgYHBwX2d1YXJkaWFuYCAodjIpIHBhcmEgdW4gZXNjcm93LiBUaWVtcG9zIGVuCnNlZ3VuZG9zICh0aW1lc3RhbXAgZGVsIGxlZGdlcikuAAAAAAAAAAhQdXJjaGFzZQAAAAsAAAAjTW9udG8gZm9uZGVhZG8gKD0gYGVzY3Jvdy5hbW91bnRgKS4AAAAABmFtb3VudAAAAAAACwAAADBRdWllbiBmb25kZcOzIGVsIGVzY3JvdyBhIHRyYXbDqXMgZGVsIGd1YXJkacOhbi4AAAAFYnV5ZXIAAAAAAAATAAAAQkV2aWRlbmNpYSBkZSBlbnbDrW8gcmVnaXN0cmFkYSBwb3IgZWwgZ3VhcmRpw6FuIChpbm11dGFibGUsIFRXLTMpLgAAAAAACGV2aWRlbmNlAAAD6AAAABAAAAAUYGV4dGVuZGAgeWEgc2UgdXPDsy4AAAAIZXh0ZW5kZWQAAAABAAAAAAAAAAlmdW5kZWRfYXQAAAAAAAAGAAAAQ1ZlbnRhbmEgZGUgcmV2aXNpw7NuIGRlc3B1w6lzIGRlbCBlbnbDrW8sIGZpcm1hZGEgcG9yIGVsIGNvbXByYWRvci4AAAAADGluc3BlY3Rfc2VjcwAAAAYAAABtYHNoaXBwZWRfYXQgKyBpbnNwZWN0X3NlY3NgICgrIGBpbnNwZWN0X3NlY3NgIHNpIGVsIGNvbXByYWRvciBleHRlbmRpw7MpLgpEZXNkZSBhcXXDrSBwcm9jZWRlIGBhdXRvX3JlbGVhc2VgLgAAAAAAAApyZWxlYXNlX2F0AAAAAAPoAAAABgAAADVgcm9sZXMucmVjZWl2ZXJgIGRlbCBlc2Nyb3cgZW4gZWwgbW9tZW50byBkZWwgZm9uZGVvLgAAAAAAAAZzZWxsZXIAAAAAABMAAABzYGZ1bmRlZF9hdCArIHNoaXBfc2Vjc2A6IGRlc3B1w6lzIGRlIGVzdG8geWEgbm8gc2UgcHVlZGUgYG1hcmtfc2hpcHBlZGAKeSwgY29uIGRpc3B1dGEsIHByb2NlZGUgYHJlZnVuZF91bnNoaXBwZWRgLgAAAAANc2hpcF9kZWFkbGluZQAAAAAAAAYAAABCUGxhem8gbcOheGltbyBwYXJhIGRlc3BhY2hhciwgZmlybWFkbyBwb3IgZWwgY29tcHJhZG9yIGFsIGZvbmRlYXIuAAAAAAAJc2hpcF9zZWNzAAAAAAAABgAAAClNb21lbnRvIGRlIGBtYXJrX3NoaXBwZWRgICh1bmEgc29sYSB2ZXopLgAAAAAAAApzaGlwcGVkX2F0AAAAAAPoAAAABg==",
            "AAAAAQAAAAAAAAAAAAAACU1pbGVzdG9uZQAAAAAAAAQAAAAAAAAACGFwcHJvdmVkAAAAAQAAAAAAAAALZGVzY3JpcHRpb24AAAAAEAAAAAAAAAAIZXZpZGVuY2UAAAAQAAAAAAAAAAZzdGF0dXMAAAAAABA=",
            "AAAAAQAAAAAAAAAAAAAACVRydXN0bGluZQAAAAAAAAEAAAAAAAAAB2FkZHJlc3MAAAAAEw==",
            "AAAAAAAAAI9FbCBjb21wcmFkb3IgZm9uZGVhIGBlc2Nyb3dgIGEgdHJhdsOpcyBkZWwgZ3VhcmRpw6FuIHkgZmlybWEgbG9zIHBsYXpvcy4Kw4FyYm9sIGRlIGF1dGggZGVsIGNvbXByYWRvcjogYGZ1bmRgIOKGkiBgZnVuZF9lc2Nyb3dgIOKGkiBgdHJhbnNmZXJgLgAAAAAEZnVuZAAAAAYAAAAAAAAABmVzY3JvdwAAAAAAEwAAAAAAAAAFYnV5ZXIAAAAAAAATAAAAAAAAAA9leHBlY3RlZF9lc2Nyb3cAAAAH0AAAAAZFc2Nyb3cAAAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAlzaGlwX3NlY3MAAAAAAAAGAAAAAAAAAAxpbnNwZWN0X3NlY3MAAAAGAAAAAQAAA+kAAAfQAAAACFB1cmNoYXNlAAAAAw==",
            "AAAAAAAAACxDb25maWd1cmFjacOzbiBkZWwgZ3VhcmRpw6FuIChzb2xvIGxlY3R1cmEpLgAAAAZjb25maWcAAAAAAAAAAAABAAAH0AAAAA5HdWFyZGlhbkNvbmZpZwAA",
            "AAAAAAAAAHhFbCBjb21wcmFkb3IgYWxhcmdhIHVuYSB2ZXogbGEgdmVudGFuYSBkZSByZXZpc2nDs24gKGByZWxlYXNlX2F0ICs9Cmluc3BlY3Rfc2Vjc2ApLCBhbnRlcyBkZSBgcmVsZWFzZV9hdGAgeSBzaW4gZGlzcHV0YS4AAAAGZXh0ZW5kAAAAAAACAAAAAAAAAAZlc2Nyb3cAAAAAABMAAAAAAAAABWJ1eWVyAAAAAAAAEwAAAAEAAAPpAAAH0AAAAAhQdXJjaGFzZQAAAAM=",
            "AAAAAAAAAHgiUmVjaWLDrSBjb25mb3JtZSI6IGV4aWdlIGVudsOtbyByZWdpc3RyYWRvOyBhcHJ1ZWJhIFRPRE9TIGxvcyBoaXRvcwpwZW5kaWVudGVzIChUVy0yKSB5IGxpYmVyYSBlbiBsYSBtaXNtYSBpbnZvY2FjacOzbi4AAAAHY29uZmlybQAAAAACAAAAAAAAAAZlc2Nyb3cAAAAAABMAAAAAAAAABWJ1eWVyAAAAAAAAEwAAAAEAAAPpAAAAAgAAAAM=",
            "AAAAAAAAAFlBYnJlIHVuYSBkaXNwdXRhIGVuIGVsIGVzY3Jvdy4gU29sbyBlbCBjb21wcmFkb3IgbyBlbCB2ZW5kZWRvcgpyZWdpc3RyYWRvcywgY29uIHN1IGZpcm1hLgAAAAAAAAdkaXNwdXRlAAAAAAIAAAAAAAAABmVzY3JvdwAAAAAAEwAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAQAAA+kAAAACAAAAAw==",
            "AAAAAAAAADpDb21wcmEgcmVnaXN0cmFkYSBwYXJhIGBlc2Nyb3dgLCBzaSBleGlzdGUgKHNvbG8gbGVjdHVyYSkuAAAAAAAIcHVyY2hhc2UAAAABAAAAAAAAAAZlc2Nyb3cAAAAAABMAAAABAAAD6AAAB9AAAAAIUHVyY2hhc2U=",
            "AAAAAAAAAEFGaWphIGVsIHBwX2FyYml0ZXIuIEV4aWdlIGF1dGggZGVsIGFkbWluIHkgc29sbyBmdW5jaW9uYSB1bmEgdmV6LgAAAAAAAAtzZXRfYXJiaXRlcgAAAAABAAAAAAAAAAdhcmJpdGVyAAAAABMAAAABAAAD6QAAAAIAAAAD",
            "AAAAAAAAANdMaWJlcmFjacOzbiBhdXRvbcOhdGljYSBhbCB2ZW5kZWRvci4gU2luIGF1dGggKGxhIHB1ZWRlIGRpc3BhcmFyIHVuIGNyb24pLApzb2xvIGNvbiBlbnbDrW8gcmVnaXN0cmFkbywgYG5vdyA+PSByZWxlYXNlX2F0YCB5IGVsIGVzY3JvdyBkZSBUVyBzaW4KZGlzcHV0YSwgc2luIGxpYmVyYXIgeSBzaW4gcmVzb2x2ZXIuIEFwcnVlYmEgdG9kb3MgbG9zIGhpdG9zIHkgbGliZXJhLgAAAAAMYXV0b19yZWxlYXNlAAAAAQAAAAAAAAAGZXNjcm93AAAAAAATAAAAAQAAA+kAAAACAAAAAw==",
            "AAAAAAAAAQxFbCB2ZW5kZWRvciByZWdpc3RyYSBlbCBlbnbDrW8gY29uIGV2aWRlbmNpYSAoY8OzZGlnbyBkZSBlbmNvbWllbmRhLCBVUkwgZGUKZm90byBvICJlbnRyZWdhZG8gZW4gcGVyc29uYSIpLiBVbmEgc29sYSB2ZXogeSBhbnRlcyBkZSBgc2hpcF9kZWFkbGluZWAuCkVzY3JpYmUgImVudmlhZG8iICsgZXZpZGVuY2lhIGVuIGVsIGhpdG8gMCBkZSBUVyAoYXV0aCBhbmlkYWRhIGRlbAp2ZW5kZWRvciBjb21vIHNlcnZpY2VfcHJvdmlkZXIpIHkgZmlqYSBgcmVsZWFzZV9hdGAuAAAADG1hcmtfc2hpcHBlZAAAAAMAAAAAAAAABmVzY3JvdwAAAAAAEwAAAAAAAAAGc2VsbGVyAAAAAAATAAAAAAAAAAhldmlkZW5jZQAAABAAAAABAAAD6QAAB9AAAAAIUHVyY2hhc2UAAAAD",
            "AAAAAAAAAIVgYWRtaW5gIHNvbG8gc2lydmUgcGFyYSBgc2V0X2FyYml0ZXJgICh1bmEgdmV6KS4gYHR3X2ZlZWAgcmVjaWJlIGVsIDAsMyUKZGUgVHJ1c3RsZXNzIFdvcmsgZW4gY2FkYSBsaWJlcmFjacOzbi4gVmVudGFuYXMgZW4gc2VndW5kb3MuAAAAAAAADV9fY29uc3RydWN0b3IAAAAAAAAGAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAABnR3X2ZlZQAAAAAAEwAAAAAAAAANbWluX3NoaXBfc2VjcwAAAAAAAAYAAAAAAAAADW1heF9zaGlwX3NlY3MAAAAAAAAGAAAAAAAAABBtaW5faW5zcGVjdF9zZWNzAAAABgAAAAAAAAAQbWF4X2luc3BlY3Rfc2VjcwAAAAYAAAABAAAD6QAAAAIAAAAD"]), options);
        this.options = options;
    }
    fromJSON = {
        fund: (this.txFromJSON),
        config: (this.txFromJSON),
        extend: (this.txFromJSON),
        confirm: (this.txFromJSON),
        dispute: (this.txFromJSON),
        purchase: (this.txFromJSON),
        set_arbiter: (this.txFromJSON),
        auto_release: (this.txFromJSON),
        mark_shipped: (this.txFromJSON)
    };
}
