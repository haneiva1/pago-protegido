//! Invariantes de SPEC.md §4, con el WASM real de Trustless Work.
//! Cada test indica entre corchetes el invariante que cubre: [I1]..[I9].
extern crate std;

mod common;
use common::*;

use pp_arbiter::Error as AErr;
use pp_guardian::Error as GErr;
use soroban_sdk::{
    map,
    testutils::{Address as _, AuthorizedFunction, MockAuth, MockAuthInvoke},
    Address, IntoVal, String, Symbol,
};

// ───────────────────────── caso feliz y comisiones ─────────────────────────

/// [I3][I9] fund → enviado → confirm. Aprobar y liberar ocurren en la misma
/// invocación y las comisiones son exactamente 2% plataforma y 0,3% TW.
#[test]
fn caso_feliz_confirm_libera_con_comisiones_exactas() {
    let t = setup();
    let buyer0 = t.bal(&t.buyer);
    let (escrow, _) = t.funded(WINDOW);
    assert_eq!(t.bal(&escrow), AMOUNT);
    assert_eq!(t.bal(&t.buyer), buyer0 - AMOUNT);

    let p = t.guardian.purchase(&escrow).unwrap();
    assert_eq!(p.buyer, t.buyer);
    assert_eq!(p.seller, t.seller);
    assert_eq!(p.funded_at, T0);
    assert_eq!(p.deadline, T0 + WINDOW);

    t.ship(&escrow);
    t.guardian.confirm(&escrow, &t.buyer);

    // 150 LABUSD: TW 0,45 · plataforma 3,00 · vendedor 146,55
    assert_eq!(t.bal(&t.tw_fee), 4_500_000);
    assert_eq!(t.bal(&t.platform), 30_000_000);
    assert_eq!(t.bal(&t.seller), 1_465_500_000);
    assert_eq!(t.bal(&escrow), 0);
    assert_eq!(4_500_000 + 30_000_000 + 1_465_500_000, AMOUNT);

    let e = t.tw(&escrow).get_escrow();
    assert!(e.flags.released);
    assert!(e.milestones.get(0).unwrap().approved);
}

/// [I3] confirm solo pide la firma del comprador (el guardián se autoriza a sí
/// mismo ante el escrow como invocador directo). Y `fund` pide al comprador
/// exactamente el árbol fund → fund_escrow → transfer.
#[test]
fn arboles_de_auth_de_fund_y_confirm() {
    let t = setup();
    let props = t.guardian_props(AMOUNT);
    let escrow = t.deploy_escrow(&props);
    t.guardian.fund(&escrow, &t.buyer, &props, &AMOUNT, &WINDOW);

    let auths = t.env.auths();
    assert_eq!(auths.len(), 1);
    let (who, inv) = &auths[0];
    assert_eq!(who, &t.buyer);
    let name = |f: &AuthorizedFunction| match f {
        AuthorizedFunction::Contract((addr, sym, _)) => (addr.clone(), sym.clone()),
        _ => panic!("se esperaba una invocación de contrato"),
    };
    assert_eq!(name(&inv.function), (t.guardian.address.clone(), Symbol::new(&t.env, "fund")));
    assert_eq!(inv.sub_invocations.len(), 1);
    let sub = &inv.sub_invocations[0];
    assert_eq!(name(&sub.function), (escrow.clone(), Symbol::new(&t.env, "fund_escrow")));
    assert_eq!(
        name(&sub.sub_invocations[0].function),
        (t.token.address.clone(), Symbol::new(&t.env, "transfer"))
    );

    t.ship(&escrow);
    t.guardian.confirm(&escrow, &t.buyer);
    let auths = t.env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, t.buyer);
    assert_eq!(
        name(&auths[0].1.function),
        (t.guardian.address.clone(), Symbol::new(&t.env, "confirm"))
    );
    assert!(auths[0].1.sub_invocations.is_empty());
}

// ───────────────────────── [I3] confirm ─────────────────────────

