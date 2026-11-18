//! # pp_guardian
//!
//! Approver y release_signer de los escrows single-release de Trustless Work en
//! el "modo guardián" de Pago Protegido (SPEC.md §2 y §3).
//!
//! - `fund`: el comprador fondea a través del guardián, que antes valida los
//!   roles del escrow y registra la compra (`Purchase`) con su plazo.
//! - `confirm`: el comprador aprueba y libera en la MISMA invocación, así que
//!   nunca existe un estado "aprobado pero no liberado".
//! - `dispute`: solo el comprador o el vendedor registrados.
//! - `auto_release`: sin auth, solo si venció el plazo, no hay disputa y el
//!   vendedor marcó el hito como "enviado".
//!
//! El guardián nunca recibe fondos y no tiene ninguna función que acepte una
//! dirección de destino: el escrow paga siempre a `roles.receiver` y las
//! comisiones a `roles.platform` y a `tw_fee` (fijado en el constructor).
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Env,
};

mod escrow_iface {
    include!("../../shared/escrow_iface.rs");
}
pub use escrow_iface::{
    is_shipped, Escrow, EscrowClient, Flags, Milestone, Purchase, Roles, Trustline,
    SHIPPED_STATUS,
};

const DAY_IN_LEDGERS: u32 = 17_280;
const INSTANCE_BUMP: u32 = 30 * DAY_IN_LEDGERS;
const INSTANCE_THRESHOLD: u32 = INSTANCE_BUMP - DAY_IN_LEDGERS;
// Una compra vive como máximo `max_window_secs` (30 días en testnet) más el
// tiempo de una disputa; 120 días de TTL cubren eso con margen.
const PURCHASE_BUMP: u32 = 120 * DAY_IN_LEDGERS;
const PURCHASE_THRESHOLD: u32 = PURCHASE_BUMP - 30 * DAY_IN_LEDGERS;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// Constructor: `min_window_secs` debe ser > 0 y ≤ `max_window_secs`.
    InvalidWindowConfig = 1,
    /// `set_arbiter` solo se puede llamar una vez.
    ArbiterAlreadySet = 2,
    /// `fund` exige que el admin ya haya configurado el árbitro.
    ArbiterNotSet = 3,
    /// `window_secs` fuera de [min_window_secs, max_window_secs].
    WindowOutOfRange = 4,
    /// Ya hay una compra registrada para ese escrow.
    PurchaseAlreadyExists = 5,
    /// No hay compra registrada para ese escrow.
    PurchaseNotFound = 6,
    /// Solo el comprador registrado puede confirmar.
    NotBuyer = 7,
    /// Solo el comprador o el vendedor registrados pueden abrir disputa.
    NotBuyerOrSeller = 8,
    /// `roles.approver` del escrow no es este guardián.
    ApproverNotGuardian = 9,
    /// `roles.release_signer` del escrow no es este guardián.
    ReleaseSignerNotGuardian = 10,
    /// `roles.dispute_resolver` del escrow no es el pp_arbiter configurado.
    DisputeResolverNotArbiter = 11,
    /// El escrow debe tener exactamente un hito.
    NotSingleMilestone = 12,
    /// `amount` debe ser igual a `escrow.amount`.
    AmountMismatch = 13,
    /// El escrow tiene flags activos o el hito ya está aprobado.
    EscrowNotPristine = 14,
    /// El escrow ya tiene saldo antes del fondeo.
    EscrowAlreadyFunded = 15,
    /// `expected_escrow` no coincide con el escrow guardado.
    EscrowMismatch = 16,
    /// El comprador no puede ser el receiver del escrow.
    BuyerIsSeller = 17,
    /// `roles.service_provider` debe ser igual a `roles.receiver` (el vendedor).
    ServiceProviderNotReceiver = 18,
    /// `auto_release` antes del plazo.
    DeadlineNotReached = 19,
    /// El escrow está en disputa.
    EscrowDisputed = 20,
    /// El escrow ya se liberó.
    EscrowAlreadyReleased = 21,
    /// La disputa del escrow ya se resolvió.
    EscrowAlreadyResolved = 22,
    /// `auto_release` exige que el hito 0 esté en "enviado".
    NotShipped = 23,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GuardianConfig {
    pub admin: Address,
    pub tw_fee: Address,
    pub min_window_secs: u64,
    pub max_window_secs: u64,
    /// pp_arbiter que debe figurar como `dispute_resolver`. `None` hasta que el
    /// admin llame `set_arbiter` (una sola vez).
    pub arbiter: Option<Address>,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    TwFee,
    MinWindow,
    MaxWindow,
    Arbiter,
    Purchase(Address),
}

