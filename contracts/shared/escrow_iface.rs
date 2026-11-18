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

/// Compra registrada por `pp_guardian` para un escrow.
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Purchase {
    /// Quien fondeó el escrow a través del guardián.
    pub buyer: Address,
    /// `roles.receiver` del escrow en el momento del fondeo.
    pub seller: Address,
    /// Timestamp del ledger (segundos) en que se fondeó.
    pub funded_at: u64,
    /// `funded_at + window_secs`: desde aquí se puede llamar `auto_release`.
    pub deadline: u64,
}

/// Solo las funciones del escrow que usan pp_guardian y pp_arbiter.
/// Si el escrow devuelve un error, la invocación completa se revierte.
#[allow(dead_code)]
#[contractclient(name = "EscrowClient")]
pub trait EscrowInterface {
    fn get_escrow(e: Env) -> Escrow;
    fn fund_escrow(e: Env, signer: Address, expected_escrow: Escrow, amount: i128);
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

/// Estado del hito que habilita `auto_release` (lo escribe el vendedor con
/// `change_milestone_status`).
pub const SHIPPED_STATUS: &str = "enviado";

pub fn is_shipped(env: &Env, escrow: &Escrow) -> bool {
    match escrow.milestones.get(0) {
        Some(m) => m.status == String::from_str(env, SHIPPED_STATUS),
        None => false,
    }
}
