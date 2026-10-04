import { Contract, RpcProvider, CallData } from 'starknet';
import { createShieldedNote, saveNoteLocally } from './privacy';
import sierraData from '../../contracts/target/dev/sblake_sblake.contract_class.json';

// User-provided Alchemy RPC endpoints (v0_10)
export const ALCHEMY_SEPOLIA_URL = "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/qXU4ta4yLmxUhIoLb-cZ7KtsNn808Pjw";
export const ALCHEMY_MAINNET_URL = "https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_10/qXU4ta4yLmxUhIoLb-cZ7KtsNn808Pjw";

// High-reliability Fallback RPC Pool to prevent rate limit stalls
export const FALLBACK_SEPOLIA_URLS = [
  ALCHEMY_SEPOLIA_URL,
  "https://api.cartridge.gg/x/starknet/sepolia",
  "https://starknet-sepolia.drpc.org",
];

// Current network selection ('sepolia' | 'mainnet')
export let CURRENT_NETWORK: 'sepolia' | 'mainnet' = 
  (typeof window !== 'undefined' && localStorage.getItem('sblake_network') as 'sepolia' | 'mainnet') || 'sepolia';

export const setNetwork = (network: 'sepolia' | 'mainnet') => {
  CURRENT_NETWORK = network;
  if (typeof window !== 'undefined') {
    localStorage.setItem('sblake_network', network);
  }
};

export const getActiveRpcUrl = () => {
  return CURRENT_NETWORK === 'mainnet' ? ALCHEMY_MAINNET_URL : ALCHEMY_SEPOLIA_URL;
};

/**
 * Creates an RpcProvider that automatically sanitizes 'pending' block identifiers
 * to 'latest' so Alchemy v0_10 doesn't throw -32602 invalid param errors,
 * and intercepts rate limits (-32029) to automatically fail over to alternate RPCs.
 */
export const createSanitizedProvider = (nodeUrl: string = getActiveRpcUrl()): RpcProvider => {
  const p = new RpcProvider({ nodeUrl });
  if (p.channel) {
    const channelAny = p.channel as any;
    const origFetchEndpoint = channelAny.fetchEndpoint.bind(p.channel);
    channelAny.fetchEndpoint = async (method: any, params: any) => {
      if (params && typeof params === 'object') {
        if (params.block_id === 'pending') {
          params.block_id = 'latest';
        }
        if (params.block_identifier === 'pending') {
          params.block_identifier = 'latest';
        }
      }
      try {
        return await origFetchEndpoint(method, params);
      } catch (err: any) {
        // Automatic failover on OnFinality / rate limit errors
        if (
          err?.message?.includes('-32029') ||
          err?.message?.includes('Too Many Requests') ||
          err?.message?.includes('rate limit')
        ) {
          console.warn(`[Starknet RPC] Rate limit encountered on ${nodeUrl}, trying fallback...`);
          for (const fbUrl of FALLBACK_SEPOLIA_URLS) {
            if (fbUrl !== nodeUrl) {
              try {
                const fb = new RpcProvider({ nodeUrl: fbUrl });
                return await (fb.channel as any).fetchEndpoint(method, params);
              } catch {
                // keep checking fallbacks
              }
            }
          }
        }
        throw err;
      }
    };
  }
  return p;
};

// Global primary provider
export const provider = createSanitizedProvider(getActiveRpcUrl());

/**
 * Binds our sanitized provider & channel to a connected wallet account
 * to ensure wallet methods (declare, deployContract, execute) don't query
 * the wallet extension's default OnFinality RPC or send 'pending' block IDs.
 */
export const bindAccountToCustomProvider = (account: any, customProvider: RpcProvider = provider) => {
  if (!account) return account;
  const target = account.account || account;
  try {
    if (customProvider.channel) {
      target.channel = customProvider.channel;
    }
    target.provider = customProvider;
  } catch (e) {
    console.warn("[Starknet] Could not bind custom provider to account:", e);
  }
  return target;
};

// Configurable SBLAKE contract address (defaults to deployed contract or local override once set)
export let CONTRACT_ADDRESS = typeof window !== 'undefined' && localStorage.getItem('sblake_custom_contract')
  ? localStorage.getItem('sblake_custom_contract')!
  : "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

export const setCustomContractAddress = (addr: string) => {
  CONTRACT_ADDRESS = addr;
  if (typeof window !== 'undefined') {
    localStorage.setItem('sblake_custom_contract', addr);
  }
};

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

export interface TimelineStats {
  era: number;
  blockReward: string;
  totalMints: number;
  mintsInEra: number;
  mintsUntilHalving: number;
  totalSupply: string;
  maxSupply: string;
}

