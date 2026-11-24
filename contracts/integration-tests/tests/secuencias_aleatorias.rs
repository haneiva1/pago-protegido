//! Secuencias aleatorias (tests de propiedades) contra el WASM REAL de
//! Trustless Work, pp_guardian y pp_arbiter.
//!
//! Por cada semilla se arma un mercado con 3 usuarios (compran y venden) y
//! varias compras: un escrow de TW por compra, con vendedor y monto al azar
//! (también montos de pocas unidades, para el redondeo). Cuando una compra
//! termina se abre otra (hasta `MAX_COMPRAS`). Después corre una secuencia al
//! azar de 40 a 80 operaciones: fondear (con plazos al azar dentro de
//! [min, max], a veces con un error a propósito), avanzar el tiempo (poco,
//! mucho o justo al borde de un plazo), mark_shipped, confirm, extend,
//! dispute, resolve con bps al azar (también inválidos), auto_release,
//! refund_unshipped, start_claim, resolve_expired (H-13) y llamadas DIRECTAS
//! al escrow de TW: de terceros
//! (release_funds, approve_milestone, resolve_dispute,
//! withdraw_remaining_funds, dispute_escrow, change_milestone_status,
//! update_escrow), que siempre deben fallar, y de roles legítimos de TW
//! (platform o el vendedor abren disputa; el vendedor cambia el status, TW-3).
//! Cada operación la "firma" alguien: casi siempre la parte correcta, a veces
//! otra persona por sí misma, a veces alguien que se hace pasar por ella.
//! platform también puede comprar con las comisiones que ya cobró.
//!
//! Las firmas se simulan con `mock_auths` dirigido (solo firma quien hace la
//! operación), no con `mock_all_auths`: así un tercero que se hace pasar por el
//! comprador falla igual que en la red. Las operaciones se llaman con `try_*`:
//! un fallo esperado es un resultado normal.
//!
//! Invariantes que se revisan DESPUÉS DE CADA PASO:
//! - [I1] Conservación: la suma de los saldos de LABUSD de los usuarios,
//!   platform, tw_fee, el extraño, el admin, el guardián, el árbitro y todos
//!   los escrows es siempre el total acuñado.
//! - [I2] Ningún tercero recibe nada: el extraño, el admin, el guardián y el
//!   árbitro siempre tienen saldo 0. En cada paso solo cambian los saldos del
//!   comprador, el vendedor, platform, tw_fee y el escrow de ESA compra.
//! - [I3] Un solo desenlace: cada compra llega como mucho a uno (confirmada,
//!   liberada sola, resuelta por el árbitro o devuelta por no despachar).
//!   Después su escrow queda en 0 y cualquier otro desenlace falla sin mover
//!   saldos. Los montos son exactos: 2% para platform y 0,3% para Trustless
//!   Work (`nominal_fees`); en `resolve` cada parte paga su proporción.
//!
//! Además:
//! - [I4] Reglas y firmas: cada operación pasa o falla exactamente como dice
//!   un modelo simple de las reglas (quién firma, plazos, flags), y después del
//!   paso el estado on-chain (Purchase del guardián y flags de TW) es igual al
//!   del modelo. Las llamadas directas de terceros al escrow siempre fallan.
//!   El modelo refleja H-10 tal como es hoy (conocido, arreglo previsto en v3):
//!   `dispute` no tiene plazo. Si el modelo exigiera un plazo, este test lo
//!   detectaría: las secuencias sí abren reclamos tardíos.
//! - [I5] Vivacidad: al final, toda compra fondeada se puede cerrar
//!   (auto_release, resolve, refund_unshipped o resolve_expired) y todos los
//!   escrows quedan en 0.
//! - [I6] Plazo del reclamo (H-13): `dispute` hace correr el plazo
//!   (`CLAIM_SECS`) y, si la disputa se abrió directo en TW, `start_claim` lo
//!   hace correr; el plazo on-chain es siempre el del modelo. Antes del plazo
//!   `resolve_expired` falla; pasado el plazo, todo reclamo abierto termina en
//!   una de las dos salidas: TODO al comprador sin envío registrado o TODO al
//!   vendedor con envío. Nunca a un tercero ([I2]). En el cierre, todo reclamo
//!   con el plazo vencido se cierra con `resolve_expired`, y otros también
//!   (esperando al plazo).
//!
//! Cómo correrlo:
//!   cargo test -p pp_integration_tests --test secuencias_aleatorias
//! Más semillas (por defecto 200, repartidas en 4 tests que corren en
//! paralelo; 1000 semillas tardan unos 2 minutos):
//!   SECUENCIAS_SEMILLAS=1000 cargo test -p pp_integration_tests --test secuencias_aleatorias
//! Repetir una sola semilla e imprimir el resumen:
//!   SECUENCIAS_SEMILLA=37 cargo test -p pp_integration_tests --test secuencias_aleatorias -- --nocapture
//! Con `SECUENCIAS_VER=1` además imprime todos los pasos de cada semilla.
//! Si una semilla falla, el mensaje del panic trae la semilla y la lista de
//! pasos para reproducirla.
extern crate std;

mod common;
use common::*;

use pp_arbiter::{Split, CLAIM_SECS};
use pp_guardian::{Escrow, Flags, Purchase};
use soroban_sdk::{
    map,
    testutils::{Address as _, MockAuth, MockAuthInvoke},
    Address, IntoVal, Map, String, Val, Vec,
};
use std::{
    cell::RefCell, collections::BTreeMap, format, rc::Rc, string::String as Texto,
    string::ToString, vec::Vec as Lista,
};

/// Semillas por defecto (cambiar con `SECUENCIAS_SEMILLAS`).
const SEMILLAS_POR_DEFECTO: u64 = 200;
/// Tests que reparten las semillas (cargo los corre en paralelo).
const LOTES: u64 = 4;
/// Pasos al azar por semilla (sin contar el cierre).
const PASOS_MIN: u64 = 40;
const PASOS_MAX: u64 = 80;
/// Compras (escrows) como máximo por semilla.
const MAX_COMPRAS: usize = 8;
const DIA: u64 = 24 * 3600;
const BPS_MAX: u32 = 10_000;

// ───────────────────────── PRNG determinista ─────────────────────────

/// splitmix64: chico, rápido y con la misma salida en cualquier máquina.
struct Azar(u64);

impl Azar {
    fn nuevo(semilla: u64) -> Self {
        Azar(semilla)
    }
    fn sig(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }
    /// Entero en [0, n).
    fn hasta(&mut self, n: u64) -> u64 {
        self.sig() % n
    }
    /// Entero en [lo, hi].
    fn entre(&mut self, lo: u64, hi: u64) -> u64 {
        lo + self.hasta(hi - lo + 1)
    }
    /// `true` con probabilidad `pct`%.
    fn prob(&mut self, pct: u64) -> bool {
        self.hasta(100) < pct
    }
    fn elegir<T: Clone>(&mut self, xs: &[T]) -> T {
        xs[self.hasta(xs.len() as u64) as usize].clone()
    }
}

// ───────────────────────── modelo ─────────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Desenlace {
    Confirmada,
    AutoLiberada,
    Resuelta,
    Devuelta,
    /// H-13: cerrada por `resolve_expired` al vencer el plazo del reclamo.
    Vencida,
}

/// Lo que el modelo espera de cada compra.
struct Compra {
    escrow: Address,
    props: Escrow,
    vendedor: Address,
    monto: i128,
    // Desde el fondeo:
    comprador: Option<Address>,
    fondeada_en: u64,
    envio_secs: u64,
    revision_secs: u64,
    enviada_en: Option<u64>,
    liberar_en: Option<u64>,
    extendida: bool,
    evidencia: Option<String>,
    /// Flag `disputed` del escrow de TW.
    en_disputa: bool,
    /// Momento en que empezó a correr el plazo del reclamo en pp_arbiter.
    reclamo_en: Option<u64>,
    /// Un rol de TW (platform o el vendedor) cambió el escrow ANTES del fondeo
    /// (disputa o status directo): ya no coincide con lo que firma el
    /// comprador y `fund` falla para siempre (EscrowMismatch).
    tocada_antes: bool,
    desenlace: Option<Desenlace>,
}