/// [I3] Solo el comprador registrado puede confirmar, y con su firma.
#[test]
fn confirm_solo_comprador_registrado() {
    let t = setup();
    let (escrow, _) = t.funded(WINDOW);
    t.ship(&escrow);

    for who in [&t.stranger, &t.seller, &t.platform, &t.admin] {
        assert_eq!(t.guardian.try_confirm(&escrow, who), Err(Ok(GErr::NotBuyer)));
    }

    // Sin la firma del comprador (auth real, nada simulado) falla.
    t.env.set_auths(&[]);
    assert!(t.guardian.try_confirm(&escrow, &t.buyer).is_err());
    // Un tercero que firma por sí mismo no reemplaza la firma del comprador.
    t.env.mock_auths(&[MockAuth {
        address: &t.stranger,
        invoke: &MockAuthInvoke {
            contract: &t.guardian.address,
            fn_name: "confirm",
            args: (&escrow, &t.buyer).into_val(&t.env),
            sub_invokes: &[],
        },
    }]);
    assert!(t.guardian.try_confirm(&escrow, &t.buyer).is_err());

    assert_eq!(t.bal(&escrow), AMOUNT);
    assert!(!t.tw(&escrow).get_escrow().flags.released);

    // Con la firma del comprador sí.
    t.env.mock_auths(&[MockAuth {
        address: &t.buyer,
        invoke: &MockAuthInvoke {
            contract: &t.guardian.address,
            fn_name: "confirm",
            args: (&escrow, &t.buyer).into_val(&t.env),
            sub_invokes: &[],
        },
    }]);
    t.guardian.confirm(&escrow, &t.buyer);
    assert_eq!(t.bal(&escrow), 0);
}

/// [I3] Después de confirm el escrow queda liberado: no hay ventana para
/// disputar después de aprobar, ni por el guardián ni directo en el escrow.
#[test]
fn sin_disputa_despues_de_confirm() {
    let t = setup();
    let (escrow, _) = t.funded(WINDOW);
    t.guardian.confirm(&escrow, &t.buyer);

    let e = t.tw(&escrow).get_escrow();
    assert!(e.milestones.get(0).unwrap().approved && e.flags.released);

    assert_eq!(t.guardian.try_dispute(&escrow, &t.buyer), Err(Ok(GErr::EscrowAlreadyReleased)));
    assert_eq!(t.guardian.try_dispute(&escrow, &t.seller), Err(Ok(GErr::EscrowAlreadyReleased)));
    assert_eq!(t.guardian.try_confirm(&escrow, &t.buyer), Err(Ok(GErr::EscrowAlreadyReleased)));
    assert_eq!(t.guardian.try_auto_release(&escrow), Err(Ok(GErr::EscrowAlreadyReleased)));
    // El comprador no tiene rol en el escrow: no puede disputar directo.
    assert_eq!(
        t.tw(&escrow).try_dispute_escrow(&t.buyer),
        Err(Ok(TwError::UnauthorizedToChangeDisputeFlag))
    );
}

/// [I3][I1] Peculiaridad de TW (documentada en DECISIONES.md): `dispute_escrow`
/// no revisa `released`, así que el vendedor puede marcar disputa directo en un
/// escrow ya liberado. Es inofensivo: no queda saldo y el árbitro no mueve nada.
#[test]
fn disputa_directa_tras_liberar_es_inofensiva() {
    let t = setup();
    let (escrow, _) = t.funded(WINDOW);
    t.guardian.confirm(&escrow, &t.buyer);
    let before = t.snapshot(&t.everyone(&escrow));

    t.tw(&escrow).dispute_escrow(&t.seller); // TW lo acepta
    assert!(t.tw(&escrow).get_escrow().flags.disputed);
    assert_eq!(t.arbiter.try_resolve(&escrow, &5_000), Err(Ok(AErr::EmptyEscrow)));
    assert_eq!(t.arbiter.try_refund_unshipped(&escrow), Err(Ok(AErr::EmptyEscrow)));
    assert_eq!(t.snapshot(&t.everyone(&escrow)), before);
}

// ───────────────────────── [I4] auto_release ─────────────────────────

/// [I4] auto_release falla antes del deadline (incluso un segundo antes).
#[test]
fn auto_release_falla_antes_del_deadline() {
    let t = setup();
    let (escrow, _) = t.funded(WINDOW);
    t.ship(&escrow);
    assert_eq!(t.guardian.try_auto_release(&escrow), Err(Ok(GErr::DeadlineNotReached)));
    t.advance(WINDOW - 1);
    assert_eq!(t.guardian.try_auto_release(&escrow), Err(Ok(GErr::DeadlineNotReached)));
    assert_eq!(t.bal(&escrow), AMOUNT);
}

