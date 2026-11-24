//! Hallazgos del red team sobre Trustless Work (TW-1, TW-2, TW-3, TW-5) y la
//! interfaz nueva de v2: mark_shipped, extend, refund_unshipped por plazo de
//! despacho, TTL de Purchase y contratos no actualizables.
extern crate std;

mod common;
use common::*;

use pp_arbiter::Error as AErr;
use pp_guardian::{DataKey, Error as GErr, PURCHASE_BUMP};
use soroban_sdk::{
    map,
    testutils::{storage::Persistent as _, Ledger, MockAuth, MockAuthInvoke},
    Address, IntoVal, String, Val, Vec,
};

fn mock(t: &Ctx, who: &Address, contract: &Address, f: &'static str, args: Vec<Val>) {
    t.env.mock_auths(&[MockAuth {
        address: who,
        invoke: &MockAuthInvoke { contract, fn_name: f, args, sub_invokes: &[] },
    }]);
}

// ───────────────────────── TW-1: platform puede disputar ─────────────────────────

/// TW-1: `platform` abre una disputa DIRECTO en TW (sin pasar por el
/// guardián). El guardián lee el flag real de TW: auto_release, confirm y
/// extend quedan bloqueados, y el árbitro reparte solo entre las partes.
#[test]
fn tw1_disputa_de_platform_bloquea_auto_release() {
    let t = setup();
    let (escrow, _) = t.funded();
    t.ship(&escrow);
    t.tw(&escrow).dispute_escrow(&t.platform); // TW lo permite
    assert!(t.tw(&escrow).get_escrow().flags.disputed);
    assert_eq!(t.guardian.try_extend(&escrow, &t.buyer), Err(Ok(GErr::EscrowDisputed)));
    t.advance(INSPECT + 1);
    assert_eq!(t.guardian.try_auto_release(&escrow), Err(Ok(GErr::EscrowDisputed)));
    assert_eq!(t.guardian.try_confirm(&escrow, &t.buyer), Err(Ok(GErr::EscrowDisputed)));
    assert_eq!(t.bal(&escrow), AMOUNT);

    let before = t.snapshot(&t.everyone(&escrow));
    t.arbiter.resolve(&escrow, &5_000);
    let d: std::vec::Vec<i128> = t.snapshot(&t.everyone(&escrow)).iter().zip(&before).map(|(a, b)| a - b).collect();
    assert_eq!(&d[4..8], &[0, 0, 0, 0]);
}

// ───────────────────────── TW-2: platform agrega hitos ─────────────────────────

fn add_milestone(t: &Ctx, escrow: &Address, props: &pp_guardian::Escrow, status: &str) {
    let mut more = props.clone();
    let mut m = props.milestones.get(0).unwrap();
    m.description = t.s("Hito agregado por la plataforma");
    m.status = t.s(status);
    // El hito 0 ya puede estar en "enviado": se copia el estado actual de TW.
    more.milestones = t.tw(escrow).get_escrow().milestones;
    more.milestones.push_back(m);
    t.tw(escrow).update_escrow(&t.platform, &more);
}

/// TW-2: con fondos adentro, `platform` agrega un hito sin aprobar (TW lo
/// permite). `confirm` aprueba TODOS los hitos y libera igual.
#[test]
fn tw2_hito_agregado_confirm_aprueba_todos_y_libera() {
    let t = setup();
    let (escrow, props) = t.funded();
    t.ship(&escrow);
    add_milestone(&t, &escrow, &props, "pendiente");
    assert_eq!(t.tw(&escrow).get_escrow().milestones.len(), 2);
    t.guardian.confirm(&escrow, &t.buyer);
    let e = t.tw(&escrow).get_escrow();
    assert!(e.flags.released);
    assert!(e.milestones.iter().all(|m| m.approved));
    assert_eq!(t.bal(&t.seller), 1_465_500_000);
}

/// TW-2: auto_release también aprueba todos los hitos.
#[test]
fn tw2_auto_release_tambien_aprueba_todos() {
    let t = setup();
    let (escrow, props) = t.funded();
    add_milestone(&t, &escrow, &props, "pendiente");
    t.ship(&escrow);
    t.advance(INSPECT);
    t.guardian.auto_release(&escrow);
    let e = t.tw(&escrow).get_escrow();
    assert!(e.flags.released && e.milestones.iter().all(|m| m.approved));
}

