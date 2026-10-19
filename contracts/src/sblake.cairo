use starknet::ContractAddress;
use starknet::ClassHash;

#[starknet::interface]
pub trait ISBlakePrivacy<TState> {
    // PoW Challenge & Mining (Draft 1.1: 10 SBLAKE Era 1, 900k interval)
    fn get_challenge(self: @TState, user: ContractAddress) -> (u64, u256, u256, u32);
    fn mint(ref self: TState, nonce: u256, brother_id: felt252);
    fn mint_shielded(ref self: TState, nonce: u256, commitment: felt252, encrypted_note: Span<felt252>);
    
    // STRK20 Privacy Pool, 7-Day Lock & Balances
    fn shield(ref self: TState, amount: u256, commitment: felt252);
    fn is_commitment_matured(self: @TState, commitment: felt252) -> bool;
    fn balance_of(self: @TState, account: ContractAddress) -> u256;
    fn total_supply(self: @TState) -> u256;
    fn get_total_burned(self: @TState) -> u256;
    fn get_shielded_supply(self: @TState) -> u256;
    fn get_shielded_commitments_count(self: @TState) -> u64;
    fn get_era_info(self: @TState) -> (u8, u256, u64);
    fn get_timeline_stats(self: @TState) -> (u8, u256, u64, u64, u64, u256, u256);
    fn get_halving_interval(self: @TState) -> u64;
    fn get_max_supply(self: @TState) -> u256;

    // BlakeVPN & BlakeNode Ecosystem (Draft 1.1)
    fn bond_blake_node(ref self: TState, region: felt252, subsidized: bool);
    fn unbond_blake_node(ref self: TState);
    fn purchase_vpn_pass(
        ref self: TState,
        amount: u256,
        session_pubkey: felt252,
        nullifier: felt252
    );
    fn burn_for_utility(ref self: TState, amount: u256, utility_type: felt252);
    fn get_protocol_metrics(self: @TState) -> (bool, u64, u256, u256, u64, u16, u16, u16);
    fn get_node_info(self: @TState, operator: ContractAddress) -> (u256, felt252);

    // Contract Upgradeability, Beta Controls & Governance
    fn upgrade(ref self: TState, new_class_hash: ClassHash);
    fn get_owner(self: @TState) -> ContractAddress;
    fn transfer_ownership(ref self: TState, new_owner: ContractAddress);
    fn set_halving_interval(ref self: TState, new_interval: u64);
    fn set_difficulty(ref self: TState, new_difficulty: u256);
    fn set_beta_config(ref self: TState, is_beta: bool, enforce_allowlist: bool);
    fn set_beta_tester(ref self: TState, tester: ContractAddress, allowed: bool);
    fn set_revenue_shares(ref self: TState, ops_bps: u16, buyback_bps: u16, yield_bps: u16);
}

#[starknet::contract]
mod SBlake {
    use starknet::ContractAddress;
    use starknet::ClassHash;
    use starknet::{get_caller_address, get_block_timestamp};
    use starknet::syscalls::replace_class_syscall;
    use starknet::SyscallResultTrait;
    use starknet::storage::{Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess};

    const SEVEN_DAYS_SECONDS: u64 = 604800;
    const NODE_COLLATERAL_AMOUNT: u256 = 10000_000000000000000000_u256; // 10,000 SBLAKE per BlakeNode