/// [I4] auto_release falla si el hito no está en "enviado".
#[test]
fn auto_release_falla_si_no_esta_enviado() {
    let t = setup();
    let (escrow, _) = t.funded(WINDOW);
    t.advance(WINDOW + 1);
    assert_eq!(t.guardian.try_auto_release(&escrow), Err(Ok(GErr::NotShipped)));
    // Otro texto distinto de "enviado" tampoco sirve.
    t.tw(&escrow).change_milestone_status(
        &0,
        &String::from_str(&t.env, "Enviado"),
        &None,
        &t.seller,
    );
    assert_eq!(t.guardian.try_auto_release(&escrow), Err(Ok(GErr::NotShipped)));
    assert_eq!(t.bal(&escrow), AMOUNT);
}

/// [I4] auto_release falla si hay disputa.
#[test]
fn auto_release_falla_con_disputa() {
    let t = setup();
    let (escrow, _) = t.funded(WINDOW);
    t.ship(&escrow);
    t.guardian.dispute(&escrow, &t.buyer);
    t.advance(WINDOW + 1);
    assert_eq!(t.guardian.try_auto_release(&escrow), Err(Ok(GErr::EscrowDisputed)));
    assert_eq!(t.bal(&escrow), AMOUNT);
}

/// [I4] Pasado el deadline, con "enviado" y sin disputa, cualquiera puede
/// liberar sin firma de nadie, y paga al vendedor con las comisiones exactas.
#[test]
fn auto_release_tras_deadline_sin_auth() {
    let t = setup();
    let (escrow, _) = t.funded(MIN_WINDOW);
    t.ship(&escrow);
    t.advance(MIN_WINDOW);

    t.env.set_auths(&[]); // auth real y vacía: nadie firma nada
    t.guardian.auto_release(&escrow);
    assert!(t.env.auths().is_empty());

    assert_eq!(t.bal(&t.seller), 1_465_500_000);
    assert_eq!(t.bal(&t.platform), 30_000_000);
    assert_eq!(t.bal(&t.tw_fee), 4_500_000);
    assert_eq!(t.bal(&escrow), 0);
    let e = t.tw(&escrow).get_escrow();
    assert!(e.flags.released && e.milestones.get(0).unwrap().approved);
}

// ───────────────────────── [I5] fund ─────────────────────────

/// [I5] fund funciona una sola vez por escrow.
#[test]
fn fund_una_sola_vez() {
    let t = setup();
    let (escrow, props) = t.funded(WINDOW);
    assert_eq!(
        t.guardian.try_fund(&escrow, &t.buyer, &props, &AMOUNT, &WINDOW),
        Err(Ok(GErr::PurchaseAlreadyExists))
    );
    // Ni siquiera otro comprador puede "pisar" la compra.
    t.sac.mint(&t.stranger, &AMOUNT);
    assert_eq!(
        t.guardian.try_fund(&escrow, &t.stranger, &props, &AMOUNT, &WINDOW),
        Err(Ok(GErr::PurchaseAlreadyExists))
    );
    assert_eq!(t.guardian.purchase(&escrow).unwrap().buyer, t.buyer);
    assert_eq!(t.bal(&escrow), AMOUNT);
}

/// [I5] El plazo debe estar dentro de [min, max]; los bordes son válidos.
#[test]
fn fund_ventana_dentro_de_min_max() {
    let t = setup();
    let props = t.guardian_props(AMOUNT);
    let escrow = t.deploy_escrow(&props);
    for w in [0, MIN_WINDOW - 1, MAX_WINDOW + 1, u64::MAX] {
        assert_eq!(
            t.guardian.try_fund(&escrow, &t.buyer, &props, &AMOUNT, &w),
            Err(Ok(GErr::WindowOutOfRange))
        );
    }
    assert!(t.guardian.purchase(&escrow).is_none());
    assert_eq!(t.bal(&escrow), 0);

    let (_, _) = t.funded(MIN_WINDOW);
    let (e2, _) = t.funded(MAX_WINDOW);
    assert_eq!(t.guardian.purchase(&e2).unwrap().deadline, T0 + MAX_WINDOW);
}