/// TW-2 (límite): si el hito agregado tiene status VACÍO, TW no deja aprobarlo
/// (#30). El guardián responde `MilestoneNotApprovable` sin tocar nada y queda
/// la vía de disputa: el árbitro reparte solo entre comprador y vendedor.
#[test]
fn tw2_hito_con_status_vacio_queda_la_disputa() {
    let t = setup();
    let buyer0 = t.bal(&t.buyer);
    let (escrow, props) = t.funded();
    t.ship(&escrow);
    add_milestone(&t, &escrow, &props, "");
    assert_eq!(t.guardian.try_confirm(&escrow, &t.buyer), Err(Ok(GErr::MilestoneNotApprovable)));
    t.advance(INSPECT);
    assert_eq!(t.guardian.try_auto_release(&escrow), Err(Ok(GErr::MilestoneNotApprovable)));
    assert!(!t.tw(&escrow).get_escrow().milestones.get(0).unwrap().approved);
    t.guardian.dispute(&escrow, &t.buyer);
    t.arbiter.resolve(&escrow, &10_000);
    assert_eq!(t.bal(&t.buyer), buyer0 - AMOUNT + 1_465_500_000);
    assert_eq!(t.bal(&t.stranger), 0);
}

// ───────────────────────── TW-3: evidencia sobrescribible ─────────────────────────

/// TW-3: el vendedor puede sobrescribir la evidencia directo en TW, pero el
/// registro del guardián (evidencia, shipped_at, release_at) es inmutable y es
/// el que cuenta. Y mark_shipped no se puede repetir.
#[test]
fn tw3_evidencia_inmutable_en_el_guardian() {
    let t = setup();
    let (escrow, _) = t.funded();
    t.ship(&escrow);
    let p0 = t.guardian.purchase(&escrow).unwrap();
    t.advance(60);
    t.tw(&escrow).change_milestone_status(&0, &t.s("enviado"), &Some(t.s("otra guía")), &t.seller);
    assert_eq!(t.tw(&escrow).get_escrow().milestones.get(0).unwrap().evidence, t.s("otra guía"));
    assert_eq!(t.guardian.purchase(&escrow).unwrap(), p0);
    assert_eq!(
        t.guardian.try_mark_shipped(&escrow, &t.seller, &t.s("otra guía")),
        Err(Ok(GErr::AlreadyShipped))
    );
}

// ───────────────────────── TW-5: withdraw_remaining_funds ─────────────────────────

/// TW-5: `withdraw_remaining_funds` acepta destinos arbitrarios, pero solo lo
/// puede llamar el dispute_resolver (pp_arbiter), que no tiene ninguna ruta a
/// esa función. Fondos sobrantes en un escrow liberado no se pueden desviar.
#[test]
fn tw5_sin_ruta_a_withdraw_remaining_funds() {
    let t = setup();
    let (escrow, _) = t.funded();
    t.ship(&escrow);
    t.guardian.confirm(&escrow, &t.buyer);
    t.sac.mint(&escrow, &(5 * UNIT)); // saldo sobrante "perdido" en el escrow
    let tw = t.tw(&escrow);
    let steal = map![&t.env, (t.stranger.clone(), 5 * UNIT)];
    let before = t.snapshot(&t.everyone(&escrow));

    assert_eq!(
        tw_llamar!(tw, try_withdraw_remaining_funds, &t.stranger, &t.stranger, &steal),
        Err(Ok(TwError::OnlyDisputeResolverCanExecuteThisFunction))
    );
    for who in [&t.stranger, &t.admin, &t.platform, &t.seller] {
        let args = tw_args!(&t.env, &t.arbiter.address, &t.stranger, steal.clone());
        mock(&t, who, &escrow, "withdraw_remaining_funds", args);
        assert!(tw_llamar!(tw, try_withdraw_remaining_funds, &t.arbiter.address, &t.stranger, &steal).is_err());
    }
    t.env.set_auths(&[]);
    assert!(tw_llamar!(tw, try_withdraw_remaining_funds, &t.arbiter.address, &t.stranger, &steal).is_err());
    assert_eq!(t.snapshot(&t.everyone(&escrow)), before);
}

// ───────────────────────── mark_shipped ─────────────────────────

