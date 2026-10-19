import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Square, 
  Activity, 
  Cpu, 
  Clock, 
  Trophy, 
  AlertTriangle, 
  ShieldCheck, 
  Eye, 
  Sparkles,
  Layers,
  Calendar,
  Flame,
  TrendingUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getChallenge,
  mintSBlake,
  getTimelineStats,
  TimelineStats,
  unshieldSBlake,
  burnForUtility,
  getSBlakeBalance,
  CONTRACT_ADDRESS,
} from '../utils/starknet';
import { getFingerprint } from '../utils/fingerprint';
import {
  deriveViewingKey,
  getLocalNotes,
  computeNullifier,
  markNoteSpent,
  seedBetaMaturedNote,
  StoredShieldedNote,
} from '../utils/privacy';

interface MinerProps {
  address: string;
  account: any;
}

const DIFFICULTY_PRESETS: Record<'fast' | 'standard' | 'hard', { label: string; targetHex: string; avgHashes: string }> = {
  fast: {
    label: '16-Bit Fast Verify (~65k hashes / 1–3s)',
    targetHex: '0x0000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    avgHashes: '~65,536',
  },
  standard: {
    label: '20-Bit Standard Beta (~1M hashes / 5–15s)',
    targetHex: '0x00000fffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    avgHashes: '~1,048,576',
  },
  hard: {
    label: '24-Bit High Diff (~16.7M hashes / 1–3m)',
    targetHex: '0x000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    avgHashes: '~16,777,216',
  },
};