#[contractevent(topics = ["pp_arbiter_set"])]
pub struct ArbiterSet {
    pub arbiter: Address,
}

#[contractevent(topics = ["pp_funded"])]
pub struct Funded {
    #[topic]
    pub escrow: Address,
    pub buyer: Address,
    pub seller: Address,
    pub amount: i128,
    pub deadline: u64,
}

#[contractevent(topics = ["pp_confirmed"])]
pub struct Confirmed {
    #[topic]
    pub escrow: Address,
    pub buyer: Address,
}

#[contractevent(topics = ["pp_disputed"])]
pub struct Disputed {
    #[topic]
    pub escrow: Address,
    pub caller: Address,
}

#[contractevent(topics = ["pp_auto_released"])]
pub struct AutoReleased {
    #[topic]
    pub escrow: Address,
}

#[contract]
pub struct PpGuardian;

#[contractimpl]
impl PpGuardian {
    /// `admin` solo sirve para `set_arbiter` (una vez). `tw_fee` recibe el 0,3%
    /// de Trustless Work en cada liberación.
    pub fn __constructor(
        env: Env,
        admin: Address,
        tw_fee: Address,
        min_window_secs: u64,
        max_window_secs: u64,
    ) -> Result<(), Error> {
        if min_window_secs == 0 || min_window_secs > max_window_secs {
            return Err(Error::InvalidWindowConfig);
        }
        let s = env.storage().instance();
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::TwFee, &tw_fee);
        s.set(&DataKey::MinWindow, &min_window_secs);
        s.set(&DataKey::MaxWindow, &max_window_secs);
        bump_instance(&env);
        Ok(())
    }

    /// Fija el pp_arbiter. Exige auth del admin y solo funciona una vez.
    pub fn set_arbiter(env: Env, arbiter: Address) -> Result<(), Error> {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        if env.storage().instance().has(&DataKey::Arbiter) {
            return Err(Error::ArbiterAlreadySet);
        }
        env.storage().instance().set(&DataKey::Arbiter, &arbiter);
        bump_instance(&env);
        ArbiterSet { arbiter }.publish(&env);
        Ok(())
    }

    /// El comprador fondea `escrow` a través del guardián.
    ///
    /// Valida la ventana y los roles del modo guardián, registra la compra y
    /// llama `escrow.fund_escrow(buyer, expected_escrow, amount)`. El árbol de
    /// auth que firma el comprador es: `fund` → `fund_escrow` → `transfer`.
    pub fn fund(
        env: Env,
        escrow: Address,
        buyer: Address,
        expected_escrow: Escrow,
        amount: i128,
        window_secs: u64,
    ) -> Result<Purchase, Error> {
        buyer.require_auth();
        bump_instance(&env);

        let min: u64 = env.storage().instance().get(&DataKey::MinWindow).unwrap();
        let max: u64 = env.storage().instance().get(&DataKey::MaxWindow).unwrap();
        if window_secs < min || window_secs > max {
            return Err(Error::WindowOutOfRange);
        }
        let arbiter: Address = env
            .storage()
            .instance()
            .get(&DataKey::Arbiter)
            .ok_or(Error::ArbiterNotSet)?;

        let key = DataKey::Purchase(escrow.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::PurchaseAlreadyExists);
        }

        let client = EscrowClient::new(&env, &escrow);
        let stored = client.get_escrow();
        if stored != expected_escrow {
            return Err(Error::EscrowMismatch);
        }
        let me = env.current_contract_address();
        let roles = &stored.roles;
        if roles.approver != me {
            return Err(Error::ApproverNotGuardian);
        }
        if roles.release_signer != me {
            return Err(Error::ReleaseSignerNotGuardian);
        }
        if roles.dispute_resolver != arbiter {
            return Err(Error::DisputeResolverNotArbiter);
        }
        if roles.service_provider != roles.receiver {
            return Err(Error::ServiceProviderNotReceiver);
        }
        if buyer == roles.receiver {
            return Err(Error::BuyerIsSeller);
        }
        if stored.milestones.len() != 1 {
            return Err(Error::NotSingleMilestone);
        }
        let f = &stored.flags;
        if f.disputed || f.released || f.resolved || stored.milestones.get_unchecked(0).approved {
            return Err(Error::EscrowNotPristine);
        }
        if amount != stored.amount {
            return Err(Error::AmountMismatch);
        }
        if token::TokenClient::new(&env, &stored.trustline.address).balance(&escrow) != 0 {
            return Err(Error::EscrowAlreadyFunded);
        }

        let now = env.ledger().timestamp();
        let purchase = Purchase {
            buyer: buyer.clone(),
            seller: roles.receiver.clone(),
            funded_at: now,
            deadline: now + window_secs,
        };
        env.storage().persistent().set(&key, &purchase);
        env.storage()
            .persistent()
            .extend_ttl(&key, PURCHASE_THRESHOLD, PURCHASE_BUMP);

        client.fund_escrow(&buyer, &expected_escrow, &amount);

        Funded {
            escrow,
            buyer,
            seller: purchase.seller.clone(),
            amount,
            deadline: purchase.deadline,
        }
        .publish(&env);
        Ok(purchase)
    }

    /// "Recibí conforme": aprueba el hito 0 y libera en la misma invocación.
    /// Solo el comprador registrado.
    pub fn confirm(env: Env, escrow: Address, buyer: Address) -> Result<(), Error> {
        buyer.require_auth();
        let purchase = read_purchase(&env, &escrow)?;
        if buyer != purchase.buyer {
            return Err(Error::NotBuyer);
        }
        let client = EscrowClient::new(&env, &escrow);
        check_open(&client.get_escrow())?;
        approve_and_release(&env, &client);
        Confirmed { escrow, buyer }.publish(&env);
        Ok(())
    }

    /// Abre una disputa en el escrow. Solo el comprador o el vendedor
    /// registrados, con su firma.
    pub fn dispute(env: Env, escrow: Address, caller: Address) -> Result<(), Error> {
        let purchase = read_purchase(&env, &escrow)?;
        if caller != purchase.buyer && caller != purchase.seller {
            return Err(Error::NotBuyerOrSeller);
        }
        caller.require_auth();
        let client = EscrowClient::new(&env, &escrow);
        check_open(&client.get_escrow())?;
        client.dispute_escrow(&env.current_contract_address());
        Disputed { escrow, caller }.publish(&env);
        Ok(())
    }

    /// Liberación automática al vendedor. No requiere auth: cualquiera puede
    /// llamarla (p. ej. un cron de la plataforma), pero solo funciona si venció
    /// el plazo, no hay disputa, no está liberado/resuelto y el hito 0 está en
    /// "enviado".
    pub fn auto_release(env: Env, escrow: Address) -> Result<(), Error> {
        let purchase = read_purchase(&env, &escrow)?;
        let client = EscrowClient::new(&env, &escrow);
        let data = client.get_escrow();
        check_open(&data)?;
        if env.ledger().timestamp() < purchase.deadline {
            return Err(Error::DeadlineNotReached);
        }
        if !is_shipped(&env, &data) {
            return Err(Error::NotShipped);
        }
        approve_and_release(&env, &client);
        AutoReleased { escrow }.publish(&env);
        Ok(())
    }

    /// Compra registrada para `escrow`, si existe.
    pub fn purchase(env: Env, escrow: Address) -> Option<Purchase> {
        env.storage().persistent().get(&DataKey::Purchase(escrow))
    }

    /// Configuración del guardián (solo lectura).
    pub fn config(env: Env) -> GuardianConfig {
        let s = env.storage().instance();
        GuardianConfig {
            admin: s.get(&DataKey::Admin).unwrap(),
            tw_fee: s.get(&DataKey::TwFee).unwrap(),
            min_window_secs: s.get(&DataKey::MinWindow).unwrap(),
            max_window_secs: s.get(&DataKey::MaxWindow).unwrap(),
            arbiter: s.get(&DataKey::Arbiter),
        }
    }
}

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);
}

