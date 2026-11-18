//! Entorno de test compartido: SAC de prueba, escrow REAL de Trustless Work
//! (WASM del commit f0b706e registrado en el Env), pp_guardian y pp_arbiter.
#![allow(dead_code)]
extern crate std;

use pp_arbiter::{PpArbiter, PpArbiterClient};
use pp_guardian::{Escrow, Flags, Milestone, PpGuardian, PpGuardianClient, Roles, Trustline};
use soroban_sdk::{
    contractclient, contracterror,
    testutils::{Address as _, Ledger},
    token, vec, Address, Env, Map, String,
};

/// WASM real del escrow single-release de Trustless Work (sha256
/// 1b367bc8476cf80b89f6396e2aa07b602b78361dd829b5ce9b64ada365196660).
pub const ESCROW_WASM: &[u8] = include_bytes!("../../../wasm/escrow.wasm");

pub const UNIT: i128 = 10_000_000; // 7 decimales, como LABUSD
pub const AMOUNT: i128 = 150 * UNIT;
pub const PLATFORM_FEE_BPS: u32 = 200; // 2%
pub const MIN_WINDOW: u64 = 60;
pub const MAX_WINDOW: u64 = 30 * 24 * 3600;
pub const WINDOW: u64 = 3 * 24 * 3600;
pub const T0: u64 = 1_763_400_000;

/// Errores del escrow de Trustless Work (`src/error.rs`, commit f0b706e).
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum TwError {
    AmountCannotBeZero = 1,
    EscrowAlreadyInitialized = 2,
    EscrowNotFound = 3,
    OnlyReleaseSignerCanReleaseEarnings = 4,
    EscrowNotCompleted = 5,
    EscrowBalanceNotEnoughToSendEarnings = 6,
    OnlyPlatformAddressExecuteThisFunction = 7,
    OnlyServiceProviderChangeMilstoneStatus = 8,
    NoMilestoneDefined = 9,
    InvalidMileStoneIndex = 10,
    OnlyApproverChangeMilstoneFlag = 11,
    OnlyDisputeResolverCanExecuteThisFunction = 12,
    EscrowAlreadyInDispute = 13,
    EscrowNotInDispute = 14,
    InsufficientFundsForResolution = 15,
    EscrowOpenedForDisputeResolution = 16,
    Overflow = 17,
    Underflow = 18,
    DivisionError = 19,
    InsufficientApproverFundsForCommissions = 20,
    InsufficientServiceProviderFundsForCommissions = 21,
    MilestoneApprovedCantChangeEscrowProperties = 22,
    EscrowHasFunds = 23,
    EscrowAlreadyResolved = 24,
    TooManyEscrowsRequested = 25,
    UnauthorizedToChangeDisputeFlag = 26,
    TooManyMilestones = 27,
    ReceiverAndApproverFundsNotEqual = 28,
    MilestoneHasAlreadyBeenApproved = 29,
    EmptyMilestoneStatus = 30,
    PlatformFeeTooHigh = 31,
    FlagsMustBeFalse = 32,
    EscrowPropertiesMismatch = 33,
    ApproverOrReceiverFundsLessThanZero = 34,
    EscrowAlreadyReleased = 35,
    IncompatibleEscrowWasmHash = 36,
    PlatformAddressCannotBeChanged = 37,
    AmountsToBeTransferredShouldBePositive = 38,
    DistributionsMustEqualEscrowBalance = 39,
    DisputeResolverCannotDisputeTheEscrow = 40,
    TotalAmountCannotBeZero = 41,
    InsufficientFundsForEscrowFunding = 42,
    MilestoneToApproveDoesNotExist = 43,
    EscrowNotFullyProcessed = 44,
    TooManyDistributions = 45,
    MilestoneToUpdateDoesNotExist = 46,
}

/// Cliente de test con las firmas reales del escrow (`src/contract.rs`).
#[contractclient(name = "TwClient")]
pub trait TwEscrow {
    fn initialize_escrow(e: Env, escrow_properties: Escrow) -> Result<Escrow, TwError>;
    fn fund_escrow(e: Env, signer: Address, expected_escrow: Escrow, amount: i128)
        -> Result<(), TwError>;
    fn release_funds(e: Env, release_signer: Address, trustless_work_address: Address)
        -> Result<(), TwError>;
    fn update_escrow(e: Env, plataform_address: Address, escrow_properties: Escrow)
        -> Result<Escrow, TwError>;
    fn get_escrow(e: Env) -> Result<Escrow, TwError>;
    fn change_milestone_status(
        e: Env,
        milestone_index: u32,
        new_status: String,
        new_evidence: Option<String>,
        service_provider: Address,
    ) -> Result<(), TwError>;
    fn approve_milestone(e: Env, milestone_index: u32, approver: Address) -> Result<(), TwError>;
    fn resolve_dispute(
        e: Env,
        dispute_resolver: Address,
        trustless_work_address: Address,
        distributions: Map<Address, i128>,
    ) -> Result<(), TwError>;
    fn dispute_escrow(e: Env, signer: Address) -> Result<(), TwError>;
}

pub struct Ctx {
    pub env: Env,
    pub token: token::Client<'static>,
    pub sac: token::StellarAssetClient<'static>,
    pub guardian: PpGuardianClient<'static>,
    pub arbiter: PpArbiterClient<'static>,
    pub admin: Address,
    pub platform: Address,
    pub buyer: Address,
    pub seller: Address,
    pub tw_fee: Address,
    pub stranger: Address,
}

