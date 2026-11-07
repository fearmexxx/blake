// VpnPayments — USD-priced BlakeVPN passes.
//
// - Plans are priced in USD (6 decimals). Default plan #1 = $6.00 / 30 days.
// - `pay_stable`: user pays the exact USD price in the configured stablecoin (USDC, 6 decimals).
//   Revenue is split on the spot: ops treasury / node payout pool / buyback vault.
// - `pay_sblake`: user pays in SBLAKE at a discount (default 20%) using an oracle price.
//   A share (default 30%) of the SBLAKE is burned immediately; the rest goes to the ops treasury.
// - Passes are keyed by the client's WireGuard public key (32 bytes -> u256). BlakeNode daemons
//   watch `PassActivated` events and add/expire WireGuard peers accordingly.
// - No unverifiable "nullifier" payments: unlinkability comes from paying from a STRK20 shadow /
//   fresh account, not from trusting a client-supplied value.

#[starknet::contract]
pub mod VpnPayments {
    use core::num::traits::Zero;
    use starknet::{ContractAddress, ClassHash, get_caller_address, get_block_timestamp};
    use starknet::syscalls::replace_class_syscall;
    use starknet::SyscallResultTrait;
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use crate::interfaces::{
        IVpnPayments, IOwnable, IERC20Dispatcher, IERC20DispatcherTrait, ISBlakeTokenDispatcher,
        ISBlakeTokenDispatcherTrait,
    };

    pub const BPS: u16 = 10000;
    pub const MAX_PRICE_AGE: u64 = 86400;
    pub const MAX_DISCOUNT_BPS: u16 = 5000;
    pub const MAX_PASS_SECONDS: u64 = 31_536_000; // 1 year

    #[storage]
    struct Storage {
        owner: ContractAddress,
        granter: ContractAddress,
        oracle: ContractAddress,
        stable_token: ContractAddress,
        sblake_token: ContractAddress,
        ops_treasury: ContractAddress,
        node_pool: ContractAddress,
        buyback_vault: ContractAddress,
        ops_bps: u16,
        node_bps: u16,
        buyback_bps: u16,
        sblake_discount_bps: u16,
        sblake_burn_bps: u16,
        sblake_price_e8: u128,
        sblake_price_ts: u64,
        plan_price_e6: Map<u8, u64>,
        plan_duration: Map<u8, u64>,
        plan_active: Map<u8, bool>,
        session_expiry: Map<u256, u64>,
        total_stable_revenue: u256,
        total_sblake_revenue: u256,
        total_passes: u64,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        PassActivated: PassActivated,
        PlanUpdated: PlanUpdated,
        PriceUpdated: PriceUpdated,
        ConfigUpdated: ConfigUpdated,
        OwnershipTransferred: OwnershipTransferred,
        Upgraded: Upgraded,
    }

    /// payment_kind: 'STABLE' | 'SBLAKE' | 'GRANT'
    #[derive(Drop, starknet::Event)]
    pub struct PassActivated {
        #[key]
        pub session_pubkey: u256,
        pub plan_id: u8,
        pub region: felt252,
        pub expires_at: u64,
        pub payment_kind: felt252,
        pub amount: u256,
        pub burned: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct PlanUpdated {
        pub plan_id: u8,
        pub usd_price_e6: u64,
        pub duration_secs: u64,
        pub active: bool,
    }

    #[derive(Drop, starknet::Event)]
    pub struct PriceUpdated {
        pub price_usd_e8: u128,
        pub timestamp: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct ConfigUpdated {
        pub key: felt252,
        pub value: felt252,
    }

