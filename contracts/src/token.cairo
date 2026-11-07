// SBLAKE ERC-20 token (v2).
// - 18 decimals, 21,000,000 cumulative mint cap (burns are permanent and never re-open supply)
// - Minting restricted to approved minters (the SBlakeMiner contract)
// - Standard snake_case + camelCase ERC-20 entrypoints for wallet / DEX (Ekubo) compatibility
// - Plain ERC-20 so it can be used with Starknet's native STRK20 privacy pool / Shadow Accounts

#[starknet::contract]
pub mod SBlakeToken {
    use core::num::traits::Zero;
    use starknet::{ContractAddress, ClassHash, get_caller_address};
    use starknet::syscalls::replace_class_syscall;
    use starknet::SyscallResultTrait;
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use crate::interfaces::{IERC20, ISBlakeToken, IOwnable};

    pub const MAX_SUPPLY: u256 = 21_000_000_000000000000000000_u256;

    #[storage]
    struct Storage {
        owner: ContractAddress,
        minters: Map<ContractAddress, bool>,
        balances: Map<ContractAddress, u256>,
        allowances: Map<(ContractAddress, ContractAddress), u256>,
        total_supply: u256,
        total_minted: u256,
        total_burned: u256,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        Transfer: Transfer,
        Approval: Approval,
        MinterUpdated: MinterUpdated,
        OwnershipTransferred: OwnershipTransferred,
        Upgraded: Upgraded,
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

    #[derive(Drop, starknet::Event)]
    pub struct MinterUpdated {
        #[key]
        pub account: ContractAddress,
        pub allowed: bool,
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
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        assert(!owner.is_zero(), 'Owner is zero');
        self.owner.write(owner);
    }

    #[abi(embed_v0)]
    impl ERC20Impl of IERC20<ContractState> {
        fn name(self: @ContractState) -> felt252 {
            'StarkBlake'
        }
        fn symbol(self: @ContractState) -> felt252 {
            'SBLAKE'
        }
        fn decimals(self: @ContractState) -> u8 {
            18
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
            self._spend_allowance(sender, spender, amount);
            self._transfer(sender, recipient, amount);
            true
        }
        fn approve(ref self: ContractState, spender: ContractAddress, amount: u256) -> bool {
            let owner = get_caller_address();
            self._approve(owner, spender, amount);
            true
        }
    }

    // camelCase aliases for legacy tooling
    #[external(v0)]
    fn totalSupply(self: @ContractState) -> u256 {
        self.total_supply.read()
    }
    #[external(v0)]
    fn balanceOf(self: @ContractState, account: ContractAddress) -> u256 {
        self.balances.entry(account).read()
    }
    #[external(v0)]
    fn transferFrom(
        ref self: ContractState, sender: ContractAddress, recipient: ContractAddress, amount: u256,
    ) -> bool {
        let spender = get_caller_address();
        self._spend_allowance(sender, spender, amount);
        self._transfer(sender, recipient, amount);
        true
    }

    #[abi(embed_v0)]
    impl SBlakeTokenImpl of ISBlakeToken<ContractState> {
        fn mint(ref self: ContractState, to: ContractAddress, amount: u256) {
            assert(self.minters.entry(get_caller_address()).read(), 'Caller is not minter');
            assert(!to.is_zero(), 'Mint to zero');
            let minted = self.total_minted.read() + amount;
            assert(minted <= MAX_SUPPLY, 'Max supply exceeded');
            self.total_minted.write(minted);
            self.total_supply.write(self.total_supply.read() + amount);
            self.balances.entry(to).write(self.balances.entry(to).read() + amount);
            self.emit(Transfer { from: Zero::zero(), to, value: amount });
        }

        fn burn(ref self: ContractState, amount: u256) {
            let caller = get_caller_address();
            self._burn(caller, amount);
        }

        fn burn_from(ref self: ContractState, account: ContractAddress, amount: u256) {
            let spender = get_caller_address();
            self._spend_allowance(account, spender, amount);
            self._burn(account, amount);
        }

        fn max_supply(self: @ContractState) -> u256 {
            MAX_SUPPLY
        }
        fn total_minted(self: @ContractState) -> u256 {
            self.total_minted.read()
        }
        fn total_burned(self: @ContractState) -> u256 {
            self.total_burned.read()
        }
        fn is_minter(self: @ContractState, account: ContractAddress) -> bool {
            self.minters.entry(account).read()
        }
        fn set_minter(ref self: ContractState, account: ContractAddress, allowed: bool) {
            self._only_owner();
            self.minters.entry(account).write(allowed);
            self.emit(MinterUpdated { account, allowed });
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

        fn _transfer(
            ref self: ContractState,
            sender: ContractAddress,
            recipient: ContractAddress,
            amount: u256,
        ) {
            assert(!sender.is_zero(), 'Transfer from zero');
            assert(!recipient.is_zero(), 'Transfer to zero');
            let bal = self.balances.entry(sender).read();
            assert(bal >= amount, 'Insufficient balance');
            self.balances.entry(sender).write(bal - amount);
            self.balances.entry(recipient).write(self.balances.entry(recipient).read() + amount);
            self.emit(Transfer { from: sender, to: recipient, value: amount });
        }

        fn _approve(
            ref self: ContractState, owner: ContractAddress, spender: ContractAddress, amount: u256,
        ) {
            assert(!owner.is_zero(), 'Approve from zero');
            assert(!spender.is_zero(), 'Approve to zero');
            self.allowances.entry((owner, spender)).write(amount);
            self.emit(Approval { owner, spender, value: amount });
        }

        fn _spend_allowance(
            ref self: ContractState, owner: ContractAddress, spender: ContractAddress, amount: u256,
        ) {
            let current = self.allowances.entry((owner, spender)).read();
            let unlimited: u256 = core::num::traits::Bounded::MAX;
            if current != unlimited {
                assert(current >= amount, 'Insufficient allowance');
                self.allowances.entry((owner, spender)).write(current - amount);
            }
        }

        fn _burn(ref self: ContractState, account: ContractAddress, amount: u256) {
            let bal = self.balances.entry(account).read();
            assert(bal >= amount, 'Insufficient balance');
            self.balances.entry(account).write(bal - amount);
            self.total_supply.write(self.total_supply.read() - amount);
            self.total_burned.write(self.total_burned.read() + amount);
            self.emit(Transfer { from: account, to: Zero::zero(), value: amount });
        }
    }
}
