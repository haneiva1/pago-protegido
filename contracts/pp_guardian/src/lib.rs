//! # pp_guardian (v2)
//!
//! Approver y release_signer de los escrows single-release de Trustless Work en
//! el "modo guardián" de Pago Protegido. v2 incorpora los hallazgos del red
//! team (TW-1, TW-2, TW-3, TW-5; ver docs/SEGURIDAD.md):
//!
//! - `fund`: el comprador fondea a través del guardián y firma DOS plazos: el
//!   plazo máximo para despachar (`ship_secs`) y la ventana de revisión después
//!   del envío (`inspect_secs`).
//! - `mark_shipped`: el envío pasa por el guardián, con la firma del vendedor y
//!   evidencia; queda registrado una sola vez (`shipped_at`, `release_at`).
//! - `confirm`: solo con envío registrado; aprueba TODOS los hitos y libera en
//!   la misma invocación.
//! - `auto_release`: sin auth, solo si `now >= release_at` y el escrow de TW no
//!   está en disputa (aunque la haya abierto `platform` directo, TW-1).
//! - `extend`: el comprador alarga una vez la ventana de revisión.
//! - `dispute`: abre la disputa en TW y, en la misma invocación, hace correr
//!   el plazo máximo del reclamo en pp_arbiter (`start_claim`, H-13).
//!
//! El guardián nunca recibe fondos, no acepta direcciones de destino, no llama
//! `withdraw_remaining_funds` ni `update_escrow`, y NO es actualizable: no hay
//! `update_current_contract_wasm` ni ninguna función que cambie su código.
#![no_std]

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype, token,
    Address, Env, String,
};

mod escrow_iface {
    include!("../../shared/escrow_iface.rs");
}
pub use escrow_iface::{
    Escrow, EscrowClient, Flags, Milestone, Purchase, Roles, Trustline, SHIPPED_STATUS,
};

/// Lo único que el guardián necesita del árbitro (H-13).
#[allow(dead_code)]
#[contractclient(name = "ArbiterClient")]
pub trait ArbiterInterface {
    fn start_claim(env: Env, escrow: Address) -> u64;
}

pub const DAY_IN_LEDGERS: u32 = 17_280;
const INSTANCE_BUMP: u32 = 30 * DAY_IN_LEDGERS;
const INSTANCE_THRESHOLD: u32 = INSTANCE_BUMP - DAY_IN_LEDGERS;
/// TTL al que se extiende cada `Purchase` en CADA operación sobre ella. Los
/// plazos máximos son 30 + 30 (+30 con extend) días, más una disputa.
pub const PURCHASE_BUMP: u32 = 120 * DAY_IN_LEDGERS;
const PURCHASE_THRESHOLD: u32 = PURCHASE_BUMP - DAY_IN_LEDGERS;
/// Largo máximo de la evidencia de envío (bytes).
pub const MAX_EVIDENCE_LEN: u32 = 256;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// Constructor: mínimos > 0 y mínimo ≤ máximo en ambas ventanas.
    InvalidWindowConfig = 1,
    /// `set_arbiter` solo se puede llamar una vez.
    ArbiterAlreadySet = 2,
    /// `fund` exige que el admin ya haya configurado el árbitro.
    ArbiterNotSet = 3,
    /// `ship_secs` fuera de [min_ship_secs, max_ship_secs].
    ShipWindowOutOfRange = 4,
    /// Ya hay una compra registrada para ese escrow.
    PurchaseAlreadyExists = 5,
    /// No hay compra registrada para ese escrow.
    PurchaseNotFound = 6,
    /// Solo el comprador registrado (confirm, extend).
    NotBuyer = 7,
    /// Solo el comprador o el vendedor registrados pueden abrir disputa.
    NotBuyerOrSeller = 8,
    /// `roles.approver` del escrow no es este guardián.
    ApproverNotGuardian = 9,
    /// `roles.release_signer` del escrow no es este guardián.
    ReleaseSignerNotGuardian = 10,
    /// `roles.dispute_resolver` del escrow no es el pp_arbiter configurado.
    DisputeResolverNotArbiter = 11,
    /// Al fondear, el escrow debe tener exactamente un hito.
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
    /// `auto_release` antes de `release_at`.
    DeadlineNotReached = 19,
    /// El escrow de TW está en disputa (la haya abierto quien sea).
    EscrowDisputed = 20,
    /// El escrow ya se liberó.
    EscrowAlreadyReleased = 21,
    /// La disputa del escrow ya se resolvió.
    EscrowAlreadyResolved = 22,
    /// Falta `mark_shipped` (confirm, auto_release, extend).
    NotShipped = 23,
    /// Solo el vendedor registrado puede `mark_shipped`.
    NotSeller = 24,
    /// `mark_shipped` solo una vez.
    AlreadyShipped = 25,
    /// `mark_shipped` después de `ship_deadline`.
    ShipDeadlinePassed = 26,
    /// `extend` solo una vez.
    AlreadyExtended = 27,
    /// `extend` después de `release_at`.
    ReleaseWindowClosed = 28,
    /// Hay un hito con status vacío: TW no permite aprobarlo (#30). Queda la
    /// vía de disputa y árbitro.
    MilestoneNotApprovable = 29,
    /// `inspect_secs` fuera de [min_inspect_secs, max_inspect_secs].
    InspectWindowOutOfRange = 30,
    /// La evidencia de envío está vacía o supera `MAX_EVIDENCE_LEN`.
    InvalidEvidence = 31,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GuardianConfig {
    pub admin: Address,
    pub tw_fee: Address,
    pub min_ship_secs: u64,
    pub max_ship_secs: u64,
    pub min_inspect_secs: u64,
    pub max_inspect_secs: u64,
    /// pp_arbiter que debe figurar como `dispute_resolver`. `None` hasta que el
    /// admin llame `set_arbiter` (una sola vez).
    pub arbiter: Option<Address>,
}