/// [I5] fund exige la firma del comprador.
#[test]
fn fund_exige_firma_del_comprador() {
    let t = setup();
    let props = t.guardian_props(AMOUNT);
    let escrow = t.deploy_escrow(&props);
    t.env.set_auths(&[]);
    assert!(t.guardian.try_fund(&escrow, &t.buyer, &props, &AMOUNT, &WINDOW).is_err());
    t.env.mock_auths(&[MockAuth {
        address: &t.stranger,
        invoke: &MockAuthInvoke {
            contract: &t.guardian.address,
            fn_name: "fund",
            args: (&escrow, &t.buyer, &props, AMOUNT, WINDOW).into_val(&t.env),
            sub_invokes: &[],
        },
    }]);
    assert!(t.guardian.try_fund(&escrow, &t.buyer, &props, &AMOUNT, &WINDOW).is_err());
    assert_eq!(t.bal(&escrow), 0);
    assert!(t.guardian.purchase(&escrow).is_none());
}

// ───────────────────────── [I6] dispute ─────────────────────────

/// [I6] Por el guardián solo el comprador o el vendedor abren disputa.
#[test]
fn disputa_solo_comprador_o_vendedor() {
    let t = setup();
    let (e1, _) = t.funded(WINDOW);
    for who in [&t.stranger, &t.platform, &t.admin, &t.tw_fee, &t.arbiter.address] {
        assert_eq!(t.guardian.try_dispute(&e1, who), Err(Ok(GErr::NotBuyerOrSeller)));
    }
    assert!(!t.tw(&e1).get_escrow().flags.disputed);

    // Sin firma, ni el comprador puede.
    t.env.set_auths(&[]);
    assert!(t.guardian.try_dispute(&e1, &t.buyer).is_err());
    t.env.mock_all_auths();

    t.guardian.dispute(&e1, &t.seller);
    assert!(t.tw(&e1).get_escrow().flags.disputed);
    assert_eq!(t.guardian.try_dispute(&e1, &t.buyer), Err(Ok(GErr::EscrowDisputed)));

    let (e2, _) = t.funded(WINDOW);
    t.guardian.dispute(&e2, &t.buyer);
    assert!(t.tw(&e2).get_escrow().flags.disputed);
    // Con disputa abierta tampoco se puede confirmar.
    assert_eq!(t.guardian.try_confirm(&e2, &t.buyer), Err(Ok(GErr::EscrowDisputed)));
}

// ───────────────────────── [I7] roles ─────────────────────────

/// [I7] Si el escrow no tiene los roles del modo guardián, fund falla.
#[test]
fn fund_falla_sin_roles_del_modo_guardian() {
    let t = setup();
    let g = t.guardian.address.clone();
    let arb = t.arbiter.address.clone();
    let (b, s) = (t.buyer.clone(), t.seller.clone());
    let cases = [
        // modo directo: approver = release_signer = comprador, resolver = cuenta árbitro
        (t.props(&b, &b, &t.admin, &s, &s, AMOUNT), GErr::ApproverNotGuardian),
        (t.props(&g, &t.platform, &arb, &s, &s, AMOUNT), GErr::ReleaseSignerNotGuardian),
        (t.props(&g, &g, &t.admin, &s, &s, AMOUNT), GErr::DisputeResolverNotArbiter),
        (t.props(&g, &g, &g, &s, &s, AMOUNT), GErr::DisputeResolverNotArbiter),
        (t.props(&g, &g, &arb, &s, &t.stranger, AMOUNT), GErr::ServiceProviderNotReceiver),
        (t.props(&g, &g, &arb, &b, &b, AMOUNT), GErr::BuyerIsSeller),
    ];
    for (props, err) in cases {
        let escrow = t.deploy_escrow(&props);
        assert_eq!(t.guardian.try_fund(&escrow, &t.buyer, &props, &AMOUNT, &WINDOW), Err(Ok(err)));
        assert_eq!(t.bal(&escrow), 0);
        assert!(t.guardian.purchase(&escrow).is_none());
    }

    // Más de un hito tampoco.
    let mut props = t.guardian_props(AMOUNT);
    props.milestones.push_back(props.milestones.get(0).unwrap());
    let escrow = t.deploy_escrow(&props);
    assert_eq!(
        t.guardian.try_fund(&escrow, &t.buyer, &props, &AMOUNT, &WINDOW),
        Err(Ok(GErr::NotSingleMilestone))
    );
}

