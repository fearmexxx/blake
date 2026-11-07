use core::poseidon::poseidon_hash_span;
use starknet::{ContractAddress, contract_address_const};
use snforge_std::{
    declare, ContractClassTrait, DeclareResultTrait, start_cheat_caller_address,
    stop_cheat_caller_address, start_cheat_block_timestamp_global,
};
use sblake::interfaces::{
    IERC20Dispatcher, IERC20DispatcherTrait, ISBlakeTokenDispatcher, ISBlakeTokenDispatcherTrait,
    ISBlakeMinerDispatcher, ISBlakeMinerDispatcherTrait, IDevVestingDispatcher,
    IDevVestingDispatcherTrait, IVpnPaymentsDispatcher, IVpnPaymentsDispatcherTrait,
    INodeRegistryDispatcher, INodeRegistryDispatcherTrait, ITimelockDispatcher,
    ITimelockDispatcherTrait, IBrotherIdRegistryDispatcher, IBrotherIdRegistryDispatcherTrait,
};

#[starknet::interface]
trait IMockStableExtras<TState> {
    fn faucet(ref self: TState);
}

#[starknet::interface]
trait IBrotherRegistryExtras<TState> {
    fn attest(ref self: TState, account: ContractAddress, status: bool);
}

fn owner() -> ContractAddress {
    contract_address_const::<'OWNER'>()
}
fn guardian() -> ContractAddress {
    contract_address_const::<'GUARDIAN'>()
}
fn miner_user() -> ContractAddress {
    contract_address_const::<'MINER1'>()
}
fn dev_beneficiary() -> ContractAddress {
    contract_address_const::<'DEV_MULTISIG'>()
}
fn ops_treasury() -> ContractAddress {
    contract_address_const::<'OPS_TREASURY'>()
}
fn buyback_vault() -> ContractAddress {
    contract_address_const::<'BUYBACK_VAULT'>()
}
fn oracle() -> ContractAddress {
    contract_address_const::<'ORACLE'>()
}

/// Helper to deploy the v2 suite for testing
fn deploy_suite(
    initial_target: u256,
) -> (
    ContractAddress, // token
    ContractAddress, // miner
    ContractAddress, // vesting
    ContractAddress, // vpn_payments
    ContractAddress, // node_registry
    ContractAddress, // brother_registry
    ContractAddress, // mock_stable
) {
    start_cheat_block_timestamp_global(1_000_000);

    // 1. Deploy SBlakeToken
    let token_class = declare("SBlakeToken").unwrap().contract_class();
    let (token_addr, _) = token_class.deploy(@array![owner().into()]).unwrap();

    // 2. Deploy DevVesting (cliff = 1000s, duration = 10000s)
    let vesting_class = declare("DevVesting").unwrap().contract_class();
    let (vesting_addr, _) = vesting_class
        .deploy(@array![token_addr.into(), dev_beneficiary().into(), 1000, 10000])
        .unwrap();

    // 3. Deploy SBlakeMiner (8% dev fee = 800 bps, 10 SBLAKE reward, 365d halving, 3600s epoch)
    let miner_class = declare("SBlakeMiner").unwrap().contract_class();
    let era1_reward: u256 = 10_000000000000000000_u256;
    let mut miner_calldata: Array<felt252> = array![
        owner().into(),
        guardian().into(),
        token_addr.into(),
        vesting_addr.into(),
        800, // 8% dev fee
    ];
    Serde::serialize(@era1_reward, ref miner_calldata);
    miner_calldata.append(31_536_000); // halving_period (1 year)
    miner_calldata.append(3600); // epoch_seconds (1 hour)
    miner_calldata.append(100); // target_mints_per_epoch
    Serde::serialize(@initial_target, ref miner_calldata);

    let (miner_addr, _) = miner_class.deploy(@miner_calldata).unwrap();

    // Authorize miner as token minter
    start_cheat_caller_address(token_addr, owner());
    ISBlakeTokenDispatcher { contract_address: token_addr }.set_minter(miner_addr, true);
    stop_cheat_caller_address(token_addr);

    // 4. Deploy BrotherIdRegistry & wire into Miner
    let reg_class = declare("BrotherIdRegistry").unwrap().contract_class();
    let (reg_addr, _) = reg_class.deploy(@array![owner().into()]).unwrap();
    start_cheat_caller_address(miner_addr, owner());
    ISBlakeMinerDispatcher { contract_address: miner_addr }.set_brother_registry(reg_addr);
    stop_cheat_caller_address(miner_addr);

    // 5. Deploy MockStable (tUSDC)
    let stable_class = declare("MockStable").unwrap().contract_class();
    let (stable_addr, _) = stable_class.deploy(@array![]).unwrap();

    // 6. Deploy NodeRegistry
    let node_class = declare("NodeRegistry").unwrap().contract_class();
    let (node_addr, _) = node_class
        .deploy(@array![owner().into(), owner().into(), token_addr.into(), stable_addr.into()])
        .unwrap();

    // 7. Deploy VpnPayments (node_pool = node_addr)
    let vpn_class = declare("VpnPayments").unwrap().contract_class();
    let (vpn_addr, _) = vpn_class
        .deploy(
            @array![
                owner().into(),
                owner().into(),
                oracle().into(),
                stable_addr.into(),
                token_addr.into(),
                ops_treasury().into(),
                node_addr.into(),
                buyback_vault().into(),
            ],
        )
        .unwrap();

    (token_addr, miner_addr, vesting_addr, vpn_addr, node_addr, reg_addr, stable_addr)
}

