//! Invariantes de SPEC.md §4 sobre la interfaz v2, con el WASM real de
//! Trustless Work. Cada test indica entre corchetes el invariante: [I1]..[I9].
extern crate std;

mod common;
use common::*;

use pp_arbiter::Error as AErr;
use pp_guardian::Error as GErr;
use soroban_sdk::{
    map,
    testutils::{Address as _, AuthorizedFunction, MockAuth, MockAuthInvoke},
    Address, IntoVal, Symbol, Val, Vec,
};

fn mock(t: &Ctx, who: &Address, contract: &Address, f: &'static str, args: Vec<Val>) {
    t.env.mock_auths(&[MockAuth {
        address: who,
        invoke: &MockAuthInvoke { contract, fn_name: f, args, sub_invokes: &[] },
    }]);
}

// ───────────────────────── caso feliz y comisiones ─────────────────────────

/// [I3][I9] fund → mark_shipped → confirm, con comisiones exactas (2% / 0,3%).
#[test]
fn caso_feliz_fund_ship_confirm_comisiones_exactas() {
    let t = setup();
    let buyer0 = t.bal(&t.buyer);
    let (escrow, _) = t.funded();
    let p = t.guardian.purchase(&escrow).unwrap();
    assert_eq!((p.buyer.clone(), p.seller.clone(), p.amount), (t.buyer.clone(), t.seller.clone(), AMOUNT));
    assert_eq!((p.funded_at, p.ship_secs, p.inspect_secs, p.ship_deadline), (T0, SHIP, INSPECT, T0 + SHIP));
    assert_eq!((p.shipped_at, p.release_at, p.extended, p.evidence), (None, None, false, None));

    t.advance(3600);
    t.ship(&escrow);
    let p = t.guardian.purchase(&escrow).unwrap();
    assert_eq!(p.shipped_at, Some(T0 + 3600));
    assert_eq!(p.release_at, Some(T0 + 3600 + INSPECT));
    assert_eq!(p.evidence, Some(t.s(EVIDENCE)));
    let m = t.tw(&escrow).get_escrow().milestones.get(0).unwrap();
    assert_eq!((m.status, m.evidence), (t.s("enviado"), t.s(EVIDENCE)));

    t.guardian.confirm(&escrow, &t.buyer);
    assert_eq!(t.bal(&t.buyer), buyer0 - AMOUNT);
    assert_eq!(t.bal(&t.seller), 1_465_500_000); // 146,55
    assert_eq!(t.bal(&t.platform), 30_000_000); // 3,00
    assert_eq!(t.bal(&t.tw_fee), 4_500_000); // 0,45
    assert_eq!(t.bal(&escrow), 0);
    let e = t.tw(&escrow).get_escrow();
    assert!(e.flags.released && e.milestones.get(0).unwrap().approved);
}

/// [I3] Árboles de auth: el comprador firma fund → fund_escrow → transfer; el
/// vendedor firma mark_shipped → change_milestone_status; confirm solo pide al
/// comprador (el guardián se autoriza como invocador directo).
#[test]
fn arboles_de_auth_de_fund_ship_y_confirm() {
    let t = setup();
    let name = |f: &AuthorizedFunction| match f {
        AuthorizedFunction::Contract((addr, sym, _)) => (addr.clone(), sym.clone()),
        _ => panic!("se esperaba una invocación de contrato"),
    };
    let sym = |s: &str| Symbol::new(&t.env, s);
    let (escrow, _) = t.funded();
    let a = t.env.auths();
    assert_eq!(a.len(), 1);
    assert_eq!(a[0].0, t.buyer);
    assert_eq!(name(&a[0].1.function), (t.guardian.address.clone(), sym("fund")));
    let sub = &a[0].1.sub_invocations[0];
    assert_eq!(name(&sub.function), (escrow.clone(), sym("fund_escrow")));
    assert_eq!(name(&sub.sub_invocations[0].function), (t.token.address.clone(), sym("transfer")));

    t.ship(&escrow);
    let a = t.env.auths();
    assert_eq!(a.len(), 1);
    assert_eq!(a[0].0, t.seller);
    assert_eq!(name(&a[0].1.function), (t.guardian.address.clone(), sym("mark_shipped")));
    assert_eq!(name(&a[0].1.sub_invocations[0].function), (escrow.clone(), sym("change_milestone_status")));

    t.guardian.confirm(&escrow, &t.buyer);
    let a = t.env.auths();
    assert_eq!(a.len(), 1);
    assert_eq!(a[0].0, t.buyer);
    assert_eq!(name(&a[0].1.function), (t.guardian.address.clone(), sym("confirm")));
    assert!(a[0].1.sub_invocations.is_empty());
}