impl Compra {
    fn fondeada(&self) -> bool {
        self.comprador.is_some()
    }
    fn liberada(&self) -> bool {
        matches!(self.desenlace, Some(Desenlace::Confirmada | Desenlace::AutoLiberada))
    }
    fn resuelta(&self) -> bool {
        matches!(self.desenlace, Some(Desenlace::Resuelta | Desenlace::Devuelta | Desenlace::Vencida))
    }
    /// Igual a `check_open` del guardián.
    fn abierta(&self) -> bool {
        !self.liberada() && !self.resuelta() && !self.en_disputa
    }
    fn plazo_envio(&self) -> u64 {
        self.fondeada_en + self.envio_secs
    }
    /// Vencimiento del plazo del reclamo (H-13), si ya corre.
    fn plazo_reclamo(&self) -> Option<u64> {
        self.reclamo_en.map(|t| t + CLAIM_SECS)
    }
    /// Saldo que debería tener el escrow.
    fn saldo_esperado(&self) -> i128 {
        if self.fondeada() && self.desenlace.is_none() {
            self.monto
        } else {
            0
        }
    }
}

/// Llamadas directas al escrow de TW.
#[derive(Clone, Debug)]
enum Directa {
    /// `release_funds(signer, extraño)`.
    ReleaseFunds { signer: Address },
    /// `approve_milestone(0, approver)`.
    ApproveMilestone { approver: Address },
    /// `resolve_dispute(resolver, extraño, {destino: saldo})`.
    ResolveDispute { resolver: Address, destino: Address },
    /// `withdraw_remaining_funds(resolver, extraño, {destino: monto})`.
    WithdrawRemaining { resolver: Address, destino: Address },
    /// `dispute_escrow(signer)`.
    DisputeEscrow { signer: Address },
    /// `change_milestone_status(0, status, Some(evidencia), sp)`.
    ChangeStatus { sp: Address, status: &'static str },
    /// `update_escrow(platform, props con receiver = extraño)`.
    Secuestrar { platform: Address },
}

#[derive(Clone, Debug)]
enum Op {
    Avanzar(u64),
    Fondear { i: usize, firma: Address, como: Address, monto: i128, envio: u64, revision: u64, props_ok: bool },
    Enviar { i: usize, firma: Address, como: Address, evidencia: Texto },
    Confirmar { i: usize, firma: Address, como: Address },
    Extender { i: usize, firma: Address, como: Address },
    Disputar { i: usize, firma: Address, como: Address },
    Resolver { i: usize, firma: Address, bps: u32 },
    AutoLiberar { i: usize },
    DevolverNoEnviado { i: usize },
    IniciarPlazo { i: usize },
    ResolverVencido { i: usize },
    Directa { i: usize, firma: Address, d: Directa },
}

impl Op {
    fn compra(&self) -> Option<usize> {
        match self {
            Op::Avanzar(_) => None,
            Op::Fondear { i, .. }
            | Op::Enviar { i, .. }
            | Op::Confirmar { i, .. }
            | Op::Extender { i, .. }
            | Op::Disputar { i, .. }
            | Op::Resolver { i, .. }
            | Op::AutoLiberar { i }
            | Op::DevolverNoEnviado { i }
            | Op::IniciarPlazo { i }
            | Op::ResolverVencido { i }
            | Op::Directa { i, .. } => Some(*i),
        }
    }
    fn tipo(&self) -> &'static str {
        match self {
            Op::Avanzar(_) => "avanzar",
            Op::Fondear { .. } => "fund",
            Op::Enviar { .. } => "mark_shipped",
            Op::Confirmar { .. } => "confirm",
            Op::Extender { .. } => "extend",
            Op::Disputar { .. } => "dispute",
            Op::Resolver { .. } => "resolve",
            Op::AutoLiberar { .. } => "auto_release",
            Op::DevolverNoEnviado { .. } => "refund_unshipped",
            Op::IniciarPlazo { .. } => "start_claim",
            Op::ResolverVencido { .. } => "resolve_expired",
            Op::Directa { .. } => "tw_directa",
        }
    }
    fn es_desenlace(&self) -> bool {
        matches!(
            self,
            Op::Confirmar { .. }
                | Op::Resolver { .. }
                | Op::AutoLiberar { .. }
                | Op::DevolverNoEnviado { .. }
                | Op::ResolverVencido { .. }
        )
    }
}

/// Resultado de ejecutar un paso.
struct Res {
    ok: bool,
    texto: Texto,
    split: Option<Split>,
}

fn res<T, C, E: core::fmt::Debug>(r: &Result<Result<T, C>, E>) -> Res {
    match r {
        Ok(Ok(_)) => Res { ok: true, texto: "Ok".to_string(), split: None },
        Ok(Err(_)) => Res { ok: false, texto: "Err(conversión)".to_string(), split: None },
        Err(e) => Res { ok: false, texto: format!("Err({e:?})"), split: None },
    }
}

// ───────────────────────── mercado de una semilla ─────────────────────────

struct Mercado {
    t: Ctx,
    usuarios: [Address; 3],
    compras: Lista<Compra>,
    /// Direcciones cuyo saldo se sigue: usuarios, platform, tw_fee, extraño,
    /// admin, guardián, árbitro y escrows.
    seguidas: Lista<Address>,
    nombres: Lista<(Address, Texto)>,
    suministro: i128,
    log: Rc<RefCell<Lista<Texto>>>,
    pasos: usize,
    stats: BTreeMap<&'static str, (u32, u32)>,
    desenlaces: BTreeMap<&'static str, u32>,
}

impl Mercado {
    fn nuevo(az: &mut Azar, log: Rc<RefCell<Lista<Texto>>>) -> Self {
        let t = setup_sin_snapshot();
        let u2 = Address::generate(&t.env);
        let usuarios = [t.buyer.clone(), t.seller.clone(), u2];
        // Saldos al azar: a veces no alcanza para fondear.
        for u in &usuarios {
            let extra = az.entre(0, 20_000) as i128 * UNIT + az.hasta(UNIT as u64) as i128;
            if extra > 0 {
                t.sac.mint(u, &extra);
            }
        }
        let mut nombres: Lista<(Address, Texto)> = Lista::new();
        for (k, u) in usuarios.iter().enumerate() {
            nombres.push((u.clone(), format!("u{k}")));
        }
        for (a, n) in [
            (&t.platform, "platform"),
            (&t.tw_fee, "tw_fee"),
            (&t.stranger, "extraño"),
            (&t.admin, "admin"),
            (&t.guardian.address, "guardián"),
            (&t.arbiter.address, "árbitro"),
        ] {
            nombres.push((a.clone(), n.to_string()));
        }
        let seguidas: Lista<Address> = nombres.iter().map(|(a, _)| a.clone()).collect();
        let mut m = Mercado {
            t,
            usuarios,
            compras: Lista::new(),
            seguidas,
            nombres,
            suministro: 0,
            log,
            pasos: 0,
            stats: BTreeMap::new(),
            desenlaces: BTreeMap::new(),
        };
        m.suministro = m.saldos().iter().sum();
        let saldos: Lista<Texto> = m.usuarios.iter().map(|u| format!("{}={}", m.n(u), m.t.bal(u))).collect();
        m.log.borrow_mut().push(format!("inicio: {}", saldos.join(" ")));
        for _ in 0..az.entre(2, 3) {
            m.abrir_compra(az);
        }
        m
    }

