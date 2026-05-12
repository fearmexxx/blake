export const getFingerprint = async (): Promise<string> => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const webgl = canvas.getContext('webgl');
  
  let fingerprint = '';
  
  // Canvas fingerprinting
  if (ctx) {
    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("StarkBlake Miner", 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText("StarkBlake Miner", 4, 17);
    fingerprint += canvas.toDataURL();
  }
  
  // Hardware info
  fingerprint += navigator.hardwareConcurrency || '0';
  fingerprint += screen.width + 'x' + screen.height + 'x' + screen.colorDepth;
  
  // Simplified hash of the fingerprint string
  const encoder = new TextEncoder();
  const data = encoder.encode(fingerprint);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};