// ───────────────────────── [I3] confirm ─────────────────────────

/// [I3] Solo el comprador registrado puede confirmar, y con su firma.
#[test]
fn confirm_solo_comprador_registrado() {
    let t = setup();
    let (escrow, _) = t.funded();
    t.ship(&escrow);
    for who in [&t.stranger, &t.seller, &t.platform, &t.admin] {
        assert_eq!(t.guardian.try_confirm(&escrow, who), Err(Ok(GErr::NotBuyer)));
    }
    t.env.set_auths(&[]);
    assert!(t.guardian.try_confirm(&escrow, &t.buyer).is_err());
    let args = (&escrow, &t.buyer).into_val(&t.env);
    mock(&t, &t.stranger, &t.guardian.address, "confirm", args);
    assert!(t.guardian.try_confirm(&escrow, &t.buyer).is_err());
    assert_eq!(t.bal(&escrow), AMOUNT);

    mock(&t, &t.buyer, &t.guardian.address, "confirm", (&escrow, &t.buyer).into_val(&t.env));
    t.guardian.confirm(&escrow, &t.buyer);
    assert_eq!(t.bal(&escrow), 0);
}

/// [I3] v2: confirm exige el envío registrado en el guardián. Que el vendedor
/// ponga "enviado" directo en TW no cuenta.
#[test]
fn confirm_exige_envio_registrado() {
    let t = setup();
    let (escrow, _) = t.funded();
    assert_eq!(t.guardian.try_confirm(&escrow, &t.buyer), Err(Ok(GErr::NotShipped)));
    t.tw(&escrow).change_milestone_status(&0, &t.s("enviado"), &Some(t.s("x")), &t.seller);
    assert_eq!(t.guardian.try_confirm(&escrow, &t.buyer), Err(Ok(GErr::NotShipped)));
    // Entrega en persona: el vendedor la registra igual con mark_shipped.
    t.guardian.mark_shipped(&escrow, &t.seller, &t.s("entregado en persona"));
    t.guardian.confirm(&escrow, &t.buyer);
    assert!(t.tw(&escrow).get_escrow().flags.released);
}

/// [I3] Después de confirm el escrow queda liberado: no queda ventana para
/// disputar, extender ni auto-liberar.
#[test]
fn sin_disputa_despues_de_confirm() {
    let t = setup();
    let (escrow, _) = t.funded();
    t.ship(&escrow);
    t.guardian.confirm(&escrow, &t.buyer);
    let e = t.tw(&escrow).get_escrow();
    assert!(e.milestones.get(0).unwrap().approved && e.flags.released);
    assert_eq!(t.guardian.try_dispute(&escrow, &t.buyer), Err(Ok(GErr::EscrowAlreadyReleased)));
    assert_eq!(t.guardian.try_dispute(&escrow, &t.seller), Err(Ok(GErr::EscrowAlreadyReleased)));
    assert_eq!(t.guardian.try_confirm(&escrow, &t.buyer), Err(Ok(GErr::EscrowAlreadyReleased)));
    assert_eq!(t.guardian.try_extend(&escrow, &t.buyer), Err(Ok(GErr::EscrowAlreadyReleased)));
    t.advance(30 * 24 * 3600);
    assert_eq!(t.guardian.try_auto_release(&escrow), Err(Ok(GErr::EscrowAlreadyReleased)));
    assert_eq!(
        t.tw(&escrow).try_dispute_escrow(&t.buyer),
        Err(Ok(TwError::UnauthorizedToChangeDisputeFlag))
    );
}