    #[derive(Drop, starknet::Event)]
    pub struct OwnershipTransferred {
        pub previous_owner: ContractAddress,
        pub new_owner: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Upgraded {
        pub class_hash: ClassHash,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        granter: ContractAddress,
        oracle: ContractAddress,
        stable_token: ContractAddress,
        sblake_token: ContractAddress,
        ops_treasury: ContractAddress,
        node_pool: ContractAddress,
        buyback_vault: ContractAddress,
    ) {
        assert(!owner.is_zero(), 'Owner is zero');
        assert(!stable_token.is_zero(), 'Stable token is zero');
        assert(!sblake_token.is_zero(), 'SBLAKE token is zero');
        assert(!ops_treasury.is_zero(), 'Ops treasury is zero');
        assert(!node_pool.is_zero(), 'Node pool is zero');
        assert(!buyback_vault.is_zero(), 'Buyback vault is zero');
        self.owner.write(owner);
        self.granter.write(granter);
        self.oracle.write(oracle);
        self.stable_token.write(stable_token);
        self.sblake_token.write(sblake_token);
        self.ops_treasury.write(ops_treasury);
        self.node_pool.write(node_pool);
        self.buyback_vault.write(buyback_vault);
        // v2.1 defaults: 55% ops / 30% nodes / 15% buyback; SBLAKE: 20% discount, 50% burned
        self.ops_bps.write(5500);
        self.node_bps.write(3000);
        self.buyback_bps.write(1500);
        self.sblake_discount_bps.write(2000);
        self.sblake_burn_bps.write(5000);
        // Plan #1: Standard Consumer Monthly ($6.00 / 30 days -> $4.80 in SBLAKE)
        self.plan_price_e6.entry(1).write(6_000000);
        self.plan_duration.entry(1).write(2_592_000);
        self.plan_active.entry(1).write(true);
        // Plan #2: Annual Saver Pre-Pay ($48.00 / 365 days = $4/mo -> $38.40 in SBLAKE)
        self.plan_price_e6.entry(2).write(48_000000);
        self.plan_duration.entry(2).write(31_536_000);
        self.plan_active.entry(2).write(true);
        // Plan #3: Pro Trader & Starknet Private RPC Pass ($19.00 / 30 days -> $15.20 in SBLAKE)
        self.plan_price_e6.entry(3).write(19_000000);
        self.plan_duration.entry(3).write(2_592_000);
        self.plan_active.entry(3).write(true);
    }

    #[abi(embed_v0)]
    impl VpnPaymentsImpl of IVpnPayments<ContractState> {
        fn pay_stable(ref self: ContractState, plan_id: u8, session_pubkey: u256, region: felt252) {
            let (price_e6, duration) = self._active_plan(plan_id);
            let payer = get_caller_address();
            let total: u256 = price_e6.into();
            let ops = (total * self.ops_bps.read().into()) / BPS.into();
            let nodes = (total * self.node_bps.read().into()) / BPS.into();
            let buyback = total - ops - nodes;
            let stable = IERC20Dispatcher { contract_address: self.stable_token.read() };
            if ops > 0 {
                assert(stable.transfer_from(payer, self.ops_treasury.read(), ops), 'Ops transfer failed');
            }
            if nodes > 0 {
                assert(stable.transfer_from(payer, self.node_pool.read(), nodes), 'Node transfer failed');
            }
            if buyback > 0 {
                assert(
                    stable.transfer_from(payer, self.buyback_vault.read(), buyback),
                    'Buyback transfer failed',
                );
            }
            self.total_stable_revenue.write(self.total_stable_revenue.read() + total);
            self._activate(session_pubkey, plan_id, region, duration, 'STABLE', total, 0);
        }

