import { blake2s } from '@noble/hashes/blake2s';

self.onmessage = (e: MessageEvent) => {
  const { wallet, epoch, blockHash, difficulty, startNonce, step, brotherId } = e.data;

  // Convert challenge prefix to bytes once
  const prefixStr = `${wallet}:${epoch}:${blockHash}:${brotherId || ''}:`;
  const baseData = new TextEncoder().encode(prefixStr);
  const target = BigInt(difficulty);

  let nonce = BigInt(startNonce);
  const stepBig = BigInt(step || 1);
  const BATCH_SIZE = 5000;
  let sessionBestHash: bigint | null = null;

  const toHex64 = (val: bigint) => '0x' + val.toString(16).padStart(64, '0');

  const mine = () => {
    let batchIterations = 0;

    for (let i = 0; i < BATCH_SIZE; i++) {
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
        self.postMessage({
          type: 'PROGRESS',
          iterations: batchIterations,
          bestHash: toHex64(hashValue),
        });
        self.postMessage({
          type: 'SUCCESS',
          nonce: nonce.toString(),
          hash: toHex64(hashValue),
        });
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

  mine();
};
