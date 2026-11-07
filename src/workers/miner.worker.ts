import { blake2s } from '@noble/hashes/blake2s';
import { poseidonHashMany } from '@scure/starknet';

/**
 * StarkBlake v2.0 Post-Quantum Ready Mining Worker
 *
 * Supports two Post-Quantum hash modes:
 * 1. 'POSEIDON_PQ' (Default — Starknet Native STARK Hash):
 *    Computes `work = poseidon_hash_span([challenge, nonce])` over the Starknet prime field
 *    `P = 2^251 + 17 * 2^192 + 1`. Matches `SBlakeMiner::compute_work` on-chain 1:1 and aligns
 *    with Starknet's hash-based post-quantum STARK proof system (SNIP-36).
 * 2. 'BLAKE2S_PQ' (High-Throughput Symmetric Hash):
 *    256-bit BLAKE2s symmetric PoW (128-bit post-quantum Grover security).
 */

export type HashAlgorithm = 'POSEIDON_PQ' | 'BLAKE2S_PQ';

let algorithm: HashAlgorithm = 'POSEIDON_PQ';
let currentWallet = '';
let currentEpoch = 1;
let currentBlockHash = '';
let currentBrotherId = '';
let currentRound = 1;
let challengeFelt = 0n;
let target = BigInt('0x0001ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
let nonce = 0n;
let stepBig = 1n;
let baseData = new Uint8Array();
let sessionBestHash: bigint | null = null;
let isRunning = false;

// Poseidon is algebraically heavier than byte-level BLAKE2s, so use smaller batch sizes
// to keep UI progress telemetry smooth (~60fps updates).
const POSEIDON_BATCH_SIZE = 250;
const BLAKE2S_BATCH_SIZE = 5000;

const toHex64 = (val: bigint) => '0x' + val.toString(16).padStart(64, '0');

const parseFeltBigInt = (input: string | number | bigint): bigint => {
  try {
    if (typeof input === 'bigint') return input;
    if (typeof input === 'number') return BigInt(input);
    const trimmed = input.trim();
    if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
      return BigInt(trimmed);
    }
    if (/^\d+$/.test(trimmed)) {
      return BigInt(trimmed);
    }
    // Fallback: encode ASCII bytes into a felt252
    const bytes = new TextEncoder().encode(trimmed.slice(0, 31));
    let hex = '0x';
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex === '0x' ? 1n : BigInt(hex);
  } catch {
    return 1n;
  }
};

const rebuildBaseData = () => {
  const prefixStr = `${currentWallet}:${currentEpoch}:${currentBlockHash}:${currentBrotherId}:${currentRound}:`;
  baseData = new TextEncoder().encode(prefixStr);

  // Derive deterministic Starknet Poseidon challenge matching SBlakeMiner::get_challenge:
  // challenge = poseidon_hash_span([epoch_seed, user_address, round])
  const walletFelt = parseFeltBigInt(currentWallet || '0x1');
  const seedFelt = parseFeltBigInt(currentBlockHash || '0x1234567890abcdef');
  const epochFelt = BigInt(currentEpoch || 1);
  const roundFelt = BigInt(currentRound || 1);
  const epochSeed = poseidonHashMany([seedFelt, epochFelt, roundFelt]);
  challengeFelt = poseidonHashMany([epochSeed, walletFelt]);
};

const mine = () => {
  if (!isRunning) return;

  let batchIterations = 0;
  const activeRound = currentRound;
  const batchLimit = algorithm === 'POSEIDON_PQ' ? POSEIDON_BATCH_SIZE : BLAKE2S_BATCH_SIZE;

  for (let i = 0; i < batchLimit; i++) {
    if (activeRound !== currentRound) break;

    let hashValue: bigint;

    if (algorithm === 'POSEIDON_PQ') {
      // Exact Starknet Cairo `poseidon_hash_span(array![challenge, nonce].span())`
      hashValue = poseidonHashMany([challengeFelt, nonce]);
    } else {
      const nonceBytes = new TextEncoder().encode(nonce.toString());
      const data = new Uint8Array(baseData.length + nonceBytes.length);
      data.set(baseData);
      data.set(nonceBytes, baseData.length);

      const digest = blake2s(data);
      let hex = '0x';
      for (let j = 0; j < digest.length; j++) {
        hex += digest[j].toString(16).padStart(2, '0');
      }
      hashValue = BigInt(hex);
    }

    if (sessionBestHash === null || hashValue < sessionBestHash) {
      sessionBestHash = hashValue;
    }

    batchIterations++;

    if (hashValue < target) {
      const winningNonce = nonce.toString();
      const winningHashHex = toHex64(hashValue);
      nonce += stepBig;
      sessionBestHash = null;

      self.postMessage({
        type: 'PROGRESS',
        iterations: batchIterations,
        bestHash: winningHashHex,
        algorithm,
      });
      self.postMessage({
        type: 'SUCCESS',
        round: activeRound,
        nonce: winningNonce,
        hash: winningHashHex,
        challenge: toHex64(challengeFelt),
        algorithm,
      });

      currentRound += 1;
      rebuildBaseData();
      setTimeout(mine, 350);
      return;
    }

    nonce += stepBig;
  }

  self.postMessage({
    type: 'PROGRESS',
    iterations: batchIterations,
    bestHash: sessionBestHash !== null ? toHex64(sessionBestHash) : null,
    algorithm,
  });
  setTimeout(mine, 0);
};

self.onmessage = (e: MessageEvent) => {
  const msg = e.data;

  if (msg.type === 'STOP') {
    isRunning = false;
    return;
  }

  if (msg.type === 'NEW_ROUND') {
    currentRound = msg.round;
    if (msg.difficulty) {
      target = BigInt(msg.difficulty);
    }
    if (msg.algorithm) {
      algorithm = msg.algorithm;
    }
    sessionBestHash = null;
    rebuildBaseData();
    return;
  }

  if (msg.type === 'UPDATE_DIFFICULTY') {
    target = BigInt(msg.difficulty);
    if (msg.algorithm) {
      algorithm = msg.algorithm;
    }
    sessionBestHash = null;
    return;
  }

  // Initial start message
  algorithm = msg.algorithm || 'POSEIDON_PQ';
  currentWallet = msg.wallet || '';
  currentEpoch = msg.epoch || 1;
  currentBlockHash = msg.blockHash || '';
  currentBrotherId = msg.brotherId || '';
  currentRound = msg.round || 1;
  target = BigInt(msg.difficulty);
  nonce = BigInt(msg.startNonce || 0);
  stepBig = BigInt(msg.step || 1);
  sessionBestHash = null;
  rebuildBaseData();

  if (!isRunning) {
    isRunning = true;
    mine();
  }
};
