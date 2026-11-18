extern crate std;

use crate::error::ContractError;
use crate::storage::types::{Escrow, Flags, Milestone, Roles, Trustline};
use soroban_sdk::{testutils::Address as _, vec, Address, Env, String};

use super::helpers::{create_escrow_contract, create_usdc_token};

/// A released escrow must not be flagged as disputed afterwards.
#[test]
fn test_cannot_dispute_released_escrow() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let approver = Address::generate(&env);
    let service_provider = Address::generate(&env);
    let platform = Address::generate(&env);
    let release_signer = Address::generate(&env);
    let dispute_resolver = Address::generate(&env);
    let trustless_work = Address::generate(&env);

    let (usdc, usdc_admin) = create_usdc_token(&env, &admin);
    let amount: i128 = 100_000_000;
    usdc_admin.mint(&approver, &amount);

    let escrow = Escrow {
        engagement_id: String::from_str(&env, "dispute_after_release"),
        title: String::from_str(&env, "Dispute after release"),
        roles: Roles {
            approver: approver.clone(),
            service_provider: service_provider.clone(),
            platform: platform.clone(),
            release_signer: release_signer.clone(),
            dispute_resolver: dispute_resolver.clone(),
            receiver: service_provider.clone(),
        },
        description: String::from_str(&env, "H-1"),
        amount,
        platform_fee: 200,
        milestones: vec![
            &env,
            Milestone {
                description: String::from_str(&env, "Delivery"),
                status: String::from_str(&env, "pending"),
                evidence: String::from_str(&env, ""),
                approved: false,
            },
        ],
        flags: Flags { disputed: false, released: false, resolved: false },
        trustline: Trustline { address: usdc.address.clone() },
        receiver_memo: 0,
    };

    let client = create_escrow_contract(&env).client;
    client.initialize_escrow(&escrow);
    client.fund_escrow(&approver, &escrow, &amount);
    client.approve_milestone(&0, &approver);
    client.release_funds(&release_signer, &trustless_work);
    assert!(client.get_escrow().flags.released);
    assert_eq!(usdc.balance(&client.address), 0);

    // Every role holder except the dispute resolver used to be able to flip
    // `disputed` on a finished escrow.
    for signer in [&service_provider, &platform, &approver, &release_signer] {
        assert_eq!(
            client.try_dispute_escrow(signer),
            Err(Ok(ContractError::EscrowAlreadyReleased))
        );
    }
    assert!(!client.get_escrow().flags.disputed);
}