/// [I3][I1] H-1 de TW: `dispute_escrow` no revisa `released`. El vendedor
/// puede marcar disputa directo en TW tras la liberación; es inofensivo.
#[test]
fn disputa_directa_tras_liberar_es_inofensiva() {
    let t = setup();
    let (escrow, _) = t.funded();
    t.ship(&escrow);
    t.guardian.confirm(&escrow, &t.buyer);
    let before = t.snapshot(&t.everyone(&escrow));
    t.tw(&escrow).dispute_escrow(&t.seller);
    assert!(t.tw(&escrow).get_escrow().flags.disputed);
    assert_eq!(t.arbiter.try_resolve(&escrow, &5_000), Err(Ok(AErr::EmptyEscrow)));
    assert_eq!(t.arbiter.try_refund_unshipped(&escrow), Err(Ok(AErr::EmptyEscrow)));
    assert_eq!(t.snapshot(&t.everyone(&escrow)), before);
}

// ───────────────────────── [I4] auto_release ─────────────────────────

/// [I4] auto_release falla sin envío registrado (aunque pase mucho tiempo) y
/// antes de release_at (incluso un segundo antes).
#[test]
fn auto_release_falla_sin_envio_y_antes_de_release_at() {
    let t = setup();
    let (escrow, _) = t.funded();
    t.advance(SHIP + INSPECT + 1);
    assert_eq!(t.guardian.try_auto_release(&escrow), Err(Ok(GErr::NotShipped)));

    let (e2, _) = t.funded();
    t.ship(&e2);
    let release_at = t.guardian.purchase(&e2).unwrap().release_at.unwrap();
    assert_eq!(t.guardian.try_auto_release(&e2), Err(Ok(GErr::DeadlineNotReached)));
    t.set_time(release_at - 1);
    assert_eq!(t.guardian.try_auto_release(&e2), Err(Ok(GErr::DeadlineNotReached)));
    assert_eq!(t.bal(&e2), AMOUNT);
}

/// [I4] auto_release falla si hay disputa abierta por el comprador.
#[test]
fn auto_release_falla_con_disputa() {
    let t = setup();
    let (escrow, _) = t.funded();
    t.ship(&escrow);
    t.guardian.dispute(&escrow, &t.buyer);
    t.advance(INSPECT + 1);
    assert_eq!(t.guardian.try_auto_release(&escrow), Err(Ok(GErr::EscrowDisputed)));
    assert_eq!(t.bal(&escrow), AMOUNT);
}

/// [I4] Pasado release_at, sin disputa, cualquiera libera sin firma de nadie.
#[test]
fn auto_release_tras_release_at_sin_auth() {
    let t = setup();
    let (escrow, _) = t.funded_with(AMOUNT, MIN_WIN, MIN_WIN);
    t.ship(&escrow);
    t.advance(MIN_WIN);
    t.env.set_auths(&[]);
    t.guardian.auto_release(&escrow);
    assert!(t.env.auths().is_empty());
    assert_eq!(t.bal(&t.seller), 1_465_500_000);
    assert_eq!(t.bal(&t.platform), 30_000_000);
    assert_eq!(t.bal(&t.tw_fee), 4_500_000);
    assert_eq!(t.bal(&escrow), 0);
}

// ───────────────────────── [I5][I7] fund ─────────────────────────

/// [I5] fund funciona una sola vez por escrow.
#[test]
fn fund_una_sola_vez() {
    let t = setup();
    let (escrow, props) = t.funded();
    assert_eq!(
        t.guardian.try_fund(&escrow, &t.buyer, &props, &AMOUNT, &SHIP, &INSPECT),
        Err(Ok(GErr::PurchaseAlreadyExists))
    );
    t.sac.mint(&t.stranger, &AMOUNT);
    assert_eq!(
        t.guardian.try_fund(&escrow, &t.stranger, &props, &AMOUNT, &SHIP, &INSPECT),
        Err(Ok(GErr::PurchaseAlreadyExists))
    );
    assert_eq!(t.guardian.purchase(&escrow).unwrap().buyer, t.buyer);
}