    /// Despliega un escrow REAL de TW para una compra nueva (vendedor y monto
    /// al azar). No mueve saldos.
    fn abrir_compra(&mut self, az: &mut Azar) {
        let k = self.compras.len();
        let vendedor = self.usuarios[az.hasta(3) as usize].clone();
        let monto = match az.hasta(10) {
            0 => az.entre(1, 1_000) as i128, // montos minúsculos: redondeo
            1..=3 => az.entre(1, 2_000) as i128 * UNIT,
            _ => az.entre(1, 2_000 * UNIT as u64) as i128,
        };
        let t = &self.t;
        let g = t.guardian.address.clone();
        let props = t.props(&g, &g, &t.arbiter.address, &vendedor, &vendedor, monto);
        let escrow = t.deploy_escrow(&props);
        self.nombres.push((escrow.clone(), format!("e{k}")));
        self.seguidas.push(escrow.clone());
        self.log.borrow_mut().push(format!(
            "abrir e{k}: vendedor={} monto={monto}",
            self.n(&vendedor)
        ));
        assert_eq!(self.t.bal(&escrow), 0);
        assert_eq!(self.t.guardian.purchase(&escrow), None);
        self.compras.push(Compra {
            escrow,
            props,
            vendedor,
            monto,
            comprador: None,
            fondeada_en: 0,
            envio_secs: 0,
            revision_secs: 0,
            enviada_en: None,
            liberar_en: None,
            extendida: false,
            evidencia: None,
            en_disputa: false,
            reclamo_en: None,
            tocada_antes: false,
            desenlace: None,
        });
    }

    fn n(&self, a: &Address) -> Texto {
        self.nombres
            .iter()
            .find(|(x, _)| x == a)
            .map(|(_, n)| n.clone())
            .unwrap_or_else(|| "?".to_string())
    }

    fn idx(&self, a: &Address) -> usize {
        self.seguidas.iter().position(|x| x == a).expect("dirección no seguida")
    }

    fn saldos(&self) -> Lista<i128> {
        self.seguidas.iter().map(|a| self.t.bal(a)).collect()
    }

    fn ahora(&self) -> u64 {
        self.t.now()
    }

    fn personas(&self) -> Lista<Address> {
        let mut v: Lista<Address> = self.usuarios.to_vec();
        v.push(self.t.stranger.clone());
        v.push(self.t.admin.clone());
        v.push(self.t.platform.clone());
        v
    }

    // ───────────── generación de pasos ─────────────

    /// Elige una compra: con prob. alta una que cumpla `pref`, si hay.
    fn elegir_compra(&self, az: &mut Azar, pref: impl Fn(&Compra) -> bool) -> usize {
        let candidatas: Lista<usize> = (0..self.compras.len()).filter(|&k| pref(&self.compras[k])).collect();
        if !candidatas.is_empty() && az.prob(85) {
            az.elegir(&candidatas)
        } else {
            az.hasta(self.compras.len() as u64) as usize
        }
    }

    /// (quién firma, en nombre de quién). Casi siempre la parte correcta; a
    /// veces otra persona por sí misma; a veces alguien que se hace pasar.
    fn quien(&self, az: &mut Azar, correcto: &Address) -> (Address, Address) {
        let p = self.personas();
        match az.hasta(100) {
            0..=74 => (correcto.clone(), correcto.clone()),
            75..=89 => {
                let x = az.elegir(&p);
                (x.clone(), x)
            }
            _ => {
                let otros: Lista<Address> = p.into_iter().filter(|x| x != correcto).collect();
                (az.elegir(&otros), correcto.clone())
            }
        }
    }

    /// Plazo válido (dentro de [MIN_WIN, MAX_WIN]), a veces justo en el borde.
    fn ventana(az: &mut Azar) -> u64 {
        match az.hasta(100) {
            0..=14 => az.entre(MIN_WIN, 3_600),
            15..=59 => az.entre(3_600, 7 * DIA),
            60..=84 => az.entre(7 * DIA, MAX_WIN),
            _ => az.elegir(&[MIN_WIN, MAX_WIN]),
        }
    }

    /// Fondeo: casi siempre correcto; el resto con UN error a propósito.
    fn generar_fondeo(&self, az: &mut Azar) -> Op {
        let i = self.elegir_compra(az, |c| !c.fondeada() && !c.tocada_antes);
        let c = &self.compras[i];
        let otros: Lista<Address> = self.usuarios.iter().filter(|u| **u != c.vendedor).cloned().collect();
        let mut como = az.elegir(&otros);
        let mut firma = como.clone();
        let mut monto = c.monto;
        let mut envio = Self::ventana(az);
        let mut revision = Self::ventana(az);
        let mut props_ok = true;
        if az.prob(35) {
            match az.hasta(7) {
                0 => {
                    como = c.vendedor.clone(); // comprador = vendedor
                    firma = como.clone();
                }
                1 => {
                    como = self.t.stranger.clone(); // sin saldo
                    firma = como.clone();
                }
                2 => {
                    let p: Lista<Address> = self.personas().into_iter().filter(|x| *x != como).collect();
                    firma = az.elegir(&p); // se hace pasar por el comprador
                }
                3 => monto = az.elegir(&[c.monto + 1, (c.monto - 1).max(1), c.monto * 2]),
                4 => envio = az.elegir(&[0, MIN_WIN - 1, MAX_WIN + 1, u64::MAX]),
                5 => revision = az.elegir(&[0, MIN_WIN - 1, MAX_WIN + 1, u64::MAX]),
                _ => props_ok = false,
            }
        }
        Op::Fondear { i, firma, como, monto, envio, revision, props_ok }
    }

    fn tiempo(&self, az: &mut Azar) -> u64 {
        let ahora = self.ahora();
        match az.hasta(100) {
            0..=39 => az.entre(0, 120),
            40..=69 => az.entre(0, DIA),
            70..=82 => az.entre(DIA, 10 * DIA),
            83..=86 => az.entre(10 * DIA, 40 * DIA),
            _ => {
                // Justo en el borde de un plazo (−1, 0, +1 segundo).
                let mut bordes = Lista::new();
                for c in self.compras.iter().filter(|c| c.fondeada()) {
                    for base in [Some(c.plazo_envio()), c.liberar_en, c.plazo_reclamo()].into_iter().flatten() {
                        for b in [base.saturating_sub(1), base, base + 1] {
                            if b >= ahora {
                                bordes.push(b - ahora);
                            }
                        }
                    }
                }
                if bordes.is_empty() {
                    az.entre(0, 60)
                } else {
                    az.elegir(&bordes)
                }
            }
        }
    }

