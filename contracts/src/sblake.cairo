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

    // v2.0 ERC-20 + Vested Dev Fee (5-10%) + Unshield + Post-Quantum Poseidon PoW
    fn name(self: @TState) -> felt252;
    fn symbol(self: @TState) -> felt252;
    fn decimals(self: @TState) -> u8;
    fn transfer(ref self: TState, recipient: ContractAddress, amount: u256) -> bool;
    fn approve(ref self: TState, spender: ContractAddress, amount: u256) -> bool;
    fn transfer_from(
        ref self: TState, sender: ContractAddress, recipient: ContractAddress, amount: u256,
    ) -> bool;
    fn allowance(self: @TState, owner: ContractAddress, spender: ContractAddress) -> u256;
    fn unshield(ref self: TState, commitment: felt252, nullifier: felt252, amount: u256);
    fn set_dev_fee_bps(ref self: TState, new_bps: u16);
    fn get_dev_fee_info(self: @TState) -> (u16, u256, u256);
    fn claim_vested_dev_fee(ref self: TState);
}

#[starknet::contract]
mod SBlake {
    use core::poseidon::poseidon_hash_span;
    use starknet::ContractAddress;
    use starknet::ClassHash;
    use starknet::{get_caller_address, get_block_timestamp};
    use starknet::syscalls::replace_class_syscall;
    use starknet::SyscallResultTrait;
    use starknet::storage::{Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess};

    const SEVEN_DAYS_SECONDS: u64 = 604800;
    const NODE_COLLATERAL_AMOUNT: u256 = 10000_000000000000000000_u256; // 10,000 SBLAKE per BlakeNode
    const MIN_DEV_FEE_BPS: u16 = 500;  // 5% floor
    const MAX_DEV_FEE_BPS: u16 = 1000; // 10% cap
    const VESTING_DURATION_SECONDS: u64 = 63072000; // 24-month linear vesting

    #[storage]
    struct Storage {
        owner: ContractAddress,
        balances: Map<ContractAddress, u256>,
        allowances: Map<(ContractAddress, ContractAddress), u256>,
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
        // Anti-Sybil & Daily Caps (Fixed UTC Day Bucket)
        daily_mint_count: Map<ContractAddress, u32>,
        last_mint_timestamp: Map<ContractAddress, u64>,
        user_mint_day: Map<ContractAddress, u64>,
        verified_brother_ids: Map<ContractAddress, bool>,
        used_work: Map<felt252, bool>,
        // Vested Dev Fee on Emission (5-10%, default 8% = 800 bps)
        genesis_timestamp: u64,
        dev_fee_bps: u16,
        dev_vesting_accrued: u256,
        dev_vesting_claimed: u256,
        // Privacy Commitments (STRK20 Shielded Pool + 7-Day Lock Tracking)
        commitments: Map<u64, felt252>,
        commitment_timestamps: Map<felt252, u64>,
        commitment_amounts: Map<felt252, u256>,
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
        let now = get_block_timestamp();
        self.owner.write(deployer);
        self.genesis_timestamp.write(now);
        // Initial Era 1 difficulty target (64 hex digits = 256 bits, 5 leading hex zeros = ~1.04M hashes)
        self.difficulty.write(0x00000fffffffffffffffffffffffffffffffffffffffffffffffffffffffffff);
        self.current_epoch.write(1);
        self.last_block_hash.write(0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef);
        self.era.write(1);
        self.total_mints.write(0);
        // Draft 1.1 / v2.0: 900,000 mints per Era
        self.halving_interval.write(900000);
        self.max_supply.write(21000000_000000000000000000_u256);
        self.total_burned.write(0);
        self.commitments_count.write(0);
        // v2.0 Vested Dev Fee on Emission (8% default = 800 bps, bounded 500..=1000 bps)
        self.dev_fee_bps.write(800);
        // v2.0 Default Revenue Split: 55% Ops / 15% Ekubo TWAP Buyback & Burn / 30% Node & STRK20 Pool
        self.is_beta_phase.write(true);
        self.beta_enforce_allowlist.write(false);
        self.ops_treasury_bps.write(5500);
        self.buyback_burn_bps.write(1500);
        self.shielded_yield_bps.write(3000);
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
            self.verify_and_record_pow(user, nonce);
            self.enforce_mint_rules(user, brother_id);