/// mark_shipped: solo el vendedor registrado, con su firma, con evidencia
/// válida, una vez y antes del plazo de despacho. Con disputa abierta se permite.
#[test]
fn mark_shipped_reglas() {
    let t = setup();
    let (escrow, _) = t.funded();
    let ev = t.s(EVIDENCE);
    for who in [&t.stranger, &t.buyer, &t.platform] {
        assert_eq!(t.guardian.try_mark_shipped(&escrow, who, &ev), Err(Ok(GErr::NotSeller)));
    }
    t.env.set_auths(&[]);
    assert!(t.guardian.try_mark_shipped(&escrow, &t.seller, &ev).is_err());
    t.env.mock_all_auths();
    assert_eq!(t.guardian.try_mark_shipped(&escrow, &t.seller, &t.s("")), Err(Ok(GErr::InvalidEvidence)));
    let long = String::from_str(&t.env, &"x".repeat(257));
    assert_eq!(t.guardian.try_mark_shipped(&escrow, &t.seller, &long), Err(Ok(GErr::InvalidEvidence)));
    t.ship(&escrow);
    assert_eq!(t.guardian.try_mark_shipped(&escrow, &t.seller, &ev), Err(Ok(GErr::AlreadyShipped)));

    let (late, _) = t.funded_with(AMOUNT, MIN_WIN, INSPECT);
    t.advance(MIN_WIN);
    assert_eq!(t.guardian.try_mark_shipped(&late, &t.seller, &ev), Err(Ok(GErr::ShipDeadlinePassed)));

    let (disp, _) = t.funded();
    t.guardian.dispute(&disp, &t.buyer);
    t.ship(&disp);
    assert!(t.guardian.purchase(&disp).unwrap().shipped_at.is_some());
}

// ───────────────────────── extend ─────────────────────────

/// extend suma inspect_secs a release_at una sola vez: antes del nuevo plazo
/// auto_release no libera; después sí.
#[test]
fn extend_suma_inspect_y_solo_una_vez() {
    let t = setup();
    let (escrow, _) = t.funded_with(AMOUNT, SHIP, MIN_WIN);
    t.ship(&escrow);
    let r0 = t.guardian.purchase(&escrow).unwrap().release_at.unwrap();
    let p = t.guardian.extend(&escrow, &t.buyer);
    assert_eq!((p.release_at, p.extended), (Some(r0 + MIN_WIN), true));
    assert_eq!(t.guardian.try_extend(&escrow, &t.buyer), Err(Ok(GErr::AlreadyExtended)));
    t.set_time(r0);
    assert_eq!(t.guardian.try_auto_release(&escrow), Err(Ok(GErr::DeadlineNotReached)));
    t.set_time(r0 + MIN_WIN - 1);
    assert_eq!(t.guardian.try_auto_release(&escrow), Err(Ok(GErr::DeadlineNotReached)));
    t.set_time(r0 + MIN_WIN);
    t.guardian.auto_release(&escrow);
    assert!(t.tw(&escrow).get_escrow().flags.released);
}

/// extend: solo el comprador, con su firma, con envío registrado, antes de
/// release_at y sin disputa.
#[test]
fn extend_reglas() {
    let t = setup();
    let (escrow, _) = t.funded();
    assert_eq!(t.guardian.try_extend(&escrow, &t.buyer), Err(Ok(GErr::NotShipped)));
    t.ship(&escrow);
    for who in [&t.stranger, &t.seller, &t.platform] {
        assert_eq!(t.guardian.try_extend(&escrow, who), Err(Ok(GErr::NotBuyer)));
    }
    t.env.set_auths(&[]);
    assert!(t.guardian.try_extend(&escrow, &t.buyer).is_err());
    t.env.mock_all_auths();
    t.advance(INSPECT);
    assert_eq!(t.guardian.try_extend(&escrow, &t.buyer), Err(Ok(GErr::ReleaseWindowClosed)));

    let (e2, _) = t.funded();
    t.ship(&e2);
    t.guardian.dispute(&e2, &t.seller);
    assert_eq!(t.guardian.try_extend(&e2, &t.buyer), Err(Ok(GErr::EscrowDisputed)));
}

// ───────────────────────── refund_unshipped v2 ─────────────────────────