        fn pay_sblake(
            ref self: ContractState,
            plan_id: u8,
            session_pubkey: u256,
            region: felt252,
            max_sblake: u256,
        ) {
            let (_, duration) = self._active_plan(plan_id);
            let cost = self.quote_sblake(plan_id);
            assert(cost > 0, 'Quote unavailable');
            assert(cost <= max_sblake, 'Slippage: cost > max');
            let payer = get_caller_address();
            let burn_amt = (cost * self.sblake_burn_bps.read().into()) / BPS.into();
            let to_ops = cost - burn_amt;
            let sblake_addr = self.sblake_token.read();
            if burn_amt > 0 {
                ISBlakeTokenDispatcher { contract_address: sblake_addr }.burn_from(payer, burn_amt);
            }
            if to_ops > 0 {
                assert(
                    IERC20Dispatcher { contract_address: sblake_addr }
                        .transfer_from(payer, self.ops_treasury.read(), to_ops),
                    'SBLAKE transfer failed',
                );
            }
            self.total_sblake_revenue.write(self.total_sblake_revenue.read() + cost);
            self._activate(session_pubkey, plan_id, region, duration, 'SBLAKE', cost, burn_amt);
        }

        fn get_plan(self: @ContractState, plan_id: u8) -> (u64, u64, bool) {
            (
                self.plan_price_e6.entry(plan_id).read(),
                self.plan_duration.entry(plan_id).read(),
                self.plan_active.entry(plan_id).read(),
            )
        }

        fn quote_sblake(self: @ContractState, plan_id: u8) -> u256 {
            let price_e8 = self.sblake_price_e8.read();
            if price_e8 == 0 {
                return 0;
            }
            if get_block_timestamp() > self.sblake_price_ts.read() + MAX_PRICE_AGE {
                return 0;
            }
            let usd_e6: u256 = self.plan_price_e6.entry(plan_id).read().into();
            let discounted_e6 = (usd_e6 * (BPS - self.sblake_discount_bps.read()).into()) / BPS.into();
            // SBLAKE (18 dec) = usd_e6 * 1e12 * 1e8 / price_e8
            (discounted_e6 * 100000000000000000000_u256) / price_e8.into()
        }

        fn session_expiry(self: @ContractState, session_pubkey: u256) -> u64 {
            self.session_expiry.entry(session_pubkey).read()
        }

        fn is_session_active(self: @ContractState, session_pubkey: u256) -> bool {
            self.session_expiry.entry(session_pubkey).read() > get_block_timestamp()
        }

        fn get_revenue_config(self: @ContractState) -> (u16, u16, u16, u16, u16) {
            (
                self.ops_bps.read(),
                self.node_bps.read(),
                self.buyback_bps.read(),
                self.sblake_burn_bps.read(),
                self.sblake_discount_bps.read(),
            )
        }

        fn get_sblake_price(self: @ContractState) -> (u128, u64) {
            (self.sblake_price_e8.read(), self.sblake_price_ts.read())
        }

        // ---------------- admin ----------------
        fn set_plan(
            ref self: ContractState, plan_id: u8, usd_price_e6: u64, duration_secs: u64, active: bool,
        ) {
            self._only_owner();
            assert(plan_id > 0, 'Plan id is zero');
            assert(duration_secs > 0 && duration_secs <= MAX_PASS_SECONDS, 'Bad duration');
            assert(usd_price_e6 > 0, 'Price is zero');
            self.plan_price_e6.entry(plan_id).write(usd_price_e6);
            self.plan_duration.entry(plan_id).write(duration_secs);
            self.plan_active.entry(plan_id).write(active);
            self.emit(PlanUpdated { plan_id, usd_price_e6, duration_secs, active });
        }

        fn set_revenue_split(ref self: ContractState, ops_bps: u16, node_bps: u16, buyback_bps: u16) {
            self._only_owner();
            assert(ops_bps + node_bps + buyback_bps == BPS, 'Split must sum to 100%');
            self.ops_bps.write(ops_bps);
            self.node_bps.write(node_bps);
            self.buyback_bps.write(buyback_bps);
        }

        fn set_sblake_terms(ref self: ContractState, discount_bps: u16, burn_bps: u16) {
            self._only_owner();
            assert(discount_bps <= MAX_DISCOUNT_BPS, 'Discount too high');
            assert(burn_bps <= BPS, 'Burn > 100%');
            self.sblake_discount_bps.write(discount_bps);
            self.sblake_burn_bps.write(burn_bps);
        }