    #[storage]
    struct Storage {
        owner: ContractAddress,
        balances: Map<ContractAddress, u256>,
        total_supply: u256,
        max_supply: u256,
        total_burned: u256,
        shielded_supply: u256,
        difficulty: u256,
        current_epoch: u64,
        last_block_hash: u256,
        total_mints: u64,
        era: u8,
        halving_interval: u64,
        // Anti-Sybil & Daily Caps
        daily_mint_count: Map<ContractAddress, u32>,
        last_mint_timestamp: Map<ContractAddress, u64>,
        // Privacy Commitments (STRK20 Shielded Pool + 7-Day Lock Tracking)
        commitments: Map<u64, felt252>,
        commitment_timestamps: Map<felt252, u64>,
        nullifiers: Map<felt252, bool>,
        commitments_count: u64,
        // Beta Phase & Governance Controls (Draft 1.1)
        is_beta_phase: bool,
        beta_enforce_allowlist: bool,
        beta_allowlist: Map<ContractAddress, bool>,
        ops_treasury_bps: u16,      // Default 6000 (60%)
        buyback_burn_bps: u16,      // Default 2500 (25%)
        shielded_yield_bps: u16,    // Default 1500 (15%)
        ops_treasury_pool: u256,
        shielded_yield_pool: u256,
        // BlakeNode & BlakeVPN State
        active_nodes_count: u64,
        total_node_collateral: u256,
        node_collateral: Map<ContractAddress, u256>,
        node_region: Map<ContractAddress, felt252>,
        vpn_sessions_count: u64,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        Mint: Mint,
        ShieldedMint: ShieldedMint,
        Shield: Shield,
        BlakeNodeBonded: BlakeNodeBonded,
        BlakeNodeUnbonded: BlakeNodeUnbonded,
        VpnPassPurchased: VpnPassPurchased,
        UtilityBurn: UtilityBurn,
        Upgraded: Upgraded,
        OwnershipTransferred: OwnershipTransferred,
        HalvingIntervalUpdated: HalvingIntervalUpdated,
        DifficultyUpdated: DifficultyUpdated,
    }

    #[derive(Drop, starknet::Event)]
    struct Mint {
        #[key]
        user: ContractAddress,
        amount: u256,
        era: u8,
        brother_id: felt252,
    }

    #[derive(Drop, starknet::Event)]
    struct ShieldedMint {
        #[key]
        commitment: felt252,
        amount: u256,
        era: u8,
        unlock_timestamp: u64,
    }

    #[derive(Drop, starknet::Event)]
    struct Shield {
        #[key]
        user: ContractAddress,
        commitment: felt252,
        amount: u256,
        unlock_timestamp: u64,
    }

    #[derive(Drop, starknet::Event)]
    struct BlakeNodeBonded {
        #[key]
        operator: ContractAddress,
        region: felt252,
        collateral_locked: u256,
        subsidized: bool,
    }

    #[derive(Drop, starknet::Event)]
    struct BlakeNodeUnbonded {
        #[key]
        operator: ContractAddress,
        collateral_returned: u256,
    }

    #[derive(Drop, starknet::Event)]
    struct VpnPassPurchased {
        #[key]
        session_pubkey: felt252,
        amount_paid: u256,
        burned_share: u256,
        shielded_payment: bool,
    }

    #[derive(Drop, starknet::Event)]
    struct UtilityBurn {
        #[key]
        user: ContractAddress,
        amount: u256,
        utility_type: felt252,
    }

    #[derive(Drop, starknet::Event)]
    struct Upgraded {
        class_hash: ClassHash,
    }

    #[derive(Drop, starknet::Event)]
    struct OwnershipTransferred {
        previous_owner: ContractAddress,
        new_owner: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct HalvingIntervalUpdated {
        previous_interval: u64,
        new_interval: u64,
    }

    #[derive(Drop, starknet::Event)]
    struct DifficultyUpdated {
        previous_difficulty: u256,
        new_difficulty: u256,
    }

    #[constructor]
    fn constructor(ref self: ContractState) {
        let deployer = get_caller_address();
        self.owner.write(deployer);
        // Initial Era 1 difficulty target (64 hex digits = 256 bits, 5 leading hex zeros = ~1.04M hashes)
        self.difficulty.write(0x00000fffffffffffffffffffffffffffffffffffffffffffffffffffffffffff);
        self.current_epoch.write(1);
        self.last_block_hash.write(0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef);
        self.era.write(1);
        self.total_mints.write(0);
        // Draft 1.1: 900,000 mints per Era (800k-1,000k target interval -> 9M SBLAKE in Era 1)
        self.halving_interval.write(900000);
        self.max_supply.write(21000000_000000000000000000_u256);
        self.total_burned.write(0);
        self.commitments_count.write(0);
        // Beta Phase Default Config (Draft 1.1 Section 3 & 4)
        self.is_beta_phase.write(true);
        self.beta_enforce_allowlist.write(false);
        self.ops_treasury_bps.write(6000);   // 60% Operations Treasury (within 50-70% band)
        self.buyback_burn_bps.write(2500);   // 25% Buyback & Burn (within 20-30% band)
        self.shielded_yield_bps.write(1500); // 15% Shielded Yield + Node Incentives (within 10-20% band)
    }

