//! # pp_arbiter
//!
//! `dispute_resolver` de los escrows de Pago Protegido (SPEC.md §3). Es un
//! árbitro ACOTADO: solo puede repartir el saldo del escrow entre el comprador
//! registrado en pp_guardian y `roles.receiver` (el vendedor).
//!
//! Ninguna función pública acepta una dirección de destino ni un mapa de
//! distribuciones: el admin solo elige `buyer_bps` (0..=10000). Como el escrow
//! exige `dispute_resolver.require_auth()` y el dispute_resolver es este
//! contrato, nadie (ni el admin, ni la plataforma) puede llamar
//! `resolve_dispute` del escrow por fuera de este código.
//!
//! v2: `refund_unshipped` usa el plazo de despacho firmado por el comprador
//! (`funded_at + ship_secs`) y el envío registrado en pp_guardian. Este
//! contrato NO es actualizable (no hay `update_current_contract_wasm`) y no
//! tiene ninguna ruta a `withdraw_remaining_funds` de TW (TW-5).
#![no_std]

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype, token,
    Address, Env, Map,
};

mod escrow_iface {
    include!("../../shared/escrow_iface.rs");
}
pub use escrow_iface::{Escrow, EscrowClient, Flags, Milestone, Purchase, Roles, Trustline};

/// 100% en puntos básicos.
pub const BPS_DENOMINATOR: u32 = 10_000;

const DAY_IN_LEDGERS: u32 = 17_280;
const INSTANCE_BUMP: u32 = 30 * DAY_IN_LEDGERS;
const INSTANCE_THRESHOLD: u32 = INSTANCE_BUMP - DAY_IN_LEDGERS;

/// Lo único que el árbitro necesita del guardián.
#[allow(dead_code)]
#[contractclient(name = "GuardianClient")]
pub trait GuardianInterface {
    fn purchase(env: Env, escrow: Address) -> Option<Purchase>;
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// `buyer_bps` > 10000.
    InvalidBps = 1,
    /// El escrow no está en disputa.
    NotInDispute = 2,
    /// pp_guardian no tiene compra registrada para ese escrow.
    PurchaseNotFound = 3,
    /// `roles.dispute_resolver` del escrow no es este contrato.
    NotDisputeResolver = 4,
    /// El escrow no tiene saldo para repartir.
    EmptyEscrow = 5,
    /// `Purchase.seller` no coincide con `roles.receiver` del escrow.
    SellerMismatch = 6,
    /// `refund_unshipped` antes del plazo de la compra.
    DeadlineNotReached = 7,
    /// `refund_unshipped` con el hito ya en "enviado".
    AlreadyShipped = 8,
    /// Comprador y vendedor son la misma dirección.
    BuyerIsSeller = 9,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ArbiterConfig {
    pub admin: Address,
    pub guardian: Address,
    pub tw_fee: Address,
}

/// Reparto bruto del saldo del escrow (antes de las comisiones que descuenta
/// Trustless Work). `buyer_amount + seller_amount == balance` siempre.
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Split {
    pub buyer: Address,
    pub seller: Address,
    pub balance: i128,
    pub buyer_amount: i128,
    pub seller_amount: i128,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Guardian,
    TwFee,
}

#[contractevent(topics = ["pp_resolved"])]
pub struct Resolved {
    #[topic]
    pub escrow: Address,
    pub buyer_bps: u32,
    pub buyer_amount: i128,
    pub seller_amount: i128,
}

#[contractevent(topics = ["pp_refunded_unshipped"])]
pub struct RefundedUnshipped {
    #[topic]
    pub escrow: Address,
    pub buyer_amount: i128,
}

#[contractevent(topics = ["pp_admin_changed"])]
pub struct AdminChanged {
    pub old_admin: Address,
    pub new_admin: Address,
}

#[contract]
pub struct PpArbiter;

#[contractimpl]
impl PpArbiter {
    pub fn __constructor(env: Env, admin: Address, guardian: Address, tw_fee: Address) {
        let s = env.storage().instance();
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::Guardian, &guardian);
        s.set(&DataKey::TwFee, &tw_fee);
        bump_instance(&env);
    }

    /// Resuelve la disputa: `buyer_bps` del saldo al comprador y el resto al
    /// vendedor. Solo el admin y solo con el escrow en disputa.
    ///
    /// Redondeo: `seller_amount = floor(balance * (10000 - buyer_bps) / 10000)`
    /// y `buyer_amount = balance - seller_amount`; la unidad sobrante (si la
    /// hay) queda para el comprador, nunca para un tercero.
    pub fn resolve(env: Env, escrow: Address, buyer_bps: u32) -> Result<Split, Error> {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        let ctx = load(&env, &escrow, buyer_bps)?;
        execute(&env, &escrow, &ctx.split);
        Resolved {
            escrow,
            buyer_bps,
            buyer_amount: ctx.split.buyer_amount,
            seller_amount: ctx.split.seller_amount,
        }
        .publish(&env);
        Ok(ctx.split)
    }