/// [I5][I7] Otras validaciones de fund: escrow distinto del esperado, monto
/// distinto, escrow con saldo previo y guardián sin árbitro configurado.
#[test]
fn fund_otras_validaciones() {
    let t = setup();
    let props = t.guardian_props(AMOUNT);
    let escrow = t.deploy_escrow(&props);

    let mut other = props.clone();
    other.platform_fee = 9_000;
    assert_eq!(
        t.guardian.try_fund(&escrow, &t.buyer, &other, &AMOUNT, &WINDOW),
        Err(Ok(GErr::EscrowMismatch))
    );
    assert_eq!(
        t.guardian.try_fund(&escrow, &t.buyer, &props, &(AMOUNT - 1), &WINDOW),
        Err(Ok(GErr::AmountMismatch))
    );
    t.sac.mint(&escrow, &1);
    assert_eq!(
        t.guardian.try_fund(&escrow, &t.buyer, &props, &AMOUNT, &WINDOW),
        Err(Ok(GErr::EscrowAlreadyFunded))
    );

    // Un guardián nuevo sin set_arbiter no acepta fondeos.
    let g2 = t.env.register(pp_guardian::PpGuardian, (&t.admin, &t.tw_fee, MIN_WINDOW, MAX_WINDOW));
    let g2c = pp_guardian::PpGuardianClient::new(&t.env, &g2);
    let p2 = t.props(&g2, &g2, &t.arbiter.address, &t.seller, &t.seller, AMOUNT);
    let e2 = t.deploy_escrow(&p2);
    assert_eq!(g2c.try_fund(&e2, &t.buyer, &p2, &AMOUNT, &WINDOW), Err(Ok(GErr::ArbiterNotSet)));
}

// ───────────────────────── [I2] resolve: solo admin, solo en disputa ─────────────────────────

/// [I2] Solo el admin puede llamar resolve (auth real, sin mock_all_auths).
#[test]
fn resolve_solo_admin() {
    let t = setup();
    let (escrow, _) = t.funded(WINDOW);
    t.guardian.dispute(&escrow, &t.buyer);
    let args: soroban_sdk::Vec<soroban_sdk::Val> = (&escrow, 7_000u32).into_val(&t.env);

    t.env.set_auths(&[]);
    assert!(t.arbiter.try_resolve(&escrow, &7_000).is_err());
    for who in [&t.stranger, &t.buyer, &t.seller, &t.platform] {
        t.env.mock_auths(&[MockAuth {
            address: who,
            invoke: &MockAuthInvoke {
                contract: &t.arbiter.address,
                fn_name: "resolve",
                args: args.clone(),
                sub_invokes: &[],
            },
        }]);
        assert!(t.arbiter.try_resolve(&escrow, &7_000).is_err());
    }
    assert_eq!(t.bal(&escrow), AMOUNT);

    t.env.mock_auths(&[MockAuth {
        address: &t.admin,
        invoke: &MockAuthInvoke {
            contract: &t.arbiter.address,
            fn_name: "resolve",
            args,
            sub_invokes: &[],
        },
    }]);
    t.arbiter.resolve(&escrow, &7_000);
    assert_eq!(t.bal(&escrow), 0);
}

/// [I2] resolve solo con el escrow en disputa (antes de abrirla y después de
/// resolverla falla).
#[test]
fn resolve_solo_con_disputa_abierta() {
    let t = setup();
    let (escrow, _) = t.funded(WINDOW);
    assert_eq!(t.arbiter.try_resolve(&escrow, &7_000), Err(Ok(AErr::NotInDispute)));
    assert_eq!(t.arbiter.try_quote(&escrow, &7_000), Err(Ok(AErr::NotInDispute)));
    t.guardian.dispute(&escrow, &t.buyer);
    t.arbiter.resolve(&escrow, &7_000);
    assert_eq!(t.arbiter.try_resolve(&escrow, &7_000), Err(Ok(AErr::NotInDispute)));
    // Un escrow que no tiene a este árbitro como dispute_resolver.
    let p = t.props(&t.admin, &t.admin, &t.admin, &t.seller, &t.seller, AMOUNT);
    let other = t.deploy_escrow(&p);
    assert_eq!(t.arbiter.try_resolve(&other, &7_000), Err(Ok(AErr::NotDisputeResolver)));
}

// ───────────────────────── [I1][I8][I9] reparto ─────────────────────────

