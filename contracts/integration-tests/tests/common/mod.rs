//! Entorno de test compartido (v2): SAC de prueba, escrow REAL de Trustless
//! Work (WASM del commit f0b706e registrado en el Env), pp_guardian y pp_arbiter.
#![allow(dead_code)]
extern crate std;

use pp_arbiter::{PpArbiter, PpArbiterClient};
use pp_guardian::{Escrow, Flags, Milestone, PpGuardian, PpGuardianClient, Roles, Trustline};
use soroban_sdk::{
    contractclient, contracterror,
    testutils::{Address as _, EnvTestConfig, Ledger},
    token, vec, Address, Env, Map, String,
};

/// WASM real del escrow single-release de Trustless Work (sha256
/// 1b367bc8476cf80b89f6396e2aa07b602b78361dd829b5ce9b64ada365196660).
#[cfg(not(feature = "tw-mainnet"))]
pub const ESCROW_WASM: &[u8] = include_bytes!("../../../wasm/escrow.wasm");
/// Con `--features tw-mainnet`: el WASM instalado en mainnet (sha256 96d51751…, wasm/README.md).
#[cfg(feature = "tw-mainnet")]
pub const ESCROW_WASM: &[u8] = include_bytes!("../../../wasm/escrow-mainnet.wasm");
/// Cuenta del 0,3 % de Trustless Work, fija en el WASM de mainnet.
pub const TW_MAINNET: &str = "GBWWSOATPLIC72ZBOIM7WJCT7VCAHNWW4QUBZ2H4FORMCCIUM5ZVKSZN";

pub const UNIT: i128 = 10_000_000; // 7 decimales, como LABUSD
pub const AMOUNT: i128 = 150 * UNIT;
pub const PLATFORM_FEE_BPS: u32 = 200; // 2%
pub const MIN_WIN: u64 = 60;
pub const MAX_WIN: u64 = 30 * 24 * 3600;
pub const SHIP: u64 = 3 * 24 * 3600;
pub const INSPECT: u64 = 2 * 24 * 3600;
pub const T0: u64 = 1_763_400_000;
pub const EVIDENCE: &str = "Encomienda OLVA-55821";

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
#[cfg(not(feature = "tw-mainnet"))]
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
    fn withdraw_remaining_funds(
        e: Env,
        dispute_resolver: Address,
        trustless_work_address: Address,
        distributions: Map<Address, i128>,
    ) -> Result<(), TwError>;
}

/// Las firmas del escrow de mainnet: sin `trustless_work_address`.
#[cfg(feature = "tw-mainnet")]
#[contractclient(name = "TwClient")]
pub trait TwEscrow {
    fn initialize_escrow(e: Env, escrow_properties: Escrow) -> Result<Escrow, TwError>;
    fn fund_escrow(e: Env, signer: Address, expected_escrow: Escrow, amount: i128)
        -> Result<(), TwError>;
    fn release_funds(e: Env, release_signer: Address) -> Result<(), TwError>;
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
        distributions: Map<Address, i128>,
    ) -> Result<(), TwError>;
    fn dispute_escrow(e: Env, signer: Address) -> Result<(), TwError>;
    fn withdraw_remaining_funds(
        e: Env,
        dispute_resolver: Address,
        distributions: Map<Address, i128>,
    ) -> Result<(), TwError>;
}

/// Llamadas directas a TW que difieren entre testnet (reciben la cuenta del 0,3 %) y mainnet (la tienen fija).
#[macro_export]
macro_rules! tw_llamar {
    ($tw:expr, $f:ident, $quien:expr, $fee:expr $(, $m:expr)?) => {{
        #[cfg(not(feature = "tw-mainnet"))]
        let r = $tw.$f($quien, $fee $(, $m)?);
        #[cfg(feature = "tw-mainnet")]
        let r = {
            let _ = $fee;
            $tw.$f($quien $(, $m)?)
        };
        r
    }};
}

/// Los argumentos de esas llamadas, para firmarlas en los tests.
#[macro_export]
macro_rules! tw_args {
    ($env:expr, $quien:expr, $fee:expr $(, $m:expr)?) => {{
        #[cfg(not(feature = "tw-mainnet"))]
        let a: soroban_sdk::Vec<soroban_sdk::Val> = ($quien, $fee $(, $m)?).into_val($env);
        #[cfg(feature = "tw-mainnet")]
        let a: soroban_sdk::Vec<soroban_sdk::Val> = {
            let _ = $fee;
            ($quien, $($m,)?).into_val($env)
        };
        a
    }};
}