    /// Devuelve el 100% del saldo al comprador sin intervención del admin
    /// (no requiere auth) si: el escrow está en disputa, venció el plazo de
    /// despacho (`funded_at + ship_secs`) y el vendedor nunca registró el envío
    /// en pp_guardian (`shipped_at` vacío).
    pub fn refund_unshipped(env: Env, escrow: Address) -> Result<Split, Error> {
        let ctx = load(&env, &escrow, BPS_DENOMINATOR)?;
        if ctx.purchase.shipped_at.is_some() {
            return Err(Error::AlreadyShipped);
        }
        if env.ledger().timestamp() < ctx.purchase.funded_at + ctx.purchase.ship_secs {
            return Err(Error::DeadlineNotReached);
        }
        execute(&env, &escrow, &ctx.split);
        RefundedUnshipped {
            escrow,
            buyer_amount: ctx.split.buyer_amount,
        }
        .publish(&env);
        Ok(ctx.split)
    }

    /// Vista previa del reparto (solo lectura, mismas validaciones que
    /// `resolve` salvo la auth). Útil para el slider del panel del árbitro.
    pub fn quote(env: Env, escrow: Address, buyer_bps: u32) -> Result<Split, Error> {
        Ok(load(&env, &escrow, buyer_bps)?.split)
    }

    /// Cambia el admin. Exige auth del admin actual.
    pub fn set_admin(env: Env, new_admin: Address) {
        let old_admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        old_admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &new_admin);
        bump_instance(&env);
        AdminChanged {
            old_admin,
            new_admin,
        }
        .publish(&env);
    }

    /// Configuración del árbitro (solo lectura).
    pub fn config(env: Env) -> ArbiterConfig {
        let s = env.storage().instance();
        ArbiterConfig {
            admin: s.get(&DataKey::Admin).unwrap(),
            guardian: s.get(&DataKey::Guardian).unwrap(),
            tw_fee: s.get(&DataKey::TwFee).unwrap(),
        }
    }
}

struct Ctx {
    purchase: Purchase,
    split: Split,
}

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);
}

/// Lee escrow + compra, valida y calcula el reparto. Las dos únicas
/// direcciones de destino posibles salen de aquí: `Purchase.buyer` (guardado
/// por pp_guardian) y `roles.receiver` del escrow.
fn load(env: &Env, escrow: &Address, buyer_bps: u32) -> Result<Ctx, Error> {
    bump_instance(env);
    if buyer_bps > BPS_DENOMINATOR {
        return Err(Error::InvalidBps);
    }
    let data = EscrowClient::new(env, escrow).get_escrow();
    if data.roles.dispute_resolver != env.current_contract_address() {
        return Err(Error::NotDisputeResolver);
    }
    if !data.flags.disputed {
        return Err(Error::NotInDispute);
    }
    let guardian: Address = env.storage().instance().get(&DataKey::Guardian).unwrap();
    let purchase = GuardianClient::new(env, &guardian)
        .purchase(escrow)
        .ok_or(Error::PurchaseNotFound)?;
    let seller = data.roles.receiver.clone();
    if purchase.seller != seller {
        return Err(Error::SellerMismatch);
    }
    if purchase.buyer == seller {
        return Err(Error::BuyerIsSeller);
    }
    let balance = token::TokenClient::new(env, &data.trustline.address).balance(escrow);
    if balance <= 0 {
        return Err(Error::EmptyEscrow);
    }
    let seller_amount =
        balance * ((BPS_DENOMINATOR - buyer_bps) as i128) / (BPS_DENOMINATOR as i128);
    let buyer_amount = balance - seller_amount;
    Ok(Ctx {
        split: Split {
            buyer: purchase.buyer.clone(),
            seller,
            balance,
            buyer_amount,
            seller_amount,
        },
        purchase,
    })
}

/// Arma las distribuciones (omitiendo montos 0) y llama `resolve_dispute`.
fn execute(env: &Env, escrow: &Address, split: &Split) {
    let mut distributions: Map<Address, i128> = Map::new(env);
    if split.buyer_amount > 0 {
        distributions.set(split.buyer.clone(), split.buyer_amount);
    }
    if split.seller_amount > 0 {
        distributions.set(split.seller.clone(), split.seller_amount);
    }
    let tw_fee: Address = env.storage().instance().get(&DataKey::TwFee).unwrap();
    EscrowClient::new(env, escrow).resolve_dispute(
        &env.current_contract_address(),
        &tw_fee,
        &distributions,
    );
}
