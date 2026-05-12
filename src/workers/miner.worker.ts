import { blake2s } from '@noble/hashes/blake2s';

self.onmessage = (e: MessageEvent) => {
  const { wallet, epoch, blockHash, difficulty, startNonce, step, brotherId } = e.data;
  
  // Convert inputs to Uint8Array
  const baseData = new TextEncoder().encode(`${wallet}${epoch}${blockHash}${brotherId || ''}`);
  const target = BigInt(difficulty); // Simplified target check
  
  let nonce = BigInt(startNonce);
  let iterations = 0;
  const BATCH_SIZE = 10000;
  
  const mine = () => {
    for (let i = 0; i < BATCH_SIZE; i++) {
      const nonceBytes = new TextEncoder().encode(nonce.toString());
      const data = new Uint8Array(baseData.length + nonceBytes.length);
      data.set(baseData);
      data.set(nonceBytes, baseData.length);
      
      const hash = blake2s(data);
      const hashValue = BigInt('0x' + Array.from(hash).map(b => b.toString(16).padStart(2, '0')).join(''));
      
      if (hashValue < target) {
        self.postMessage({ type: 'SUCCESS', nonce: nonce.toString(), hash: '0x' + hashValue.toString(16) });
        return;
      }
      
      nonce += BigInt(step);
      iterations++;
    }
    
    self.postMessage({ type: 'PROGRESS', iterations });
    setTimeout(mine, 0); // Yield to event loop
  };
  
  mine();
};