/// [I8][I9] Disputa 70/30 con los montos exactos que cobra cada uno.
#[test]
fn resolve_70_30_montos_exactos() {
    let t = setup();
    let buyer0 = t.bal(&t.buyer);
    let (escrow, _) = t.funded(WINDOW);
    t.ship(&escrow);
    t.guardian.dispute(&escrow, &t.buyer);

    let q = t.arbiter.quote(&escrow, &7_000);
    assert_eq!((q.buyer_amount, q.seller_amount, q.balance), (1_050_000_000, 450_000_000, AMOUNT));
    let split = t.arbiter.resolve(&escrow, &7_000);
    assert_eq!(split, q);

    // Comprador: 105 − 0,315 (TW) − 2,10 (plataforma) = 102,585
    assert_eq!(t.bal(&t.buyer) - (buyer0 - AMOUNT), 1_025_850_000);
    // Vendedor: 45 − 0,135 − 0,90 = 43,965
    assert_eq!(t.bal(&t.seller), 439_650_000);
    assert_eq!(t.bal(&t.platform), 30_000_000); // 2% de 150
    assert_eq!(t.bal(&t.tw_fee), 4_500_000); // 0,3% de 150
    assert_eq!(t.bal(&escrow), 0);
    assert_eq!(1_025_850_000 + 439_650_000 + 30_000_000 + 4_500_000, AMOUNT);
    let e = t.tw(&escrow).get_escrow();
    assert!(e.flags.resolved && !e.flags.disputed && !e.flags.released);
}

/// [I1][I8] Para cualquier buyer_bps, solo cambian los saldos de comprador,
/// vendedor, plataforma y TW; la suma se conserva y nada queda en el escrow.
#[test]
fn resolve_nunca_paga_a_terceros() {
    let t = setup();
    for bps in [0u32, 1, 2_500, 3_333, 5_000, 7_000, 9_999, 10_000] {
        let (escrow, _) = t.funded(WINDOW);
        t.guardian.dispute(&escrow, &t.seller);
        let who = t.everyone(&escrow);
        let before = t.snapshot(&who);
        let split = t.arbiter.resolve(&escrow, &bps);
        let after = t.snapshot(&who);
        let delta: std::vec::Vec<i128> = after.iter().zip(&before).map(|(a, b)| a - b).collect();

        // [buyer, seller, platform, tw_fee, admin, stranger, guardian, arbiter, escrow]
        assert_eq!(&delta[4..8], &[0, 0, 0, 0], "bps={bps}: un tercero recibió fondos");
        assert_eq!(delta[8], -AMOUNT);
        assert_eq!(delta.iter().sum::<i128>(), 0);
        assert_eq!(split.buyer_amount + split.seller_amount, AMOUNT);
        assert_eq!(split.buyer, t.buyer);
        assert_eq!(split.seller, t.seller);
        if bps == 0 {
            assert_eq!(delta[0], 0);
        }
        if bps == 10_000 {
            assert_eq!(delta[1], 0);
        }
    }
}

/// [I1] No existe otra vía hacia el escrow: ni un tercero, ni el admin del
/// árbitro, ni la plataforma pueden llamar resolve_dispute o cambiar el
/// receiver. La única auth válida del dispute_resolver es la del contrato
/// pp_arbiter como invocador directo (no implementa `__check_auth`).
#[test]
fn no_existe_via_directa_al_escrow() {
    let t = setup();
    let (escrow, props) = t.funded(WINDOW);
    let tw = t.tw(&escrow);
    let steal = map![&t.env, (t.stranger.clone(), AMOUNT)];

    // La plataforma no puede cambiar el receiver con fondos adentro.
    let mut hijack = props.clone();
    hijack.roles.receiver = t.stranger.clone();
    hijack.roles.service_provider = t.stranger.clone();
    assert_eq!(
        tw.try_update_escrow(&t.platform, &hijack),
        Err(Ok(TwError::EscrowPropertiesMismatch))
    );

    t.guardian.dispute(&escrow, &t.buyer);
    let before = t.snapshot(&t.everyone(&escrow));

    // Un tercero que se declara dispute_resolver: el escrow lo rechaza (#12).
    assert_eq!(
        tw.try_resolve_dispute(&t.stranger, &t.stranger, &steal),
        Err(Ok(TwError::OnlyDisputeResolverCanExecuteThisFunction))
    );
    // Con auth real, nadie puede firmar por el contrato pp_arbiter.
    for who in [&t.stranger, &t.admin, &t.platform] {
        t.env.mock_auths(&[MockAuth {
            address: who,
            invoke: &MockAuthInvoke {
                contract: &escrow,
                fn_name: "resolve_dispute",
                args: (&t.arbiter.address, &t.stranger, steal.clone()).into_val(&t.env),
                sub_invokes: &[],
            },
        }]);
        assert!(tw.try_resolve_dispute(&t.arbiter.address, &t.stranger, &steal).is_err());
    }
    t.env.set_auths(&[]);
    assert!(tw.try_resolve_dispute(&t.arbiter.address, &t.stranger, &steal).is_err());
    t.env.mock_all_auths();
    // Durante la disputa la plataforma tampoco puede editar el escrow.
    assert_eq!(
        tw.try_update_escrow(&t.platform, &hijack),
        Err(Ok(TwError::EscrowOpenedForDisputeResolution))
    );
    assert_eq!(t.snapshot(&t.everyone(&escrow)), before);

    // La vía legítima sigue funcionando y paga solo a comprador y vendedor.
    t.arbiter.resolve(&escrow, &5_000);
    assert_eq!(t.bal(&t.stranger), 0);
    assert_eq!(t.bal(&t.admin), 0);
}