export const getChallenge = async (address: string): Promise<ChallengeData> => {
  if (CONTRACT_ADDRESS && !CONTRACT_ADDRESS.startsWith("0x0123456789")) {
    for (const nodeUrl of FALLBACK_SEPOLIA_URLS) {
      try {
        const activeProvider = createSanitizedProvider(nodeUrl);
        const contract = new Contract(sierraData.abi, CONTRACT_ADDRESS, activeProvider);
        const res: any = await contract.get_challenge(address, { 
          parseResponse: true, 
          blockIdentifier: 'latest' 
        });

        return {
          epoch: Number(res[0]),
          blockHash: '0x' + BigInt(res[1]).toString(16),
          difficulty: '0x' + BigInt(res[2]).toString(16),
          mintsToday: Number(res[3]),
        };
      } catch (err: any) {
        console.warn(`RPC call to ${nodeUrl} failed:`, err?.message || err);
      }
    }
  }

  // Pre-deployment / Responsive Fallback State
  return {
    epoch: 1,
    blockHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    difficulty: "0x00000fffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    mintsToday: 0,
  };
};

export const getTimelineStats = async (): Promise<TimelineStats> => {
  if (CONTRACT_ADDRESS && !CONTRACT_ADDRESS.startsWith("0x0123456789")) {
    for (const nodeUrl of FALLBACK_SEPOLIA_URLS) {
      try {
        const activeProvider = createSanitizedProvider(nodeUrl);
        const contract = new Contract(sierraData.abi, CONTRACT_ADDRESS, activeProvider);
        const res: any = await contract.get_timeline_stats({
          parseResponse: true,
          blockIdentifier: 'latest',
        });
        return {
          era: Number(res[0]),
          blockReward: (BigInt(res[1].toString()) / 10n ** 18n).toString(),
          totalMints: Number(res[2]),
          mintsInEra: Number(res[3]),
          mintsUntilHalving: Number(res[4]),
          totalSupply: (BigInt(res[5].toString()) / 10n ** 18n).toString(),
          maxSupply: (BigInt(res[6].toString()) / 10n ** 18n).toString(),
        };
      } catch (err: any) {
        console.warn(`[TimelineStats] Call failed on ${nodeUrl}:`, err?.message || err);
      }
    }
  }

  // Fallback defaults for Era 1
  return {
    era: 1,
    blockReward: "100",
    totalMints: 0,
    mintsInEra: 0,
    mintsUntilHalving: 100000,
    totalSupply: "0",
    maxSupply: "21000000",
  };
};

export const getSBlakeBalance = async (address: string): Promise<string> => {
  if (CONTRACT_ADDRESS && !CONTRACT_ADDRESS.startsWith("0x0123456789")) {
    for (const nodeUrl of FALLBACK_SEPOLIA_URLS) {
      try {
        const activeProvider = createSanitizedProvider(nodeUrl);
        const contract = new Contract(sierraData.abi, CONTRACT_ADDRESS, activeProvider);
        const bal: any = await contract.balance_of(address, { 
          parseResponse: true, 
          blockIdentifier: 'latest' 
        });
        return (BigInt(bal.toString()) / 10n ** 18n).toString();
      } catch {
        // Continue to fallback
      }
    }
  }
  return "0";
};

export const mintSBlake = async (
  account: any,
  nonce: string,
  shielded: boolean = false,
  brotherId?: string
) => {
  console.log(`[StarkBlake SDK] Submitting PoW solution. Shielded: ${shielded}, Nonce: ${nonce}`);
  const activeAcc = bindAccountToCustomProvider(account, provider);

  if (shielded) {
    const baseReward = 100n * 10n ** 18n;
    const shieldedReward = (baseReward * 115n) / 100n; // +15% emission boost
    const note = await createShieldedNote(activeAcc.address, shieldedReward);
    saveNoteLocally(note);

    if (activeAcc && activeAcc.execute && CONTRACT_ADDRESS && !CONTRACT_ADDRESS.startsWith("0x0123456789")) {
      const tx = await activeAcc.execute({
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

    return {
      transaction_hash: "0x" + Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join(''),
      commitment: note.commitment,
      note,
    };
  }

  // Standard Transparent Minting
  if (activeAcc && activeAcc.execute && CONTRACT_ADDRESS && !CONTRACT_ADDRESS.startsWith("0x0123456789")) {
    const tx = await activeAcc.execute({
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

export const upgradeContract = async (account: any, newClassHash: string) => {
  const activeAcc = bindAccountToCustomProvider(account, provider);
  if (!activeAcc || !activeAcc.execute) {
    throw new Error("Wallet not connected");
  }
  return await activeAcc.execute({
    contractAddress: CONTRACT_ADDRESS,
    entrypoint: "upgrade",
    calldata: CallData.compile({
      new_class_hash: newClassHash,
    }),
  });
};
