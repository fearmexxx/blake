import { blake2s } from '@noble/hashes/blake2s';

let currentWallet = '';
let currentEpoch = 1;
let currentBlockHash = '';
let currentBrotherId = '';
let currentRound = 1;
let target = BigInt('0x00000fffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
let nonce = 0n;
let stepBig = 1n;
let baseData = new Uint8Array();
let sessionBestHash: bigint | null = null;
let isRunning = false;

const BATCH_SIZE = 5000;
const toHex64 = (val: bigint) => '0x' + val.toString(16).padStart(64, '0');

const rebuildBaseData = () => {
  const prefixStr = `${currentWallet}:${currentEpoch}:${currentBlockHash}:${currentBrotherId}:${currentRound}:`;
  baseData = new TextEncoder().encode(prefixStr);
};

const mine = () => {
  if (!isRunning) return;

  let batchIterations = 0;
  const activeRound = currentRound;

  for (let i = 0; i < BATCH_SIZE; i++) {
    // If a new round was triggered via onmessage, break batch and start fresh
    if (activeRound !== currentRound) break;

    const nonceBytes = new TextEncoder().encode(nonce.toString());
    const data = new Uint8Array(baseData.length + nonceBytes.length);
    data.set(baseData);
    data.set(nonceBytes, baseData.length);

    const digest = blake2s(data);
    let hex = '0x';
    for (let j = 0; j < digest.length; j++) {
      hex += digest[j].toString(16).padStart(2, '0');
    }
    const hashValue = BigInt(hex);

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
      });
      self.postMessage({
        type: 'SUCCESS',
        round: activeRound,
        nonce: winningNonce,
        hash: winningHashHex,
      });

      // Advance round locally and keep mining continuously after brief cooldown
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
  });
  setTimeout(mine, 0);
};

self.onmessage = (e: MessageEvent) => {
  const msg = e.data;

  if (msg.type === 'NEW_ROUND') {
    currentRound = msg.round;
    if (msg.difficulty) {
      target = BigInt(msg.difficulty);
    }
    sessionBestHash = null;
    rebuildBaseData();
    return;
  }

  if (msg.type === 'UPDATE_DIFFICULTY') {
    target = BigInt(msg.difficulty);
    sessionBestHash = null;
    return;
  }

  // Initial start message
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
