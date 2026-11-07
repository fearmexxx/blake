// StarkBlake v2 shared interfaces.
//
// v2 splits the legacy monolith (`sblake.cairo`) into independent contracts:
//   - SBlakeToken    (ERC-20, 21M cumulative mint cap, minter roles, burn)
//   - SBlakeMiner    (Poseidon proof-of-work, time-based emission, difficulty retarget)
//   - DevVesting     (vested 5-10% dev fee on emission)
//   - VpnPayments    (USD-priced BlakeVPN passes, USDC or SBLAKE at a discount)
//   - NodeRegistry   (BlakeNode bonding, slashing, stablecoin payouts)
//   - Timelock       (delayed admin execution; intended owner of all contracts)

use starknet::{ContractAddress, ClassHash};

#[starknet::interface]
pub trait IERC20<TState> {
    fn name(self: @TState) -> felt252;
    fn symbol(self: @TState) -> felt252;
    fn decimals(self: @TState) -> u8;
    fn total_supply(self: @TState) -> u256;
    fn balance_of(self: @TState, account: ContractAddress) -> u256;
    fn allowance(self: @TState, owner: ContractAddress, spender: ContractAddress) -> u256;
    fn transfer(ref self: TState, recipient: ContractAddress, amount: u256) -> bool;
    fn transfer_from(
        ref self: TState, sender: ContractAddress, recipient: ContractAddress, amount: u256,
    ) -> bool;
    fn approve(ref self: TState, spender: ContractAddress, amount: u256) -> bool;
}

#[starknet::interface]
pub trait ISBlakeToken<TState> {
    /// Minter-only. Reverts if cumulative minted supply would exceed the 21M cap.
    fn mint(ref self: TState, to: ContractAddress, amount: u256);
    /// Burns `amount` from the caller's balance.
    fn burn(ref self: TState, amount: u256);
    /// Burns `amount` from `account`, consuming the caller's allowance.
    fn burn_from(ref self: TState, account: ContractAddress, amount: u256);
    fn max_supply(self: @TState) -> u256;
    /// Cumulative amount ever minted (burns do NOT re-open mintable supply).
    fn total_minted(self: @TState) -> u256;
    fn total_burned(self: @TState) -> u256;
    fn is_minter(self: @TState, account: ContractAddress) -> bool;
    fn set_minter(ref self: TState, account: ContractAddress, allowed: bool);
}

#[starknet::interface]
pub trait IOwnable<TState> {
    fn owner(self: @TState) -> ContractAddress;
    fn transfer_ownership(ref self: TState, new_owner: ContractAddress);
    fn upgrade(ref self: TState, new_class_hash: ClassHash);
}

/// Brother ID human-verification registry. Any contract implementing this can be
/// plugged into the miner; the miner never trusts a user-supplied flag.
#[starknet::interface]
pub trait IBrotherIdRegistry<TState> {
    fn is_verified(self: @TState, account: ContractAddress) -> bool;
}

#[starknet::interface]
pub trait ISBlakeMiner<TState> {
    /// Returns (epoch, challenge, target, mints_today, daily_limit).
    /// work = poseidon_hash_span([challenge, nonce]) and must satisfy work <= target.
    fn get_challenge(self: @TState, user: ContractAddress) -> (u64, felt252, u256, u32, u32);
    /// Helper so clients can self-check a solution before paying gas.
    fn compute_work(self: @TState, user: ContractAddress, nonce: felt252) -> felt252;
    fn mint(ref self: TState, nonce: felt252);
    /// Anyone may roll the epoch forward once its time window elapsed.
    fn advance_epoch(ref self: TState);
    /// Burns the overclock cost and grants +OVERCLOCK_BONUS mints for 24h.
    fn buy_overclock(ref self: TState);
    /// Mints the accrued dev fee to the vesting vault. Callable by anyone.
    fn flush_dev_fee(ref self: TState);
    /// Returns (era, miner_reward_per_mint, epoch, epoch_mints, target_mints_per_epoch, next_halving_ts).
    fn get_emission_info(self: @TState) -> (u8, u256, u64, u32, u32, u64);
    fn get_dev_fee_info(self: @TState) -> (u16, u256, ContractAddress);
    fn get_overclock_info(self: @TState, user: ContractAddress) -> (u256, u64);
    fn is_paused(self: @TState) -> bool;
    // --- admin ---
    fn set_paused(ref self: TState, paused: bool);
    fn set_guardian(ref self: TState, guardian: ContractAddress);
    fn set_brother_registry(ref self: TState, registry: ContractAddress);
    fn set_allowlist_enabled(ref self: TState, enabled: bool);
    fn set_allowlisted(ref self: TState, account: ContractAddress, allowed: bool);
    fn set_dev_fee_bps(ref self: TState, bps: u16);
    fn set_overclock_cost(ref self: TState, cost: u256);
}