const Miner: React.FC<MinerProps> = ({ address, account }) => {
  const [isMining, setIsMining] = useState(false);
  const [hashrate, setHashrate] = useState(0);
  const [totalHashes, setTotalHashes] = useState(0);
  const [threads, setThreads] = useState(navigator.hardwareConcurrency || 4);
  const [difficultyPreset, setDifficultyPreset] = useState<'fast' | 'standard' | 'hard'>('standard');
  const [challenge, setChallenge] = useState<any>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [brotherId, setBrotherId] = useState<string | null>(null);
  const [lastMint, setLastMint] = useState<string | null>(null);
  const [lastCommitment, setLastCommitment] = useState<string | null>(null);
  const [lastWinningNonce, setLastWinningNonce] = useState<string | null>(null);
  const [lastWinningHash, setLastWinningHash] = useState<string | null>(null);
  const [lastMintOnChain, setLastMintOnChain] = useState<boolean>(false);
  const [blocksMinedSession, setBlocksMinedSession] = useState<number>(0);
  const [bestHashSoFar, setBestHashSoFar] = useState<string | null>(null);
  const [publicBalance, setPublicBalance] = useState<string>('0');
  const [shieldedBalanceTotal, setShieldedBalanceTotal] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // STRK20 Privacy Mode state
  const [isShieldedMode, setIsShieldedMode] = useState<boolean>(true);
  const [viewingKey, setViewingKey] = useState<string | null>(null);
  const [shieldedNotesCount, setShieldedNotesCount] = useState<number>(0);
  const [localNotes, setLocalNotes] = useState<StoredShieldedNote[]>([]);
  const [vaultStatus, setVaultStatus] = useState<string | null>(null);

  // On-Chain Mining Timeline State (Draft 1.1: Era 1 = 10 SBLAKE, 900k mint interval)
  const [timeline, setTimeline] = useState<TimelineStats>({
    era: 1,
    blockReward: "10",
    totalMints: 0,
    mintsInEra: 0,
    mintsUntilHalving: 900000,
    totalSupply: "0",
    maxSupply: "21000000",
  });

  const workersRef = useRef<Worker[]>([]);
  const intervalRef = useRef<any>(null);
  const hashrateRef = useRef<number>(0);
  const bestHashBigRef = useRef<bigint | null>(null);

  const syncVaultNotes = () => {
    const notes = getLocalNotes().filter((n) => !n.spent);
    setLocalNotes(notes);
    setShieldedNotesCount(notes.length);
    const totalShielded = notes.reduce((acc, n) => {
      return acc + Number(BigInt(n.amount) / (10n ** 16n)) / 100;
    }, 0);
    setShieldedBalanceTotal(totalShielded);
  };

  useEffect(() => {
    // Fetch fingerprint & viewing key on mount
    getFingerprint().then(setFingerprint);
    deriveViewingKey(address).then(setViewingKey);
    syncVaultNotes();
    fetchData();

    return () => stopMining();
  }, [address]);

  const handleSeedDemoNote = async () => {
    await seedBetaMaturedNote(address);
    syncVaultNotes();
    setVaultStatus("Seeded a 7-day matured STRK20 note (250 SBLAKE) — 50% Mint Fee Discount unlocked!");
  };

  const handleUnshieldNote = async (note: StoredShieldedNote) => {
    setVaultStatus(null);
    try {
      const nullifier = await computeNullifier(note.commitment, note.salt);
      const res = await unshieldSBlake(account, nullifier, address, note.amount);
      markNoteSpent(note.commitment);
      syncVaultNotes();
      setVaultStatus(`Unshielded note to wallet (0.25% deflationary burn applied). Tx: ${res.transaction_hash.slice(0, 12)}...`);
    } catch (err: any) {
      setError(err?.message || "Failed to unshield STRK20 note.");
    }
  };

  const handleUtilityBurn = async (amount: number, utilityLabel: string) => {
    setVaultStatus(null);
    try {
      const res = await burnForUtility(account, amount, utilityLabel);
      if (utilityLabel === 'OVERCLOCK_2X') {
        setBrotherId('OVERCLOCK_BOOST');
      }
      setVaultStatus(`Burned ${amount} SBLAKE for ${utilityLabel}! Tx: ${res.transaction_hash.slice(0, 12)}...`);
    } catch (err: any) {
      setError(err?.message || "Utility burn failed.");
    }
  };

  const fetchData = async () => {
    try {
      const [challengeData, timelineData, pubBal] = await Promise.all([
        getChallenge(address),
        getTimelineStats(),
        getSBlakeBalance(address),
      ]);
      setChallenge(challengeData);
      setTimeline(timelineData);
      setPublicBalance(pubBal);
    } catch {
      setError("Failed to fetch contract challenge & timeline from Starknet.");
    }
  };

  const activeTargetDifficulty = DIFFICULTY_PRESETS[difficultyPreset].targetHex;

  const startMining = () => {
    if (!challenge) return;
    setError(null);
    setIsMining(true);
    hashrateRef.current = 0;
    bestHashBigRef.current = null;
    setBestHashSoFar(null);
    
    const numThreads = threads;
    const workers: Worker[] = [];
    // Add random session offset so repeated runs don't re-hash the exact same nonces
    const randomOffset = BigInt(Math.floor(Math.random() * 100000000));
    
    for (let i = 0; i < numThreads; i++) {
      const worker = new Worker(new URL('../workers/miner.worker.ts', import.meta.url), {
        type: 'module'
      });
      
      worker.onmessage = (e) => {
        if (e.data.type === 'SUCCESS') {
          handleSuccess(e.data.nonce, e.data.hash);
        } else if (e.data.type === 'PROGRESS') {
          hashrateRef.current += e.data.iterations;
          setTotalHashes(prev => prev + e.data.iterations);
          if (e.data.bestHash) {
            const candidateBig = BigInt(e.data.bestHash);
            if (bestHashBigRef.current === null || candidateBig < bestHashBigRef.current) {
              bestHashBigRef.current = candidateBig;
              setBestHashSoFar(e.data.bestHash);
            }
          }
        }
      };

      worker.postMessage({
        wallet: address,
        epoch: challenge.epoch,
        blockHash: challenge.blockHash,
        difficulty: activeTargetDifficulty,
        startNonce: (randomOffset + BigInt(i)).toString(),
        step: numThreads.toString(),
        brotherId: brotherId
      });
      
      workers.push(worker);
    }
    
    workersRef.current = workers;

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setHashrate(hashrateRef.current);
      hashrateRef.current = 0;
    }, 1000);
  };

  const stopMining = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    workersRef.current.forEach(w => w.terminate());
    workersRef.current = [];
    setIsMining(false);
    setHashrate(0);
  };

  const handleSuccess = async (nonce: string, winningHash: string) => {
    stopMining();
    setLastWinningNonce(nonce);
    setLastWinningHash(winningHash);
    setBestHashSoFar(winningHash);
    setIsSubmitting(true);
    try {
      const res: any = await mintSBlake(account, nonce, isShieldedMode, brotherId || undefined);
      setLastMint(res.transaction_hash);
      setLastMintOnChain(Boolean(res.isOnChain));
      setBlocksMinedSession((prev) => prev + 1);
      if (res.commitment) {
        setLastCommitment(res.commitment);
      }
      syncVaultNotes();
      await fetchData();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to submit PoW solution to Starknet.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const eraProgressPercent = Math.min(
    100,
    Math.max(0, ((timeline.mintsInEra) / (timeline.mintsInEra + timeline.mintsUntilHalving || 900000)) * 100)
  );

  const isLiveSepoliaContract = CONTRACT_ADDRESS && !CONTRACT_ADDRESS.startsWith("0x0123456789");

  return (
    <div className="space-y-6">
      {/* Mining Control Core Card */}
      <div className="glass-panel p-8 relative overflow-hidden border border-[#00ff41]/20">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-3 w-3 relative">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isMining ? 'bg-[#00ff41]' : 'bg-gray-500'}`} />
                <span className={`relative inline-flex rounded-full h-3 w-3 ${isMining ? 'bg-[#00ff41]' : 'bg-gray-500'}`} />
              </span>
              <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                CORE MINER
                <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-gray-300 font-mono">
                  ERA {timeline.era}
                </span>
              </h2>
            </div>
            <p className="text-gray-400 text-sm mt-1">Blake2s Cairo-compatible multi-threaded hashing worker</p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* STRK20 Privacy Switch */}
            <button
              onClick={() => setIsShieldedMode(!isShieldedMode)}
              className={`px-4 py-2 rounded-sm border text-xs font-bold font-mono transition-all flex items-center gap-2 ${
                isShieldedMode
                  ? 'bg-[#00f3ff]/10 border-[#00f3ff] text-[#00f3ff] shadow-[0_0_15px_rgba(0,243,255,0.2)]'
                  : 'bg-black/40 border-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              <Sparkles size={14} />
              {isShieldedMode ? "STRK20 SHIELDED (+15%)" : "TRANSPARENT MINT"}
            </button>

            {/* Threads Selector */}
            <div className="flex items-center gap-2 bg-black/40 border border-gray-800 px-3 py-2 rounded-sm">
              <Cpu size={16} className="text-gray-400" />
              <span className="text-xs text-gray-400 font-mono">THREADS:</span>
              <select 
                value={threads} 
                onChange={(e) => setThreads(Number(e.target.value))}
                disabled={isMining}
                className="bg-transparent text-sm font-mono text-white outline-none cursor-pointer"
              >
                {[1, 2, 4, 8, 16, 32].map(t => (
                  <option key={t} value={t} className="bg-[#111]">{t}</option>
                ))}
              </select>
            </div>

            {/* Start / Stop Trigger */}
            <button
              onClick={isMining ? stopMining : startMining}
              disabled={isSubmitting}
              className={`w-full md:w-auto px-8 py-3 rounded-sm font-black text-sm tracking-wider flex items-center justify-center gap-2 transition-all ${
                isMining 
                  ? 'bg-red-500 hover:bg-red-600 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)]' 
                  : 'bg-[#00ff41] hover:bg-[#00cc33] text-black shadow-[0_0_20px_rgba(0,255,65,0.4)]'
              }`}
            >
              {isSubmitting ? (
                <>SUBMITTING TX...</>
              ) : isMining ? (
                <><Square size={16} fill="currentColor" /> STOP MINING</>
              ) : (
                <><Play size={16} fill="currentColor" /> START MINING</>
              )}
            </button>
          </div>
        </div>

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-8 pt-6 border-t border-gray-800">
          <Metric label="Hashrate" value={`${(hashrate / 1000).toFixed(2)} KH/s`} subValue="Multi-core BLAKE2s" />
          <Metric label="Total Hashes" value={totalHashes.toLocaleString()} subValue="Real Session Hashes" />
          <Metric 
            label="Your Mined SBLAKE" 
            value={`${(shieldedBalanceTotal + Number(publicBalance)).toFixed(2)} SBLAKE`} 
            subValue={`🔒 ${shieldedBalanceTotal.toFixed(1)} Shielded | 💳 ${publicBalance} Public`} 
          />
          <Metric
            label="Session Blocks Found"
            value={`${blocksMinedSession} Blocks`}
            subValue={`+${isShieldedMode ? '11.5' : '10'} SBLAKE / Block`}
          />
        </div>

        {/* Live Proof-of-Work Hash Inspector & Difficulty Selector */}
        <div className="mt-6 pt-5 border-t border-gray-800/80 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="text-xs font-mono font-bold text-[#00f3ff] uppercase flex items-center gap-2">
              <Activity size={14} className={isMining ? 'animate-pulse text-[#00ff41]' : 'text-[#00f3ff]'} />
              Live Proof-of-Work Hash Verification (Hash &lt; Target)
            </div>

            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-gray-400">PoW Target Difficulty:</span>
              <select
                value={difficultyPreset}
                onChange={(e) => setDifficultyPreset(e.target.value as 'fast' | 'standard' | 'hard')}
                disabled={isMining}
                className="bg-black/80 border border-gray-700 text-[#00ff41] px-2.5 py-1 rounded text-xs font-mono outline-none cursor-pointer"
              >
                <option value="fast">⚡ 16-Bit Fast Verify (~65k hashes / 1–3 sec)</option>
                <option value="standard">🛡️ 20-Bit Standard Beta (~1M hashes / 5–15 sec)</option>
                <option value="hard">🔥 24-Bit Hard (~16.7M hashes / 1–3 min)</option>
              </select>
            </div>
          </div>

          <div className="bg-black/80 border border-gray-800 p-3.5 rounded-sm space-y-2 font-mono text-[11px]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-gray-400 shrink-0">Target Threshold:</span>
              <span className="text-yellow-400 break-all">{activeTargetDifficulty}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-gray-400 shrink-0">Best Hash Found:</span>
              <span className="text-[#00ff41] break-all">
                {bestHashSoFar || '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff (Click START MINING)'}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-gray-800/80 text-[10px] text-gray-400">
              <span>
                Expected Hashes per Block: <strong className="text-white">{DIFFICULTY_PRESETS[difficultyPreset].avgHashes}</strong>
              </span>
              <span>
                Execution Mode:{' '}
                <strong className={isLiveSepoliaContract ? 'text-[#00ff41]' : 'text-[#00f3ff]'}>
                  {isLiveSepoliaContract
                    ? `Live Sepolia Contract (${CONTRACT_ADDRESS.slice(0, 10)}...)`
                    : 'Local STRK20 Safe + Simulated Mint (Deploy Contract in Status Tab for On-Chain Tx)'}
                </strong>
              </span>
            </div>
          </div>
        </div>

        {/* Active Mining Pulse */}
        {isMining && (
          <motion.div 
            className="absolute bottom-0 left-0 h-1 bg-[#00ff41]"
            initial={{ width: 0 }}
            animate={{ width: "100%" }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          />
        )}
      </div>

      {/* Notifications & Mathematical Proof Verification Receipt */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-red-500/10 border border-red-500/20 p-4 rounded text-red-400 flex items-center gap-3 text-sm"
          >
            <AlertTriangle size={18} />
            {error}
          </motion.div>
        )}
        
        {lastMint && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#00ff41]/10 border border-[#00ff41]/40 p-5 rounded-sm text-[#00ff41] space-y-3 text-xs font-mono"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#00ff41]/20 pb-2.5">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Trophy size={18} />
                <span>
                  BLOCK MINED! +{isShieldedMode ? '11.50' : '10.00'} SBLAKE CREDITED ({isShieldedMode ? 'STRK20 Shielded Vault' : 'Public Balance'})
                </span>
              </div>
              <span className="px-2 py-0.5 rounded bg-[#00ff41]/20 text-[#00ff41] text-[10px] font-bold">
                PoW HASH &lt; TARGET VERIFIED ✓
              </span>
            </div>

            <div className="space-y-1.5 text-[11px] bg-black/60 p-3 rounded border border-gray-800 text-gray-300">
              <div>
                <span className="text-gray-500">Winning Nonce: </span>
                <strong className="text-white">{lastWinningNonce}</strong>
              </div>
              <div className="break-all">
                <span className="text-gray-500">Winning BLAKE2s Hash: </span>
                <strong className="text-[#00ff41]">{lastWinningHash}</strong>
              </div>
              <div className="break-all">
                <span className="text-gray-500">Target Threshold:     </span>
                <span className="text-yellow-400">{activeTargetDifficulty}</span>
              </div>
              {lastCommitment && (
                <div className="break-all pt-1 text-[#00f3ff]">
                  🔒 STRK20 Shielded Note Commitment Saved in Vault: <strong>{lastCommitment}</strong>
                </div>
              )}
              <div className="pt-1 flex flex-wrap items-center justify-between gap-2 border-t border-gray-800/80">
                <span>
                  Settlement:{' '}
                  <strong className="text-white">
                    {lastMintOnChain
                      ? 'Submitted On-Chain to Starknet Sepolia'
                      : 'Credited to Local STRK20 Vault (Deploy Sepolia Contract in Status Tab for Live Starkscan Tx)'}
                  </strong>
                </span>
                {lastMintOnChain && (
                  <a
                    href={`https://sepolia.starkscan.co/tx/${lastMint}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#00f3ff] underline font-bold"
                  >
                    View Tx on Starkscan ({lastMint.slice(0, 10)}...) &rarr;
                  </a>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reworked On-Chain Mining Timeline Card */}
      <div className="glass-panel p-6 border border-gray-800 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-800 pb-4">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-[#00f3ff]" />
            <h3 className="font-bold text-sm text-white uppercase tracking-wider">
              On-Chain Mining Timeline & Halving Schedule (Draft 1.1)
            </h3>
          </div>
          <span className="text-xs font-mono text-gray-400 flex items-center gap-1.5">
            <TrendingUp size={14} className="text-[#00ff41]" />
            Halving Cadence: <strong className="text-white">Every 900,000 Mints (~10–14 Mos)</strong>
          </span>
        </div>

        {/* Halving Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-gray-400">
              Era {timeline.era} Progress ({timeline.mintsInEra.toLocaleString()} mints)
            </span>
            <span className="text-[#00f3ff] font-bold">
              {timeline.mintsUntilHalving.toLocaleString()} mints until Era {timeline.era + 1} Halving
            </span>
          </div>
          <div className="w-full bg-black/60 h-2.5 rounded-full overflow-hidden border border-gray-800">
            <motion.div 
              className="bg-gradient-to-r from-[#00ff41] to-[#00f3ff] h-full"
              style={{ width: `${Math.max(2, eraProgressPercent)}%` }}
            />
          </div>
        </div>

        {/* Multi-Era Schedule Breakdown */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className={`p-3 rounded border text-xs font-mono space-y-1 ${timeline.era === 1 ? 'border-[#00ff41] bg-[#00ff41]/5' : 'border-gray-800 bg-black/30'}`}>
            <div className="flex items-center justify-between text-[11px] text-gray-400">
              <span>ERA 1</span>
              {timeline.era === 1 && <span className="text-[#00ff41] font-bold">CURRENT</span>}
            </div>
            <div className="text-base font-black text-white">10 SBLAKE</div>
            <div className="text-[10px] text-gray-500">0 – 900k Mints (~9M)</div>
          </div>

          <div className={`p-3 rounded border text-xs font-mono space-y-1 ${timeline.era === 2 ? 'border-[#00ff41] bg-[#00ff41]/5' : 'border-gray-800 bg-black/30'}`}>
            <div className="flex items-center justify-between text-[11px] text-gray-400">
              <span>ERA 2</span>
              {timeline.era === 2 && <span className="text-[#00ff41] font-bold">CURRENT</span>}
            </div>
            <div className="text-base font-black text-white">5 SBLAKE</div>
            <div className="text-[10px] text-gray-500">900k – 1.8M (~4.5M)</div>
          </div>

          <div className={`p-3 rounded border text-xs font-mono space-y-1 ${timeline.era === 3 ? 'border-[#00ff41] bg-[#00ff41]/5' : 'border-gray-800 bg-black/30'}`}>
            <div className="flex items-center justify-between text-[11px] text-gray-400">
              <span>ERA 3</span>
              {timeline.era === 3 && <span className="text-[#00ff41] font-bold">CURRENT</span>}
            </div>
            <div className="text-base font-black text-white">2.5 SBLAKE</div>
            <div className="text-[10px] text-gray-500">1.8M – 2.7M (~2.25M)</div>
          </div>

          <div className={`p-3 rounded border text-xs font-mono space-y-1 ${timeline.era >= 4 ? 'border-[#00ff41] bg-[#00ff41]/5' : 'border-gray-800 bg-black/30'}`}>
            <div className="flex items-center justify-between text-[11px] text-gray-400">
              <span>ERA 4+</span>
              {timeline.era >= 4 && <span className="text-[#00ff41] font-bold">CURRENT</span>}
            </div>
            <div className="text-base font-black text-white">1.25 SBLAKE</div>
            <div className="text-[10px] text-gray-500">Halvings to 0.3125</div>
          </div>
        </div>

        {/* Global Supply Status */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center text-xs text-gray-400 pt-1 font-mono gap-2">
          <div>
            Total Circulating: <strong className="text-white">{Number(timeline.totalSupply).toLocaleString()} SBLAKE</strong>
          </div>
          <div>
            Max Supply Cap: <strong className="text-[#00f3ff]">21,000,000 SBLAKE</strong> (Hard Capped)
          </div>
        </div>
      </div>

      {/* Privacy & Anti-Sybil Metadata Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-panel p-6 space-y-4">
          <h4 className="text-xs font-mono text-gray-500 uppercase tracking-widest flex items-center gap-2">
            <Clock size={14} />
            Challenge Metadata
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Epoch</span>
              <span className="font-mono">{challenge?.epoch || '1'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Target Block</span>
              <span className="font-mono text-[10px]">{challenge?.blockHash?.slice(0, 20) || '0x123456...'}...</span>
            </div>
          </div>
        </div>
        
        <div className="glass-panel p-6 space-y-4">
          <h4 className="text-xs font-mono text-gray-500 uppercase tracking-widest flex items-center gap-2">
            <ShieldCheck size={14} />
            Hardware Binding
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Device Hash</span>
              <span className="font-mono text-[10px] text-[#00f3ff]">{fingerprint?.slice(0, 18) || 'CALCULATING...'}...</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Sybil Protection</span>
              <span className="text-[#00ff41] text-[10px] font-bold">ACTIVE</span>
            </div>
          </div>
        </div>

        <div className="glass-panel p-6 space-y-4">
          <h4 className="text-xs font-mono text-gray-500 uppercase tracking-widest flex items-center gap-2 text-[#00f3ff]">
            <Eye size={14} />
            STRK20 Viewing Key
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Auditable VK</span>
              <span className="font-mono text-[10px] text-gray-300">{viewingKey ? `${viewingKey.slice(0, 16)}...` : 'DERIVING...'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Shielded Notes</span>
              <span className="font-mono text-[10px] text-[#00ff41] font-bold">{shieldedNotesCount} In Safe</span>
            </div>
          </div>
        </div>
      </div>

      {/* STRK20 Dark Pool Note Vault & Utility Burn Sinks */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: STRK20 Note Vault (7-Day Maturity for 50% Fee Discount) */}
        <div className="lg:col-span-7 glass-panel p-6 border border-[#00f3ff]/30 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Layers size={16} className="text-[#00f3ff]" />
                STRK20 Shielded Note Vault (7-Day Maturity Tracker)
              </h3>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Notes held &ge;7 days (`604,800s`) unlock the <strong>50% Protocol Mint Fee Discount</strong> (`0.25–0.5 STRK`) and unlinkable BlakeVPN spending.
              </p>
            </div>
            <button
              onClick={handleSeedDemoNote}
              className="px-3 py-1.5 bg-[#00f3ff]/15 hover:bg-[#00f3ff]/25 border border-[#00f3ff]/40 rounded text-[11px] font-mono font-bold text-[#00f3ff] shrink-0"
            >
              + Seed 7d Matured Note
            </button>
          </div>

          {localNotes.length === 0 ? (
            <div className="p-6 text-center bg-black/50 border border-dashed border-gray-800 rounded text-xs font-mono text-gray-500">
              No active STRK20 shielded notes in local vault yet. Mine in Shielded Mode (+15%) or click "+ Seed 7d Matured Note" to test.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {localNotes.map((n) => {
                const ageSeconds = Math.floor((Date.now() - n.timestamp) / 1000);
                const matured = ageSeconds >= 604800;
                const progressPct = Math.min(100, Math.round((ageSeconds / 604800) * 100));
                const sblakeAmt = (BigInt(n.amount) / 10n ** 18n).toString();
                return (
                  <div
                    key={n.commitment}
                    className="p-3 bg-black/70 border border-gray-800 rounded flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-bold">{sblakeAmt} SBLAKE</span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                            matured
                              ? 'bg-[#00ff41]/15 text-[#00ff41]'
                              : 'bg-yellow-500/15 text-yellow-400'
                          }`}
                        >
                          {matured ? '7D MATURED (50% FEE DISC. ✓)' : `MATURING (${progressPct}%)`}
                        </span>
                      </div>
                      <div className="text-[10px] text-gray-500">
                        Commitment: {n.commitment.slice(0, 18)}...{n.commitment.slice(-8)}
                      </div>
                    </div>

                    <button
                      onClick={() => handleUnshieldNote(n)}
                      className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded text-[11px] font-bold transition-colors shrink-0"
                    >
                      Unshield (0.25% Burn)
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {vaultStatus && (
            <div className="p-2.5 bg-[#00ff41]/10 border border-[#00ff41]/30 rounded text-[11px] font-mono text-[#00ff41]">
              {vaultStatus}
            </div>
          )}
        </div>

        {/* Right: Consumption Utility Burn Sinks (Draft 1.1 Section 5) */}
        <div className="lg:col-span-5 glass-panel p-6 border border-red-500/25 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-800 pb-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Flame size={16} className="text-red-400" />
              Utility Consumption Burns
            </h3>
            <span className="text-[10px] font-mono bg-red-500/10 text-red-400 px-2 py-0.5 rounded font-bold">
              DEFLATIONARY SINKS
            </span>
          </div>

          <p className="text-xs text-gray-400 leading-relaxed">
            Burn `SBLAKE` on-chain (`burn_for_utility`) to unlock mining cap boosts or reserve unlinkable `.blake` Stealth IDs for BlakeVPN.
          </p>

          <div className="space-y-3">
            <div className="p-3.5 bg-black/70 border border-gray-800 rounded flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-white font-mono">2x Overclock Daily Cap Pass</div>
                <div className="text-[11px] text-gray-400">Doubles anti-Sybil daily limit from 10 to 20 mints/24h</div>
              </div>
              <button
                onClick={() => handleUtilityBurn(50, 'OVERCLOCK_2X')}
                className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 font-mono font-bold text-xs rounded shrink-0"
              >
                Burn 50 SB
              </button>
            </div>

            <div className="p-3.5 bg-black/70 border border-gray-800 rounded flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-white font-mono">.blake Stealth Relay Identity</div>
                <div className="text-[11px] text-gray-400">Permanent zero-knowledge routing alias for BlakeVPN</div>
              </div>
              <button
                onClick={() => handleUtilityBurn(150, 'STEALTH_BLAKE_ID')}
                className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 font-mono font-bold text-xs rounded shrink-0"
              >
                Burn 150 SB
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Metric = ({ label, value, subValue }: { label: string; value: string; subValue: string }) => (
  <div className="space-y-1">
    <div className="text-[10px] text-gray-500 tracking-widest uppercase font-mono">{label}</div>
    <div className="text-xl font-black text-white">{value}</div>
    <div className="text-[10px] text-gray-500 font-mono">{subValue}</div>
  </div>
);

export default Miner;