/// [I5] Los dos plazos deben estar dentro de [min, max]; los bordes valen.
#[test]
fn fund_ventanas_dentro_de_min_max() {
    let t = setup();
    let props = t.guardian_props(AMOUNT);
    let escrow = t.deploy_escrow(&props);
    for w in [0, MIN_WIN - 1, MAX_WIN + 1, u64::MAX] {
        assert_eq!(
            t.guardian.try_fund(&escrow, &t.buyer, &props, &AMOUNT, &w, &INSPECT),
            Err(Ok(GErr::ShipWindowOutOfRange))
        );
        assert_eq!(
            t.guardian.try_fund(&escrow, &t.buyer, &props, &AMOUNT, &SHIP, &w),
            Err(Ok(GErr::InspectWindowOutOfRange))
        );
    }
    assert!(t.guardian.purchase(&escrow).is_none());
    assert_eq!(t.bal(&escrow), 0);
    t.funded_with(AMOUNT, MIN_WIN, MIN_WIN);
    let (e2, _) = t.funded_with(AMOUNT, MAX_WIN, MAX_WIN);
    assert_eq!(t.guardian.purchase(&e2).unwrap().ship_deadline, T0 + MAX_WIN);
}

/// [I5] fund exige la firma del comprador.
#[test]
fn fund_exige_firma_del_comprador() {
    let t = setup();
    let props = t.guardian_props(AMOUNT);
    let escrow = t.deploy_escrow(&props);
    t.env.set_auths(&[]);
    assert!(t.guardian.try_fund(&escrow, &t.buyer, &props, &AMOUNT, &SHIP, &INSPECT).is_err());
    let args = (&escrow, &t.buyer, &props, AMOUNT, SHIP, INSPECT).into_val(&t.env);
    mock(&t, &t.stranger, &t.guardian.address, "fund", args);
    assert!(t.guardian.try_fund(&escrow, &t.buyer, &props, &AMOUNT, &SHIP, &INSPECT).is_err());
    assert_eq!(t.bal(&escrow), 0);
}

/// [I7] Si el escrow no tiene los roles del modo guardián, fund falla.
#[test]
fn fund_falla_sin_roles_del_modo_guardian() {
    let t = setup();
    let g = t.guardian.address.clone();
    let arb = t.arbiter.address.clone();
    let (b, s) = (t.buyer.clone(), t.seller.clone());
    let cases = [
        (t.props(&b, &b, &t.admin, &s, &s, AMOUNT), GErr::ApproverNotGuardian),
        (t.props(&g, &t.platform, &arb, &s, &s, AMOUNT), GErr::ReleaseSignerNotGuardian),
        (t.props(&g, &g, &t.admin, &s, &s, AMOUNT), GErr::DisputeResolverNotArbiter),
        (t.props(&g, &g, &arb, &s, &t.stranger, AMOUNT), GErr::ServiceProviderNotReceiver),
        (t.props(&g, &g, &arb, &b, &b, AMOUNT), GErr::BuyerIsSeller),
    ];
    for (props, err) in cases {
        let escrow = t.deploy_escrow(&props);
        assert_eq!(t.guardian.try_fund(&escrow, &t.buyer, &props, &AMOUNT, &SHIP, &INSPECT), Err(Ok(err)));
        assert_eq!(t.bal(&escrow), 0);
    }
    let mut props = t.guardian_props(AMOUNT);
    props.milestones.push_back(props.milestones.get(0).unwrap());
    let escrow = t.deploy_escrow(&props);
    assert_eq!(
        t.guardian.try_fund(&escrow, &t.buyer, &props, &AMOUNT, &SHIP, &INSPECT),
        Err(Ok(GErr::NotSingleMilestone))
    );
}

/// [I5][I7] Escrow distinto del esperado, monto distinto, saldo previo y
/// guardián sin árbitro.
#[test]
fn fund_otras_validaciones() {
    let t = setup();
    let props = t.guardian_props(AMOUNT);
    let escrow = t.deploy_escrow(&props);
    let mut other = props.clone();
    other.platform_fee = 9_000;
    assert_eq!(t.guardian.try_fund(&escrow, &t.buyer, &other, &AMOUNT, &SHIP, &INSPECT), Err(Ok(GErr::EscrowMismatch)));
    assert_eq!(t.guardian.try_fund(&escrow, &t.buyer, &props, &(AMOUNT - 1), &SHIP, &INSPECT), Err(Ok(GErr::AmountMismatch)));
    t.sac.mint(&escrow, &1);
    assert_eq!(t.guardian.try_fund(&escrow, &t.buyer, &props, &AMOUNT, &SHIP, &INSPECT), Err(Ok(GErr::EscrowAlreadyFunded)));

    let g2 = t.env.register(pp_guardian::PpGuardian, (&t.admin, &t.tw_fee, MIN_WIN, MAX_WIN, MIN_WIN, MAX_WIN));
    let g2c = pp_guardian::PpGuardianClient::new(&t.env, &g2);
    let p2 = t.props(&g2, &g2, &t.arbiter.address, &t.seller, &t.seller, AMOUNT);
    let e2 = t.deploy_escrow(&p2);
    assert_eq!(g2c.try_fund(&e2, &t.buyer, &p2, &AMOUNT, &SHIP, &INSPECT), Err(Ok(GErr::ArbiterNotSet)));
}