    fn generar(&self, az: &mut Azar) -> Op {
        let viva = |c: &Compra| c.fondeada() && c.desenlace.is_none();
        let enviada = |c: &Compra| c.fondeada() && c.desenlace.is_none() && c.enviada_en.is_some();
        if self.compras.iter().any(|c| !c.fondeada() && !c.tocada_antes) && az.prob(25) {
            return self.generar_fondeo(az);
        }
        match az.hasta(100) {
            0..=17 => Op::Avanzar(self.tiempo(az)),
            18..=21 => self.generar_fondeo(az),
            22..=24 => {
                // Fondear otra vez una compra ya fondeada (siempre falla).
                let i = self.elegir_compra(az, |c| c.fondeada());
                let c = &self.compras[i];
                let como = az.elegir(&self.personas());
                Op::Fondear {
                    i,
                    firma: como.clone(),
                    como,
                    monto: c.monto,
                    envio: Self::ventana(az),
                    revision: Self::ventana(az),
                    props_ok: true,
                }
            }
            25..=40 => {
                let i = self.elegir_compra(az, |c| viva(c) && c.enviada_en.is_none());
                let (firma, como) = self.quien(az, &self.compras[i].vendedor.clone());
                let evidencia = match az.hasta(20) {
                    0 => Texto::new(),
                    1 => "x".repeat(257),
                    _ => format!("OLVA-{}", az.entre(10_000, 99_999)),
                };
                Op::Enviar { i, firma, como, evidencia }
            }
            41..=50 => {
                let i = self.elegir_compra(az, enviada);
                let correcto = self.compras[i].comprador.clone().unwrap_or(self.usuarios[0].clone());
                let (firma, como) = self.quien(az, &correcto);
                Op::Confirmar { i, firma, como }
            }
            51..=55 => {
                let i = self.elegir_compra(az, enviada);
                let correcto = self.compras[i].comprador.clone().unwrap_or(self.usuarios[0].clone());
                let (firma, como) = self.quien(az, &correcto);
                Op::Extender { i, firma, como }
            }
            56..=61 => {
                let i = self.elegir_compra(az, viva);
                let c = &self.compras[i];
                let correcto = if az.prob(50) {
                    c.comprador.clone().unwrap_or(self.usuarios[0].clone())
                } else {
                    c.vendedor.clone()
                };
                let (firma, como) = self.quien(az, &correcto);
                Op::Disputar { i, firma, como }
            }
            62..=66 => {
                let i = self.elegir_compra(az, |c| c.en_disputa);
                let firma = if az.prob(75) { self.t.admin.clone() } else { az.elegir(&self.personas()) };
                let bps = match az.hasta(100) {
                    0..=69 => az.entre(0, BPS_MAX as u64) as u32,
                    70..=84 => az.elegir(&[0, 1, 5_000, 9_999, BPS_MAX]),
                    _ => {
                        let raro = az.entre(10_001, 1_000_000) as u32;
                        az.elegir(&[BPS_MAX + 1, u32::MAX, raro])
                    }
                };
                Op::Resolver { i, firma, bps }
            }
            67..=68 => Op::IniciarPlazo { i: self.elegir_compra(az, |c| c.en_disputa) },
            69..=77 => Op::AutoLiberar { i: self.elegir_compra(az, enviada) },
            78..=80 => Op::DevolverNoEnviado { i: self.elegir_compra(az, |c| c.en_disputa) },
            81..=84 => Op::ResolverVencido { i: self.elegir_compra(az, |c| c.en_disputa) },
            85..=93 => self.generar_tercero(az),
            _ => self.generar_rol(az),
        }
    }

    /// Llamada directa al escrow de alguien que NO tiene ese poder: debe fallar.
    fn generar_tercero(&self, az: &mut Azar) -> Op {
        let i = self.elegir_compra(az, |c| c.fondeada());
        let c = &self.compras[i];
        let t = &self.t;
        let g = t.guardian.address.clone();
        let arb = t.arbiter.address.clone();
        // Cualquiera, incluso platform y el vendedor (pero nunca un contrato).
        let firma = az.elegir(&self.personas());
        // Para `dispute_escrow(firma)`: alguien que no es rol de TW.
        let no_rol: Lista<Address> = self
            .personas()
            .into_iter()
            .filter(|x| *x != c.vendedor && *x != t.platform)
            .collect();
        let d = match az.hasta(12) {
            0 => Directa::ReleaseFunds { signer: firma.clone() },
            1 => Directa::ReleaseFunds { signer: g },
            2 => Directa::ApproveMilestone { approver: firma.clone() },
            3 => Directa::ApproveMilestone { approver: g },
            4 => Directa::ResolveDispute { resolver: firma.clone(), destino: firma.clone() },
            5 => Directa::ResolveDispute { resolver: arb, destino: firma.clone() },
            6 => Directa::WithdrawRemaining { resolver: arb, destino: firma.clone() },
            7 => Directa::DisputeEscrow { signer: g },
            8 => Directa::DisputeEscrow { signer: arb },
            9 => {
                let x = az.elegir(&no_rol);
                return Op::Directa { i, firma: x.clone(), d: Directa::DisputeEscrow { signer: x } };
            }
            10 => {
                // Se hace pasar por el vendedor, o se declara service_provider.
                let x = az.elegir(&no_rol);
                let sp = if az.prob(50) { c.vendedor.clone() } else { x.clone() };
                return Op::Directa { i, firma: x, d: Directa::ChangeStatus { sp, status: "enviado" } };
            }
            _ => {
                // platform solo intenta secuestrar con fondos adentro (debe fallar).
                let platform = if c.saldo_esperado() > 0 && az.prob(50) {
                    t.platform.clone()
                } else {
                    firma.clone()
                };
                let firma = if platform == t.platform && c.saldo_esperado() == 0 {
                    t.stranger.clone()
                } else {
                    firma
                };
                return Op::Directa { i, firma, d: Directa::Secuestrar { platform } };
            }
        };
        Op::Directa { i, firma, d }
    }

    /// Llamada directa al escrow de un rol legítimo de TW (permitida por TW).
    fn generar_rol(&self, az: &mut Azar) -> Op {
        // Casi siempre sobre una compra fondeada; a veces antes del fondeo
        // (deja el escrow inservible para `fund`: ver `tocada_antes`).
        let fondeadas: Lista<usize> = (0..self.compras.len()).filter(|&k| self.compras[k].fondeada()).collect();
        let i = if !fondeadas.is_empty() && az.prob(95) {
            az.elegir(&fondeadas)
        } else {
            az.hasta(self.compras.len() as u64) as usize
        };
        let c = &self.compras[i];
        if az.prob(60) {
            let x = if az.prob(50) { self.t.platform.clone() } else { c.vendedor.clone() };
            Op::Directa { i, firma: x.clone(), d: Directa::DisputeEscrow { signer: x } }
        } else {
            let status = az.elegir(&["enviado", "entregado", "en camino"]);
            Op::Directa { i, firma: c.vendedor.clone(), d: Directa::ChangeStatus { sp: c.vendedor.clone(), status } }
        }
    }

    // ───────────── descripción ─────────────

    fn describir(&self, op: &Op) -> Texto {
        let e = |i: &usize| format!("e{i}");
        match op {
            Op::Avanzar(s) => format!("avanzar {s}s"),
            Op::Fondear { i, firma, como, monto, envio, revision, props_ok } => format!(
                "fund({}, como={}, monto={monto}, envio={envio}, revision={revision}{}) firma={}",
                e(i),
                self.n(como),
                if *props_ok { "" } else { ", props alterados" },
                self.n(firma)
            ),
            Op::Enviar { i, firma, como, evidencia } => format!(
                "mark_shipped({}, como={}, evidencia={} bytes) firma={}",
                e(i),
                self.n(como),
                evidencia.len(),
                self.n(firma)
            ),
            Op::Confirmar { i, firma, como } => {
                format!("confirm({}, como={}) firma={}", e(i), self.n(como), self.n(firma))
            }
            Op::Extender { i, firma, como } => {
                format!("extend({}, como={}) firma={}", e(i), self.n(como), self.n(firma))
            }
            Op::Disputar { i, firma, como } => {
                format!("dispute({}, como={}) firma={}", e(i), self.n(como), self.n(firma))
            }
            Op::Resolver { i, firma, bps } => format!("resolve({}, bps={bps}) firma={}", e(i), self.n(firma)),
            Op::AutoLiberar { i } => format!("auto_release({}) sin firma", e(i)),
            Op::DevolverNoEnviado { i } => format!("refund_unshipped({}) sin firma", e(i)),
            Op::IniciarPlazo { i } => format!("start_claim({}) sin firma", e(i)),
            Op::ResolverVencido { i } => format!("resolve_expired({}) sin firma", e(i)),
            Op::Directa { i, firma, d } => {
                let d = match d {
                    Directa::ReleaseFunds { signer } => format!("release_funds({})", self.n(signer)),
                    Directa::ApproveMilestone { approver } => format!("approve_milestone(0, {})", self.n(approver)),
                    Directa::ResolveDispute { resolver, destino } => {
                        format!("resolve_dispute({}, {{{}: saldo}})", self.n(resolver), self.n(destino))
                    }
                    Directa::WithdrawRemaining { resolver, destino } => {
                        format!("withdraw_remaining_funds({}, {{{}: monto}})", self.n(resolver), self.n(destino))
                    }
                    Directa::DisputeEscrow { signer } => format!("dispute_escrow({})", self.n(signer)),
                    Directa::ChangeStatus { sp, status } => {
                        format!("change_milestone_status(0, {status:?}, {})", self.n(sp))
                    }
                    Directa::Secuestrar { platform } => {
                        format!("update_escrow({}, receiver=extraño)", self.n(platform))
                    }
                };
                format!("TW directo {}.{d} firma={}", e(i), self.n(firma))
            }
        }
    }