/// Claves de storage. Pública para que los tests verifiquen el TTL de `Purchase`.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    TwFee,
    Windows,
    Arbiter,
    Purchase(Address),
}

#[contracttype]
#[derive(Clone)]
struct Windows {
    min_ship: u64,
    max_ship: u64,
    min_inspect: u64,
    max_inspect: u64,
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
    pub ship_deadline: u64,
    pub inspect_secs: u64,
}

#[contractevent(topics = ["pp_shipped"])]
pub struct Shipped {
    #[topic]
    pub escrow: Address,
    pub evidence: String,
    pub release_at: u64,
}

#[contractevent(topics = ["pp_extended"])]
pub struct Extended {
    #[topic]
    pub escrow: Address,
    pub release_at: u64,
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
    /// de Trustless Work en cada liberación. Ventanas en segundos.
    pub fn __constructor(
        env: Env,
        admin: Address,
        tw_fee: Address,
        min_ship_secs: u64,
        max_ship_secs: u64,
        min_inspect_secs: u64,
        max_inspect_secs: u64,
    ) -> Result<(), Error> {
        if min_ship_secs == 0
            || min_ship_secs > max_ship_secs
            || min_inspect_secs == 0
            || min_inspect_secs > max_inspect_secs
        {
            return Err(Error::InvalidWindowConfig);
        }
        let s = env.storage().instance();
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::TwFee, &tw_fee);
        s.set(
            &DataKey::Windows,
            &Windows {
                min_ship: min_ship_secs,
                max_ship: max_ship_secs,
                min_inspect: min_inspect_secs,
                max_inspect: max_inspect_secs,
            },
        );
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

    /// El comprador fondea `escrow` a través del guardián y firma los plazos.
    /// Árbol de auth del comprador: `fund` → `fund_escrow` → `transfer`.
    pub fn fund(
        env: Env,
        escrow: Address,
        buyer: Address,
        expected_escrow: Escrow,
        amount: i128,
        ship_secs: u64,
        inspect_secs: u64,
    ) -> Result<Purchase, Error> {
        buyer.require_auth();
        bump_instance(&env);

        let w: Windows = env.storage().instance().get(&DataKey::Windows).unwrap();
        if ship_secs < w.min_ship || ship_secs > w.max_ship {
            return Err(Error::ShipWindowOutOfRange);
        }
        if inspect_secs < w.min_inspect || inspect_secs > w.max_inspect {
            return Err(Error::InspectWindowOutOfRange);
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
            amount,
            funded_at: now,
            ship_secs,
            inspect_secs,
            ship_deadline: now + ship_secs,
            shipped_at: None,
            release_at: None,
            extended: false,
            evidence: None,
        };
        write_purchase(&env, &escrow, &purchase);

        client.fund_escrow(&buyer, &expected_escrow, &amount);

        Funded {
            escrow,
            buyer,
            seller: purchase.seller.clone(),
            amount,
            ship_deadline: purchase.ship_deadline,
            inspect_secs,
        }
        .publish(&env);
        Ok(purchase)
    }