pub fn setup() -> Ctx {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(T0);

    let admin = Address::generate(&env);
    let platform = Address::generate(&env);
    let buyer = Address::generate(&env);
    let seller = Address::generate(&env);
    let tw_fee = Address::generate(&env);
    let stranger = Address::generate(&env);
    let issuer = Address::generate(&env);

    let sac_contract = env.register_stellar_asset_contract_v2(issuer);
    let token = token::Client::new(&env, &sac_contract.address());
    let sac = token::StellarAssetClient::new(&env, &sac_contract.address());

    let guardian_id = env.register(PpGuardian, (&admin, &tw_fee, MIN_WINDOW, MAX_WINDOW));
    let arbiter_id = env.register(PpArbiter, (&admin, &guardian_id, &tw_fee));
    let guardian = PpGuardianClient::new(&env, &guardian_id);
    let arbiter = PpArbiterClient::new(&env, &arbiter_id);
    guardian.set_arbiter(&arbiter_id);

    sac.mint(&buyer, &(10_000 * UNIT));

    Ctx { env, token, sac, guardian, arbiter, admin, platform, buyer, seller, tw_fee, stranger }
}

impl Ctx {
    pub fn tw(&self, escrow: &Address) -> TwClient<'static> {
        TwClient::new(&self.env, escrow)
    }

    pub fn props(
        &self,
        approver: &Address,
        release_signer: &Address,
        dispute_resolver: &Address,
        service_provider: &Address,
        receiver: &Address,
        amount: i128,
    ) -> Escrow {
        let e = &self.env;
        Escrow {
            engagement_id: String::from_str(e, "pp-test-0001"),
            title: String::from_str(e, "Zapatillas talla 40"),
            roles: Roles {
                approver: approver.clone(),
                service_provider: service_provider.clone(),
                platform: self.platform.clone(),
                release_signer: release_signer.clone(),
                dispute_resolver: dispute_resolver.clone(),
                receiver: receiver.clone(),
            },
            description: String::from_str(e, "Pago Protegido (test)"),
            amount,
            platform_fee: PLATFORM_FEE_BPS,
            milestones: vec![
                e,
                Milestone {
                    description: String::from_str(e, "Entrega del producto"),
                    status: String::from_str(e, "pendiente"),
                    evidence: String::from_str(e, ""),
                    approved: false,
                },
            ],
            flags: Flags { disputed: false, released: false, resolved: false },
            trustline: Trustline { address: self.token.address.clone() },
            receiver_memo: 0,
        }
    }

    /// Escrow con los roles del modo guardián (SPEC §2).
    pub fn guardian_props(&self, amount: i128) -> Escrow {
        let g = self.guardian.address.clone();
        self.props(&g, &g, &self.arbiter.address, &self.seller, &self.seller, amount)
    }

    /// Despliega una instancia del WASM real y la inicializa.
    pub fn deploy_escrow(&self, props: &Escrow) -> Address {
        let id = self.env.register(ESCROW_WASM, ());
        self.tw(&id).initialize_escrow(props);
        id
    }

    /// Escrow en modo guardián fondeado por el comprador vía `fund`.
    pub fn funded(&self, window: u64) -> (Address, Escrow) {
        self.funded_amount(AMOUNT, window)
    }

    pub fn funded_amount(&self, amount: i128, window: u64) -> (Address, Escrow) {
        let props = self.guardian_props(amount);
        let id = self.deploy_escrow(&props);
        self.guardian.fund(&id, &self.buyer, &props, &amount, &window);
        (id, props)
    }

    /// El vendedor marca el hito 0 como "enviado" con evidencia.
    pub fn ship(&self, escrow: &Address) {
        let e = &self.env;
        self.tw(escrow).change_milestone_status(
            &0,
            &String::from_str(e, "enviado"),
            &Some(String::from_str(e, "Encomienda SRV-2026-000123")),
            &self.seller,
        );
    }

    pub fn bal(&self, a: &Address) -> i128 {
        self.token.balance(a)
    }

    pub fn advance(&self, secs: u64) {
        let now = self.env.ledger().timestamp();
        self.env.ledger().set_timestamp(now + secs);
    }

    /// Todas las direcciones conocidas del entorno (para verificar que ningún
    /// tercero recibe fondos).
    pub fn everyone(&self, escrow: &Address) -> std::vec::Vec<Address> {
        std::vec![
            self.buyer.clone(),
            self.seller.clone(),
            self.platform.clone(),
            self.tw_fee.clone(),
            self.admin.clone(),
            self.stranger.clone(),
            self.guardian.address.clone(),
            self.arbiter.address.clone(),
            escrow.clone(),
        ]
    }

    pub fn snapshot(&self, addrs: &[Address]) -> std::vec::Vec<i128> {
        addrs.iter().map(|a| self.bal(a)).collect()
    }
}

/// Comisiones nominales de Trustless Work para un monto (30 bps + platform_fee),
/// igual que `FeeCalculator::calculate_standard_fees`.
pub fn nominal_fees(total: i128, platform_bps: u32) -> (i128, i128) {
    (total * 30 / 10_000, total * platform_bps as i128 / 10_000)
}
