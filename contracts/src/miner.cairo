// SBLAKE Miner (v2) — Poseidon proof-of-work with time-based emission.
//
// Security / design notes
// - Proof-of-work is verified ON-CHAIN:  work = poseidon_hash_span([challenge, nonce]) <= target
//   where challenge = poseidon_hash_span([epoch_seed, caller]). Work is bound to the caller and the
//   epoch, so solutions cannot be stolen or replayed (each work value is single-use).
// - Post-quantum posture: PoW is a pure hash search. Grover's algorithm gives at most a quadratic
//   speed-up, which the difficulty retarget absorbs. Poseidon is the same STARK-friendly hash family
//   Starknet's (hash-based, post-quantum) proof system relies on. Nothing here depends on elliptic
//   curve hardness; account-level signatures can migrate to PQ schemes via account abstraction
//   without changing this contract.
// - Emission is time-based: halving every `halving_period` seconds, and each epoch has a mint quota
//   (2x target). Difficulty retargets every epoch toward `target_mints_per_epoch`, so emission per
//   day stays roughly constant regardless of how many miners join.
// - Daily cap per wallet uses fixed UTC day buckets (resets every day even for continuous miners):
//   10/day base, 20/day if verified by the Brother ID registry, +10 with a paid (burned) Overclock.
// - Dev fee: `dev_fee_bps` (bounded 5-10%) on top of every miner reward accrues to a vesting vault.

#[starknet::contract]
pub mod SBlakeMiner {
    use core::num::traits::Zero;
    use core::poseidon::poseidon_hash_span;
    use starknet::{
        ContractAddress, ClassHash, get_caller_address, get_block_timestamp, get_block_number,
    };
    use starknet::syscalls::{replace_class_syscall, get_block_hash_syscall};
    use starknet::SyscallResultTrait;
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use crate::interfaces::{
        ISBlakeMiner, IOwnable, ISBlakeTokenDispatcher, ISBlakeTokenDispatcherTrait,
        IBrotherIdRegistryDispatcher, IBrotherIdRegistryDispatcherTrait,
    };

    pub const DAY_SECONDS: u64 = 86400;
    pub const BASE_DAILY_LIMIT: u32 = 10;
    pub const VERIFIED_DAILY_LIMIT: u32 = 20;
    pub const OVERCLOCK_BONUS: u32 = 10;
    pub const MIN_DEV_FEE_BPS: u16 = 500; // 5%
    pub const MAX_DEV_FEE_BPS: u16 = 1000; // 10%
    pub const MAX_ERAS: u64 = 32;
    // Easiest allowed target (every felt252 passes). Difficulty can never go below this.
    pub const MAX_TARGET: u256 =
        0x0800000000000011000000000000000000000000000000000000000000000000_u256;

    #[storage]
    struct Storage {
        owner: ContractAddress,
        guardian: ContractAddress,
        paused: bool,
        token: ContractAddress,
        // emission
        genesis_ts: u64,
        halving_period: u64,
        era1_reward: u256,
        // epochs & difficulty
        epoch_seconds: u64,
        epoch: u64,
        epoch_seed: felt252,
        epoch_mints: u32,
        target_mints_per_epoch: u32,
        target: u256,
        used_work: Map<felt252, bool>,
        total_mints: u64,
        // per-user caps
        user_day: Map<ContractAddress, u64>,
        user_day_count: Map<ContractAddress, u32>,
        overclock_until: Map<ContractAddress, u64>,
        overclock_cost: u256,
        brother_registry: ContractAddress,
        allowlist_enabled: bool,
        allowlisted: Map<ContractAddress, bool>,
        // dev fee
        dev_fee_bps: u16,
        dev_vault: ContractAddress,
        pending_dev_fee: u256,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        Mined: Mined,
        EpochAdvanced: EpochAdvanced,
        OverclockPurchased: OverclockPurchased,
        DevFeeFlushed: DevFeeFlushed,
        Paused: Paused,
        ConfigUpdated: ConfigUpdated,
        OwnershipTransferred: OwnershipTransferred,
        Upgraded: Upgraded,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Mined {
        #[key]
        pub miner: ContractAddress,
        pub epoch: u64,
        pub nonce: felt252,
        pub work: felt252,
        pub reward: u256,
        pub dev_fee: u256,
        pub era: u8,
    }