fn read_purchase(env: &Env, escrow: &Address) -> Result<Purchase, Error> {
    bump_instance(env);
    let key = DataKey::Purchase(escrow.clone());
    let p: Purchase = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(Error::PurchaseNotFound)?;
    env.storage()
        .persistent()
        .extend_ttl(&key, PURCHASE_THRESHOLD, PURCHASE_BUMP);
    Ok(p)
}

/// Errores propios (y legibles) antes de delegar en el escrow.
fn check_open(e: &Escrow) -> Result<(), Error> {
    if e.flags.released {
        return Err(Error::EscrowAlreadyReleased);
    }
    if e.flags.resolved {
        return Err(Error::EscrowAlreadyResolved);
    }
    if e.flags.disputed {
        return Err(Error::EscrowDisputed);
    }
    Ok(())
}

/// Aprobar + liberar en la misma invocación. El escrow pide
/// `approver.require_auth()` y `release_signer.require_auth()`; como el
/// guardián es el invocador directo, esas auth se cumplen sin firmas.
fn approve_and_release(env: &Env, client: &EscrowClient) {
    let me = env.current_contract_address();
    let tw_fee: Address = env.storage().instance().get(&DataKey::TwFee).unwrap();
    client.approve_milestone(&0, &me);
    client.release_funds(&me, &tw_fee);
}
