//! Hallazgos del jurado técnico (20-nov), traídos del PoC
//! `council/poc/tests/reputacion_falsificable.rs` al repo.
//!
//! Estos tests documentan el comportamiento ACTUAL de los contratos (v2). Pasan
//! a propósito: el nombre de cada test dice que muestra una debilidad conocida.
//!
//! - H-9 (reputación falsificable): un escrow FALSO que imita la interfaz de
//!   Trustless Work puede llamar `pp_guardian.fund` y hacer que pp_guardian y
//!   pp_arbiter emitan eventos auténticos sin mover plata. Los fondos nunca
//!   corren riesgo: el ataque es contra la reputación.
//!   H-9 queda mitigado en el indexador de la app
//!   (`app/src/lib/server/verificacion.ts` y `docs/METRICAS.md`), no en el
//!   contrato: la app solo cuenta una compra si su escrow corre el hash del
//!   WASM de TW, tiene los roles pp_guardian / pp_arbiter / platform, usa LABUSD
//!   y la transacción de fondeo incluye el `transfer` del SAC.
//! - H-10 (reclamo tardío): `pp_guardian.dispute` no tiene plazo. Si nadie
//!   llamó `auto_release`, el comprador puede abrir un reclamo mucho después de
//!   `release_at` y bloquear la liberación automática.
//!   H-10 es conocido, arreglo previsto en v3 (`docs/SEGURIDAD.md`): disputa
//!   solo hasta `release_at` + un período de gracia.
extern crate std;

mod common;
use common::*;

use pp_guardian::{Error as GErr, Escrow, Flags, Milestone, Roles, Trustline};
use soroban_sdk::{
    contract, contractimpl, contracttype,
    testutils::{Address as _, Events as _},
    vec,
    xdr::{ContractEventBody, ScVal},
    Address, Env, Map, String, TryFromVal, Val,
};

// ───────────────────────── escrow falso (H-9) ─────────────────────────

#[contracttype]
enum Clave {
    Escrow,
}

/// Contrato del atacante: imita la interfaz de Trustless Work, devuelve el
/// `Escrow` que él quiera y no mueve ni un centavo.
#[contract]
pub struct EscrowFalso;

#[contractimpl]
impl EscrowFalso {
    pub fn set(env: Env, e: Escrow) {
        env.storage().instance().set(&Clave::Escrow, &e);
    }
    pub fn get_escrow(env: Env) -> Escrow {
        env.storage().instance().get(&Clave::Escrow).unwrap()
    }
    pub fn fund_escrow(_env: Env, _signer: Address, _expected: Escrow, _amount: i128) {}
    pub fn change_milestone_status(
        _env: Env,
        _i: u32,
        _status: String,
        _evidence: Option<String>,
        _sp: Address,
    ) {
    }
    pub fn approve_milestone(_env: Env, _i: u32, _approver: Address) {}
    pub fn release_funds(_env: Env, _release_signer: Address, _tw: Address) {}
    pub fn dispute_escrow(env: Env, _signer: Address) {
        let mut e: Escrow = env.storage().instance().get(&Clave::Escrow).unwrap();
        e.flags.disputed = true;
        env.storage().instance().set(&Clave::Escrow, &e);
    }
    pub fn resolve_dispute(_env: Env, _dr: Address, _tw: Address, _d: Map<Address, i128>) {}
}

/// Despliega un escrow falso con los roles exactos del modo guardián y la
/// moneda real (LABUSD de prueba). `platform` es una dirección cualquiera.
fn escrow_falso(t: &Ctx, vendedor: &Address, monto: i128) -> (Address, Escrow) {
    let e = &t.env;
    let props = Escrow {
        engagement_id: t.s("PP-0000"),
        title: t.s("iPhone 15 Pro"),
        roles: Roles {
            approver: t.guardian.address.clone(),
            service_provider: vendedor.clone(),
            platform: Address::generate(e),
            release_signer: t.guardian.address.clone(),
            dispute_resolver: t.arbiter.address.clone(),
            receiver: vendedor.clone(),
        },
        description: t.s("venta ficticia"),
        amount: monto,
        platform_fee: 0,
        milestones: vec![
            e,
            Milestone {
                description: t.s("Entrega"),
                status: t.s("pendiente"),
                evidence: t.s(""),
                approved: false,
            },
        ],
        flags: Flags { disputed: false, released: false, resolved: false },
        trustline: Trustline { address: t.token.address.clone() },
        receiver_memo: 0,
    };
    let id = e.register(EscrowFalso, ());
    EscrowFalsoClient::new(e, &id).set(&props);
    (id, props)
}