    #[derive(Drop, starknet::Event)]
    pub struct EpochAdvanced {
        pub epoch: u64,
        pub seed: felt252,
        pub previous_mints: u32,
        pub new_target: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct OverclockPurchased {
        #[key]
        pub user: ContractAddress,
        pub burned: u256,
        pub until: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct DevFeeFlushed {
        pub vault: ContractAddress,
        pub amount: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Paused {
        pub paused: bool,
        pub by: ContractAddress,
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
        guardian: ContractAddress,
        token: ContractAddress,
        dev_vault: ContractAddress,
        dev_fee_bps: u16,
        era1_reward: u256,
        halving_period: u64,
        epoch_seconds: u64,
        target_mints_per_epoch: u32,
        initial_target: u256,
    ) {
        assert(!owner.is_zero(), 'Owner is zero');
        assert(!token.is_zero(), 'Token is zero');
        assert(!dev_vault.is_zero(), 'Dev vault is zero');
        assert(dev_fee_bps >= MIN_DEV_FEE_BPS && dev_fee_bps <= MAX_DEV_FEE_BPS, 'Dev fee out of range');
        assert(era1_reward > 0, 'Reward is zero');
        assert(halving_period > 0, 'Halving period is zero');
        assert(epoch_seconds > 0, 'Epoch seconds is zero');
        assert(target_mints_per_epoch > 0, 'Target mints is zero');
        assert(initial_target > 0 && initial_target <= MAX_TARGET, 'Bad initial target');

        let now = get_block_timestamp();
        self.owner.write(owner);
        self.guardian.write(guardian);
        self.token.write(token);
        self.dev_vault.write(dev_vault);
        self.dev_fee_bps.write(dev_fee_bps);
        self.era1_reward.write(era1_reward);
        self.halving_period.write(halving_period);
        self.epoch_seconds.write(epoch_seconds);
        self.target_mints_per_epoch.write(target_mints_per_epoch);
        self.target.write(initial_target);
        self.genesis_ts.write(now);
        self.epoch.write(0);
        let seed = poseidon_hash_span(
            array!['SBLAKE_V2_GENESIS', now.into(), get_block_number().into()].span(),
        );
        self.epoch_seed.write(seed);
        self.overclock_cost.write(50_000000000000000000_u256); // 50 SBLAKE
    }

    #[abi(embed_v0)]
    impl MinerImpl of ISBlakeMiner<ContractState> {
        fn get_challenge(
            self: @ContractState, user: ContractAddress,
        ) -> (u64, felt252, u256, u32, u32) {
            let challenge = poseidon_hash_span(array![self.epoch_seed.read(), user.into()].span());
            let today = get_block_timestamp() / DAY_SECONDS;
            let used = if self.user_day.entry(user).read() == today {
                self.user_day_count.entry(user).read()
            } else {
                0
            };
            (self.epoch.read(), challenge, self.target.read(), used, self._daily_limit(user))
        }

        fn compute_work(self: @ContractState, user: ContractAddress, nonce: felt252) -> felt252 {
            let challenge = poseidon_hash_span(array![self.epoch_seed.read(), user.into()].span());
            poseidon_hash_span(array![challenge, nonce].span())
        }

        fn mint(ref self: ContractState, nonce: felt252) {
            assert(!self.paused.read(), 'Mining paused');
            let caller = get_caller_address();
            if self.allowlist_enabled.read() {
                assert(self.allowlisted.entry(caller).read(), 'Not allowlisted');
            }

            // 1. Verify proof-of-work against the CURRENT stored seed/target (what the miner saw).
            let work = self.compute_work(caller, nonce);
            let work_u256: u256 = work.into();
            assert(work_u256 <= self.target.read(), 'Insufficient work');
            assert(!self.used_work.entry(work).read(), 'Work already used');
            self.used_work.entry(work).write(true);
            let mined_epoch = self.epoch.read();

            // 2. Roll the epoch forward if its time window elapsed (retarget + new seed).
            self._maybe_advance_epoch();

            // 3. Enforce per-epoch quota (2x target) to bound emission.
            let epoch_mints = self.epoch_mints.read();
            assert(epoch_mints < self.target_mints_per_epoch.read() * 2, 'Epoch quota full');
            self.epoch_mints.write(epoch_mints + 1);

            // 4. Enforce daily wallet cap (fixed UTC day bucket).
            let today = get_block_timestamp() / DAY_SECONDS;
            let used_today = if self.user_day.entry(caller).read() == today {
                self.user_day_count.entry(caller).read()
            } else {
                0
            };
            assert(used_today < self._daily_limit(caller), 'Daily mint cap reached');
            self.user_day.entry(caller).write(today);
            self.user_day_count.entry(caller).write(used_today + 1);

            // 5. Pay reward + accrue dev fee.
            let (era, reward) = self._current_reward();
            assert(reward > 0, 'Emission ended');
            let dev_fee = (reward * self.dev_fee_bps.read().into()) / 10000_u256;
            self.pending_dev_fee.write(self.pending_dev_fee.read() + dev_fee);
            self.total_mints.write(self.total_mints.read() + 1);
            ISBlakeTokenDispatcher { contract_address: self.token.read() }.mint(caller, reward);

            self.emit(Mined { miner: caller, epoch: mined_epoch, nonce, work, reward, dev_fee, era });
        }

        fn advance_epoch(ref self: ContractState) {
            let advanced = self._maybe_advance_epoch();
            assert(advanced, 'Epoch not elapsed');
        }

        fn buy_overclock(ref self: ContractState) {
            let caller = get_caller_address();
            let cost = self.overclock_cost.read();
            ISBlakeTokenDispatcher { contract_address: self.token.read() }.burn_from(caller, cost);
            let until = get_block_timestamp() + DAY_SECONDS;
            self.overclock_until.entry(caller).write(until);
            self.emit(OverclockPurchased { user: caller, burned: cost, until });
        }

        fn flush_dev_fee(ref self: ContractState) {
            let amount = self.pending_dev_fee.read();
            assert(amount > 0, 'Nothing to flush');
            self.pending_dev_fee.write(0);
            let vault = self.dev_vault.read();
            ISBlakeTokenDispatcher { contract_address: self.token.read() }.mint(vault, amount);
            self.emit(DevFeeFlushed { vault, amount });
        }

        fn get_emission_info(self: @ContractState) -> (u8, u256, u64, u32, u32, u64) {
            let (era, reward) = self._current_reward();
            let period = self.halving_period.read();
            let next_halving = self.genesis_ts.read() + (era.into() + 1) * period;
            (
                era,
                reward,
                self.epoch.read(),
                self.epoch_mints.read(),
                self.target_mints_per_epoch.read(),
                next_halving,
            )
        }

        fn get_dev_fee_info(self: @ContractState) -> (u16, u256, ContractAddress) {
            (self.dev_fee_bps.read(), self.pending_dev_fee.read(), self.dev_vault.read())
        }

        fn get_overclock_info(self: @ContractState, user: ContractAddress) -> (u256, u64) {
            (self.overclock_cost.read(), self.overclock_until.entry(user).read())
        }

        fn is_paused(self: @ContractState) -> bool {
            self.paused.read()
        }

        // ---------------- admin ----------------
        fn set_paused(ref self: ContractState, paused: bool) {
            let caller = get_caller_address();
            assert(
                caller == self.owner.read() || caller == self.guardian.read(), 'Not owner/guardian',
            );
            self.paused.write(paused);
            self.emit(Paused { paused, by: caller });
        }

        fn set_guardian(ref self: ContractState, guardian: ContractAddress) {
            self._only_owner();
            self.guardian.write(guardian);
            self.emit(ConfigUpdated { key: 'guardian', value: guardian.into() });
        }

        fn set_brother_registry(ref self: ContractState, registry: ContractAddress) {
            self._only_owner();
            self.brother_registry.write(registry);
            self.emit(ConfigUpdated { key: 'brother_registry', value: registry.into() });
        }

        fn set_allowlist_enabled(ref self: ContractState, enabled: bool) {
            self._only_owner();
            self.allowlist_enabled.write(enabled);
            self.emit(ConfigUpdated { key: 'allowlist_enabled', value: enabled.into() });
        }

        fn set_allowlisted(ref self: ContractState, account: ContractAddress, allowed: bool) {
            self._only_owner();
            self.allowlisted.entry(account).write(allowed);
        }

        fn set_dev_fee_bps(ref self: ContractState, bps: u16) {
            self._only_owner();
            assert(bps >= MIN_DEV_FEE_BPS && bps <= MAX_DEV_FEE_BPS, 'Dev fee out of range');
            self.dev_fee_bps.write(bps);
            self.emit(ConfigUpdated { key: 'dev_fee_bps', value: bps.into() });
        }

        fn set_overclock_cost(ref self: ContractState, cost: u256) {
            self._only_owner();
            self.overclock_cost.write(cost);
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

        fn _daily_limit(self: @ContractState, user: ContractAddress) -> u32 {
            let mut limit = BASE_DAILY_LIMIT;
            let registry = self.brother_registry.read();
            if !registry.is_zero() {
                let reg_disp = IBrotherIdRegistryDispatcher { contract_address: registry };
                if reg_disp.is_verified(user) {
                    limit = VERIFIED_DAILY_LIMIT;
                }
            }
            if self.overclock_until.entry(user).read() > get_block_timestamp() {
                limit += OVERCLOCK_BONUS;
            }
            limit
        }

        fn _current_reward(self: @ContractState) -> (u8, u256) {
            let elapsed = get_block_timestamp() - self.genesis_ts.read();
            let era: u64 = elapsed / self.halving_period.read();
            if era >= MAX_ERAS {
                return (MAX_ERAS.try_into().unwrap(), 0);
            }
            let mut reward = self.era1_reward.read();
            let mut i: u64 = 0;
            while i < era {
                reward = reward / 2;
                i += 1;
            };
            (era.try_into().unwrap(), reward)
        }

        /// Returns true if the epoch was advanced.
        fn _maybe_advance_epoch(ref self: ContractState) -> bool {
            let epoch_len = self.epoch_seconds.read();
            let time_epoch = (get_block_timestamp() - self.genesis_ts.read()) / epoch_len;
            let current = self.epoch.read();
            if time_epoch <= current {
                return false;
            }
            let elapsed_epochs: u64 = time_epoch - current;
            let prev_mints = self.epoch_mints.read();

            // Retarget: scale target by expected/actual (per elapsed epoch), clamped to [1/4x, 4x].
            let expected: u256 = self.target_mints_per_epoch.read().into();
            let actual_total: u256 = prev_mints.into();
            let elapsed_u256: u256 = elapsed_epochs.into();
            let old_target = self.target.read();
            let mut new_target = old_target;
            // actual per epoch scaled by 100 for precision
            let actual_x100 = (actual_total * 100) / elapsed_u256;
            let expected_x100 = expected * 100;
            if actual_x100 == 0 {
                new_target = old_target * 4;
            } else if actual_x100 > expected_x100 {
                // too many mints -> harder (smaller target), at most 4x harder
                let floor = old_target / 4;
                new_target = (old_target / actual_x100) * expected_x100;
                if new_target < floor {
                    new_target = floor;
                }
            } else if actual_x100 < expected_x100 {
                // too few mints -> easier (larger target), at most 4x easier
                let ceil = if old_target > MAX_TARGET / 4 {
                    MAX_TARGET
                } else {
                    old_target * 4
                };
                new_target = (old_target / actual_x100) * expected_x100;
                if new_target > ceil {
                    new_target = ceil;
                }
            }
            if new_target > MAX_TARGET {
                new_target = MAX_TARGET;
            }
            if new_target == 0 {
                new_target = 1;
            }
            self.target.write(new_target);

            // New unpredictable seed: mix previous seed with a recent block hash when available.
            let bn = get_block_number();
            let mut block_entropy: felt252 = 0;
            if bn >= 10 {
                match get_block_hash_syscall(bn - 10) {
                    Result::Ok(h) => { block_entropy = h; },
                    Result::Err(_) => {},
                }
            }
            let seed = poseidon_hash_span(
                array![
                    self.epoch_seed.read(),
                    block_entropy,
                    get_block_timestamp().into(),
                    self.total_mints.read().into(),
                ]
                    .span(),
            );
            self.epoch_seed.write(seed);
            self.epoch.write(time_epoch);
            self.epoch_mints.write(0);
            self.emit(EpochAdvanced { epoch: time_epoch, seed, previous_mints: prev_mints, new_target });
            true
        }
    }
}