    // ───────────── modelo: ¿debería pasar? ─────────────

    /// Llamada directa de un rol legítimo de TW (puede pasar).
    fn directa_legitima(&self, i: usize, firma: &Address, d: &Directa) -> bool {
        let c = &self.compras[i];
        match d {
            Directa::DisputeEscrow { signer } => {
                firma == signer && (*signer == self.t.platform || *signer == c.vendedor)
            }
            Directa::ChangeStatus { sp, .. } => firma == sp && *sp == c.vendedor,
            _ => false,
        }
    }

    /// ¿La operación debería pasar? Reglas de pp_guardian y pp_arbiter (y de
    /// TW para las llamadas directas de roles legítimos).
    fn esperado(&self, op: &Op, saldos: &[i128]) -> bool {
        let ahora = self.ahora();
        let en_rango = |w: u64| (MIN_WIN..=MAX_WIN).contains(&w);
        let c = op.compra().map(|i| &self.compras[i]);
        let comprador = c.and_then(|c| c.comprador.clone());
        let es_comprador = |a: &Address| comprador.as_ref() == Some(a);
        match op {
            Op::Avanzar(_) => true,
            Op::Fondear { firma, como, monto, envio, revision, props_ok, .. } => {
                let c = c.unwrap();
                firma == como
                    && en_rango(*envio)
                    && en_rango(*revision)
                    && !c.fondeada()
                    && !c.tocada_antes
                    && *props_ok
                    && *como != c.vendedor
                    && *monto == c.monto
                    && saldos[self.idx(como)] >= *monto
            }
            Op::Enviar { firma, como, evidencia, .. } => {
                let c = c.unwrap();
                c.fondeada()
                    && firma == como
                    && *como == c.vendedor
                    && c.enviada_en.is_none()
                    && ahora < c.plazo_envio()
                    && !evidencia.is_empty()
                    && evidencia.len() <= 256
                    && !c.liberada()
                    && !c.resuelta()
            }
            Op::Confirmar { firma, como, .. } => {
                let c = c.unwrap();
                firma == como && es_comprador(como) && c.abierta() && c.enviada_en.is_some()
            }
            Op::Extender { firma, como, .. } => {
                let c = c.unwrap();
                firma == como
                    && es_comprador(como)
                    && !c.extendida
                    && c.abierta()
                    && c.liberar_en.map_or(false, |r| ahora < r)
            }
            // H-10 (conocido): no hay plazo para disputar.
            Op::Disputar { firma, como, .. } => {
                let c = c.unwrap();
                c.fondeada() && firma == como && (es_comprador(como) || *como == c.vendedor) && c.abierta()
            }
            Op::Resolver { firma, bps, .. } => {
                let c = c.unwrap();
                *firma == self.t.admin && *bps <= BPS_MAX && c.en_disputa && c.saldo_esperado() > 0
            }
            Op::AutoLiberar { .. } => {
                let c = c.unwrap();
                c.fondeada() && c.abierta() && c.liberar_en.map_or(false, |r| ahora >= r)
            }
            Op::DevolverNoEnviado { .. } => {
                let c = c.unwrap();
                c.en_disputa && c.saldo_esperado() > 0 && c.enviada_en.is_none() && ahora >= c.plazo_envio()
            }
            // H-13: el plazo corre con el escrow de TW en disputa (la haya
            // abierto quien sea); si ya corre, no se mueve.
            Op::IniciarPlazo { .. } => c.unwrap().en_disputa,
            Op::ResolverVencido { .. } => {
                let c = c.unwrap();
                c.en_disputa && c.saldo_esperado() > 0 && c.plazo_reclamo().map_or(false, |v| ahora >= v)
            }
            // Un tercero nunca. Un rol legítimo: disputa si no hay otra abierta
            // y no está resuelta (H-1: después de liberar, sí); status mientras
            // no esté liberada ni resuelta. El WASM de mainnet no congela el
            // status al cerrar (no mueve plata: pp_guardian usa su propia
            // evidencia y ya no hay saldo).
            Op::Directa { i, firma, d } => {
                let c = c.unwrap();
                self.directa_legitima(*i, firma, d)
                    && match d {
                        Directa::DisputeEscrow { .. } => !c.en_disputa && !c.resuelta(),
                        _ => cfg!(feature = "tw-mainnet") || (!c.liberada() && !c.resuelta()),
                    }
            }
        }
    }

    // ───────────── ejecución ─────────────

    fn firmar(&self, firma: &Address, contrato: &Address, f: &str, args: Vec<Val>, sub: &[MockAuthInvoke]) {
        self.t.env.mock_auths(&[MockAuth {
            address: firma,
            invoke: &MockAuthInvoke { contract: contrato, fn_name: f, args, sub_invokes: sub },
        }]);
    }

