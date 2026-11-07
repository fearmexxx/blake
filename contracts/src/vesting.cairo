// DevVesting — receives the 5-10% dev fee on SBLAKE emission and releases it linearly
// to the beneficiary (intended: team multisig) after a cliff.
//
// vested(t) = 0                                   if t < cliff_end
//           = total_received * (t - start) / duration   if cliff_end <= t < end
//           = total_received                       if t >= end
// where total_received = current balance + already released. Tokens that arrive later
// (the fee streams in with every mint) vest on the same schedule.

#[starknet::contract]
pub mod DevVesting {
    use core::num::traits::Zero;
    use starknet::{ContractAddress, get_block_timestamp, get_contract_address};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use crate::interfaces::{IDevVesting, IERC20Dispatcher, IERC20DispatcherTrait};

    #[storage]
    struct Storage {
        token: ContractAddress,
        beneficiary: ContractAddress,
        start: u64,
        cliff_end: u64,
        end: u64,
        released: u256,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        Released: Released,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Released {
        pub beneficiary: ContractAddress,
        pub amount: u256,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        token: ContractAddress,
        beneficiary: ContractAddress,
        cliff_seconds: u64,
        duration_seconds: u64,
    ) {
        assert(!token.is_zero(), 'Token is zero');
        assert(!beneficiary.is_zero(), 'Beneficiary is zero');
        assert(duration_seconds > 0, 'Duration is zero');
        assert(cliff_seconds <= duration_seconds, 'Cliff > duration');
        let now = get_block_timestamp();
        self.token.write(token);
        self.beneficiary.write(beneficiary);
        self.start.write(now);
        self.cliff_end.write(now + cliff_seconds);
        self.end.write(now + duration_seconds);
    }

    #[abi(embed_v0)]
    impl DevVestingImpl of IDevVesting<ContractState> {
        fn release(ref self: ContractState) {
            let amount = self.releasable();
            assert(amount > 0, 'Nothing to release');
            self.released.write(self.released.read() + amount);
            let beneficiary = self.beneficiary.read();
            IERC20Dispatcher { contract_address: self.token.read() }.transfer(beneficiary, amount);
            self.emit(Released { beneficiary, amount });
        }

        fn releasable(self: @ContractState) -> u256 {
            let now = get_block_timestamp();
            if now < self.cliff_end.read() {
                return 0;
            }
            let balance = IERC20Dispatcher { contract_address: self.token.read() }
                .balance_of(get_contract_address());
            let released = self.released.read();
            let total = balance + released;
            let start = self.start.read();
            let end = self.end.read();
            let vested = if now >= end {
                total
            } else {
                let elapsed: u256 = (now - start).into();
                let duration: u256 = (end - start).into();
                (total * elapsed) / duration
            };
            if vested > released {
                vested - released
            } else {
                0
            }
        }

        fn get_schedule(self: @ContractState) -> (ContractAddress, u64, u64, u64, u256) {
            (
                self.beneficiary.read(),
                self.start.read(),
                self.cliff_end.read(),
                self.end.read(),
                self.released.read(),
            )
        }
    }
}