// ───────────────────────── ayudas para leer eventos ─────────────────────────

/// Eventos que emitió `contrato` en la ÚLTIMA invocación: (tópicos, datos).
/// Ojo: cualquier llamada (incluso `balance`) es una invocación nueva.
fn eventos(t: &Ctx, contrato: &Address) -> std::vec::Vec<(std::vec::Vec<ScVal>, ScVal)> {
    t.env
        .events()
        .all()
        .filter_by_contract(contrato)
        .events()
        .iter()
        .map(|e| {
            let ContractEventBody::V0(v0) = &e.body;
            (v0.topics.iter().cloned().collect(), v0.data.clone())
        })
        .collect()
}

/// Nombre (primer tópico) de cada evento que emitió `contrato`.
fn nombres(t: &Ctx, contrato: &Address) -> std::vec::Vec<std::string::String> {
    eventos(t, contrato)
        .iter()
        .map(|(topics, _)| match topics.first() {
            Some(ScVal::Symbol(s)) => s.0.to_utf8_string_lossy(),
            _ => std::string::String::from("?"),
        })
        .collect()
}

/// Transferencias del SAC en la última invocación: (desde, hacia, monto).
fn transferencias(t: &Ctx) -> std::vec::Vec<(Address, Address, i128)> {
    eventos(t, &t.token.address)
        .iter()
        .filter(|(topics, _)| matches!(topics.first(), Some(ScVal::Symbol(s)) if s.0.to_utf8_string_lossy() == "transfer"))
        .map(|(topics, data)| {
            let desde = Address::try_from_val(&t.env, &topics[1]).unwrap();
            let hacia = Address::try_from_val(&t.env, &topics[2]).unwrap();
            let v = Val::try_from_val(&t.env, data).unwrap();
            (desde, hacia, i128::try_from_val(&t.env, &v).unwrap())
        })
        .collect()
}

/// Direcciones cuya firma exigió la última invocación.
fn firmantes(t: &Ctx) -> std::vec::Vec<Address> {
    t.env.auths().into_iter().map(|(a, _)| a).collect()
}

// ───────────────────────── H-9 ─────────────────────────

/// H-9 (a), mitigado en la app: un estafador infla su reputación. Con un
/// escrow falso y una segunda cuenta de saldo 0 fabrica una "venta protegida
/// y confirmada" de USD 5.000. Los eventos `pp_funded`, `pp_shipped` y
/// `pp_confirmed` salen del pp_guardian REAL, pero no hay ningún `transfer`
/// del SAC y nadie movió un centavo. Por eso el indexador exige el WASM de TW
/// y el `transfer` en la transacción de fondeo.
#[test]
fn h9_mitigado_en_app_escrow_falso_infla_reputacion_sin_mover_plata() {
    let t = setup();
    let estafador = Address::generate(&t.env);
    let titere = Address::generate(&t.env); // segunda cuenta, saldo 0
    let monto = 5_000 * UNIT;
    let (falso, props) = escrow_falso(&t, &estafador, monto);

    t.guardian.fund(&falso, &titere, &props, &monto, &MIN_WIN, &MIN_WIN);
    assert_eq!(nombres(&t, &t.guardian.address), ["pp_funded"]);
    assert!(transferencias(&t).is_empty(), "el fondeo falso no mueve el SAC");

    t.guardian.mark_shipped(&falso, &estafador, &t.s("OLVA-000001"));
    assert_eq!(nombres(&t, &t.guardian.address), ["pp_shipped"]);

    t.guardian.confirm(&falso, &titere);
    assert_eq!(nombres(&t, &t.guardian.address), ["pp_confirmed"]);
    assert!(transferencias(&t).is_empty(), "la confirmación falsa no paga a nadie");

    let p = t.guardian.purchase(&falso).unwrap();
    assert_eq!((p.amount, p.seller, p.buyer), (monto, estafador.clone(), titere.clone()));
    for a in [&estafador, &titere, &falso] {
        assert_eq!(t.bal(a), 0, "nadie movió un centavo");
    }
}

