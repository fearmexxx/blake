#[starknet::interface]
pub trait ISBlake<TState> {
    fn get_challenge(self: @TState, user: starknet::ContractAddress) -> (u64, u256, u256);
    fn mint(ref self: TState, nonce: u256);
    fn balance_of(self: @TState, account: starknet::ContractAddress) -> u256;
}

#[starknet::contract]
mod SBlake {
    use starknet::ContractAddress;
    use starknet::get_caller_address;
    use starknet::storage::{Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess};

    #[storage]
    struct Storage {
        balances: Map<ContractAddress, u256>,
        total_supply: u256,
        difficulty: u256,
        current_epoch: u64,
        last_block_hash: u256,
    }

    #[constructor]
    fn constructor(ref self: ContractState) {
        self.difficulty.write(0x00000fffffffffffffffffffffffffffffffffffffffffffffffffffffff);
        self.current_epoch.write(1);
        self.last_block_hash.write(0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef);
    }

    #[abi(embed_v0)]
    impl SBlakeImpl of super::ISBlake<ContractState> {
        fn balance_of(self: @ContractState, account: ContractAddress) -> u256 {
            self.balances.entry(account).read()
        }

        fn get_challenge(self: @ContractState, user: ContractAddress) -> (u64, u256, u256) {
            (self.current_epoch.read(), self.last_block_hash.read(), self.difficulty.read())
        }

        fn mint(ref self: ContractState, nonce: u256) {
            let user = get_caller_address();
            let amount = 100_000000000000000000_u256;
            
            let current_bal = self.balances.entry(user).read();
            self.balances.entry(user).write(current_bal + amount);
            
            let total = self.total_supply.read();
            self.total_supply.write(total + amount);
        }
    }
}
