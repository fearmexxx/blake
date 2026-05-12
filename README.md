# StarkBlake Mining Client 🚀

A high-performance, browser-based PoW miner for SBLAKE on Starknet.

## Features
- **Multi-threaded Mining**: Uses Web Workers for parallel BLAKE2s hashing.
- **Starknet Native**: Integrated with `starknet.js` and `get-starknet`.
- **Anti-Sybil**: Built-in browser fingerprinting (Canvas, WebGL, Hardware).
- **Premium UI**: Matrix-inspired industrial dark mode with real-time metrics.
- **PWA Ready**: Installable on mobile and desktop for background mining.

## Getting Started

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Run Development Server**:
   ```bash
   npm run dev
   ```

3. **Build for Production**:
   ```bash
   npm run build
   ```

## Project Structure
- `src/workers/miner.worker.ts`: The core hashing engine.
- `src/components/Miner.tsx`: Miner UI and worker management.
- `src/utils/starknet.ts`: Starknet contract interaction layer.
- `src/utils/fingerprint.ts`: Device identity tracking.

## Technical Details
- **Algorithm**: BLAKE2s
- **Target**: Retargets every epoch to maintain ~1 mint per minute.
- **Limits**: 10 mints per 24h per wallet (on-chain enforcement).

## License
MIT