/// En mainnet la comisión va a una cuenta G… fija: en el Env de test se le crea la trustline al activo de prueba.
#[cfg(feature = "tw-mainnet")]
fn cuenta_tw(env: &Env, asset: soroban_sdk::xdr::Asset) -> Address {
    use soroban_sdk::xdr::{
        AccountEntry, AccountEntryExt, AccountId, LedgerEntry, LedgerEntryData, LedgerEntryExt, LedgerKey,
        LedgerKeyAccount, LedgerKeyTrustLine, ScAddress, SequenceNumber, String32, Thresholds, TrustLineAsset,
        TrustLineEntry, TrustLineEntryExt, VecM,
    };
    use std::rc::Rc;
    let a = Address::from_str(env, TW_MAINNET);
    let sc: ScAddress = (&a).into();
    let ScAddress::Account(id) = sc else { panic!("TW_MAINNET no es una cuenta") };
    let id: AccountId = id;
    let tl = match asset {
        soroban_sdk::xdr::Asset::CreditAlphanum4(x) => TrustLineAsset::CreditAlphanum4(x),
        soroban_sdk::xdr::Asset::CreditAlphanum12(x) => TrustLineAsset::CreditAlphanum12(x),
        soroban_sdk::xdr::Asset::Native => TrustLineAsset::Native,
    };
    let guardar = |k: LedgerKey, data: LedgerEntryData| {
        let e = LedgerEntry { last_modified_ledger_seq: 0, data, ext: LedgerEntryExt::V0 };
        env.host().add_ledger_entry(&Rc::new(k), &Rc::new(e), None).unwrap();
    };
    guardar(
        LedgerKey::Account(LedgerKeyAccount { account_id: id.clone() }),
        LedgerEntryData::Account(AccountEntry {
            account_id: id.clone(),
            balance: 100_000_000,
            seq_num: SequenceNumber(0),
            num_sub_entries: 1,
            inflation_dest: None,
            flags: 0,
            home_domain: String32::default(),
            thresholds: Thresholds([1, 0, 0, 0]),
            signers: VecM::default(),
            ext: AccountEntryExt::V0,
        }),
    );
    guardar(
        LedgerKey::Trustline(LedgerKeyTrustLine { account_id: id.clone(), asset: tl.clone() }),
        LedgerEntryData::Trustline(TrustLineEntry {
            account_id: id,
            asset: tl,
            balance: 0,
            limit: i64::MAX,
            flags: 1, // AUTHORIZED
            ext: TrustLineEntryExt::V0,
        }),
    );
    a
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
    setup_en(Env::default())
}

/// Igual que `setup`, pero sin escribir `test_snapshots/` al terminar. Para
/// tests que crean cientos de entornos (secuencias aleatorias).
pub fn setup_sin_snapshot() -> Ctx {
    setup_en(Env::new_with_config(EnvTestConfig { capture_snapshot_at_drop: false }))
}

fn setup_en(env: Env) -> Ctx {
    env.mock_all_auths();
    env.ledger().set_timestamp(T0);
    // TTL mínimos holgados para poder avanzar ledgers en el test de TTL sin que
    // se archiven el SAC o la instancia del escrow.
    env.ledger().with_mut(|li| {
        li.min_persistent_entry_ttl = 500_000;
        li.min_temp_entry_ttl = 500_000;
        li.max_entry_ttl = 6_312_000;
    });

    let admin = Address::generate(&env);
    let platform = Address::generate(&env);
    let buyer = Address::generate(&env);
    let seller = Address::generate(&env);
    let stranger = Address::generate(&env);
    let issuer = Address::generate(&env);

    let sac_contract = env.register_stellar_asset_contract_v2(issuer);
    #[cfg(not(feature = "tw-mainnet"))]
    let tw_fee = Address::generate(&env);
    #[cfg(feature = "tw-mainnet")]
    let tw_fee = cuenta_tw(&env, sac_contract.asset());
    let token = token::Client::new(&env, &sac_contract.address());
    let sac = token::StellarAssetClient::new(&env, &sac_contract.address());

    let guardian_id = env.register(
        PpGuardian,
        (&admin, &tw_fee, MIN_WIN, MAX_WIN, MIN_WIN, MAX_WIN),
    );
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

    pub fn s(&self, v: &str) -> String {
        String::from_str(&self.env, v)
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
            engagement_id: self.s("pp-test-0001"),
            title: self.s("Zapatillas talla 40"),
            roles: Roles {
                approver: approver.clone(),
                service_provider: service_provider.clone(),
                platform: self.platform.clone(),
                release_signer: release_signer.clone(),
                dispute_resolver: dispute_resolver.clone(),
                receiver: receiver.clone(),
            },
            description: self.s("Pago Protegido (test)"),
            amount,
            platform_fee: PLATFORM_FEE_BPS,
            milestones: vec![
                e,
                Milestone {
                    description: self.s("Entrega del producto"),
                    status: self.s("pendiente"),
                    evidence: self.s(""),
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

    /// Escrow en modo guardián fondeado vía `fund` (plazos por defecto).
    pub fn funded(&self) -> (Address, Escrow) {
        self.funded_with(AMOUNT, SHIP, INSPECT)
    }

    pub fn funded_with(&self, amount: i128, ship: u64, inspect: u64) -> (Address, Escrow) {
        let props = self.guardian_props(amount);
        let id = self.deploy_escrow(&props);
        self.guardian.fund(&id, &self.buyer, &props, &amount, &ship, &inspect);
        (id, props)
    }

    /// El vendedor registra el envío por el guardián.
    pub fn ship(&self, escrow: &Address) {
        self.guardian.mark_shipped(escrow, &self.seller, &self.s(EVIDENCE));
    }

    pub fn bal(&self, a: &Address) -> i128 {
        self.token.balance(a)
    }

    pub fn now(&self) -> u64 {
        self.env.ledger().timestamp()
    }

    pub fn advance(&self, secs: u64) {
        let now = self.env.ledger().timestamp();
        self.env.ledger().set_timestamp(now + secs);
    }

    pub fn set_time(&self, t: u64) {
        self.env.ledger().set_timestamp(t);
    }

    /// Todas las direcciones conocidas (para verificar que ningún tercero
    /// recibe fondos): [buyer, seller, platform, tw_fee, admin, stranger,
    /// guardian, arbiter, escrow].
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
