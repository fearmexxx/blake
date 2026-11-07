// MockStable — 6-decimal test stablecoin ("tUSDC") with an open faucet.
// TESTNET / TESTS ONLY. On mainnet VpnPayments must point at real USDC.

#[starknet::contract]
pub mod MockStable {
    use core::num::traits::Zero;
    use starknet::{ContractAddress, get_caller_address};
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use crate::interfaces::IERC20;

    pub const FAUCET_AMOUNT: u256 = 100_000000; // 100 tUSDC

    #[storage]
    struct Storage {
        balances: Map<ContractAddress, u256>,
        allowances: Map<(ContractAddress, ContractAddress), u256>,
        total_supply: u256,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        Transfer: Transfer,
        Approval: Approval,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Transfer {
        #[key]
        pub from: ContractAddress,
        #[key]
        pub to: ContractAddress,
        pub value: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Approval {
        #[key]
        pub owner: ContractAddress,
        #[key]
        pub spender: ContractAddress,
        pub value: u256,
    }

    #[abi(embed_v0)]
    impl ERC20Impl of IERC20<ContractState> {
        fn name(self: @ContractState) -> felt252 {
            'Test USD Coin'
        }
        fn symbol(self: @ContractState) -> felt252 {
            'tUSDC'
        }
        fn decimals(self: @ContractState) -> u8 {
            6
        }
        fn total_supply(self: @ContractState) -> u256 {
            self.total_supply.read()
        }
        fn balance_of(self: @ContractState, account: ContractAddress) -> u256 {
            self.balances.entry(account).read()
        }
        fn allowance(
            self: @ContractState, owner: ContractAddress, spender: ContractAddress,
        ) -> u256 {
            self.allowances.entry((owner, spender)).read()
        }
        fn transfer(ref self: ContractState, recipient: ContractAddress, amount: u256) -> bool {
            let sender = get_caller_address();
            self._transfer(sender, recipient, amount);
            true
        }
        fn transfer_from(
            ref self: ContractState,
            sender: ContractAddress,
            recipient: ContractAddress,
            amount: u256,
        ) -> bool {
            let spender = get_caller_address();
            let current = self.allowances.entry((sender, spender)).read();
            assert(current >= amount, 'Insufficient allowance');
            self.allowances.entry((sender, spender)).write(current - amount);
            self._transfer(sender, recipient, amount);
            true
        }
        fn approve(ref self: ContractState, spender: ContractAddress, amount: u256) -> bool {
            let owner = get_caller_address();
            self.allowances.entry((owner, spender)).write(amount);
            self.emit(Approval { owner, spender, value: amount });
            true
        }
    }

    #[external(v0)]
    fn faucet(ref self: ContractState) {
        let to = get_caller_address();
        self.balances.entry(to).write(self.balances.entry(to).read() + FAUCET_AMOUNT);
        self.total_supply.write(self.total_supply.read() + FAUCET_AMOUNT);
        self.emit(Transfer { from: Zero::zero(), to, value: FAUCET_AMOUNT });
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn _transfer(
            ref self: ContractState,
            sender: ContractAddress,
            recipient: ContractAddress,
            amount: u256,
        ) {
            assert(!recipient.is_zero(), 'Transfer to zero');
            let bal = self.balances.entry(sender).read();
            assert(bal >= amount, 'Insufficient balance');
            self.balances.entry(sender).write(bal - amount);
            self.balances.entry(recipient).write(self.balances.entry(recipient).read() + amount);
            self.emit(Transfer { from: sender, to: recipient, value: amount });
        }
    }
}