#[test]
fn test_pow_verification_and_replay_protection() {
    // Use MAX_TARGET so any valid Poseidon hash passes, then verify replay is rejected
    let max_target: u256 =
        0x0800000000000011000000000000000000000000000000000000000000000000_u256;
    let (token_addr, miner_addr, vesting_addr, _, _, _, _) = deploy_suite(max_target);
    let miner = ISBlakeMinerDispatcher { contract_address: miner_addr };
    let erc20 = IERC20Dispatcher { contract_address: token_addr };

    start_cheat_caller_address(miner_addr, miner_user());
    miner.mint(42);
    stop_cheat_caller_address(miner_addr);

    assert(erc20.balance_of(miner_user()) == 10_000000000000000000_u256, 'Miner should get 10');

    // Flush 8% dev fee (0.8 SBLAKE) to DevVesting
    miner.flush_dev_fee();
    assert(erc20.balance_of(vesting_addr) == 800000000000000000_u256, 'Dev vault should get 0.8');

    // Test vesting cliff & linear release
    let vesting = IDevVestingDispatcher { contract_address: vesting_addr };
    assert(vesting.releasable() == 0, 'Before cliff should be 0');
    start_cheat_block_timestamp_global(1_000_000 + 5000); // 50% vested
    let half = vesting.releasable();
    assert(half == 400000000000000000_u256, 'Half vested at 50%');
    vesting.release();
    assert(erc20.balance_of(dev_beneficiary()) == half, 'Beneficiary received half');
}

#[test]
#[should_panic(expected: ('Work already used',))]
fn test_pow_replay_rejected() {
    let max_target: u256 =
        0x0800000000000011000000000000000000000000000000000000000000000000_u256;
    let (_, miner_addr, _, _, _, _, _) = deploy_suite(max_target);
    let miner = ISBlakeMinerDispatcher { contract_address: miner_addr };

    start_cheat_caller_address(miner_addr, miner_user());
    miner.mint(777);
    // Replaying the same nonce in the same epoch must panic
    miner.mint(777);
}

#[test]
#[should_panic(expected: ('Insufficient work',))]
fn test_pow_rejects_invalid_nonce() {
    // Target = 1 so a random nonce will exceed target
    let tiny_target: u256 = 1_u256;
    let (_, miner_addr, _, _, _, _, _) = deploy_suite(tiny_target);
    let miner = ISBlakeMinerDispatcher { contract_address: miner_addr };

    start_cheat_caller_address(miner_addr, miner_user());
    miner.mint(12345);
}

#[test]
fn test_daily_cap_and_brother_id_registry_and_utc_reset() {
    let max_target: u256 =
        0x0800000000000011000000000000000000000000000000000000000000000000_u256;
    let (_, miner_addr, _, _, _, reg_addr, _) = deploy_suite(max_target);
    let miner = ISBlakeMinerDispatcher { contract_address: miner_addr };

    let (_, _, _, used0, limit0) = miner.get_challenge(miner_user());
    assert(used0 == 0 && limit0 == 10, 'Default cap is 10');

    start_cheat_caller_address(miner_addr, miner_user());
    let mut n: felt252 = 1;
    let mut i: u32 = 0;
    while i < 10 {
        miner.mint(n);
        n += 1;
        i += 1;
    };
    stop_cheat_caller_address(miner_addr);

    // Attest miner_user in BrotherIdRegistry -> cap doubles to 20/day
    start_cheat_caller_address(reg_addr, owner());
    IBrotherRegistryExtrasDispatcher { contract_address: reg_addr }.attest(miner_user(), true);
    stop_cheat_caller_address(reg_addr);

    let (_, _, _, used10, limit20) = miner.get_challenge(miner_user());
    assert(used10 == 10 && limit20 == 20, 'Verified cap is 20');

    // Advance UTC day (+86,400s) -> used counter resets to 0 even for active miner!
    start_cheat_block_timestamp_global(1_000_000 + 86400);
    let (_, _, _, used_next_day, _) = miner.get_challenge(miner_user());
    assert(used_next_day == 0, 'New UTC day resets count');
}

