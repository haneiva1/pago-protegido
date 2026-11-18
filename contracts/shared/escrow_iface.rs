// Tipos e interfaz mínima del escrow single-release de Trustless Work.
//
// Copiados campo por campo de `contracts/escrow/src/storage/types.rs` y de las
// firmas de `contracts/escrow/src/contract.rs` del repo
// Trustless-Work/Trustless-Work-Smart-Escrow, rama single-release-develop,
// commit f0b706e. Un `#[contracttype]` struct se codifica como un ScMap con
// los nombres de campo como claves, así que estos tipos son compatibles byte a
// byte con los del escrow real.
//
// Este archivo se incluye con `include!` dentro de un módulo en pp_guardian y
// en pp_arbiter (en vez de un crate compartido) para que los tipos queden
// exportados en el spec de cada contrato y los bindings TypeScript los tengan.

use soroban_sdk::{contractclient, contracttype, Address, Env, Map, String, Vec};

/// Estado completo de un escrow single-release (igual a `Escrow` de TW).
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Escrow {
    pub engagement_id: String,
    pub title: String,
    pub roles: Roles,
    pub description: String,
    pub amount: i128,
    pub platform_fee: u32,
    pub milestones: Vec<Milestone>,
    pub flags: Flags,
    pub trustline: Trustline,
    pub receiver_memo: u32,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Milestone {
    pub description: String,
    pub status: String,
    pub evidence: String,
    pub approved: bool,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Roles {
    pub approver: Address,
    pub service_provider: Address,
    pub platform: Address,
    pub release_signer: Address,
    pub dispute_resolver: Address,
    pub receiver: Address,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Flags {
    pub disputed: bool,
    pub released: bool,
    pub resolved: bool,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Trustline {
    pub address: Address,
}

/// Compra registrada por `pp_guardian` (v2) para un escrow. Tiempos en
/// segundos (timestamp del ledger).
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Purchase {
    /// Quien fondeó el escrow a través del guardián.
    pub buyer: Address,
    /// `roles.receiver` del escrow en el momento del fondeo.
    pub seller: Address,
    /// Monto fondeado (= `escrow.amount`).
    pub amount: i128,
    pub funded_at: u64,
    /// Plazo máximo para despachar, firmado por el comprador al fondear.
    pub ship_secs: u64,
    /// Ventana de revisión después del envío, firmada por el comprador.
    pub inspect_secs: u64,
    /// `funded_at + ship_secs`: después de esto ya no se puede `mark_shipped`
    /// y, con disputa, procede `refund_unshipped`.
    pub ship_deadline: u64,
    /// Momento de `mark_shipped` (una sola vez).
    pub shipped_at: Option<u64>,
    /// `shipped_at + inspect_secs` (+ `inspect_secs` si el comprador extendió).
    /// Desde aquí procede `auto_release`.
    pub release_at: Option<u64>,
    /// `extend` ya se usó.
    pub extended: bool,
    /// Evidencia de envío registrada por el guardián (inmutable, TW-3).
    pub evidence: Option<String>,
}

/// Solo las funciones del escrow que usan pp_guardian y pp_arbiter.
/// Si el escrow devuelve un error, la invocación completa se revierte.
/// No incluye `withdraw_remaining_funds` (TW-5) ni `update_escrow`.
#[allow(dead_code)]
#[contractclient(name = "EscrowClient")]
pub trait EscrowInterface {
    fn get_escrow(e: Env) -> Escrow;
    fn fund_escrow(e: Env, signer: Address, expected_escrow: Escrow, amount: i128);
    fn change_milestone_status(
        e: Env,
        milestone_index: u32,
        new_status: String,
        new_evidence: Option<String>,
        service_provider: Address,
    );
    fn approve_milestone(e: Env, milestone_index: u32, approver: Address);
    fn release_funds(e: Env, release_signer: Address, trustless_work_address: Address);
    fn dispute_escrow(e: Env, signer: Address);
    fn resolve_dispute(
        e: Env,
        dispute_resolver: Address,
        trustless_work_address: Address,
        distributions: Map<Address, i128>,
    );
}

/// Status que `pp_guardian.mark_shipped` escribe en el hito 0 del escrow.
#[allow(dead_code)]
pub const SHIPPED_STATUS: &str = "enviado";
