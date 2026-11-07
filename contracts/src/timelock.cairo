// Timelock — delayed execution of admin calls. Intended to be the `owner` of SBlakeToken,
// SBlakeMiner, VpnPayments and NodeRegistry so that upgrades / parameter changes are public
// for `min_delay` seconds before they can take effect. The `proposer` should be a team multisig.

#[starknet::contract]
pub mod Timelock {
    use core::num::traits::Zero;
    use core::poseidon::poseidon_hash_span;
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp, get_contract_address};
    use starknet::syscalls::call_contract_syscall;
    use starknet::SyscallResultTrait;
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use crate::interfaces::ITimelock;

    const DONE: u64 = 1;

    #[storage]
    struct Storage {
        proposer: ContractAddress,
        min_delay: u64,
        // 0 = unknown, 1 = done, otherwise = ready timestamp
        ready_at: Map<felt252, u64>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        Scheduled: Scheduled,
        Executed: Executed,
        Cancelled: Cancelled,
        DelayUpdated: DelayUpdated,
        ProposerUpdated: ProposerUpdated,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Scheduled {
        #[key]
        pub id: felt252,
        pub target: ContractAddress,
        pub selector: felt252,
        pub calldata: Span<felt252>,
        pub salt: felt252,
        pub ready_at: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Executed {
        #[key]
        pub id: felt252,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Cancelled {
        #[key]
        pub id: felt252,
    }

    #[derive(Drop, starknet::Event)]
    pub struct DelayUpdated {
        pub old_delay: u64,
        pub new_delay: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct ProposerUpdated {
        pub proposer: ContractAddress,
    }

    #[constructor]
    fn constructor(ref self: ContractState, proposer: ContractAddress, min_delay: u64) {
        assert(!proposer.is_zero(), 'Proposer is zero');
        self.proposer.write(proposer);
        self.min_delay.write(min_delay);
    }

    #[abi(embed_v0)]
    impl TimelockImpl of ITimelock<ContractState> {
        fn schedule(
            ref self: ContractState,
            target: ContractAddress,
            selector: felt252,
            calldata: Span<felt252>,
            salt: felt252,
        ) -> felt252 {
            assert(get_caller_address() == self.proposer.read(), 'Caller is not proposer');
            let id = self.hash_operation(target, selector, calldata, salt);
            assert(self.ready_at.entry(id).read() == 0, 'Operation exists');
            let ready_at = get_block_timestamp() + self.min_delay.read();
            // store at least 2 so it never collides with the DONE marker
            let stored = if ready_at <= DONE {
                DONE + 1
            } else {
                ready_at
            };
            self.ready_at.entry(id).write(stored);
            self.emit(Scheduled { id, target, selector, calldata, salt, ready_at: stored });
            id
        }

        fn execute(
            ref self: ContractState,
            target: ContractAddress,
            selector: felt252,
            calldata: Span<felt252>,
            salt: felt252,
        ) -> Span<felt252> {
            let id = self.hash_operation(target, selector, calldata, salt);
            let ready_at = self.ready_at.entry(id).read();
            assert(ready_at > DONE, 'Operation not pending');
            assert(get_block_timestamp() >= ready_at, 'Operation not ready');
            self.ready_at.entry(id).write(DONE);
            let result = call_contract_syscall(target, selector, calldata).unwrap_syscall();
            self.emit(Executed { id });
            result
        }

        fn cancel(ref self: ContractState, id: felt252) {
            assert(get_caller_address() == self.proposer.read(), 'Caller is not proposer');
            assert(self.ready_at.entry(id).read() > DONE, 'Operation not pending');
            self.ready_at.entry(id).write(0);
            self.emit(Cancelled { id });
        }

        fn hash_operation(
            self: @ContractState,
            target: ContractAddress,
            selector: felt252,
            calldata: Span<felt252>,
            salt: felt252,
        ) -> felt252 {
            let mut data: Array<felt252> = array![target.into(), selector, calldata.len().into()];
            let mut i: u32 = 0;
            while i < calldata.len() {
                data.append(*calldata.at(i));
                i += 1;
            };
            data.append(salt);
            poseidon_hash_span(data.span())
        }

        fn get_ready_at(self: @ContractState, id: felt252) -> u64 {
            self.ready_at.entry(id).read()
        }

        fn min_delay(self: @ContractState) -> u64 {
            self.min_delay.read()
        }

        fn proposer(self: @ContractState) -> ContractAddress {
            self.proposer.read()
        }

        /// Only callable by the timelock itself (i.e. through schedule + execute).
        fn update_delay(ref self: ContractState, new_delay: u64) {
            assert(get_caller_address() == get_contract_address(), 'Only via timelock');
            let old_delay = self.min_delay.read();
            self.min_delay.write(new_delay);
            self.emit(DelayUpdated { old_delay, new_delay });
        }

        /// Only callable by the timelock itself (i.e. through schedule + execute).
        fn set_proposer(ref self: ContractState, new_proposer: ContractAddress) {
            assert(get_caller_address() == get_contract_address(), 'Only via timelock');
            assert(!new_proposer.is_zero(), 'Proposer is zero');
            self.proposer.write(new_proposer);
            self.emit(ProposerUpdated { proposer: new_proposer });
        }
    }
}