#[test]
fn test_vpn_payments_usd_split_and_sblake_20pct_discount() {
    let max_target: u256 =
        0x0800000000000011000000000000000000000000000000000000000000000000_u256;
    let (token_addr, miner_addr, _, vpn_addr, node_addr, _, stable_addr) = deploy_suite(max_target);
    let stable = IERC20Dispatcher { contract_address: stable_addr };
    let vpn = IVpnPaymentsDispatcher { contract_address: vpn_addr };

    // 1. Test $6.00 USDC payment -> 55% ($3.30) Ops, 30% ($1.80) Node Pool, 15% ($0.90) Buyback
    start_cheat_caller_address(stable_addr, miner_user());
    IMockStableExtrasDispatcher { contract_address: stable_addr }.faucet();
    stable.approve(vpn_addr, 6_000000);
    stop_cheat_caller_address(stable_addr);

    start_cheat_caller_address(vpn_addr, miner_user());
    vpn.pay_stable(1, 0xABCDEF_u256, 'eu-west-1');
    stop_cheat_caller_address(vpn_addr);

    assert(vpn.is_session_active(0xABCDEF_u256), 'VPN session should be active');
    assert(stable.balance_of(ops_treasury()) == 3_300000, 'Ops gets $3.30');
    assert(stable.balance_of(node_addr) == 1_800000, 'Node pool gets $1.80');
    assert(stable.balance_of(buyback_vault()) == 900000, 'Buyback gets $0.90');

    // 2. Test paying in SBLAKE at $6/mo with 20% discount ($4.80 effective)
    // Set oracle price = $0.10 (10_000_000 in 8-decimal USD) -> quote = 48 SBLAKE
    start_cheat_caller_address(vpn_addr, oracle());
    vpn.push_sblake_price(10_000_000);
    stop_cheat_caller_address(vpn_addr);

    let quote = vpn.quote_sblake(1);
    assert(quote == 48_000000000000000000_u256, 'Quote should be 48 SBLAKE');

    // Mine 5 times (50 SBLAKE) and pay with SBLAKE
    let miner = ISBlakeMinerDispatcher { contract_address: miner_addr };
    start_cheat_caller_address(miner_addr, miner_user());
    miner.mint(101);
    miner.mint(102);
    miner.mint(103);
    miner.mint(104);
    miner.mint(105);
    stop_cheat_caller_address(miner_addr);

    let sblake_erc20 = IERC20Dispatcher { contract_address: token_addr };
    start_cheat_caller_address(token_addr, miner_user());
    sblake_erc20.approve(vpn_addr, quote);
    stop_cheat_caller_address(token_addr);

    start_cheat_caller_address(vpn_addr, miner_user());
    vpn.pay_sblake(1, 0x999999_u256, 'us-east-1', quote);
    stop_cheat_caller_address(vpn_addr);

    assert(vpn.is_session_active(0x999999_u256), 'SBLAKE session active');
    // 30% of 48 SBLAKE = 14.4 SBLAKE burned permanently
    let burned = ISBlakeTokenDispatcher { contract_address: token_addr }.total_burned();
    assert(burned == 14_400000000000000000_u256, '14.4 SBLAKE burned');
}

#[test]
fn test_node_registry_bonding_and_stable_payout() {
    let max_target: u256 =
        0x0800000000000011000000000000000000000000000000000000000000000000_u256;
    let (_, _, _, vpn_addr, node_addr, _, stable_addr) = deploy_suite(max_target);
    let nodes = INodeRegistryDispatcher { contract_address: node_addr };
    let stable = IERC20Dispatcher { contract_address: stable_addr };
    let vpn = IVpnPaymentsDispatcher { contract_address: vpn_addr };

    // Subsidize miner_user as Beta node operator & bond node
    start_cheat_caller_address(node_addr, owner());
    nodes.set_subsidized(miner_user(), true);
    stop_cheat_caller_address(node_addr);

    start_cheat_caller_address(node_addr, miner_user());
    nodes.bond('eu-west-1', '185.212.44.19:51820', 0x11223344_u256);
    stop_cheat_caller_address(node_addr);

    let (active_count, _, _) = nodes.get_stats();
    assert(active_count == 1, '1 active node');

    // Subscriber pays $6.00 USDC -> $1.80 lands in NodeRegistry
    let subscriber = contract_address_const::<'SUB1'>();
    start_cheat_caller_address(stable_addr, subscriber);
    IMockStableExtrasDispatcher { contract_address: stable_addr }.faucet();
    stable.approve(vpn_addr, 6_000000);
    stop_cheat_caller_address(stable_addr);

    start_cheat_caller_address(vpn_addr, subscriber);
    vpn.pay_stable(1, 0x555555_u256, 'eu-west-1');
    stop_cheat_caller_address(vpn_addr);

    // Owner/Manager allocates $1.80 USDC reward to node operator
    start_cheat_caller_address(node_addr, owner());
    nodes.allocate_rewards(array![miner_user()].span(), array![1_800000_u256].span());
    stop_cheat_caller_address(node_addr);

    // Node operator claims $1.80 USDC
    start_cheat_caller_address(node_addr, miner_user());
    nodes.claim();
    stop_cheat_caller_address(node_addr);

    assert(stable.balance_of(miner_user()) == 1_800000, 'Operator claimed $1.80 USDC');
}