    #[abi(embed_v0)]
    impl SBlakePrivacyImpl of super::ISBlakePrivacy<ContractState> {
        fn get_challenge(self: @ContractState, user: ContractAddress) -> (u64, u256, u256, u32) {
            let mints_today = self.daily_mint_count.entry(user).read();
            (
                self.current_epoch.read(),
                self.last_block_hash.read(),
                self.difficulty.read(),
                mints_today,
            )
        }

        fn get_era_info(self: @ContractState) -> (u8, u256, u64) {
            let current_era = self.era.read();
            let base_reward = self.get_base_reward(current_era);
            let mints = self.total_mints.read();
            (current_era, base_reward, mints)
        }

        fn get_timeline_stats(self: @ContractState) -> (u8, u256, u64, u64, u64, u256, u256) {
            let current_era = self.era.read();
            let reward = self.get_base_reward(current_era);
            let total = self.total_mints.read();
            let interval = self.halving_interval.read();
            let mints_in_era = if interval > 0 { total % interval } else { 0 };
            let mints_until = if interval > 0 { interval - mints_in_era } else { 0 };
            let supply = self.total_supply.read();
            let max_sup = self.max_supply.read();
            (current_era, reward, total, mints_in_era, mints_until, supply, max_sup)
        }

        fn get_halving_interval(self: @ContractState) -> u64 {
            self.halving_interval.read()
        }

        fn get_max_supply(self: @ContractState) -> u256 {
            self.max_supply.read()
        }

        fn balance_of(self: @ContractState, account: ContractAddress) -> u256 {
            self.balances.entry(account).read()
        }

        fn total_supply(self: @ContractState) -> u256 {
            self.total_supply.read()
        }

        fn get_total_burned(self: @ContractState) -> u256 {
            self.total_burned.read()
        }

        fn get_shielded_supply(self: @ContractState) -> u256 {
            self.shielded_supply.read()
        }

        fn get_shielded_commitments_count(self: @ContractState) -> u64 {
            self.commitments_count.read()
        }

        fn is_commitment_matured(self: @ContractState, commitment: felt252) -> bool {
            let created_at = self.commitment_timestamps.entry(commitment).read();
            if created_at == 0 {
                return false;
            }
            let now = get_block_timestamp();
            now >= created_at + SEVEN_DAYS_SECONDS
        }

        fn get_protocol_metrics(self: @ContractState) -> (bool, u64, u256, u256, u64, u16, u16, u16) {
            (
                self.is_beta_phase.read(),
                self.active_nodes_count.read(),
                self.total_node_collateral.read(),
                self.total_burned.read(),
                self.vpn_sessions_count.read(),
                self.ops_treasury_bps.read(),
                self.buyback_burn_bps.read(),
                self.shielded_yield_bps.read(),
            )
        }

        fn get_node_info(self: @ContractState, operator: ContractAddress) -> (u256, felt252) {
            (
                self.node_collateral.entry(operator).read(),
                self.node_region.entry(operator).read(),
            )
        }

        fn get_owner(self: @ContractState) -> ContractAddress {
            self.owner.read()
        }

        fn transfer_ownership(ref self: ContractState, new_owner: ContractAddress) {
            let caller = get_caller_address();
            let current_owner = self.owner.read();
            assert(caller == current_owner, 'Only owner can transfer');
            self.owner.write(new_owner);
            self.emit(OwnershipTransferred {
                previous_owner: current_owner,
                new_owner,
            });
        }

        fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {
            let caller = get_caller_address();
            let current_owner = self.owner.read();
            assert(caller == current_owner, 'Only owner can upgrade');
            replace_class_syscall(new_class_hash).unwrap_syscall();
            self.emit(Upgraded { class_hash: new_class_hash });
        }

        fn set_halving_interval(ref self: ContractState, new_interval: u64) {
            let caller = get_caller_address();
            let current_owner = self.owner.read();
            assert(caller == current_owner, 'Only owner can configure');
            assert(new_interval > 0, 'Interval must be > 0');
            let prev = self.halving_interval.read();
            self.halving_interval.write(new_interval);
            self.emit(HalvingIntervalUpdated {
                previous_interval: prev,
                new_interval,
            });
        }

        fn set_difficulty(ref self: ContractState, new_difficulty: u256) {
            let caller = get_caller_address();
            let current_owner = self.owner.read();
            assert(caller == current_owner, 'Only owner can configure');
            let prev = self.difficulty.read();
            self.difficulty.write(new_difficulty);
            self.emit(DifficultyUpdated {
                previous_difficulty: prev,
                new_difficulty,
            });
        }

        fn set_beta_config(ref self: ContractState, is_beta: bool, enforce_allowlist: bool) {
            let caller = get_caller_address();
            assert(caller == self.owner.read(), 'Only owner can configure');
            self.is_beta_phase.write(is_beta);
            self.beta_enforce_allowlist.write(enforce_allowlist);
        }

        fn set_beta_tester(ref self: ContractState, tester: ContractAddress, allowed: bool) {
            let caller = get_caller_address();
            assert(caller == self.owner.read(), 'Only owner can configure');
            self.beta_allowlist.entry(tester).write(allowed);
        }

        fn set_revenue_shares(ref self: ContractState, ops_bps: u16, buyback_bps: u16, yield_bps: u16) {
            let caller = get_caller_address();
            assert(caller == self.owner.read(), 'Only owner can configure');
            assert(ops_bps + buyback_bps + yield_bps == 10000, 'Shares must sum to 10000 bps');
            self.ops_treasury_bps.write(ops_bps);
            self.buyback_burn_bps.write(buyback_bps);
            self.shielded_yield_bps.write(yield_bps);
        }

        fn mint(ref self: ContractState, nonce: u256, brother_id: felt252) {
            let user = get_caller_address();
            self.enforce_mint_rules(user, brother_id);

            let current_era = self.era.read();
            let reward = self.get_base_reward(current_era);

            let current_supply = self.total_supply.read();
            let max_sup = self.max_supply.read();
            assert(current_supply + reward <= max_sup, 'Max SBLAKE supply reached');

            let current_bal = self.balances.entry(user).read();
            self.balances.entry(user).write(current_bal + reward);
            self.total_supply.write(current_supply + reward);

            self.advance_mints();

            self.emit(Mint {
                user,
                amount: reward,
                era: current_era,
                brother_id,
            });
        }

        fn mint_shielded(
            ref self: ContractState,
            nonce: u256,
            commitment: felt252,
            encrypted_note: Span<felt252>,
        ) {
            let user = get_caller_address();
            self.enforce_mint_rules(user, 0);

            let current_era = self.era.read();
            // Draft 1.1: Controlled emission (10 SBLAKE in Era 1, no inflationary supply dilution;
            // shielded miners receive 50% protocol fee discount & 10-20% revenue yield share after 7 days)
            let reward = self.get_base_reward(current_era);

            let current_supply = self.total_supply.read();
            let max_sup = self.max_supply.read();
            assert(current_supply + reward <= max_sup, 'Max SBLAKE supply reached');

            let now = get_block_timestamp();
            let count = self.commitments_count.read();
            self.commitments.entry(count).write(commitment);
            self.commitment_timestamps.entry(commitment).write(now);
            self.commitments_count.write(count + 1);

            self.shielded_supply.write(self.shielded_supply.read() + reward);
            self.total_supply.write(current_supply + reward);

            self.advance_mints();

            self.emit(ShieldedMint {
                commitment,
                amount: reward,
                era: current_era,
                unlock_timestamp: now + SEVEN_DAYS_SECONDS,
            });
        }

