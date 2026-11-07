# StarkBlake & BlakeVPN — Market Opportunity & Go-To-Market Plan (v2.0)

## 1. Market Sizing (TAM / SAM / SOM)

| Market Tier | Valuation / Users | Target Audience |
| :--- | :--- | :--- |
| **TAM (Global VPN Market)** | **$83B–$108B** (2026 est.) • ~1.6B users | Global consumer & remote-work privacy/security users. |
| **SAM (Privacy-First & Crypto VPN)** | **2M–5M users** (~$150M–$350M ARR) | Mullvad/Proton crypto payers, dVPN users (Mysterium, Sentinel, NymVPN), and censorship-resistant exit users. |
| **SOM (12-Month Starknet & DePIN Target)** | **1,500–3,000 paying subs** ($9k–$18k MRR) | Starknet wallet users (Argent X, Braavos, Xverse), STRK20 privacy adopters, and self-hosted WireGuard node runners. |

---

## 2. Competitive Positioning

> **"The Post-Quantum Starknet VPN you can pay for privately at $6/mo—or earn a 20% discount ($4.80/mo) by mining in your browser."**

- **vs. Mullvad (€5/mo):** We match Mullvad's flat, no-account ethos while adding **Mine-to-Subscribe** (`20%` discount via browser PoW) and community-operated DePIN exit nodes paid in stablecoins.
- **vs. Mysterium / Sentinel:** Zero custom desktop driver installation required—instant **WireGuard `.conf` download** or **1-Click Chrome/Brave Proxy Extension** (`/extension`) backed by Starknet STRK20 Shadow Accounts.

---

## 3. 4-Phase Gated Go-To-Market Roadmap

| Phase | Duration | Core Objective | Gate to Advance |
| :--- | :---: | :--- | :--- |
| **Phase A: Contract Hardening & PQ Miner** | Weeks 1–4 | Deploy modular v2.0 Cairo contracts (`SBlakeToken`, `SBlakeMiner`, `DevVesting`, `VpnPayments`, `NodeRegistry`, `Timelock`) on Starknet Sepolia + Post-Quantum Poseidon miner. | 100% on-chain PoW verification; automated WireGuard peer provisioning in `node-runner/daemon.mjs`. |
| **Phase B: Public Testnet Alpha** | Weeks 5–10 | Onboard **15–25 community BlakeNodes** (EU/US/APAC) and **200–500 alpha VPN testers** using free testnet passes. | $\ge 95\%$ node uptime SLA; $\ge 40\%$ 30-day tester retention; $\ge 30\%$ willingness-to-pay survey at $6/mo. |
| **Phase C: Paid Beta ($6/mo USD / $4.80 SBLAKE)** | Weeks 11–18 | Enable live `$6.00/mo` USDC/STRK subscriptions and `$4.80/mo` SBLAKE-discounted passes; distribute 30% revenue pool in stablecoins to nodes. | $\ge 300$ paying subscribers; positive node operator unit economics. |
| **Phase D: Mainnet Fair Launch & Ekubo Pool** | Week 19+ | Launch mainnet `SBLAKE` with 8% vested dev fee, seed Ekubo liquidity pool, and activate automated 15% Ekubo TWAP Buyback & Burn. | External security review complete; $\ge 1,515$ subs for $5,000/mo Ops Floor breakeven. |