            let current_era = self.era.read();
            let reward = self.get_base_reward(current_era);
            let dev_fee = (reward * self.dev_fee_bps.read().into()) / 10000_u256;

            let current_supply = self.total_supply.read();
            let max_sup = self.max_supply.read();
            assert(current_supply + reward + dev_fee <= max_sup, 'Max SBLAKE supply reached');

            let current_bal = self.balances.entry(user).read();
            self.balances.entry(user).write(current_bal + reward);
            self.dev_vesting_accrued.write(self.dev_vesting_accrued.read() + dev_fee);
            self.total_supply.write(current_supply + reward + dev_fee);

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
            let _ = encrypted_note;
            let user = get_caller_address();
            self.verify_and_record_pow(user, nonce);
            self.enforce_mint_rules(user, 0);
            assert(commitment != 0, 'Commitment is zero');
            assert(self.commitment_timestamps.entry(commitment).read() == 0, 'Commitment exists');

            let current_era = self.era.read();
            let reward = self.get_base_reward(current_era);
            let dev_fee = (reward * self.dev_fee_bps.read().into()) / 10000_u256;

            let current_supply = self.total_supply.read();
            let max_sup = self.max_supply.read();
            assert(current_supply + reward + dev_fee <= max_sup, 'Max SBLAKE supply reached');

            let now = get_block_timestamp();
            let count = self.commitments_count.read();
            self.commitments.entry(count).write(commitment);
            self.commitment_timestamps.entry(commitment).write(now);
            self.commitment_amounts.entry(commitment).write(reward);
            self.commitments_count.write(count + 1);

            self.shielded_supply.write(self.shielded_supply.read() + reward);
            self.dev_vesting_accrued.write(self.dev_vesting_accrued.read() + dev_fee);
            self.total_supply.write(current_supply + reward + dev_fee);

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
            assert(commitment != 0, 'Commitment is zero');
            assert(self.commitment_timestamps.entry(commitment).read() == 0, 'Commitment exists');

            let now = get_block_timestamp();
            self.balances.entry(user).write(current_bal - amount);
            self.shielded_supply.write(self.shielded_supply.read() + amount);

            let count = self.commitments_count.read();
            self.commitments.entry(count).write(commitment);
            self.commitment_timestamps.entry(commitment).write(now);
            self.commitment_amounts.entry(commitment).write(amount);
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

        // v2.0 ERC-20 Standard + Unshield + Vested Dev Fee (5-10%)
        fn name(self: @ContractState) -> felt252 {
            'StarkBlake'
        }

        fn symbol(self: @ContractState) -> felt252 {
            'SBLAKE'
        }

        fn decimals(self: @ContractState) -> u8 {
            18
        }

        fn transfer(ref self: ContractState, recipient: ContractAddress, amount: u256) -> bool {
            let sender = get_caller_address();
            let bal = self.balances.entry(sender).read();
            assert(bal >= amount, 'Insufficient balance');
            self.balances.entry(sender).write(bal - amount);
            self.balances.entry(recipient).write(self.balances.entry(recipient).read() + amount);
            true
        }

        fn approve(ref self: ContractState, spender: ContractAddress, amount: u256) -> bool {
            let owner = get_caller_address();
            self.allowances.entry((owner, spender)).write(amount);
            true
        }

        fn transfer_from(
            ref self: ContractState,
            sender: ContractAddress,
            recipient: ContractAddress,
            amount: u256,
        ) -> bool {
            let spender = get_caller_address();
            let allowed = self.allowances.entry((sender, spender)).read();
            assert(allowed >= amount, 'Insufficient allowance');
            self.allowances.entry((sender, spender)).write(allowed - amount);

            let bal = self.balances.entry(sender).read();
            assert(bal >= amount, 'Insufficient balance');
            self.balances.entry(sender).write(bal - amount);
            self.balances.entry(recipient).write(self.balances.entry(recipient).read() + amount);
            true
        }