// ───────────────────────── [I6] dispute ─────────────────────────

/// [I6] Por el guardián solo el comprador o el vendedor abren disputa.
#[test]
fn disputa_solo_comprador_o_vendedor() {
    let t = setup();
    let (e1, _) = t.funded();
    for who in [&t.stranger, &t.platform, &t.admin, &t.tw_fee, &t.arbiter.address] {
        assert_eq!(t.guardian.try_dispute(&e1, who), Err(Ok(GErr::NotBuyerOrSeller)));
    }
    t.env.set_auths(&[]);
    assert!(t.guardian.try_dispute(&e1, &t.buyer).is_err());
    t.env.mock_all_auths();
    t.guardian.dispute(&e1, &t.seller);
    assert!(t.tw(&e1).get_escrow().flags.disputed);
    assert_eq!(t.guardian.try_dispute(&e1, &t.buyer), Err(Ok(GErr::EscrowDisputed)));

    let (e2, _) = t.funded();
    t.ship(&e2);
    t.guardian.dispute(&e2, &t.buyer);
    assert_eq!(t.guardian.try_confirm(&e2, &t.buyer), Err(Ok(GErr::EscrowDisputed)));
}

// ───────────────────────── [I2] resolve ─────────────────────────

/// [I2] Solo el admin puede llamar resolve (auth real).
#[test]
fn resolve_solo_admin() {
    let t = setup();
    let (escrow, _) = t.funded();
    t.guardian.dispute(&escrow, &t.buyer);
    let args: Vec<Val> = (&escrow, 7_000u32).into_val(&t.env);
    t.env.set_auths(&[]);
    assert!(t.arbiter.try_resolve(&escrow, &7_000).is_err());
    for who in [&t.stranger, &t.buyer, &t.seller, &t.platform] {
        mock(&t, who, &t.arbiter.address, "resolve", args.clone());
        assert!(t.arbiter.try_resolve(&escrow, &7_000).is_err());
    }
    assert_eq!(t.bal(&escrow), AMOUNT);
    mock(&t, &t.admin, &t.arbiter.address, "resolve", args);
    t.arbiter.resolve(&escrow, &7_000);
    assert_eq!(t.bal(&escrow), 0);
}

/// [I2] resolve solo con el escrow en disputa y con este árbitro designado.
#[test]
fn resolve_solo_con_disputa_abierta() {
    let t = setup();
    let (escrow, _) = t.funded();
    assert_eq!(t.arbiter.try_resolve(&escrow, &7_000), Err(Ok(AErr::NotInDispute)));
    assert_eq!(t.arbiter.try_quote(&escrow, &7_000), Err(Ok(AErr::NotInDispute)));
    t.guardian.dispute(&escrow, &t.buyer);
    t.arbiter.resolve(&escrow, &7_000);
    assert_eq!(t.arbiter.try_resolve(&escrow, &7_000), Err(Ok(AErr::NotInDispute)));
    let p = t.props(&t.admin, &t.admin, &t.admin, &t.seller, &t.seller, AMOUNT);
    let other = t.deploy_escrow(&p);
    assert_eq!(t.arbiter.try_resolve(&other, &7_000), Err(Ok(AErr::NotDisputeResolver)));
}

// ───────────────────────── [I1][I8][I9] reparto ─────────────────────────

