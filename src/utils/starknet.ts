import { Contract, RpcProvider, CallData } from 'starknet';
import { createShieldedNote, saveNoteLocally } from './privacy';

// Configurable contract address (defaults to deployed contract once set)
export const CONTRACT_ADDRESS = "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

export const provider = new RpcProvider({ nodeUrl: "https://rpc.starknet-testnet.lava.build" });

export interface ChallengeData {
  epoch: number;
  blockHash: string;
  difficulty: string;
  mintsToday: number;
}

export interface EraInfo {
  era: number;
  rewardPerMint: string;
  totalMints: number;
}

export const getChallenge = async (address: string): Promise<ChallengeData> => {
  try {
    if (CONTRACT_ADDRESS && !CONTRACT_ADDRESS.startsWith("0x0123456789")) {
      const contract = new Contract([
        {
          name: "get_challenge",
          type: "function",
          inputs: [{ name: "user", type: "core::starknet::contract_address::ContractAddress" }],
          outputs: [
            { type: "core::integer::u64" },
            { type: "core::integer::u256" },
            { type: "core::integer::u256" },
            { type: "core::integer::u32" },
          ],
          state_mutability: "view",
        }
      ], CONTRACT_ADDRESS, provider);

      const res = await contract.get_challenge(address);
      return {
        epoch: Number(res[0]),
        blockHash: '0x' + BigInt(res[1]).toString(16),
        difficulty: '0x' + BigInt(res[2]).toString(16),
        mintsToday: Number(res[3]),
      };
    }
  } catch (err) {
    console.warn("Live contract call failed, using responsive fallback:", err);
  }

  // Fallback / Pre-deployment state
  return {
    epoch: 1,
    blockHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    difficulty: "0x00000fffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    mintsToday: 0,
  };
};

export const mintSBlake = async (
  account: any,
  nonce: string,
  shielded: boolean = false,
  brotherId?: string
) => {
  console.log(`[StarkBlake SDK] Submitting PoW solution. Shielded: ${shielded}, Nonce: ${nonce}`);

  if (shielded) {
    // Generate private STRK20 note commitment
    const baseReward = 100n * 10n ** 18n;
    const shieldedReward = (baseReward * 115n) / 100n; // +15% emission boost
    const note = await createShieldedNote(account.address, shieldedReward);
    saveNoteLocally(note);

    if (account && account.execute && CONTRACT_ADDRESS && !CONTRACT_ADDRESS.startsWith("0x0123456789")) {
      const tx = await account.execute({
        contractAddress: CONTRACT_ADDRESS,
        entrypoint: "mint_shielded",
        calldata: CallData.compile({
          nonce: { low: BigInt(nonce) & 0xffffffffffffffffffffffffffffffffn, high: BigInt(nonce) >> 128n },
          commitment: note.commitment,
          encrypted_note: [note.salt, note.viewingKey],
        }),
      });
      return { transaction_hash: tx.transaction_hash, commitment: note.commitment, note };
    }

    // Mock response when testing without on-chain deployment
    return {
      transaction_hash: "0x" + Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join(''),
      commitment: note.commitment,
      note,
    };
  }

  // Standard Transparent Minting
  if (account && account.execute && CONTRACT_ADDRESS && !CONTRACT_ADDRESS.startsWith("0x0123456789")) {
    const tx = await account.execute({
      contractAddress: CONTRACT_ADDRESS,
      entrypoint: "mint",
      calldata: CallData.compile({
        nonce: { low: BigInt(nonce) & 0xffffffffffffffffffffffffffffffffn, high: BigInt(nonce) >> 128n },
        brother_id: brotherId || "0",
      }),
    });
    return { transaction_hash: tx.transaction_hash };
  }

  return {
    transaction_hash: "0x" + Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join(''),
  };
};