/// [I1] Si la plataforma agrega un hito después del fondeo (poder que TW le
/// deja), confirm deja de funcionar pero los fondos no se pueden desviar: la
/// disputa y el árbitro siguen repartiendo solo entre comprador y vendedor.
#[test]
fn hito_agregado_por_plataforma_no_desvia_fondos() {
    let t = setup();
    let (escrow, props) = t.funded(WINDOW);
    let mut more = props.clone();
    more.milestones.push_back(props.milestones.get(0).unwrap());
    t.tw(&escrow).update_escrow(&t.platform, &more);

    assert!(t.guardian.try_confirm(&escrow, &t.buyer).is_err());
    assert_eq!(t.bal(&escrow), AMOUNT);

    t.guardian.dispute(&escrow, &t.buyer);
    let split = t.arbiter.resolve(&escrow, &10_000);
    assert_eq!(split.buyer_amount, AMOUNT);
    assert_eq!(t.bal(&t.stranger), 0);
    assert_eq!(t.bal(&escrow), 0);
}

/// [I8] Redondeo con saldos "feos": el reparto suma el saldo, la unidad
/// sobrante va al comprador y las comisiones nunca superan su valor nominal
/// (el residuo de redondeo de TW queda en comprador/vendedor, nunca en un
/// tercero).
#[test]
fn redondeo_nunca_favorece_a_terceros() {
    let t = setup();
    for (amount, bps) in [(1_000_000_007i128, 3_333u32), (7, 5_000), (3, 3_333), (1_234_567, 1), (999, 9_999)] {
        let (escrow, _) = t.funded_amount(amount, WINDOW);
        t.guardian.dispute(&escrow, &t.buyer);
        let who = t.everyone(&escrow);
        let before = t.snapshot(&who);
        let split = t.arbiter.resolve(&escrow, &bps);
        let after = t.snapshot(&who);
        let d: std::vec::Vec<i128> = after.iter().zip(&before).map(|(a, b)| a - b).collect();

        let floor_buyer = amount * bps as i128 / 10_000;
        assert_eq!(split.buyer_amount + split.seller_amount, amount);
        assert!(split.buyer_amount - floor_buyer == 0 || split.buyer_amount - floor_buyer == 1);
        assert_eq!(split.seller_amount, amount * (10_000 - bps as i128) / 10_000);

        let (tw_nom, pl_nom) = nominal_fees(amount, PLATFORM_FEE_BPS);
        assert!(d[3] <= tw_nom && d[2] <= pl_nom, "comisión mayor a la nominal");
        assert_eq!(d[0] + d[1] + d[2] + d[3], amount);
        assert!(d[0] >= 0 && d[1] >= 0);
        assert_eq!(&d[4..8], &[0, 0, 0, 0]);
        assert_eq!(t.bal(&escrow), 0);
    }
}

