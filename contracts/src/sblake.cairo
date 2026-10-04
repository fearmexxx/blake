use starknet::ContractAddress;
use starknet::ClassHash;

#[starknet::interface]
pub trait ISBlakePrivacy<TState> {
    // PoW Challenge & Mining
    fn get_challenge(self: @TState, user: ContractAddress) -> (u64, u256, u256, u32);
    fn mint(ref self: TState, nonce: u256, brother_id: felt252);
    fn mint_shielded(ref self: TState, nonce: u256, commitment: felt252, encrypted_note: Span<felt252>);
    
    // STRK20 Privacy Pool & Balances
    fn shield(ref self: TState, amount: u256, commitment: felt252);
    fn balance_of(self: @TState, account: ContractAddress) -> u256;
    fn total_supply(self: @TState) -> u256;
    fn get_shielded_supply(self: @TState) -> u256;
    fn get_shielded_commitments_count(self: @TState) -> u64;
    fn get_era_info(self: @TState) -> (u8, u256, u64);
    fn get_timeline_stats(self: @TState) -> (u8, u256, u64, u64, u64, u256, u256);
    fn get_halving_interval(self: @TState) -> u64;
    fn get_max_supply(self: @TState) -> u256;

    // Contract Upgradeability & Parameter Governance
    fn upgrade(ref self: TState, new_class_hash: ClassHash);
    fn get_owner(self: @TState) -> ContractAddress;
    fn transfer_ownership(ref self: TState, new_owner: ContractAddress);
    fn set_halving_interval(ref self: TState, new_interval: u64);
    fn set_difficulty(ref self: TState, new_difficulty: u256);
}

#[starknet::contract]
mod SBlake {
    use starknet::ContractAddress;
    use starknet::ClassHash;
    use starknet::{get_caller_address, get_block_timestamp};
    use starknet::syscalls::replace_class_syscall;
    use starknet::SyscallResultTrait;
    use starknet::storage::{Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess};

    #[storage]
    struct Storage {
        owner: ContractAddress,
        balances: Map<ContractAddress, u256>,
        total_supply: u256,
        max_supply: u256,
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
        // Privacy Commitments (STRK20 Shielded Pool)
        commitments: Map<u64, felt252>,
        commitments_count: u64,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        Mint: Mint,
        ShieldedMint: ShieldedMint,
        Shield: Shield,
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
    }

    #[derive(Drop, starknet::Event)]
    struct Shield {
        #[key]
        user: ContractAddress,
        commitment: felt252,
        amount: u256,
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
        // Initial Era 1 difficulty target
        self.difficulty.write(0x00000fffffffffffffffffffffffffffffffffffffffffffffffffffffff);
        self.current_epoch.write(1);
        self.last_block_hash.write(0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef);
        self.era.write(1);
        self.total_mints.write(0);
        self.halving_interval.write(100000);
        self.max_supply.write(21000000_000000000000000000_u256);
        self.commitments_count.write(0);
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

        fn get_shielded_supply(self: @ContractState) -> u256 {
            self.shielded_supply.read()
        }

        fn get_shielded_commitments_count(self: @ContractState) -> u64 {
            self.commitments_count.read()
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
            let base_reward = self.get_base_reward(current_era);
            
            // Shielded Mining Yield Multiplier: +15% emission bonus
            let shielded_reward = (base_reward * 115_u256) / 100_u256;

            let current_supply = self.total_supply.read();
            let max_sup = self.max_supply.read();
            assert(current_supply + shielded_reward <= max_sup, 'Max SBLAKE supply reached');

            let count = self.commitments_count.read();
            self.commitments.entry(count).write(commitment);
            self.commitments_count.write(count + 1);

            self.shielded_supply.write(self.shielded_supply.read() + shielded_reward);
            self.total_supply.write(current_supply + shielded_reward);

            self.advance_mints();

            self.emit(ShieldedMint {
                commitment,
                amount: shielded_reward,
                era: current_era,
            });
        }

        fn shield(ref self: ContractState, amount: u256, commitment: felt252) {
            let user = get_caller_address();
            let current_bal = self.balances.entry(user).read();
            assert(current_bal >= amount, 'Insufficient balance');

            self.balances.entry(user).write(current_bal - amount);
            self.shielded_supply.write(self.shielded_supply.read() + amount);

            let count = self.commitments_count.read();
            self.commitments.entry(count).write(commitment);
            self.commitments_count.write(count + 1);

            self.emit(Shield {
                user,
                commitment,
                amount,
            });
        }
    }

    #[generate_trait]
    impl InternalMethods of InternalMethodsTrait {
        fn get_base_reward(self: @ContractState, era: u8) -> u256 {
            if era == 1 {
                100_000000000000000000_u256 // 100 SBLAKE
            } else if era == 2 {
                50_000000000000000000_u256  // 50 SBLAKE
            } else if era == 3 {
                25_000000000000000000_u256  // 25 SBLAKE
            } else if era == 4 {
                12_500000000000000000_u256  // 12.5 SBLAKE
            } else if era == 5 {
                6_250000000000000000_u256   // 6.25 SBLAKE
            } else if era == 6 {
                3_125000000000000000_u256   // 3.125 SBLAKE
            } else {
                1_000000000000000000_u256   // 1 SBLAKE minimum tail emission
            }
        }

        fn enforce_mint_rules(ref self: ContractState, user: ContractAddress, brother_id: felt252) {
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