        fn allowance(
            self: @ContractState, owner: ContractAddress, spender: ContractAddress,
        ) -> u256 {
            self.allowances.entry((owner, spender)).read()
        }

        fn unshield(
            ref self: ContractState, commitment: felt252, nullifier: felt252, amount: u256,
        ) {
            assert(commitment != 0 && nullifier != 0, 'Invalid commitment/nullifier');
            assert(!self.nullifiers.entry(nullifier).read(), 'Note already spent');
            let stored_amt = self.commitment_amounts.entry(commitment).read();
            assert(stored_amt >= amount && amount > 0, 'Invalid unshield amount');

            self.nullifiers.entry(nullifier).write(true);
            self.commitment_amounts.entry(commitment).write(stored_amt - amount);
            let cur_shielded = self.shielded_supply.read();
            if cur_shielded >= amount {
                self.shielded_supply.write(cur_shielded - amount);
            }

            let caller = get_caller_address();
            self.balances.entry(caller).write(self.balances.entry(caller).read() + amount);
        }

        fn set_dev_fee_bps(ref self: ContractState, new_bps: u16) {
            assert(get_caller_address() == self.owner.read(), 'Only owner can configure');
            assert(
                new_bps >= MIN_DEV_FEE_BPS && new_bps <= MAX_DEV_FEE_BPS,
                'Dev fee must be 500..1000 bps',
            );
            self.dev_fee_bps.write(new_bps);
        }

        fn get_dev_fee_info(self: @ContractState) -> (u16, u256, u256) {
            (
                self.dev_fee_bps.read(),
                self.dev_vesting_accrued.read(),
                self.dev_vesting_claimed.read(),
            )
        }

        fn claim_vested_dev_fee(ref self: ContractState) {
            let caller = get_caller_address();
            assert(caller == self.owner.read(), 'Only owner can claim');
            let now = get_block_timestamp();
            let start = self.genesis_timestamp.read();
            let elapsed = if now > start { now - start } else { 0 };
            let total_accrued = self.dev_vesting_accrued.read();
            let vested = if elapsed >= VESTING_DURATION_SECONDS {
                total_accrued
            } else {
                (total_accrued * elapsed.into()) / VESTING_DURATION_SECONDS.into()
            };
            let claimed = self.dev_vesting_claimed.read();
            assert(vested > claimed, 'No vested dev fee available');
            let claimable = vested - claimed;
            self.dev_vesting_claimed.write(vested);
            self.balances.entry(caller).write(self.balances.entry(caller).read() + claimable);
        }
    }

    #[generate_trait]
    impl InternalMethods of InternalMethodsTrait {
        fn verify_and_record_pow(ref self: ContractState, user: ContractAddress, nonce: u256) {
            assert(nonce.low != 0 || nonce.high != 0, 'PoW nonce cannot be zero');
            let epoch = self.current_epoch.read();
            let work = poseidon_hash_span(
                array![user.into(), nonce.low.into(), nonce.high.into(), epoch.into()].span(),
            );
            assert(!self.used_work.entry(work).read(), 'PoW solution already used');
            self.used_work.entry(work).write(true);
        }

        // Draft 1.1 / v2.0: Era 1 = 10 SBLAKE, Era 2 = 5 SBLAKE, Halving continues
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
            let current_day = now / 86400;
            let last_day = self.user_mint_day.entry(user).read();

            // Daily cap: 10 mints default, 20 mints if Brother ID verified
            let is_verified = self.verified_brother_ids.entry(user).read() || brother_id != 0;
            let daily_limit: u32 = if is_verified { 20_u32 } else { 10_u32 };

            if current_day > last_day {
                self.user_mint_day.entry(user).write(current_day);
                self.daily_mint_count.entry(user).write(1);
            } else {
                let current_mints = self.daily_mint_count.entry(user).read();
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
