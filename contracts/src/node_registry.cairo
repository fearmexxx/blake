// NodeRegistry — BlakeNode operator bonding, on-chain discovery, slashing and stablecoin payouts.
//
// - Operators bond `bond_amount` SBLAKE (default 10,000) or are whitelisted for the Beta subsidy.
// - Endpoint ("ip:port" short string) + WireGuard public key are stored on-chain so clients can
//   discover nodes without a central server.
// - Unbonding has a 7-day delay during which the owner can still slash misbehaving nodes.
//   Slashed SBLAKE is burned.
// - Node payouts are in the stablecoin received from VpnPayments (30% of revenue by default).
//   The rewards manager allocates the epoch's pool by SLA score; operators `claim()`.

#[starknet::contract]
pub mod NodeRegistry {
    use core::num::traits::Zero;
    use starknet::{
        ContractAddress, ClassHash, get_caller_address, get_block_timestamp, get_contract_address,
    };
    use starknet::syscalls::replace_class_syscall;
    use starknet::SyscallResultTrait;
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use crate::interfaces::{
        INodeRegistry, IOwnable, IERC20Dispatcher, IERC20DispatcherTrait, ISBlakeTokenDispatcher,
        ISBlakeTokenDispatcherTrait,
    };

    pub const UNBOND_DELAY: u64 = 604800; // 7 days

    #[storage]
    struct Storage {
        owner: ContractAddress,
        manager: ContractAddress,
        sblake_token: ContractAddress,
        stable_token: ContractAddress,
        bond_amount: u256,
        operators: Map<u32, ContractAddress>,
        operators_count: u32,
        registered: Map<ContractAddress, bool>,
        subsidized: Map<ContractAddress, bool>,
        collateral: Map<ContractAddress, u256>,
        region: Map<ContractAddress, felt252>,
        endpoint: Map<ContractAddress, felt252>,
        wg_pubkey: Map<ContractAddress, u256>,
        active: Map<ContractAddress, bool>,
        last_heartbeat: Map<ContractAddress, u64>,
        unbond_at: Map<ContractAddress, u64>,
        claimable: Map<ContractAddress, u256>,
        active_count: u32,
        total_collateral: u256,
        total_unclaimed: u256,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        NodeBonded: NodeBonded,
        UnbondRequested: UnbondRequested,
        CollateralWithdrawn: CollateralWithdrawn,
        Heartbeat: Heartbeat,
        Slashed: Slashed,
        RewardsAllocated: RewardsAllocated,
        RewardsClaimed: RewardsClaimed,
        OwnershipTransferred: OwnershipTransferred,
        Upgraded: Upgraded,
    }

    #[derive(Drop, starknet::Event)]
    pub struct NodeBonded {
        #[key]
        pub operator: ContractAddress,
        pub region: felt252,
        pub endpoint: felt252,
        pub wg_pubkey: u256,
        pub collateral: u256,
        pub subsidized: bool,
    }