#[starknet::interface]
pub trait IVpnPayments<TState> {
    /// Pays the USD plan price in the configured stablecoin (e.g. USDC, 6 decimals).
    fn pay_stable(ref self: TState, plan_id: u8, session_pubkey: u256, region: felt252);
    /// Pays in SBLAKE at the configured discount. Reverts if cost > max_sblake (slippage guard).
    fn pay_sblake(
        ref self: TState, plan_id: u8, session_pubkey: u256, region: felt252, max_sblake: u256,
    );
    /// Returns (usd_price_e6, duration_secs, active).
    fn get_plan(self: @TState, plan_id: u8) -> (u64, u64, bool);
    fn quote_sblake(self: @TState, plan_id: u8) -> u256;
    fn session_expiry(self: @TState, session_pubkey: u256) -> u64;
    fn is_session_active(self: @TState, session_pubkey: u256) -> bool;
    /// Returns (ops_bps, node_bps, buyback_bps, sblake_burn_bps, sblake_discount_bps).
    fn get_revenue_config(self: @TState) -> (u16, u16, u16, u16, u16);
    fn get_sblake_price(self: @TState) -> (u128, u64);
    // --- admin ---
    fn set_plan(ref self: TState, plan_id: u8, usd_price_e6: u64, duration_secs: u64, active: bool);
    fn set_revenue_split(ref self: TState, ops_bps: u16, node_bps: u16, buyback_bps: u16);
    fn set_sblake_terms(ref self: TState, discount_bps: u16, burn_bps: u16);
    fn set_price_oracle(ref self: TState, oracle: ContractAddress);
    /// Oracle-only: SBLAKE price in USD with 8 decimals.
    fn push_sblake_price(ref self: TState, price_usd_e8: u128);
    fn set_destinations(
        ref self: TState,
        ops_treasury: ContractAddress,
        node_pool: ContractAddress,
        buyback_vault: ContractAddress,
    );
    fn set_granter(ref self: TState, granter: ContractAddress);
    /// Testnet / alpha: grant a free pass (Phase B free VPN for testers).
    fn grant_pass(ref self: TState, session_pubkey: u256, duration_secs: u64, region: felt252);
}

#[starknet::interface]
pub trait INodeRegistry<TState> {
    fn bond(ref self: TState, region: felt252, endpoint: felt252, wg_pubkey: u256);
    fn request_unbond(ref self: TState);
    fn withdraw(ref self: TState);
    fn heartbeat(ref self: TState);
    fn claim(ref self: TState);
    /// Returns (collateral, region, endpoint, wg_pubkey, active, last_heartbeat, unbond_at, claimable).
    fn get_node(
        self: @TState, operator: ContractAddress,
    ) -> (u256, felt252, felt252, u256, bool, u64, u64, u256);
    fn get_stats(self: @TState) -> (u32, u256, u256);
    fn operator_at(self: @TState, index: u32) -> ContractAddress;
    fn operators_count(self: @TState) -> u32;
    // --- admin ---
    fn set_manager(ref self: TState, manager: ContractAddress);
    fn set_subsidized(ref self: TState, operator: ContractAddress, allowed: bool);
    fn set_bond_amount(ref self: TState, amount: u256);
    fn slash(ref self: TState, operator: ContractAddress, amount: u256, reason: felt252);
    fn allocate_rewards(ref self: TState, operators: Span<ContractAddress>, amounts: Span<u256>);
}

#[starknet::interface]
pub trait IDevVesting<TState> {
    fn release(ref self: TState);
    fn releasable(self: @TState) -> u256;
    /// Returns (beneficiary, start, cliff_end, end, released).
    fn get_schedule(self: @TState) -> (ContractAddress, u64, u64, u64, u256);
}

#[starknet::interface]
pub trait ITimelock<TState> {
    fn schedule(
        ref self: TState,
        target: ContractAddress,
        selector: felt252,
        calldata: Span<felt252>,
        salt: felt252,
    ) -> felt252;
    fn execute(
        ref self: TState,
        target: ContractAddress,
        selector: felt252,
        calldata: Span<felt252>,
        salt: felt252,
    ) -> Span<felt252>;
    fn cancel(ref self: TState, id: felt252);
    fn hash_operation(
        self: @TState,
        target: ContractAddress,
        selector: felt252,
        calldata: Span<felt252>,
        salt: felt252,
    ) -> felt252;
    fn get_ready_at(self: @TState, id: felt252) -> u64;
    fn min_delay(self: @TState) -> u64;
    fn proposer(self: @TState) -> ContractAddress;
    fn update_delay(ref self: TState, new_delay: u64);
    fn set_proposer(ref self: TState, new_proposer: ContractAddress);
}