/// refund_unshipped: con disputa, vencido el plazo de despacho y sin envío
/// registrado en el guardián, cualquiera devuelve el 100% al comprador. El
/// "enviado" escrito directo en TW no cuenta.
#[test]
fn refund_unshipped_por_plazo_de_despacho() {
    let t = setup();
    let buyer0 = t.bal(&t.buyer);
    let (escrow, _) = t.funded_with(AMOUNT, MIN_WIN, INSPECT);
    assert_eq!(t.arbiter.try_refund_unshipped(&escrow), Err(Ok(AErr::NotInDispute)));
    t.guardian.dispute(&escrow, &t.buyer);
    assert_eq!(t.arbiter.try_refund_unshipped(&escrow), Err(Ok(AErr::DeadlineNotReached)));
    t.tw(&escrow).change_milestone_status(&0, &t.s("enviado"), &None, &t.seller);
    t.advance(MIN_WIN);
    assert_eq!(t.guardian.try_mark_shipped(&escrow, &t.seller, &t.s(EVIDENCE)), Err(Ok(GErr::ShipDeadlinePassed)));
    t.env.set_auths(&[]);
    let s = t.arbiter.refund_unshipped(&escrow);
    assert!(t.env.auths().is_empty());
    assert_eq!((s.buyer_amount, s.seller_amount), (AMOUNT, 0));
    assert_eq!(t.bal(&t.buyer), buyer0 - AMOUNT + 1_465_500_000);
    t.env.mock_all_auths();

    let (e2, _) = t.funded_with(AMOUNT, MIN_WIN, INSPECT);
    t.ship(&e2);
    t.guardian.dispute(&e2, &t.buyer);
    t.advance(MIN_WIN);
    assert_eq!(t.arbiter.try_refund_unshipped(&e2), Err(Ok(AErr::AlreadyShipped)));
}

// ───────────────────────── TTL ─────────────────────────

/// El TTL de cada Purchase (storage persistente) se extiende en cada operación.
#[test]
fn ttl_de_purchase_se_extiende_en_cada_operacion() {
    let t = setup();
    let (escrow, _) = t.funded();
    let ttl = || {
        t.env.as_contract(&t.guardian.address, || {
            t.env.storage().persistent().get_ttl(&DataKey::Purchase(escrow.clone()))
        })
    };
    assert_eq!(ttl(), PURCHASE_BUMP);
    let skip = 20_000u32; // > 1 día de ledgers: por debajo del umbral de extensión
    let seq = t.env.ledger().sequence();
    t.env.ledger().set_sequence_number(seq + skip);
    assert_eq!(ttl(), PURCHASE_BUMP - skip);
    t.ship(&escrow);
    assert_eq!(ttl(), PURCHASE_BUMP);
    t.env.ledger().set_sequence_number(seq + 2 * skip);
    t.guardian.extend(&escrow, &t.buyer);
    assert_eq!(ttl(), PURCHASE_BUMP);
}

// ───────────────────────── no actualizables, sin TW-5 ─────────────────────────

fn code_lines(src: &str) -> std::vec::Vec<&str> {
    src.lines().map(|l| l.trim()).filter(|l| !l.starts_with("//")).collect()
}

fn pub_fns(src: &str) -> std::vec::Vec<std::string::String> {
    let mut v: std::vec::Vec<std::string::String> = code_lines(src)
        .iter()
        .filter_map(|l| l.strip_prefix("pub fn "))
        .map(|l| l.split('(').next().unwrap().to_string())
        .collect();
    v.sort();
    v
}

/// Ninguno de los dos contratos es actualizable (no llaman
/// `update_current_contract_wasm` ni despliegan código) y ninguno tiene ruta a
/// `withdraw_remaining_funds` ni a `update_escrow` de TW. La interfaz pública es
/// exactamente la documentada.
#[test]
fn contratos_no_actualizables_y_sin_rutas_peligrosas() {
    let guardian = include_str!("../../pp_guardian/src/lib.rs");
    let arbiter = include_str!("../../pp_arbiter/src/lib.rs");
    let shared = include_str!("../../shared/escrow_iface.rs");
    for (name, src) in [("pp_guardian", guardian), ("pp_arbiter", arbiter), ("shared", shared)] {
        for line in code_lines(src) {
            for banned in [
                "update_current_contract",
                "upload_contract_wasm",
                "deployer(",
                "withdraw_remaining_funds",
                "update_escrow",
            ] {
                assert!(!line.contains(banned), "{name}: `{banned}` en: {line}");
            }
        }
    }
    assert_eq!(
        pub_fns(guardian),
        ["__constructor", "auto_release", "config", "confirm", "dispute", "extend", "fund",
         "mark_shipped", "purchase", "set_arbiter"]
    );
    assert_eq!(
        pub_fns(arbiter),
        ["__constructor", "claim_deadline", "config", "quote", "refund_unshipped", "resolve",
         "resolve_expired", "set_admin", "start_claim"]
    );
}