        fn set_price_oracle(ref self: ContractState, oracle: ContractAddress) {
            self._only_owner();
            self.oracle.write(oracle);
            self.emit(ConfigUpdated { key: 'oracle', value: oracle.into() });
        }

        fn push_sblake_price(ref self: ContractState, price_usd_e8: u128) {
            assert(get_caller_address() == self.oracle.read(), 'Caller is not oracle');
            assert(price_usd_e8 > 0, 'Price is zero');
            let now = get_block_timestamp();
            self.sblake_price_e8.write(price_usd_e8);
            self.sblake_price_ts.write(now);
            self.emit(PriceUpdated { price_usd_e8, timestamp: now });
        }

        fn set_destinations(
            ref self: ContractState,
            ops_treasury: ContractAddress,
            node_pool: ContractAddress,
            buyback_vault: ContractAddress,
        ) {
            self._only_owner();
            assert(
                !ops_treasury.is_zero() && !node_pool.is_zero() && !buyback_vault.is_zero(),
                'Destination is zero',
            );
            self.ops_treasury.write(ops_treasury);
            self.node_pool.write(node_pool);
            self.buyback_vault.write(buyback_vault);
        }

        fn set_granter(ref self: ContractState, granter: ContractAddress) {
            self._only_owner();
            self.granter.write(granter);
            self.emit(ConfigUpdated { key: 'granter', value: granter.into() });
        }

        fn grant_pass(
            ref self: ContractState, session_pubkey: u256, duration_secs: u64, region: felt252,
        ) {
            let caller = get_caller_address();
            assert(caller == self.granter.read() || caller == self.owner.read(), 'Not granter');
            assert(duration_secs > 0 && duration_secs <= MAX_PASS_SECONDS, 'Bad duration');
            self._activate(session_pubkey, 0, region, duration_secs, 'GRANT', 0, 0);
        }
    }

    #[abi(embed_v0)]
    impl OwnableImpl of IOwnable<ContractState> {
        fn owner(self: @ContractState) -> ContractAddress {
            self.owner.read()
        }
        fn transfer_ownership(ref self: ContractState, new_owner: ContractAddress) {
            self._only_owner();
            assert(!new_owner.is_zero(), 'New owner is zero');
            let previous_owner = self.owner.read();
            self.owner.write(new_owner);
            self.emit(OwnershipTransferred { previous_owner, new_owner });
        }
        fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {
            self._only_owner();
            assert(!new_class_hash.is_zero(), 'Class hash is zero');
            replace_class_syscall(new_class_hash).unwrap_syscall();
            self.emit(Upgraded { class_hash: new_class_hash });
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn _only_owner(self: @ContractState) {
            assert(get_caller_address() == self.owner.read(), 'Caller is not owner');
        }

        fn _active_plan(self: @ContractState, plan_id: u8) -> (u64, u64) {
            assert(self.plan_active.entry(plan_id).read(), 'Plan inactive');
            (self.plan_price_e6.entry(plan_id).read(), self.plan_duration.entry(plan_id).read())
        }

        fn _activate(
            ref self: ContractState,
            session_pubkey: u256,
            plan_id: u8,
            region: felt252,
            duration: u64,
            payment_kind: felt252,
            amount: u256,
            burned: u256,
        ) {
            assert(session_pubkey != 0, 'Session pubkey is zero');
            let now = get_block_timestamp();
            let current = self.session_expiry.entry(session_pubkey).read();
            let base = if current > now {
                current
            } else {
                now
            };
            let expires_at = base + duration;
            self.session_expiry.entry(session_pubkey).write(expires_at);
            self.total_passes.write(self.total_passes.read() + 1);
            self
                .emit(
                    PassActivated {
                        session_pubkey, plan_id, region, expires_at, payment_kind, amount, burned,
                    },
                );
        }
    }
}
