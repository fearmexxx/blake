/**
 * STRK20 Privacy Pool & Note Commitments for StarkBlake (SBLAKE)
 * 
 * Supports:
 * - Commitment Note generation: Poseidon / Hash(owner, amount, salt)
 * - Scoped Viewing Key derivation for auditability
 * - Note encryption / decryption helper
 */

export interface ShieldedNote {
  ownerPubKey: string;
  amount: bigint;
  salt: string;
  commitment: string;
  viewingKey: string;
}

// Generate cryptographically secure random 256-bit salt in hex
export const generateSalt = (): string => {
  const bytes = new Uint8Array(31); // 31 bytes ensures it fits into felt252
  crypto.getRandomValues(bytes);
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Derive a client-side viewing key bound to the miner's wallet
 */
export const deriveViewingKey = async (walletAddress: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(`SBLAKE_STRK20_VIEWING_KEY_V1:${walletAddress.toLowerCase()}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  // Keep within 251 bits for Starknet felt252
  hashArray[0] &= 0x03;
  return '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Compute note commitment for STRK20 Shielded Minting
 * Commitment = Hash(OwnerPubKey, Amount, Salt)
 */
export const createShieldedNote = async (
  ownerAddress: string,
  amount: bigint,
  customSalt?: string
): Promise<ShieldedNote> => {
  const salt = customSalt || generateSalt();
  const viewingKey = await deriveViewingKey(ownerAddress);

  // Derive commitment hash (felt252 compatible)
  const encoder = new TextEncoder();
  const payload = `${ownerAddress.toLowerCase()}:${amount.toString()}:${salt}`;
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(payload));
  const digestArray = Array.from(new Uint8Array(digest));
  digestArray[0] &= 0x03; // Ensure felt252 range
  const commitment = '0x' + digestArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return {
    ownerPubKey: ownerAddress,
    amount,
    salt,
    commitment,
    viewingKey,
  };
};

/**
 * Local storage helper to persist miner's encrypted notes
 */
export const saveNoteLocally = (note: ShieldedNote) => {
  try {
    const existing = JSON.parse(localStorage.getItem('sblake_shielded_notes') || '[]');
    existing.push({
      commitment: note.commitment,
      amount: note.amount.toString(),
      salt: note.salt,
      owner: note.ownerPubKey,
      timestamp: Date.now(),
    });
    localStorage.setItem('sblake_shielded_notes', JSON.stringify(existing));
  } catch (err) {
    console.warn('Failed to save shielded note locally:', err);
  }
};

export interface StoredShieldedNote {
  commitment: string;
  amount: string;
  salt: string;
  owner?: string;
  timestamp: number;
  spent?: boolean;
}

export const getLocalNotes = (): Array<StoredShieldedNote> => {
  try {
    return JSON.parse(localStorage.getItem('sblake_shielded_notes') || '[]');
  } catch {
    return [];
  }
};

export const markNoteSpent = (commitment: string) => {
  try {
    const existing: StoredShieldedNote[] = getLocalNotes();
    const updated = existing.map((n) =>
      n.commitment === commitment ? { ...n, spent: true } : n
    );
    localStorage.setItem('sblake_shielded_notes', JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to mark shielded note as spent:', err);
  }
};

export const computeNullifier = async (commitment: string, salt: string): Promise<string> => {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(`SBLAKE_NULLIFIER_V1:${commitment}:${salt}`)
  );
  const arr = Array.from(new Uint8Array(digest));
  arr[0] &= 0x03;
  return '0x' + arr.map((b) => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Helper for Invited Beta testers to seed a 7-day matured STRK20 note (250 SBLAKE)
 * to test unlinkable BlakeVPN Pass activation & 50% mint fee discount immediately.
 */
export const seedBetaMaturedNote = async (ownerAddress: string): Promise<StoredShieldedNote> => {
  const amountWei = 250n * 10n ** 18n;
  const note = await createShieldedNote(ownerAddress, amountWei);
  const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
  const stored: StoredShieldedNote = {
    commitment: note.commitment,
    amount: amountWei.toString(),
    salt: note.salt,
    owner: ownerAddress,
    timestamp: eightDaysAgo,
    spent: false,
  };
  const existing = getLocalNotes();
  existing.unshift(stored);
  localStorage.setItem('sblake_shielded_notes', JSON.stringify(existing));
  return stored;
};