    /// El vendedor registra el envío con evidencia (código de encomienda, URL de
    /// foto o "entregado en persona"). Una sola vez y antes de `ship_deadline`.
    /// Escribe "enviado" + evidencia en el hito 0 de TW (auth anidada del
    /// vendedor como service_provider) y fija `release_at`.
    pub fn mark_shipped(
        env: Env,
        escrow: Address,
        seller: Address,
        evidence: String,
    ) -> Result<Purchase, Error> {
        seller.require_auth();
        let mut p = read_purchase(&env, &escrow)?;
        if seller != p.seller {
            return Err(Error::NotSeller);
        }
        if p.shipped_at.is_some() {
            return Err(Error::AlreadyShipped);
        }
        let now = env.ledger().timestamp();
        if now >= p.ship_deadline {
            return Err(Error::ShipDeadlinePassed);
        }
        if evidence.is_empty() || evidence.len() > MAX_EVIDENCE_LEN {
            return Err(Error::InvalidEvidence);
        }
        let client = EscrowClient::new(&env, &escrow);
        let data = client.get_escrow();
        // Con disputa abierta se permite (evidencia nueva para el árbitro).
        if data.flags.released {
            return Err(Error::EscrowAlreadyReleased);
        }
        if data.flags.resolved {
            return Err(Error::EscrowAlreadyResolved);
        }
        client.change_milestone_status(
            &0,
            &String::from_str(&env, SHIPPED_STATUS),
            &Some(evidence.clone()),
            &seller,
        );
        let release_at = now + p.inspect_secs;
        p.shipped_at = Some(now);
        p.release_at = Some(release_at);
        p.evidence = Some(evidence.clone());
        write_purchase(&env, &escrow, &p);
        Shipped {
            escrow,
            evidence,
            release_at,
        }
        .publish(&env);
        Ok(p)
    }

    /// "Recibí conforme": exige envío registrado; aprueba TODOS los hitos
    /// pendientes (TW-2) y libera en la misma invocación.
    pub fn confirm(env: Env, escrow: Address, buyer: Address) -> Result<(), Error> {
        buyer.require_auth();
        let p = read_purchase(&env, &escrow)?;
        if buyer != p.buyer {
            return Err(Error::NotBuyer);
        }
        let client = EscrowClient::new(&env, &escrow);
        let data = client.get_escrow();
        check_open(&data)?;
        if p.shipped_at.is_none() {
            return Err(Error::NotShipped);
        }
        approve_all_and_release(&env, &client, &data)?;
        Confirmed { escrow, buyer }.publish(&env);
        Ok(())
    }

    /// El comprador alarga una vez la ventana de revisión (`release_at +=
    /// inspect_secs`), antes de `release_at` y sin disputa.
    pub fn extend(env: Env, escrow: Address, buyer: Address) -> Result<Purchase, Error> {
        buyer.require_auth();
        let mut p = read_purchase(&env, &escrow)?;
        if buyer != p.buyer {
            return Err(Error::NotBuyer);
        }
        if p.extended {
            return Err(Error::AlreadyExtended);
        }
        let release_at = p.release_at.ok_or(Error::NotShipped)?;
        check_open(&EscrowClient::new(&env, &escrow).get_escrow())?;
        if env.ledger().timestamp() >= release_at {
            return Err(Error::ReleaseWindowClosed);
        }
        let new_release_at = release_at + p.inspect_secs;
        p.release_at = Some(new_release_at);
        p.extended = true;
        write_purchase(&env, &escrow, &p);
        Extended {
            escrow,
            release_at: new_release_at,
        }
        .publish(&env);
        Ok(p)
    }