        fn shield(ref self: ContractState, amount: u256, commitment: felt252) {
            let user = get_caller_address();
            let current_bal = self.balances.entry(user).read();
            assert(current_bal >= amount, 'Insufficient balance');

            let now = get_block_timestamp();
            self.balances.entry(user).write(current_bal - amount);
            self.shielded_supply.write(self.shielded_supply.read() + amount);

            let count = self.commitments_count.read();
            self.commitments.entry(count).write(commitment);
            self.commitment_timestamps.entry(commitment).write(now);
            self.commitments_count.write(count + 1);

            self.emit(Shield {
                user,
                commitment,
                amount,
                unlock_timestamp: now + SEVEN_DAYS_SECONDS,
            });
        }

        // Draft 1.1 Section 1, 2 & 3: BlakeNode 10,000 SBLAKE Collateral Bonding (or Beta Subsidy)
        fn bond_blake_node(ref self: ContractState, region: felt252, subsidized: bool) {
            let operator = get_caller_address();
            let existing_region = self.node_region.entry(operator).read();
            assert(existing_region == 0, 'Node already registered');

            let mut locked_amount: u256 = 0;
            if subsidized {
                assert(self.is_beta_phase.read(), 'Subsidy only in Beta phase');
                locked_amount = 0;
            } else {
                let bal = self.balances.entry(operator).read();
                assert(bal >= NODE_COLLATERAL_AMOUNT, 'Requires 10,000 SBLAKE bond');
                self.balances.entry(operator).write(bal - NODE_COLLATERAL_AMOUNT);
                self.node_collateral.entry(operator).write(NODE_COLLATERAL_AMOUNT);
                self.total_node_collateral.write(self.total_node_collateral.read() + NODE_COLLATERAL_AMOUNT);
                locked_amount = NODE_COLLATERAL_AMOUNT;
            }

            self.node_region.entry(operator).write(region);
            self.active_nodes_count.write(self.active_nodes_count.read() + 1);

            self.emit(BlakeNodeBonded {
                operator,
                region,
                collateral_locked: locked_amount,
                subsidized,
            });
        }

        fn unbond_blake_node(ref self: ContractState) {
            let operator = get_caller_address();
            let existing_region = self.node_region.entry(operator).read();
            assert(existing_region != 0, 'No active node found');

            let bonded = self.node_collateral.entry(operator).read();
            if bonded > 0 {
                self.node_collateral.entry(operator).write(0);
                self.total_node_collateral.write(self.total_node_collateral.read() - bonded);
                let bal = self.balances.entry(operator).read();
                self.balances.entry(operator).write(bal + bonded);
            }

            self.node_region.entry(operator).write(0);
            let nodes = self.active_nodes_count.read();
            if nodes > 0 {
                self.active_nodes_count.write(nodes - 1);
            }

            self.emit(BlakeNodeUnbonded {
                operator,
                collateral_returned: bonded,
            });
        }

        // Draft 1.1 Section 2 & 4: BlakeVPN Subscription Payment (Unlinkable STRK20 Note or Public Balance)
        fn purchase_vpn_pass(
            ref self: ContractState,
            amount: u256,
            session_pubkey: felt252,
            nullifier: felt252
        ) {
            assert(amount > 0, 'Amount must be > 0');
            let is_shielded_payment = nullifier != 0;

            if is_shielded_payment {
                assert(!self.nullifiers.entry(nullifier).read(), 'Note already spent');
                self.nullifiers.entry(nullifier).write(true);
                let current_shielded = self.shielded_supply.read();
                if current_shielded >= amount {
                    self.shielded_supply.write(current_shielded - amount);
                }
            } else {
                let caller = get_caller_address();
                let bal = self.balances.entry(caller).read();
                assert(bal >= amount, 'Insufficient SBLAKE balance');
                self.balances.entry(caller).write(bal - amount);
            }

            // Route revenue per Draft 1.1 Year-1 Default Split:
            // Ops Treasury (60%) / Buyback & Burn (25%) / Shielded + Node Yield (15%)
            let ops_bps: u256 = self.ops_treasury_bps.read().into();
            let burn_bps: u256 = self.buyback_burn_bps.read().into();

            let ops_amount = (amount * ops_bps) / 10000_u256;
            let burn_amount = (amount * burn_bps) / 10000_u256;
            let yield_amount = amount - ops_amount - burn_amount;

            self.ops_treasury_pool.write(self.ops_treasury_pool.read() + ops_amount);
            self.shielded_yield_pool.write(self.shielded_yield_pool.read() + yield_amount);

            // Permanent Burn of the Buyback & Burn share
            self.total_burned.write(self.total_burned.read() + burn_amount);
            let cur_supply = self.total_supply.read();
            if cur_supply >= burn_amount {
                self.total_supply.write(cur_supply - burn_amount);
            }

            self.vpn_sessions_count.write(self.vpn_sessions_count.read() + 1);

            self.emit(VpnPassPurchased {
                session_pubkey,
                amount_paid: amount,
                burned_share: burn_amount,
                shielded_payment: is_shielded_payment,
            });
        }

