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
  const channelAny = (p as any).channel;
  if (channelAny && typeof channelAny.fetchEndpoint === 'function') {
    const origFetchEndpoint = channelAny.fetchEndpoint.bind(channelAny);
    channelAny.fetchEndpoint = async (method: any, params: any) => {
      if (params && typeof params === 'object') {
        if (params.block_id === 'pending') {
          params.block_id = 'latest';
        }
        if (params.block_identifier === 'pending') {
          params.block_identifier = 'latest';
        }
        if (params.request && Array.isArray(params.request)) {
          for (const req of params.request) {
            if (req && req.resource_bounds && !req.resource_bounds.l1_data_gas) {
              req.resource_bounds.l1_data_gas = { max_amount: '0x0', max_price_per_unit: '0x0' };
            }
          }
        }
      }
      try {
        return await origFetchEndpoint(method, params);
      } catch (err: any) {
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
                return await ((fb as any).channel).fetchEndpoint(method, params);
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
 * to ensure wallet methods don't query OnFinality or send 'pending' block IDs.
 */
export const bindAccountToCustomProvider = (account: any, customProvider: RpcProvider = provider) => {
  if (!account) return account;
  const target = account.account || account;
  try {
    if ((customProvider as any).channel) {
      target.channel = (customProvider as any).channel;
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

export interface TimelineStats {
  era: number;
  blockReward: string;
  totalMints: number;
  mintsInEra: number;
  mintsUntilHalving: number;
  totalSupply: string;
  maxSupply: string;
}

export interface ProtocolMetrics {
  isBetaPhase: boolean;
  activeNodesCount: number;
  totalNodeCollateral: string;
  totalBurned: string;
  vpnSessionsCount: number;
  opsSharePct: number;
  buybackBurnPct: number;
  yieldSharePct: number;
}

const instantiateContract = (activeProvider: RpcProvider) => {
  return new Contract({
    abi: sierraData.abi,
    address: CONTRACT_ADDRESS,
    providerOrAccount: activeProvider,
  });
};

export const getChallenge = async (address: string): Promise<ChallengeData> => {
  if (CONTRACT_ADDRESS && !CONTRACT_ADDRESS.startsWith("0x0123456789")) {
    for (const nodeUrl of FALLBACK_SEPOLIA_URLS) {
      try {
        const activeProvider = createSanitizedProvider(nodeUrl);
        const contract: any = instantiateContract(activeProvider);
        const res: any = await contract.get_challenge(address, { 
          parseResponse: true, 
          blockIdentifier: 'latest' 
        });

        let rawDiffHex = BigInt(res[2]).toString(16);
        // Safeguard: if an older contract stored a 55-hex-char value (missing 4 trailing f's), pad to 59 f's (20-bit PoW = ~1M hashes)
        if (rawDiffHex.length === 55 && rawDiffHex.startsWith('fffff')) {
          rawDiffHex = rawDiffHex + 'ffff';
        }
        return {
          epoch: Number(res[0]),
          blockHash: '0x' + BigInt(res[1]).toString(16).padStart(64, '0'),
          difficulty: '0x' + rawDiffHex.padStart(64, '0'),
          mintsToday: Number(res[3]),
        };
      } catch (err: any) {
        console.warn(`RPC call to ${nodeUrl} failed:`, err?.message || err);
      }
    }
  }

  return {
    epoch: 1,
    blockHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    difficulty: "0x00000fffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    mintsToday: 0,
  };
};

export const getTimelineStats = async (): Promise<TimelineStats> => {
  if (CONTRACT_ADDRESS && !CONTRACT_ADDRESS.startsWith("0x0123456789")) {
    for (const nodeUrl of FALLBACK_SEPOLIA_URLS) {
      try {
        const activeProvider = createSanitizedProvider(nodeUrl);
        const contract: any = instantiateContract(activeProvider);
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

  // Draft 1.1 Fallback defaults (Era 1: 10 SBLAKE, 900,000 mint interval, 21M max supply)
  return {
    era: 1,
    blockReward: "10",
    totalMints: 0,
    mintsInEra: 0,
    mintsUntilHalving: 900000,
    totalSupply: "0",
    maxSupply: "21000000",
  };
};

export const getProtocolMetrics = async (): Promise<ProtocolMetrics> => {
  if (CONTRACT_ADDRESS && !CONTRACT_ADDRESS.startsWith("0x0123456789")) {
    for (const nodeUrl of FALLBACK_SEPOLIA_URLS) {
      try {
        const activeProvider = createSanitizedProvider(nodeUrl);
        const contract: any = instantiateContract(activeProvider);
        const res: any = await contract.get_protocol_metrics({
          parseResponse: true,
          blockIdentifier: 'latest',
        });
        return {
          isBetaPhase: Boolean(res[0]),
          activeNodesCount: Number(res[1]),
          totalNodeCollateral: (BigInt(res[2].toString()) / 10n ** 18n).toString(),
          totalBurned: (BigInt(res[3].toString()) / 10n ** 18n).toString(),
          vpnSessionsCount: Number(res[4]),
          opsSharePct: Number(res[5]) / 100,
          buybackBurnPct: Number(res[6]) / 100,
          yieldSharePct: Number(res[7]) / 100,
        };
      } catch (err: any) {
        console.warn(`[ProtocolMetrics] Call failed on ${nodeUrl}:`, err?.message || err);
      }
    }
  }

  // Draft 1.1 Beta Phase Baseline
  return {
    isBetaPhase: true,
    activeNodesCount: 18,
    totalNodeCollateral: "180000",
    totalBurned: "0",
    vpnSessionsCount: 64,
    opsSharePct: 60,
    buybackBurnPct: 25,
    yieldSharePct: 15,
  };
};

export const getSBlakeBalance = async (address: string): Promise<string> => {
  if (CONTRACT_ADDRESS && !CONTRACT_ADDRESS.startsWith("0x0123456789")) {
    for (const nodeUrl of FALLBACK_SEPOLIA_URLS) {
      try {
        const activeProvider = createSanitizedProvider(nodeUrl);
        const contract: any = instantiateContract(activeProvider);
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
  if (typeof window !== 'undefined') {
    return localStorage.getItem('sblake_sim_public_balance') || "0";
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
    // Draft 1.1: 10 SBLAKE Era 1 base + 15% STRK20 Shielded bonus = 11.5 SBLAKE
    const shieldedRewardWei = 115n * 10n ** 17n; // 11.5 * 10^18
    const note = await createShieldedNote(activeAcc?.address || "0x0", shieldedRewardWei);
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
      return { transaction_hash: tx.transaction_hash, commitment: note.commitment, note, isOnChain: true };
    }

    return {
      transaction_hash: "0x" + Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join(''),
      commitment: note.commitment,
      note,
      isOnChain: false,
    };
  }

  // Standard Transparent Minting (10 SBLAKE Era 1)
  if (activeAcc && activeAcc.execute && CONTRACT_ADDRESS && !CONTRACT_ADDRESS.startsWith("0x0123456789")) {
    const tx = await activeAcc.execute({
      contractAddress: CONTRACT_ADDRESS,
      entrypoint: "mint",
      calldata: CallData.compile({
        nonce: { low: BigInt(nonce) & 0xffffffffffffffffffffffffffffffffn, high: BigInt(nonce) >> 128n },
        brother_id: brotherId || "0",
      }),
    });
    return { transaction_hash: tx.transaction_hash, isOnChain: true };
  }

  // Track local simulated transparent balance when no Sepolia contract is linked yet
  const prevSim = Number(localStorage.getItem('sblake_sim_public_balance') || '0');
  localStorage.setItem('sblake_sim_public_balance', (prevSim + 10).toString());

  return {
    transaction_hash: "0x" + Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join(''),
    isOnChain: false,
  };
};

export const bondBlakeNode = async (
  account: any,
  region: string,
  subsidized: boolean = true
) => {
  const activeAcc = bindAccountToCustomProvider(account, provider);
  const regionFelt = "0x" + Array.from(new TextEncoder().encode(region)).map(b => b.toString(16).padStart(2, '0')).join('');

  if (activeAcc && activeAcc.execute && CONTRACT_ADDRESS && !CONTRACT_ADDRESS.startsWith("0x0123456789")) {
    const tx = await activeAcc.execute({
      contractAddress: CONTRACT_ADDRESS,
      entrypoint: "bond_blake_node",
      calldata: CallData.compile({
        region: regionFelt,
        subsidized: subsidized ? 1 : 0,
      }),
    });
    return { transaction_hash: tx.transaction_hash };
  }

  return {
    transaction_hash: "0x" + Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join(''),
  };
};

export const purchaseVpnPass = async (
  account: any,
  amountSblake: number,
  sessionPubkey: string,
  nullifier: string = "0"
) => {
  const activeAcc = bindAccountToCustomProvider(account, provider);
  const weiAmount = BigInt(amountSblake) * 10n ** 18n;

  if (activeAcc && activeAcc.execute && CONTRACT_ADDRESS && !CONTRACT_ADDRESS.startsWith("0x0123456789")) {
    const tx = await activeAcc.execute({
      contractAddress: CONTRACT_ADDRESS,
      entrypoint: "purchase_vpn_pass",
      calldata: CallData.compile({
        amount: { low: weiAmount & 0xffffffffffffffffffffffffffffffffn, high: weiAmount >> 128n },
        session_pubkey: sessionPubkey,
        nullifier: nullifier,
      }),
    });
    return { transaction_hash: tx.transaction_hash };
  }

  return {
    transaction_hash: "0x" + Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join(''),
  };
};

export const unshieldSBlake = async (
  account: any,
  nullifier: string,
  recipient: string,
  amountWeiStr: string
) => {
  const activeAcc = bindAccountToCustomProvider(account, provider);
  const weiAmount = BigInt(amountWeiStr);

  if (activeAcc && activeAcc.execute && CONTRACT_ADDRESS && !CONTRACT_ADDRESS.startsWith("0x0123456789")) {
    const tx = await activeAcc.execute({
      contractAddress: CONTRACT_ADDRESS,
      entrypoint: "unshield",
      calldata: CallData.compile({
        nullifier,
        recipient,
        amount: { low: weiAmount & 0xffffffffffffffffffffffffffffffffn, high: weiAmount >> 128n },
      }),
    });
    return { transaction_hash: tx.transaction_hash };
  }

  return {
    transaction_hash: "0x" + Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join(''),
  };
};

export const burnForUtility = async (
  account: any,
  amountSblake: number,
  utilityType: string
) => {
  const activeAcc = bindAccountToCustomProvider(account, provider);
  const weiAmount = BigInt(amountSblake) * 10n ** 18n;
  const utilFelt = "0x" + Array.from(new TextEncoder().encode(utilityType.slice(0, 30))).map(b => b.toString(16).padStart(2, '0')).join('');

  if (activeAcc && activeAcc.execute && CONTRACT_ADDRESS && !CONTRACT_ADDRESS.startsWith("0x0123456789")) {
    const tx = await activeAcc.execute({
      contractAddress: CONTRACT_ADDRESS,
      entrypoint: "burn_for_utility",
      calldata: CallData.compile({
        amount: { low: weiAmount & 0xffffffffffffffffffffffffffffffffn, high: weiAmount >> 128n },
        utility_type: utilFelt,
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