    fn ejecutar(&self, op: &Op) -> Res {
        let t = &self.t;
        let env = &t.env;
        let g = &t.guardian;
        let arb = &t.arbiter;
        match op {
            Op::Avanzar(s) => {
                t.advance(*s);
                Res { ok: true, texto: "Ok".to_string(), split: None }
            }
            Op::Fondear { i, firma, como, monto, envio, revision, props_ok } => {
                let c = &self.compras[*i];
                let mut props = c.props.clone();
                if !props_ok {
                    props.title = t.s("otro título");
                }
                let transfer = [MockAuthInvoke {
                    contract: &t.token.address,
                    fn_name: "transfer",
                    args: (como, &c.escrow, *monto).into_val(env),
                    sub_invokes: &[],
                }];
                let fund_escrow = [MockAuthInvoke {
                    contract: &c.escrow,
                    fn_name: "fund_escrow",
                    args: (como, props.clone(), *monto).into_val(env),
                    sub_invokes: &transfer,
                }];
                let args = (&c.escrow, como, props.clone(), *monto, *envio, *revision).into_val(env);
                self.firmar(firma, &g.address, "fund", args, &fund_escrow);
                res(&g.try_fund(&c.escrow, como, &props, monto, envio, revision))
            }
            Op::Enviar { i, firma, como, evidencia } => {
                let c = &self.compras[*i];
                let ev = String::from_str(env, evidencia);
                let cambio = [MockAuthInvoke {
                    contract: &c.escrow,
                    fn_name: "change_milestone_status",
                    args: (0u32, t.s(pp_guardian::SHIPPED_STATUS), Some(ev.clone()), como).into_val(env),
                    sub_invokes: &[],
                }];
                self.firmar(firma, &g.address, "mark_shipped", (&c.escrow, como, ev.clone()).into_val(env), &cambio);
                res(&g.try_mark_shipped(&c.escrow, como, &ev))
            }
            Op::Confirmar { i, firma, como } => {
                let c = &self.compras[*i];
                self.firmar(firma, &g.address, "confirm", (&c.escrow, como).into_val(env), &[]);
                res(&g.try_confirm(&c.escrow, como))
            }
            Op::Extender { i, firma, como } => {
                let c = &self.compras[*i];
                self.firmar(firma, &g.address, "extend", (&c.escrow, como).into_val(env), &[]);
                res(&g.try_extend(&c.escrow, como))
            }
            Op::Disputar { i, firma, como } => {
                let c = &self.compras[*i];
                self.firmar(firma, &g.address, "dispute", (&c.escrow, como).into_val(env), &[]);
                res(&g.try_dispute(&c.escrow, como))
            }
            Op::Resolver { i, firma, bps } => {
                let c = &self.compras[*i];
                self.firmar(firma, &arb.address, "resolve", (&c.escrow, *bps).into_val(env), &[]);
                let r = arb.try_resolve(&c.escrow, bps);
                let mut out = res(&r);
                if let Ok(Ok(s)) = r {
                    out.split = Some(s);
                }
                out
            }
            Op::AutoLiberar { i } => {
                env.set_auths(&[]);
                res(&g.try_auto_release(&self.compras[*i].escrow))
            }
            Op::DevolverNoEnviado { i } => {
                env.set_auths(&[]);
                let r = arb.try_refund_unshipped(&self.compras[*i].escrow);
                let mut out = res(&r);
                if let Ok(Ok(s)) = r {
                    out.split = Some(s);
                }
                out
            }
            Op::IniciarPlazo { i } => {
                env.set_auths(&[]);
                res(&arb.try_start_claim(&self.compras[*i].escrow))
            }
            Op::ResolverVencido { i } => {
                env.set_auths(&[]);
                let r = arb.try_resolve_expired(&self.compras[*i].escrow);
                let mut out = res(&r);
                if let Ok(Ok(s)) = r {
                    out.split = Some(s);
                }
                out
            }
            Op::Directa { i, firma, d } => {
                let c = &self.compras[*i];
                let tw = t.tw(&c.escrow);
                let e = &c.escrow;
                let x = &t.stranger;
                let saldo = t.bal(e);
                let robo = |destino: &Address, v: i128| -> Map<Address, i128> {
                    map![env, (destino.clone(), if v > 0 { v } else { c.monto })]
                };
                match d {
                    Directa::ReleaseFunds { signer } => {
                        self.firmar(firma, e, "release_funds", tw_args!(env, signer, x), &[]);
                        res(&tw_llamar!(tw, try_release_funds, signer, x))
                    }
                    Directa::ApproveMilestone { approver } => {
                        self.firmar(firma, e, "approve_milestone", (0u32, approver).into_val(env), &[]);
                        res(&tw.try_approve_milestone(&0, approver))
                    }
                    Directa::ResolveDispute { resolver, destino } => {
                        let m = robo(destino, saldo);
                        self.firmar(firma, e, "resolve_dispute", tw_args!(env, resolver, x, m.clone()), &[]);
                        res(&tw_llamar!(tw, try_resolve_dispute, resolver, x, &m))
                    }
                    Directa::WithdrawRemaining { resolver, destino } => {
                        let m = robo(destino, saldo);
                        self.firmar(firma, e, "withdraw_remaining_funds", tw_args!(env, resolver, x, m.clone()), &[]);
                        res(&tw_llamar!(tw, try_withdraw_remaining_funds, resolver, x, &m))
                    }
                    Directa::DisputeEscrow { signer } => {
                        self.firmar(firma, e, "dispute_escrow", (signer,).into_val(env), &[]);
                        res(&tw.try_dispute_escrow(signer))
                    }
                    Directa::ChangeStatus { sp, status } => {
                        let ev = Some(t.s("otra guía"));
                        self.firmar(firma, e, "change_milestone_status", (0u32, t.s(status), ev.clone(), sp).into_val(env), &[]);
                        res(&tw.try_change_milestone_status(&0, &t.s(status), &ev, sp))
                    }
                    Directa::Secuestrar { platform } => {
                        let mut p = tw.get_escrow();
                        p.roles.receiver = x.clone();
                        p.roles.service_provider = x.clone();
                        self.firmar(firma, e, "update_escrow", (platform, p.clone()).into_val(env), &[]);
                        res(&tw.try_update_escrow(platform, &p))
                    }
                }
            }
        }
    }

    // ───────────── un paso con todas las verificaciones ─────────────

    fn paso(&mut self, op: Op) -> bool {
        self.pasos += 1;
        let desc = self.describir(&op);
        let t_rel = self.ahora() - T0;
        // Se anota ANTES de ejecutar: si algo revienta, el paso queda en la lista.
        self.log.borrow_mut().push(format!("#{:03} t=+{t_rel} {desc}", self.pasos));
        let antes = self.saldos();
        let esperado = self.esperado(&op, &antes);
        let r = self.ejecutar(&op);
        let despues = self.saldos();
        if let Some(l) = self.log.borrow_mut().last_mut() {
            l.push_str(&format!(" -> {}", r.texto));
        }
        let e = self.stats.entry(op.tipo()).or_insert((0, 0));
        if r.ok {
            e.0 += 1;
        } else {
            e.1 += 1;
        }

        // [I1] Conservación.
        let total: i128 = despues.iter().sum();
        assert_eq!(total, self.suministro, "[I1] cambió la suma total de saldos en: {desc}");

        // [I2] Terceros siempre en 0.
        for a in [&self.t.stranger, &self.t.admin, &self.t.guardian.address, &self.t.arbiter.address] {
            assert_eq!(despues[self.idx(a)], 0, "[I2] {} tiene saldo después de: {desc}", self.n(a));
        }

        // [I3] Una compra terminada no tiene un segundo desenlace.
        if let (Some(i), true) = (op.compra(), op.es_desenlace()) {
            if self.compras[i].desenlace.is_some() {
                assert!(!r.ok, "[I3] segundo desenlace para e{i}: {desc}");
            }
        }

        // [I4] El resultado coincide con el modelo.
        if let Op::Directa { i, firma, d } = &op {
            assert!(!r.ok || self.directa_legitima(*i, firma, d), "[I4] llamada directa de un tercero pasó: {desc}");
        }
        assert_eq!(r.ok, esperado, "[I4] {desc}: el modelo esperaba ok={esperado}, salió {}", r.texto);

        // Cambios de saldo esperados (exactos).
        let mut delta = std::vec![0i128; self.seguidas.len()];
        if r.ok {
            self.aplicar(&op, &r, &mut delta);
        }
        let real: Lista<i128> = despues.iter().zip(&antes).map(|(d, a)| d - a).collect();
        if real != delta {
            let dif: Lista<Texto> = self
                .seguidas
                .iter()
                .enumerate()
                .filter(|(k, _)| real[*k] != delta[*k])
                .map(|(k, a)| format!("{}: real {} esperado {}", self.n(a), real[k], delta[k]))
                .collect();
            panic!("[I2][I3] saldos distintos de lo esperado en: {desc} | {}", dif.join("; "));
        }

        // Saldo de cada escrow según el modelo (también [I3]: terminado ⇒ 0).
        for (k, c) in self.compras.iter().enumerate() {
            assert_eq!(
                despues[self.idx(&c.escrow)],
                c.saldo_esperado(),
                "[I3] saldo de e{k} (desenlace {:?}) después de: {desc}",
                c.desenlace
            );
        }

        // Estado on-chain de la compra tocada = modelo.
        if let Some(i) = op.compra() {
            self.verificar_compra(i, &desc);
        }
        r.ok
    }

