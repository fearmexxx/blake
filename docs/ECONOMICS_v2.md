# StarkBlake (`SBLAKE`) & BlakeVPN — Economic Flywheel v2.0

## 1. Executive Summary

StarkBlake (`SBLAKE`) v2.0 powers the **BlakeVPN & BlakeNode** decentralized privacy network on Starknet. Rather than relying on inflationary yield promises, v2.0 anchors the token economy in **USD-denominated VPN demand**, **Post-Quantum STARK-native proof-of-work**, and **structural token sinks**:

1. **USD-Priced Subscription ($6.00/mo) with a 20% SBLAKE Payment Discount ($4.80/mo):**
   - Users can subscribe in stablecoins/STRK at **$6.00/month** (`VpnPayments::pay_stable`) or pay in **`SBLAKE` for a 20% discount ($4.80/month equivalent)** (`VpnPayments::pay_sblake`).
   - **30% of every SBLAKE-denominated VPN payment is permanently burned on-chain**, while 70% routes to the Operations Treasury.
2. **55% Ops / 30% Stablecoin Node Payouts / 15% Ekubo TWAP Buyback & Burn:**
   - **55% Operations Treasury:** Covers the **$5,000/month Operations Cost Floor** (reached at **~1,515 paying subscribers** at $6/mo).
   - **30% Stablecoin Node Payouts:** Paid in `USDC / STRK` via `NodeRegistry::claim` so node operators can pay their VPS hosting bills ($6–$20/mo) without selling `SBLAKE`.
   - **15% Ekubo TWAP Buyback & Burn:** Purchases `SBLAKE` from the Ekubo liquidity pool and burns it permanently.
3. **5–10% Vested Dev Fee on Emission (Default 8% = 800 bps):**
   - Zero presale, zero VC premine.
   - Every PoW mint accrues a **5–10% dev fee** (configured at **8% / 0.8 SBLAKE per 10 SBLAKE miner reward**) into [`DevVesting`](../contracts/src/vesting.cairo), subject to a cliff and 24-month linear vesting.
4. **Post-Quantum Ready Starknet Proof-of-Work (`POSEIDON_PQ` & `BLAKE2S_PQ`):**
   - **Poseidon Field PoW (`POSEIDON_PQ`):** Computes `work = poseidon_hash_span([challenge, nonce]) <= target` over Starknet's prime field, matching Starknet's hash-based post-quantum STARK proof architecture (SNIP-36) with zero elliptic-curve discrete-log assumptions.
   - **256-Bit BLAKE2s (`BLAKE2S_PQ`):** Provides 128-bit post-quantum Grover security.

---

## 2. Revenue & Breakeven Math

$$\text{Breakeven Subscribers} = \frac{\$5,000\text{ Ops Cost Floor}}{\$6.00 \times 0.55\text{ Ops Share}} \approx 1,515\text{ Paying Subscribers}$$

| Metric | Phase C (Paid Beta Gate) | Phase D (Breakeven Floor) | Year-1 SOM Target |
| :--- | :---: | :---: | :---: |
| **Paying Subscribers** | 350 | 1,550 | 3,000 |
| **Headline Price (USDC/STRK)** | $6.00 / mo | $6.00 / mo | $6.00 / mo |
| **SBLAKE Discount Price (-20%)** | **$4.80 / mo** | **$4.80 / mo** | **$4.80 / mo** |
| **Monthly VPN Gross Revenue** | $2,100 / mo | $9,300 / mo | $18,000 / mo |
| **55% Ops Treasury Share** | $1,155 / mo | **$5,115 / mo (Floor Met ✓)** | $9,900 / mo |
| **30% Stablecoin Node Pool** | $630 / mo | $2,790 / mo | $5,400 / mo |
| **15% Ekubo Buyback & Burn** | $315 / mo | $1,395 / mo | $2,700 / mo |

---

## 3. Modular v2.0 Smart Contract Architecture

| Contract | File | Role |
| :--- | :--- | :--- |
| **`SBlakeToken`** | [`contracts/src/token.cairo`](../contracts/src/token.cairo) | Standard OpenZeppelin-compatible ERC-20 with 21,000,000 cumulative mint cap, permanent `burn`/`burn_from`, and STRK20 compatibility. |
| **`SBlakeMiner`** | [`contracts/src/miner.cairo`](../contracts/src/miner.cairo) | On-chain Poseidon PoW verifier (`poseidon_hash_span([challenge, nonce]) <= target`), time-based epoch difficulty retargeting, UTC day caps, and 5–10% dev fee accrual. |
| **`DevVesting`** | [`contracts/src/vesting.cairo`](../contracts/src/vesting.cairo) | Cliff + linear vesting vault for the 5–10% dev fee on emission. |
| **`VpnPayments`** | [`contracts/src/vpn_payments.cairo`](../contracts/src/vpn_payments.cairo) | $6.00/mo USD plans (`pay_stable`) and 20%-discounted SBLAKE plans (`pay_sblake`, burning 30% of SBLAKE paid). |
| **`NodeRegistry`** | [`contracts/src/node_registry.cairo`](../contracts/src/node_registry.cairo) | 10,000 SBLAKE operator bonding, 7-day unbond delay, slashing, and stablecoin (`USDC`) reward claims. |
| **`Timelock`** | [`contracts/src/timelock.cairo`](../contracts/src/timelock.cairo) | Delayed governance execution for contract upgrades and parameter updates. |
| **`BrotherIdRegistry`** | [`contracts/src/brother_registry.cairo`](../contracts/src/brother_registry.cairo) | Attester-managed human verification registry unlocking 20 mints/day vs. 10 mints/day base. |