/// [I8][I9] Disputa 70/30 con los montos exactos.
#[test]
fn resolve_70_30_montos_exactos() {
    let t = setup();
    let buyer0 = t.bal(&t.buyer);
    let (escrow, _) = t.funded();
    t.ship(&escrow);
    t.guardian.dispute(&escrow, &t.buyer);
    let q = t.arbiter.quote(&escrow, &7_000);
    assert_eq!((q.buyer_amount, q.seller_amount, q.balance), (1_050_000_000, 450_000_000, AMOUNT));
    assert_eq!(t.arbiter.resolve(&escrow, &7_000), q);
    assert_eq!(t.bal(&t.buyer) - (buyer0 - AMOUNT), 1_025_850_000); // 102,585
    assert_eq!(t.bal(&t.seller), 439_650_000); // 43,965
    assert_eq!(t.bal(&t.platform), 30_000_000);
    assert_eq!(t.bal(&t.tw_fee), 4_500_000);
    assert_eq!(t.bal(&escrow), 0);
}

/// [I1][I8] Para cualquier buyer_bps solo cambian comprador, vendedor,
/// plataforma y TW; la suma se conserva.
#[test]
fn resolve_nunca_paga_a_terceros() {
    let t = setup();
    for bps in [0u32, 1, 2_500, 3_333, 5_000, 7_000, 9_999, 10_000] {
        let (escrow, _) = t.funded();
        t.guardian.dispute(&escrow, &t.seller);
        let who = t.everyone(&escrow);
        let before = t.snapshot(&who);
        let split = t.arbiter.resolve(&escrow, &bps);
        let d: std::vec::Vec<i128> = t.snapshot(&who).iter().zip(&before).map(|(a, b)| a - b).collect();
        assert_eq!(&d[4..8], &[0, 0, 0, 0], "bps={bps}: un tercero recibió fondos");
        assert_eq!(d[8], -AMOUNT);
        assert_eq!(d.iter().sum::<i128>(), 0);
        assert_eq!(split.buyer_amount + split.seller_amount, AMOUNT);
        assert_eq!((split.buyer, split.seller), (t.buyer.clone(), t.seller.clone()));
    }
}

/// [I1] No existe vía directa al escrow: ni un tercero, ni el admin, ni la
/// plataforma pueden llamar resolve_dispute o cambiar el receiver.
#[test]
fn no_existe_via_directa_al_escrow() {
    let t = setup();
    let (escrow, props) = t.funded();
    let tw = t.tw(&escrow);
    let steal = map![&t.env, (t.stranger.clone(), AMOUNT)];
    let mut hijack = props.clone();
    hijack.roles.receiver = t.stranger.clone();
    hijack.roles.service_provider = t.stranger.clone();
    assert_eq!(tw.try_update_escrow(&t.platform, &hijack), Err(Ok(TwError::EscrowPropertiesMismatch)));

    t.guardian.dispute(&escrow, &t.buyer);
    let before = t.snapshot(&t.everyone(&escrow));
    assert_eq!(
        tw_llamar!(tw, try_resolve_dispute, &t.stranger, &t.stranger, &steal),
        Err(Ok(TwError::OnlyDisputeResolverCanExecuteThisFunction))
    );
    for who in [&t.stranger, &t.admin, &t.platform] {
        let args = tw_args!(&t.env, &t.arbiter.address, &t.stranger, steal.clone());
        mock(&t, who, &escrow, "resolve_dispute", args);
        assert!(tw_llamar!(tw, try_resolve_dispute, &t.arbiter.address, &t.stranger, &steal).is_err());
    }
    t.env.set_auths(&[]);
    assert!(tw_llamar!(tw, try_resolve_dispute, &t.arbiter.address, &t.stranger, &steal).is_err());
    t.env.mock_all_auths();
    assert_eq!(tw.try_update_escrow(&t.platform, &hijack), Err(Ok(TwError::EscrowOpenedForDisputeResolution)));
    assert_eq!(t.snapshot(&t.everyone(&escrow)), before);
    t.arbiter.resolve(&escrow, &5_000);
    assert_eq!((t.bal(&t.stranger), t.bal(&t.admin)), (0, 0));
}

