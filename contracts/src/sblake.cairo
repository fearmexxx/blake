use starknet::ContractAddress;

#[starknet::interface]
pub trait ISBlakePrivacy<TState> {
    fn get_challenge(self: @TState, user: ContractAddress) -> (u64, u256, u256, u32);
    fn mint(ref self: TState, nonce: u256, brother_id: felt252);
    fn mint_shielded(ref self: TState, nonce: u256, commitment: felt252, encrypted_note: Span<felt252>);
    fn shield(ref self: TState, amount: u256, commitment: felt252);
    fn balance_of(self: @TState, account: ContractAddress) -> u256;
    fn total_supply(self: @TState) -> u256;
    fn get_shielded_supply(self: @TState) -> u256;
    fn get_shielded_commitments_count(self: @TState) -> u64;
    fn get_era_info(self: @TState) -> (u8, u256, u64);
}

#[starknet::contract]
mod SBlake {
    use starknet::ContractAddress;
    use starknet::{get_caller_address, get_block_timestamp};
    use starknet::storage::{Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess};

    #[storage]
    struct Storage {
        balances: Map<ContractAddress, u256>,
        total_supply: u256,
        shielded_supply: u256,
        difficulty: u256,
        current_epoch: u64,
        last_block_hash: u256,
        total_mints: u64,
        era: u8,
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

    #[constructor]
    fn constructor(ref self: ContractState) {
        // Initial Era 1 difficulty target
        self.difficulty.write(0x00000fffffffffffffffffffffffffffffffffffffffffffffffffffffff);
        self.current_epoch.write(1);
        self.last_block_hash.write(0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef);
        self.era.write(1);
        self.total_mints.write(0);
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

        fn mint(ref self: ContractState, nonce: u256, brother_id: felt252) {
            let user = get_caller_address();
            self.enforce_mint_rules(user, brother_id);

            let current_era = self.era.read();
            let reward = self.get_base_reward(current_era);

            // Update balance and supply
            let current_bal = self.balances.entry(user).read();
            self.balances.entry(user).write(current_bal + reward);
            self.total_supply.write(self.total_supply.read() + reward);

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
            // In shielded minting, brother_id can be 0 or derived
            self.enforce_mint_rules(user, 0);

            let current_era = self.era.read();
            let base_reward = self.get_base_reward(current_era);
            
            // Shielded Mining Yield Multiplier: +15% emission bonus
            // 115 / 100 * base_reward
            let shielded_reward = (base_reward * 115_u256) / 100_u256;

            // Store note commitment into STRK20 Privacy Pool
            let count = self.commitments_count.read();
            self.commitments.entry(count).write(commitment);
            self.commitments_count.write(count + 1);

            // Update shielded supply and total supply
            self.shielded_supply.write(self.shielded_supply.read() + shielded_reward);
            self.total_supply.write(self.total_supply.read() + shielded_reward);

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

            // Deduct public balance, credit shielded pool
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
            } else {
                12_500000000000000000_u256  // 12.5 SBLAKE
            }
        }

        fn enforce_mint_rules(ref self: ContractState, user: ContractAddress, brother_id: felt252) {
            let now = get_block_timestamp();
            let last_ts = self.last_mint_timestamp.entry(user).read();

            // Daily cap: 10 mints default, 20 mints if Brother ID verified (> 0)
            let daily_limit: u32 = if brother_id != 0 { 20_u32 } else { 10_u32 };

            let current_mints = self.daily_mint_count.entry(user).read();

            // Reset cap if > 24 hours (86400 seconds) elapsed
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

            // Halving every 100,000 mints
            let era = self.era.read();
            if mints >= 100000 && era == 1 {
                self.era.write(2);
            } else if mints >= 200000 && era == 2 {
                self.era.write(3);
            } else if mints >= 300000 && era == 3 {
                self.era.write(4);
            }
        }
    }
}