/// [I2][I8] bps fuera de rango y montos 0 omitidos (100% / 0%).
#[test]
fn resolve_bps_invalido_y_montos_cero() {
    let t = setup();
    let (escrow, _) = t.funded(WINDOW);
    t.guardian.dispute(&escrow, &t.buyer);
    assert_eq!(t.arbiter.try_resolve(&escrow, &10_001), Err(Ok(AErr::InvalidBps)));
    assert_eq!(t.arbiter.try_resolve(&escrow, &u32::MAX), Err(Ok(AErr::InvalidBps)));

    let s = t.arbiter.resolve(&escrow, &0);
    assert_eq!((s.buyer_amount, s.seller_amount), (0, AMOUNT));
    assert_eq!(t.bal(&t.seller), 1_465_500_000); // 100% al vendedor, neto de comisiones
}

// ───────────────────────── refund_unshipped ─────────────────────────

/// refund_unshipped (opcional en SPEC): sin auth, solo con disputa, plazo
/// vencido y sin "enviado". Devuelve el 100% al comprador (neto de comisiones).
#[test]
fn refund_unshipped_reglas() {
    let t = setup();
    let buyer0 = t.bal(&t.buyer);
    let (escrow, _) = t.funded(WINDOW);
    assert_eq!(t.arbiter.try_refund_unshipped(&escrow), Err(Ok(AErr::NotInDispute)));
    t.guardian.dispute(&escrow, &t.buyer);
    assert_eq!(t.arbiter.try_refund_unshipped(&escrow), Err(Ok(AErr::DeadlineNotReached)));
    t.advance(WINDOW);

    t.env.set_auths(&[]);
    let s = t.arbiter.refund_unshipped(&escrow);
    assert_eq!((s.buyer_amount, s.seller_amount), (AMOUNT, 0));
    assert_eq!(t.bal(&t.buyer), buyer0 - AMOUNT + 1_465_500_000);
    assert_eq!(t.bal(&t.seller), 0);
    t.env.mock_all_auths();

    // Si el vendedor marcó "enviado", decide el árbitro.
    let (e2, _) = t.funded(WINDOW);
    t.ship(&e2);
    t.guardian.dispute(&e2, &t.buyer);
    t.advance(WINDOW);
    assert_eq!(t.arbiter.try_refund_unshipped(&e2), Err(Ok(AErr::AlreadyShipped)));
}

// ───────────────────────── administración ─────────────────────────

/// set_arbiter: solo el admin y una sola vez.
#[test]
fn set_arbiter_una_vez_y_solo_admin() {
    let t = setup();
    assert_eq!(t.guardian.config().arbiter, Some(t.arbiter.address.clone()));
    assert_eq!(t.guardian.try_set_arbiter(&t.stranger), Err(Ok(GErr::ArbiterAlreadySet)));

    let g2 = t.env.register(pp_guardian::PpGuardian, (&t.admin, &t.tw_fee, MIN_WINDOW, MAX_WINDOW));
    let g2c = pp_guardian::PpGuardianClient::new(&t.env, &g2);
    t.env.mock_auths(&[MockAuth {
        address: &t.stranger,
        invoke: &MockAuthInvoke {
            contract: &g2,
            fn_name: "set_arbiter",
            args: (&t.stranger,).into_val(&t.env),
            sub_invokes: &[],
        },
    }]);
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

    let (escrow, _) = t.funded(WINDOW);
    t.guardian.dispute(&escrow, &t.buyer);
    let args: soroban_sdk::Vec<soroban_sdk::Val> = (&escrow, 7_000u32).into_val(&t.env);
    t.env.mock_auths(&[MockAuth {
        address: &t.admin,
        invoke: &MockAuthInvoke {
            contract: &t.arbiter.address,
            fn_name: "resolve",
            args: args.clone(),
            sub_invokes: &[],
        },
    }]);
    assert!(t.arbiter.try_resolve(&escrow, &7_000).is_err());
    t.env.mock_auths(&[MockAuth {
        address: &new_admin,
        invoke: &MockAuthInvoke {
            contract: &t.arbiter.address,
            fn_name: "resolve",
            args,
            sub_invokes: &[],
        },
    }]);
    t.arbiter.resolve(&escrow, &7_000);
    assert_eq!(t.bal(&escrow), 0);
}

/// Constructor del guardián: la ventana mínima debe ser > 0 y ≤ máxima.
#[test]
#[should_panic]
fn constructor_rechaza_ventanas_invalidas() {
    let t = setup();
    t.env.register(pp_guardian::PpGuardian, (&t.admin, &t.tw_fee, 100u64, 99u64));
}