    /// Actualiza el modelo con una operación exitosa y calcula los cambios de
    /// saldo exactos que debería haber producido.
    fn aplicar(&mut self, op: &Op, r: &Res, delta: &mut [i128]) {
        let ahora = self.ahora();
        let i_pl = self.idx(&self.t.platform.clone());
        let i_tw = self.idx(&self.t.tw_fee.clone());
        let Some(i) = op.compra() else { return };
        let i_esc = self.idx(&self.compras[i].escrow.clone());
        let (monto, vendedor, comprador) = {
            let c = &self.compras[i];
            (c.monto, c.vendedor.clone(), c.comprador.clone())
        };
        let (tw_nom, pl_nom) = nominal_fees(monto, PLATFORM_FEE_BPS);
        let mut desenlace = None;
        match op {
            Op::Fondear { como, envio, revision, .. } => {
                let ic = self.idx(como);
                let c = &mut self.compras[i];
                c.comprador = Some(como.clone());
                c.fondeada_en = ahora;
                c.envio_secs = *envio;
                c.revision_secs = *revision;
                delta[ic] -= monto;
                delta[i_esc] += monto;
            }
            Op::Enviar { evidencia, .. } => {
                let ev = self.t.s(evidencia);
                let c = &mut self.compras[i];
                c.enviada_en = Some(ahora);
                c.liberar_en = Some(ahora + c.revision_secs);
                c.evidencia = Some(ev);
            }
            Op::Extender { .. } => {
                let c = &mut self.compras[i];
                c.liberar_en = Some(c.liberar_en.unwrap() + c.revision_secs);
                c.extendida = true;
            }
            Op::Disputar { .. } => {
                let c = &mut self.compras[i];
                c.en_disputa = true;
                // H-13: dispute hace correr el plazo del reclamo.
                c.reclamo_en.get_or_insert(ahora);
                if c.liberar_en.map_or(false, |r| ahora >= r) {
                    // H-10: reclamo abierto después de release_at.
                    self.stats.entry("reclamo_tardio_h10").or_insert((0, 0)).0 += 1;
                }
            }
            Op::Directa { d, .. } => {
                let c = &mut self.compras[i];
                if !c.fondeada() {
                    c.tocada_antes = true;
                }
                if let Directa::DisputeEscrow { .. } = d {
                    c.en_disputa = true;
                }
            }
            Op::Confirmar { .. } | Op::AutoLiberar { .. } => {
                desenlace = Some(if matches!(op, Op::Confirmar { .. }) {
                    Desenlace::Confirmada
                } else {
                    Desenlace::AutoLiberada
                });
                // release_funds: comisiones nominales sobre el monto.
                delta[self.idx(&vendedor)] += monto - tw_nom - pl_nom;
                delta[i_pl] += pl_nom;
                delta[i_tw] += tw_nom;
                delta[i_esc] -= monto;
            }
            Op::IniciarPlazo { .. } => {
                self.compras[i].reclamo_en.get_or_insert(ahora);
            }
            Op::Resolver { .. } | Op::DevolverNoEnviado { .. } | Op::ResolverVencido { .. } => {
                let enviada = self.compras[i].enviada_en.is_some();
                let bps = match op {
                    Op::Resolver { bps, .. } => *bps,
                    // H-13: todo al vendedor con envío, todo al comprador sin envío.
                    Op::ResolverVencido { .. } if enviada => 0,
                    _ => BPS_MAX,
                };
                let comprador = comprador.expect("resolve sin comprador");
                let s = r.split.clone().expect("split");
                if let Op::ResolverVencido { .. } = op {
                    let plazo = self.compras[i].plazo_reclamo().expect("[I6] resolve_expired sin plazo");
                    assert!(ahora >= plazo, "[I6] resolve_expired antes del plazo");
                    let todo = if enviada { (0, monto) } else { (monto, 0) };
                    assert_eq!(
                        (s.buyer_amount, s.seller_amount),
                        todo,
                        "[I6] resolve_expired no fue todo a una de las dos partes (enviada={enviada})"
                    );
                    let salida = if enviada { "vencida_al_vendedor" } else { "vencida_al_comprador" };
                    self.stats.entry(salida).or_insert((0, 0)).0 += 1;
                }
                // Reparto del árbitro: la unidad sobrante va al comprador.
                let al_vendedor = monto * (BPS_MAX - bps) as i128 / BPS_MAX as i128;
                assert_eq!(
                    (s.buyer.clone(), s.seller.clone(), s.balance, s.buyer_amount, s.seller_amount),
                    (comprador.clone(), vendedor.clone(), monto, monto - al_vendedor, al_vendedor),
                    "[I3] split inesperado (bps={bps})"
                );
                desenlace = Some(match op {
                    Op::Resolver { .. } => Desenlace::Resuelta,
                    Op::DevolverNoEnviado { .. } => Desenlace::Devuelta,
                    _ => Desenlace::Vencida,
                });
                // resolve_dispute de TW: cada destinatario paga su proporción.
                // (platform también puede ser el comprador: los deltas se suman.)
                let (mut total_tw, mut total_pl) = (0i128, 0i128);
                for (dest, v) in [(&comprador, s.buyer_amount), (&vendedor, s.seller_amount)] {
                    if v > 0 {
                        let f_tw = v * tw_nom / monto;
                        let f_pl = v * pl_nom / monto;
                        delta[self.idx(dest)] += v - f_tw - f_pl;
                        delta[i_tw] += f_tw;
                        delta[i_pl] += f_pl;
                        total_tw += f_tw;
                        total_pl += f_pl;
                    }
                }
                delta[i_esc] -= monto;
                // Las comisiones nunca superan el nominal ni bajan más de 1.
                assert!(total_pl <= pl_nom && total_pl >= pl_nom - 1, "[I3] comisión de platform");
                assert!(total_tw <= tw_nom && total_tw >= tw_nom - 1, "[I3] comisión de TW");
            }
            Op::Avanzar(_) => {}
        }
        if let Some(d) = desenlace {
            let c = &mut self.compras[i];
            assert!(c.desenlace.is_none(), "[I3] segundo desenlace en e{i}");
            c.desenlace = Some(d);
            if c.resuelta() {
                c.en_disputa = false; // TW limpia el flag al resolver
            }
            let nombre = match d {
                Desenlace::Confirmada => "confirmada",
                Desenlace::AutoLiberada => "auto_liberada",
                Desenlace::Resuelta => "resuelta",
                Desenlace::Devuelta => "devuelta_no_enviada",
                Desenlace::Vencida => "vencida",
            };
            *self.desenlaces.entry(nombre).or_insert(0) += 1;
        }
    }

    /// Purchase del guardián y flags de TW iguales al modelo.
    fn verificar_compra(&self, i: usize, desc: &str) {
        let c = &self.compras[i];
        let p = self.t.guardian.purchase(&c.escrow);
        match &c.comprador {
            None => assert_eq!(p, None, "[I4] e{i} no debería tener compra ({desc})"),
            Some(b) => {
                let esperado = Purchase {
                    buyer: b.clone(),
                    seller: c.vendedor.clone(),
                    amount: c.monto,
                    funded_at: c.fondeada_en,
                    ship_secs: c.envio_secs,
                    inspect_secs: c.revision_secs,
                    ship_deadline: c.plazo_envio(),
                    shipped_at: c.enviada_en,
                    release_at: c.liberar_en,
                    extended: c.extendida,
                    evidence: c.evidencia.clone(),
                };
                assert_eq!(p, Some(esperado), "[I4] Purchase de e{i} distinta del modelo ({desc})");
            }
        }
        assert_eq!(
            self.t.arbiter.claim_deadline(&c.escrow),
            c.plazo_reclamo(),
            "[I6] plazo del reclamo de e{i} distinto del modelo ({desc})"
        );
        let e = self.t.tw(&c.escrow).get_escrow();
        let flags = Flags { disputed: c.en_disputa, released: c.liberada(), resolved: c.resuelta() };
        assert_eq!(e.flags, flags, "[I4] flags de TW de e{i} distintos del modelo ({desc})");
        assert_eq!(e.milestones.len(), 1);
        assert_eq!(e.milestones.get(0).unwrap().approved, c.liberada(), "[I4] hito aprobado de e{i}");
        assert_eq!(
            (&e.roles, e.amount, e.platform_fee),
            (&c.props.roles, c.props.amount, c.props.platform_fee),
            "[I2] roles o montos de e{i} cambiaron ({desc})"
        );
    }

