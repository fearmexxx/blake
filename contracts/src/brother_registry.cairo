// BrotherIdRegistry — minimal attester-managed human-verification registry.
// An off-chain verifier (Brother ID / passport / World ID bridge) attests wallets here.
// The miner reads `is_verified`; users can no longer self-declare verification.

#[starknet::contract]
pub mod BrotherIdRegistry {
    use core::num::traits::Zero;
    use starknet::{ContractAddress, get_caller_address};
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use crate::interfaces::IBrotherIdRegistry;

    #[storage]
    struct Storage {
        owner: ContractAddress,
        attesters: Map<ContractAddress, bool>,
        verified: Map<ContractAddress, bool>,
        verified_count: u32,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        Verified: Verified,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Verified {
        #[key]
        pub account: ContractAddress,
        pub status: bool,
        pub attester: ContractAddress,
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        assert(!owner.is_zero(), 'Owner is zero');
        self.owner.write(owner);
        self.attesters.entry(owner).write(true);
    }

    #[abi(embed_v0)]
    impl RegistryImpl of IBrotherIdRegistry<ContractState> {
        fn is_verified(self: @ContractState, account: ContractAddress) -> bool {
            self.verified.entry(account).read()
        }
    }

    #[external(v0)]
    fn set_attester(ref self: ContractState, attester: ContractAddress, allowed: bool) {
        assert(get_caller_address() == self.owner.read(), 'Caller is not owner');
        self.attesters.entry(attester).write(allowed);
    }

    #[external(v0)]
    fn attest(ref self: ContractState, account: ContractAddress, status: bool) {
        let attester = get_caller_address();
        assert(self.attesters.entry(attester).read(), 'Caller is not attester');
        let prev = self.verified.entry(account).read();
        if prev != status {
            self.verified.entry(account).write(status);
            let count = self.verified_count.read();
            if status {
                self.verified_count.write(count + 1);
            } else {
                self.verified_count.write(count - 1);
            }
        }
        self.emit(Verified { account, status, attester });
    }

    #[external(v0)]
    fn verified_count(self: @ContractState) -> u32 {
        self.verified_count.read()
    }
}