/// [I8] Redondeo con saldos "feos": suma exacta, la unidad sobrante va al
/// comprador y las comisiones nunca superan su valor nominal.
#[test]
fn redondeo_nunca_favorece_a_terceros() {
    let t = setup();
    for (amount, bps) in [(1_000_000_007i128, 3_333u32), (7, 5_000), (3, 3_333), (1_234_567, 1), (999, 9_999)] {
        let (escrow, _) = t.funded_with(amount, SHIP, INSPECT);
        t.guardian.dispute(&escrow, &t.buyer);
        let who = t.everyone(&escrow);
        let before = t.snapshot(&who);
        let split = t.arbiter.resolve(&escrow, &bps);
        let d: std::vec::Vec<i128> = t.snapshot(&who).iter().zip(&before).map(|(a, b)| a - b).collect();
        let floor_buyer = amount * bps as i128 / 10_000;
        assert_eq!(split.buyer_amount + split.seller_amount, amount);
        assert!(split.buyer_amount - floor_buyer == 0 || split.buyer_amount - floor_buyer == 1);
        let (tw_nom, pl_nom) = nominal_fees(amount, PLATFORM_FEE_BPS);
        assert!(d[3] <= tw_nom && d[2] <= pl_nom);
        assert_eq!(d[0] + d[1] + d[2] + d[3], amount);
        assert_eq!(&d[4..8], &[0, 0, 0, 0]);
        assert_eq!(t.bal(&escrow), 0);
    }
}

/// [I2][I8] bps fuera de rango y montos 0 omitidos.
#[test]
fn resolve_bps_invalido_y_montos_cero() {
    let t = setup();
    let (escrow, _) = t.funded();
    t.guardian.dispute(&escrow, &t.buyer);
    assert_eq!(t.arbiter.try_resolve(&escrow, &10_001), Err(Ok(AErr::InvalidBps)));
    assert_eq!(t.arbiter.try_resolve(&escrow, &u32::MAX), Err(Ok(AErr::InvalidBps)));
    let s = t.arbiter.resolve(&escrow, &0);
    assert_eq!((s.buyer_amount, s.seller_amount), (0, AMOUNT));
    assert_eq!(t.bal(&t.seller), 1_465_500_000);
}

// ───────────────────────── administración ─────────────────────────

/// set_arbiter: solo el admin y una sola vez.
#[test]
fn set_arbiter_una_vez_y_solo_admin() {
    let t = setup();
    assert_eq!(t.guardian.config().arbiter, Some(t.arbiter.address.clone()));
    assert_eq!(t.guardian.try_set_arbiter(&t.stranger), Err(Ok(GErr::ArbiterAlreadySet)));
    let g2 = t.env.register(pp_guardian::PpGuardian, (&t.admin, &t.tw_fee, MIN_WIN, MAX_WIN, MIN_WIN, MAX_WIN));
    let g2c = pp_guardian::PpGuardianClient::new(&t.env, &g2);
    mock(&t, &t.stranger, &g2, "set_arbiter", (&t.stranger,).into_val(&t.env));
    assert!(g2c.try_set_arbiter(&t.stranger).is_err());
    assert_eq!(g2c.config().arbiter, None);
}

/// set_admin del árbitro: el admin anterior pierde el poder de resolver.
#[test]
fn set_admin_transfiere_el_poder() {
    let t = setup();
    let new_admin = Address::generate(&t.env);
    t.arbiter.set_admin(&new_admin);
    assert_eq!(t.arbiter.config().admin, new_admin);
    let (escrow, _) = t.funded();
    t.guardian.dispute(&escrow, &t.buyer);
    let args: Vec<Val> = (&escrow, 7_000u32).into_val(&t.env);
    mock(&t, &t.admin, &t.arbiter.address, "resolve", args.clone());
    assert!(t.arbiter.try_resolve(&escrow, &7_000).is_err());
    mock(&t, &new_admin, &t.arbiter.address, "resolve", args);
    t.arbiter.resolve(&escrow, &7_000);
    assert_eq!(t.bal(&escrow), 0);
}

/// Constructor: ventana de despacho inválida.
#[test]
#[should_panic]
fn constructor_rechaza_ventana_de_despacho_invalida() {
    let t = setup();
    t.env.register(pp_guardian::PpGuardian, (&t.admin, &t.tw_fee, 100u64, 99u64, MIN_WIN, MAX_WIN));
}

/// Constructor: ventana de revisión inválida.
#[test]
#[should_panic]
fn constructor_rechaza_ventana_de_revision_invalida() {
    let t = setup();
    t.env.register(pp_guardian::PpGuardian, (&t.admin, &t.tw_fee, MIN_WIN, MAX_WIN, 0u64, MAX_WIN));
}