/// H-9 (b), mitigado en la app: un tercero difama a un vendedor honesto. Con
/// un escrow falso que nombra al vendedor como receiver, el atacante registra
/// una "compra", abre un reclamo y dispara la "devolución por no despachar".
/// El vendedor nunca firma nada: las únicas firmas son las del atacante, y
/// `refund_unshipped` no pide ninguna. Aun así salen `pp_disputed` y
/// `pp_refunded_unshipped` a nombre del vendedor.
#[test]
fn h9_mitigado_en_app_escrow_falso_difama_vendedor_sin_su_firma() {
    let t = setup();
    let victima = Address::generate(&t.env); // vendedor honesto, nunca firma
    let atacante = Address::generate(&t.env);
    let monto = 1_500 * UNIT;
    let (falso, props) = escrow_falso(&t, &victima, monto);

    t.guardian.fund(&falso, &atacante, &props, &monto, &MIN_WIN, &MIN_WIN);
    assert_eq!(firmantes(&t), [atacante.clone()]);
    assert_eq!(nombres(&t, &t.guardian.address), ["pp_funded"]);

    t.guardian.dispute(&falso, &atacante);
    assert_eq!(firmantes(&t), [atacante.clone()]);
    assert_eq!(nombres(&t, &t.guardian.address), ["pp_disputed"]);

    // 1 unidad (0,0000001) para pasar el chequeo EmptyEscrow del árbitro.
    t.sac.mint(&atacante, &1);
    t.token.transfer(&atacante, &falso, &1);

    t.advance(MIN_WIN);
    t.arbiter.refund_unshipped(&falso); // sin firma de nadie
    assert!(firmantes(&t).is_empty());
    assert_eq!(nombres(&t, &t.arbiter.address), ["pp_refunded_unshipped"]);

    let p = t.guardian.purchase(&falso).unwrap();
    assert_eq!(p.seller, victima);
    assert_eq!(p.shipped_at, None);
    assert_eq!(t.bal(&victima), 0);
}

/// H-9, contraste con el escrow REAL de Trustless Work: un fondeo genuino SÍ
/// mueve el SAC en la misma transacción (comprador −monto, escrow +monto) y
/// deja un evento `transfer` del SAC del comprador al escrow. Esa es la
/// propiedad que verifica el indexador de la app; el escrow falso no la cumple.
#[test]
fn h9_contraste_fondeo_real_mueve_el_sac() {
    let t = setup();
    let comprador0 = t.bal(&t.buyer);
    let props = t.guardian_props(AMOUNT);
    let escrow = t.deploy_escrow(&props);
    assert_eq!(t.bal(&escrow), 0);

    t.guardian.fund(&escrow, &t.buyer, &props, &AMOUNT, &SHIP, &INSPECT);
    // Leer los eventos ANTES de consultar saldos (cada consulta es una invocación).
    assert_eq!(nombres(&t, &t.guardian.address), ["pp_funded"]);
    assert_eq!(transferencias(&t), [(t.buyer.clone(), escrow.clone(), AMOUNT)]);

    assert_eq!(t.bal(&t.buyer), comprador0 - AMOUNT);
    assert_eq!(t.bal(&escrow), AMOUNT);
}

// ───────────────────────── H-10 ─────────────────────────

/// H-10, conocido (arreglo previsto en v3): `dispute` no tiene plazo. Con el
/// escrow REAL de Trustless Work: fondeo → envío → pasan `release_at` y 30
/// días más sin que nadie llame `auto_release`. El comprador todavía puede
/// abrir un reclamo, y desde ese momento `auto_release` falla con
/// `EscrowDisputed` (#20). En cambio `extend` sí respeta el plazo. La plata no
/// se pierde: queda en el escrow hasta que el árbitro resuelve.
#[test]
fn h10_conocido_reclamo_tardio_bloquea_auto_release() {
    let t = setup();
    let (escrow, _) = t.funded();
    t.ship(&escrow);
    let release_at = t.guardian.purchase(&escrow).unwrap().release_at.unwrap();

    t.set_time(release_at + 30 * 24 * 3600);
    // extend tiene plazo; dispute no.
    assert_eq!(t.guardian.try_extend(&escrow, &t.buyer), Err(Ok(GErr::ReleaseWindowClosed)));
    t.guardian.dispute(&escrow, &t.buyer); // no falla: este es el hallazgo
    assert!(t.tw(&escrow).get_escrow().flags.disputed);

    assert_eq!(t.guardian.try_auto_release(&escrow), Err(Ok(GErr::EscrowDisputed)));
    assert_eq!(t.bal(&escrow), AMOUNT);
    assert_eq!(t.bal(&t.seller), 0);

    // Hoy la única salida es el árbitro (aquí falla 100% a favor del vendedor).
    t.arbiter.resolve(&escrow, &0);
    assert_eq!(t.bal(&escrow), 0);
    assert_eq!(t.bal(&t.seller), 1_465_500_000);
}