    /// Abre una disputa en el escrow. Solo el comprador o el vendedor
    /// registrados, con su firma. En la misma invocación empieza a correr el
    /// plazo máximo del reclamo en pp_arbiter (H-13).
    pub fn dispute(env: Env, escrow: Address, caller: Address) -> Result<(), Error> {
        let p = read_purchase(&env, &escrow)?;
        if caller != p.buyer && caller != p.seller {
            return Err(Error::NotBuyerOrSeller);
        }
        caller.require_auth();
        let client = EscrowClient::new(&env, &escrow);
        check_open(&client.get_escrow())?;
        client.dispute_escrow(&env.current_contract_address());
        // Hay compra, así que `fund` ya verificó que el árbitro está fijado y
        // es el `dispute_resolver` del escrow.
        let arbiter: Address = env.storage().instance().get(&DataKey::Arbiter).unwrap();
        ArbiterClient::new(&env, &arbiter).start_claim(&escrow);
        Disputed { escrow, caller }.publish(&env);
        Ok(())
    }

    /// Liberación automática al vendedor. Sin auth (la puede disparar un cron),
    /// solo con envío registrado, `now >= release_at` y el escrow de TW sin
    /// disputa, sin liberar y sin resolver. Aprueba todos los hitos y libera.
    pub fn auto_release(env: Env, escrow: Address) -> Result<(), Error> {
        let p = read_purchase(&env, &escrow)?;
        let client = EscrowClient::new(&env, &escrow);
        let data = client.get_escrow();
        check_open(&data)?;
        let release_at = p.release_at.ok_or(Error::NotShipped)?;
        if env.ledger().timestamp() < release_at {
            return Err(Error::DeadlineNotReached);
        }
        approve_all_and_release(&env, &client, &data)?;
        AutoReleased { escrow }.publish(&env);
        Ok(())
    }

    /// Compra registrada para `escrow`, si existe (solo lectura).
    pub fn purchase(env: Env, escrow: Address) -> Option<Purchase> {
        env.storage().persistent().get(&DataKey::Purchase(escrow))
    }

    /// Configuración del guardián (solo lectura).
    pub fn config(env: Env) -> GuardianConfig {
        let s = env.storage().instance();
        let w: Windows = s.get(&DataKey::Windows).unwrap();
        GuardianConfig {
            admin: s.get(&DataKey::Admin).unwrap(),
            tw_fee: s.get(&DataKey::TwFee).unwrap(),
            min_ship_secs: w.min_ship,
            max_ship_secs: w.max_ship,
            min_inspect_secs: w.min_inspect,
            max_inspect_secs: w.max_inspect,
            arbiter: s.get(&DataKey::Arbiter),
        }
    }
}

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);
}

/// Lee la compra y le extiende el TTL (se usa en toda operación).
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

fn write_purchase(env: &Env, escrow: &Address, p: &Purchase) {
    let key = DataKey::Purchase(escrow.clone());
    env.storage().persistent().set(&key, p);
    env.storage()
        .persistent()
        .extend_ttl(&key, PURCHASE_THRESHOLD, PURCHASE_BUMP);
}

/// Errores propios (y legibles) leyendo los flags REALES del escrow de TW: una
/// disputa abierta por `platform` directo en TW (TW-1) también bloquea.
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

/// Aprueba TODOS los hitos pendientes y libera, en la misma invocación (TW-2:
/// `platform` puede agregar hitos con fondos adentro). El escrow pide
/// `approver.require_auth()` y `release_signer.require_auth()`; el guardián es
/// el invocador directo, así que se cumplen sin firmas.
fn approve_all_and_release(env: &Env, client: &EscrowClient, data: &Escrow) -> Result<(), Error> {
    // TW no deja aprobar un hito con status vacío (#30): error propio antes de
    // tocar nada; queda la vía de disputa.
    for m in data.milestones.iter() {
        if !m.approved && m.status.is_empty() {
            return Err(Error::MilestoneNotApprovable);
        }
    }
    let me = env.current_contract_address();
    for (i, m) in data.milestones.iter().enumerate() {
        if !m.approved {
            client.approve_milestone(&(i as u32), &me);
        }
    }
    let tw_fee: Address = env.storage().instance().get(&DataKey::TwFee).unwrap();
    client.release_funds(&me, &tw_fee);
    Ok(())
}