    /// [I5] Cierra toda compra fondeada que quedó abierta.
    fn cerrar_todo(&mut self, az: &mut Azar) {
        self.log.borrow_mut().push("── cierre ([I5]) ──".to_string());
        for i in 0..self.compras.len() {
            let c = &self.compras[i];
            if !c.fondeada() || c.desenlace.is_some() {
                continue;
            }
            let comprador = c.comprador.clone().unwrap();
            if !c.en_disputa && c.enviada_en.is_some() {
                let r = c.liberar_en.unwrap();
                let ahora = self.ahora();
                if r > ahora {
                    self.paso(Op::Avanzar(r - ahora));
                }
                assert!(self.paso(Op::AutoLiberar { i }), "[I5] auto_release no cerró e{i}");
            } else {
                if !c.en_disputa {
                    let op = Op::Disputar { i, firma: comprador.clone(), como: comprador };
                    assert!(self.paso(op), "[I5] el comprador no pudo disputar e{i}");
                }
                let c = &self.compras[i];
                let vencido = c.plazo_reclamo().map_or(false, |v| self.ahora() >= v);
                // [I6] Pasado el plazo, el reclamo SIEMPRE se cierra solo; antes
                // del plazo, a veces se espera a que venza.
                if vencido || az.prob(35) {
                    if c.reclamo_en.is_none() {
                        // Disputa abierta directo en TW (TW-1): alguien inicia el plazo.
                        assert!(self.paso(Op::IniciarPlazo { i }), "[I6] start_claim falló en e{i}");
                    }
                    let v = self.compras[i].plazo_reclamo().expect("[I6] sin plazo de reclamo");
                    let ahora = self.ahora();
                    if v > ahora {
                        assert!(!self.paso(Op::ResolverVencido { i }), "[I6] resolve_expired antes del plazo en e{i}");
                        self.paso(Op::Avanzar(v - ahora));
                    }
                    assert!(self.paso(Op::ResolverVencido { i }), "[I6] pasado el plazo, e{i} no se cerró solo");
                    continue;
                }
                let op = if c.enviada_en.is_none() && self.ahora() >= c.plazo_envio() && az.prob(50) {
                    Op::DevolverNoEnviado { i }
                } else {
                    let bps = az.entre(0, BPS_MAX as u64) as u32;
                    Op::Resolver { i, firma: self.t.admin.clone(), bps }
                };
                assert!(self.paso(op), "[I5] no se pudo cerrar e{i}");
            }
        }
        for (k, c) in self.compras.iter().enumerate() {
            assert!(!c.fondeada() || c.desenlace.is_some(), "[I5] e{k} quedó sin desenlace");
            assert_eq!(self.t.bal(&c.escrow), 0, "[I5] e{k} quedó con saldo");
            self.verificar_compra(k, "cierre");
        }
        let fuera_de_escrows: i128 = self.usuarios.iter().chain([&self.t.platform, &self.t.tw_fee]).map(|a| self.t.bal(a)).sum();
        assert_eq!(fuera_de_escrows, self.suministro, "[I1][I5] toda la plata volvió a las partes");
    }
}

// ───────────────────────── correr semillas ─────────────────────────

#[derive(Default)]
struct Resumen {
    semillas: u64,
    pasos: usize,
    stats: BTreeMap<&'static str, (u32, u32)>,
    desenlaces: BTreeMap<&'static str, u32>,
}

fn correr_semilla(semilla: u64, resumen: &mut Resumen) {
    let log: Rc<RefCell<Lista<Texto>>> = Rc::new(RefCell::new(Lista::new()));
    let log2 = log.clone();
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(move || {
        let mut az = Azar::nuevo(semilla);
        let mut m = Mercado::nuevo(&mut az, log2);
        let n_pasos = az.entre(PASOS_MIN, PASOS_MAX);
        for _ in 0..n_pasos {
            // Siempre hay al menos 2 compras activas (hasta MAX_COMPRAS).
            let activas = m.compras.iter().filter(|c| c.desenlace.is_none() && !c.tocada_antes).count();
            if activas < 2 && m.compras.len() < MAX_COMPRAS {
                m.abrir_compra(&mut az);
            }
            let op = m.generar(&mut az);
            m.paso(op);
        }
        m.cerrar_todo(&mut az);
        (m.pasos, m.stats, m.desenlaces)
    }));
    if r.is_ok() && std::env::var_os("SECUENCIAS_VER").is_some() {
        std::println!("semilla {semilla}:\n{}\n", log.borrow().join("\n"));
    }
    match r {
        Ok((pasos, stats, desenlaces)) => {
            resumen.semillas += 1;
            resumen.pasos += pasos;
            for (k, (ok, err)) in stats {
                let e = resumen.stats.entry(k).or_insert((0, 0));
                e.0 += ok;
                e.1 += err;
            }
            for (k, v) in desenlaces {
                *resumen.desenlaces.entry(k).or_insert(0) += v;
            }
        }
        Err(p) => {
            let msg = p
                .downcast_ref::<Texto>()
                .cloned()
                .or_else(|| p.downcast_ref::<&str>().map(|s| s.to_string()))
                .unwrap_or_default();
            panic!(
                "\nFALLÓ la semilla {semilla}: {msg}\n\
                 Repetir: SECUENCIAS_SEMILLA={semilla} cargo test -p pp_integration_tests \
                 --test secuencias_aleatorias -- --nocapture\nPasos:\n{}\n",
                log.borrow().join("\n")
            );
        }
    }
}

fn leer_env(nombre: &str) -> Option<u64> {
    std::env::var(nombre).ok().map(|v| v.trim().parse().expect("debe ser un número"))
}

fn correr_lote(lote: u64) {
    let mut resumen = Resumen::default();
    let semillas: Lista<u64> = match leer_env("SECUENCIAS_SEMILLA") {
        Some(s) if lote == 0 => std::vec![s],
        Some(_) => return,
        None => {
            let n = leer_env("SECUENCIAS_SEMILLAS").unwrap_or(SEMILLAS_POR_DEFECTO);
            (0..n).filter(|s| s % LOTES == lote).collect()
        }
    };
    for s in &semillas {
        correr_semilla(*s, &mut resumen);
    }
    std::println!(
        "lote {lote}: {} semillas, {} pasos | ops (ok/err): {:?} | desenlaces: {:?}",
        resumen.semillas, resumen.pasos, resumen.stats, resumen.desenlaces
    );
    // Con suficientes semillas, el generador tiene que haber recorrido todos los
    // caminos: si no, el test no estaría probando lo que dice.
    if semillas.len() >= 40 {
        for tipo in [
            "fund", "mark_shipped", "confirm", "extend", "dispute", "resolve", "auto_release",
            "refund_unshipped", "start_claim", "resolve_expired", "tw_directa",
        ] {
            let (ok, err) = resumen.stats.get(tipo).copied().unwrap_or((0, 0));
            assert!(ok > 0 && err > 0, "lote {lote}: {tipo} sin casos ok y err ({ok}/{err})");
        }
        for d in ["confirmada", "auto_liberada", "resuelta", "devuelta_no_enviada", "vencida"] {
            assert!(resumen.desenlaces.get(d).copied().unwrap_or(0) > 0, "lote {lote}: nunca hubo {d}");
        }
        // [I6] Las dos salidas del plazo vencido aparecen.
        for salida in ["vencida_al_comprador", "vencida_al_vendedor"] {
            let (n, _) = resumen.stats.get(salida).copied().unwrap_or((0, 0));
            assert!(n > 0, "lote {lote}: nunca hubo {salida}");
        }
    }
}

/// Semillas 0, 4, 8, … (ver la cabecera del archivo).
#[test]
fn secuencias_aleatorias_lote_0() {
    correr_lote(0);
}

/// Semillas 1, 5, 9, …
#[test]
fn secuencias_aleatorias_lote_1() {
    correr_lote(1);
}

/// Semillas 2, 6, 10, …
#[test]
fn secuencias_aleatorias_lote_2() {
    correr_lote(2);
}

/// Semillas 3, 7, 11, …
#[test]
fn secuencias_aleatorias_lote_3() {
    correr_lote(3);
}

/// El PRNG es determinista: la misma semilla da la misma secuencia (para que
/// una semilla que falla se pueda repetir en cualquier máquina).
#[test]
fn prng_determinista() {
    let a: Lista<u64> = (0..5).map({ let mut z = Azar::nuevo(37); move |_| z.sig() }).collect();
    let b: Lista<u64> = (0..5).map({ let mut z = Azar::nuevo(37); move |_| z.sig() }).collect();
    let c: Lista<u64> = (0..5).map({ let mut z = Azar::nuevo(38); move |_| z.sig() }).collect();
    assert_eq!(a, b);
    assert_ne!(a, c);
    // Valor conocido de splitmix64 con semilla 0.
    assert_eq!(Azar::nuevo(0).sig(), 0xE220_A839_7B1D_CDAF);
}