    #[derive(Drop, starknet::Event)]
    pub struct UnbondRequested {
        #[key]
        pub operator: ContractAddress,
        pub available_at: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct CollateralWithdrawn {
        #[key]
        pub operator: ContractAddress,
        pub amount: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Heartbeat {
        #[key]
        pub operator: ContractAddress,
        pub timestamp: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Slashed {
        #[key]
        pub operator: ContractAddress,
        pub amount: u256,
        pub reason: felt252,
    }

    #[derive(Drop, starknet::Event)]
    pub struct RewardsAllocated {
        pub total: u256,
        pub operators: u32,
    }

    #[derive(Drop, starknet::Event)]
    pub struct RewardsClaimed {
        #[key]
        pub operator: ContractAddress,
        pub amount: u256,
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
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        manager: ContractAddress,
        sblake_token: ContractAddress,
        stable_token: ContractAddress,
    ) {
        assert(!owner.is_zero(), 'Owner is zero');
        assert(!sblake_token.is_zero(), 'SBLAKE token is zero');
        assert(!stable_token.is_zero(), 'Stable token is zero');
        self.owner.write(owner);
        self.manager.write(manager);
        self.sblake_token.write(sblake_token);
        self.stable_token.write(stable_token);
        self.bond_amount.write(10_000_000000000000000000_u256);
    }

    #[abi(embed_v0)]
    impl NodeRegistryImpl of INodeRegistry<ContractState> {
        fn bond(ref self: ContractState, region: felt252, endpoint: felt252, wg_pubkey: u256) {
            let operator = get_caller_address();
            assert(!self.active.entry(operator).read(), 'Node already active');
            assert(self.collateral.entry(operator).read() == 0, 'Withdraw pending collateral');
            assert(region != 0, 'Region is zero');
            assert(endpoint != 0, 'Endpoint is zero');
            assert(wg_pubkey != 0, 'WG pubkey is zero');

            let subsidized = self.subsidized.entry(operator).read();
            let mut amount: u256 = 0;
            if !subsidized {
                amount = self.bond_amount.read();
                assert(
                    IERC20Dispatcher { contract_address: self.sblake_token.read() }
                        .transfer_from(operator, get_contract_address(), amount),
                    'Bond transfer failed',
                );
                self.collateral.entry(operator).write(amount);
                self.total_collateral.write(self.total_collateral.read() + amount);
            }

            if !self.registered.entry(operator).read() {
                let idx = self.operators_count.read();
                self.operators.entry(idx).write(operator);
                self.operators_count.write(idx + 1);
                self.registered.entry(operator).write(true);
            }
            self.region.entry(operator).write(region);
            self.endpoint.entry(operator).write(endpoint);
            self.wg_pubkey.entry(operator).write(wg_pubkey);
            self.active.entry(operator).write(true);
            self.unbond_at.entry(operator).write(0);
            self.last_heartbeat.entry(operator).write(get_block_timestamp());
            self.active_count.write(self.active_count.read() + 1);
            self
                .emit(
                    NodeBonded { operator, region, endpoint, wg_pubkey, collateral: amount, subsidized },
                );
        }

        fn request_unbond(ref self: ContractState) {
            let operator = get_caller_address();
            assert(self.active.entry(operator).read(), 'Node not active');
            self.active.entry(operator).write(false);
            self.active_count.write(self.active_count.read() - 1);
            let available_at = get_block_timestamp() + UNBOND_DELAY;
            self.unbond_at.entry(operator).write(available_at);
            self.emit(UnbondRequested { operator, available_at });
        }

        fn withdraw(ref self: ContractState) {
            let operator = get_caller_address();
            assert(!self.active.entry(operator).read(), 'Node still active');
            let available_at = self.unbond_at.entry(operator).read();
            assert(available_at != 0, 'Unbond not requested');
            assert(get_block_timestamp() >= available_at, 'Unbond delay not over');
            let amount = self.collateral.entry(operator).read();
            self.collateral.entry(operator).write(0);
            self.unbond_at.entry(operator).write(0);
            if amount > 0 {
                self.total_collateral.write(self.total_collateral.read() - amount);
                assert(
                    IERC20Dispatcher { contract_address: self.sblake_token.read() }
                        .transfer(operator, amount),
                    'Withdraw transfer failed',
                );
            }
            self.emit(CollateralWithdrawn { operator, amount });
        }

        fn heartbeat(ref self: ContractState) {
            let operator = get_caller_address();
            assert(self.active.entry(operator).read(), 'Node not active');
            let now = get_block_timestamp();
            self.last_heartbeat.entry(operator).write(now);
            self.emit(Heartbeat { operator, timestamp: now });
        }

        fn claim(ref self: ContractState) {
            let operator = get_caller_address();
            let amount = self.claimable.entry(operator).read();
            assert(amount > 0, 'Nothing to claim');
            self.claimable.entry(operator).write(0);
            self.total_unclaimed.write(self.total_unclaimed.read() - amount);
            assert(
                IERC20Dispatcher { contract_address: self.stable_token.read() }
                    .transfer(operator, amount),
                'Claim transfer failed',
            );
            self.emit(RewardsClaimed { operator, amount });
        }

        fn get_node(
            self: @ContractState, operator: ContractAddress,
        ) -> (u256, felt252, felt252, u256, bool, u64, u64, u256) {
            (
                self.collateral.entry(operator).read(),
                self.region.entry(operator).read(),
                self.endpoint.entry(operator).read(),
                self.wg_pubkey.entry(operator).read(),
                self.active.entry(operator).read(),
                self.last_heartbeat.entry(operator).read(),
                self.unbond_at.entry(operator).read(),
                self.claimable.entry(operator).read(),
            )
        }

        fn get_stats(self: @ContractState) -> (u32, u256, u256) {
            (self.active_count.read(), self.total_collateral.read(), self.total_unclaimed.read())
        }

        fn operator_at(self: @ContractState, index: u32) -> ContractAddress {
            self.operators.entry(index).read()
        }

        fn operators_count(self: @ContractState) -> u32 {
            self.operators_count.read()
        }

        // ---------------- admin ----------------
        fn set_manager(ref self: ContractState, manager: ContractAddress) {
            self._only_owner();
            self.manager.write(manager);
        }

        fn set_subsidized(ref self: ContractState, operator: ContractAddress, allowed: bool) {
            self._only_owner_or_manager();
            self.subsidized.entry(operator).write(allowed);
        }

        fn set_bond_amount(ref self: ContractState, amount: u256) {
            self._only_owner();
            assert(amount > 0, 'Bond is zero');
            self.bond_amount.write(amount);
        }

        fn slash(ref self: ContractState, operator: ContractAddress, amount: u256, reason: felt252) {
            self._only_owner();
            let bonded = self.collateral.entry(operator).read();
            assert(amount > 0 && amount <= bonded, 'Bad slash amount');
            self.collateral.entry(operator).write(bonded - amount);
            self.total_collateral.write(self.total_collateral.read() - amount);
            ISBlakeTokenDispatcher { contract_address: self.sblake_token.read() }.burn(amount);
            self.emit(Slashed { operator, amount, reason });
        }

        fn allocate_rewards(
            ref self: ContractState, operators: Span<ContractAddress>, amounts: Span<u256>,
        ) {
            self._only_owner_or_manager();
            assert(operators.len() == amounts.len(), 'Length mismatch');
            let mut total: u256 = 0;
            let mut i: u32 = 0;
            while i < operators.len() {
                let op = *operators.at(i);
                let amt = *amounts.at(i);
                assert(self.registered.entry(op).read(), 'Unknown operator');
                self.claimable.entry(op).write(self.claimable.entry(op).read() + amt);
                total += amt;
                i += 1;
            };
            let new_unclaimed = self.total_unclaimed.read() + total;
            let balance = IERC20Dispatcher { contract_address: self.stable_token.read() }
                .balance_of(get_contract_address());
            assert(balance >= new_unclaimed, 'Insufficient reward pool');
            self.total_unclaimed.write(new_unclaimed);
            self.emit(RewardsAllocated { total, operators: operators.len() });
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
        fn _only_owner_or_manager(self: @ContractState) {
            let caller = get_caller_address();
            assert(caller == self.owner.read() || caller == self.manager.read(), 'Not owner/manager');
        }
    }
}