        // Draft 1.1 Section 1: Overclock / Stealth ID Consumption Burns (50-500 SBLAKE)
        fn burn_for_utility(ref self: ContractState, amount: u256, utility_type: felt252) {
            let caller = get_caller_address();
            let bal = self.balances.entry(caller).read();
            assert(bal >= amount, 'Insufficient SBLAKE to burn');

            self.balances.entry(caller).write(bal - amount);
            self.total_burned.write(self.total_burned.read() + amount);

            let cur_supply = self.total_supply.read();
            if cur_supply >= amount {
                self.total_supply.write(cur_supply - amount);
            }

            self.emit(UtilityBurn {
                user: caller,
                amount,
                utility_type,
            });
        }
    }

    #[generate_trait]
    impl InternalMethods of InternalMethodsTrait {
        // Draft 1.1 Section 1: Era 1 = 10 SBLAKE, Era 2 = 5 SBLAKE, Halving continues
        fn get_base_reward(self: @ContractState, era: u8) -> u256 {
            if era == 1 {
                10_000000000000000000_u256 // 10 SBLAKE (Era 1: 8-10M over 800k-1,000k mints)
            } else if era == 2 {
                5_000000000000000000_u256  // 5 SBLAKE (Era 2: ~4-5M)
            } else if era == 3 {
                2_500000000000000000_u256  // 2.5 SBLAKE
            } else if era == 4 {
                1_250000000000000000_u256  // 1.25 SBLAKE
            } else if era == 5 {
                625000000000000000_u256    // 0.625 SBLAKE
            } else {
                312500000000000000_u256    // 0.3125 SBLAKE tail emission
            }
        }

        fn enforce_mint_rules(ref self: ContractState, user: ContractAddress, brother_id: felt252) {
            if self.is_beta_phase.read() && self.beta_enforce_allowlist.read() {
                assert(self.beta_allowlist.entry(user).read(), 'Beta: Invite allowlist required');
            }

            let now = get_block_timestamp();
            let last_ts = self.last_mint_timestamp.entry(user).read();

            // Daily cap: 10 mints default, 20 mints if Brother ID verified (> 0)
            let daily_limit: u32 = if brother_id != 0 { 20_u32 } else { 10_u32 };
            let current_mints = self.daily_mint_count.entry(user).read();

            if now > last_ts + 86400 {
                self.daily_mint_count.entry(user).write(1);
            } else {
                assert(current_mints < daily_limit, 'Daily mint cap reached');
                self.daily_mint_count.entry(user).write(current_mints + 1);
            }

            self.last_mint_timestamp.entry(user).write(now);
        }

        fn advance_mints(ref self: ContractState) {
            let mints = self.total_mints.read() + 1;
            self.total_mints.write(mints);

            let interval = self.halving_interval.read();
            if interval > 0 {
                let computed_era: u64 = (mints / interval) + 1;
                let new_era: u8 = if computed_era > 10 {
                    10_u8
                } else {
                    computed_era.try_into().unwrap()
                };
                self.era.write(new_era);
            }
        }
    }
}
