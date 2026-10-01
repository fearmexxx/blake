import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Activity, Cpu, Clock, Trophy, AlertTriangle, ShieldCheck, Eye, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getChallenge, mintSBlake } from '../utils/starknet';
import { getFingerprint } from '../utils/fingerprint';
import { deriveViewingKey, getLocalNotes } from '../utils/privacy';

interface MinerProps {
  address: string;
  account: any;
}

const Miner: React.FC<MinerProps> = ({ address, account }) => {
  const [isMining, setIsMining] = useState(false);
  const [hashrate, setHashrate] = useState(0);
  const [totalHashes, setTotalHashes] = useState(0);
  const [threads, setThreads] = useState(navigator.hardwareConcurrency || 4);
  const [challenge, setChallenge] = useState<any>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [brotherId, setBrotherId] = useState<string | null>(null);
  const [lastMint, setLastMint] = useState<string | null>(null);
  const [lastCommitment, setLastCommitment] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // STRK20 Privacy Mode state
  const [isShieldedMode, setIsShieldedMode] = useState<boolean>(true);
  const [viewingKey, setViewingKey] = useState<string | null>(null);
  const [shieldedNotesCount, setShieldedNotesCount] = useState<number>(0);

  const workersRef = useRef<Worker[]>([]);
  const hashrateRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    // Fetch fingerprint & viewing key on mount
    getFingerprint().then(setFingerprint);
    deriveViewingKey(address).then(setViewingKey);
    setShieldedNotesCount(getLocalNotes().length);
    fetchChallenge();

    return () => stopMining();
  }, [address]);

  const fetchChallenge = async () => {
    try {
      const data = await getChallenge(address);
      setChallenge(data);
    } catch {
      setError("Failed to fetch challenge from Starknet.");
    }
  };

  const startMining = () => {
    if (!challenge) return;
    setError(null);
    setIsMining(true);
    startTimeRef.current = Date.now();
    
    const numThreads = threads;
    const workers: Worker[] = [];
    
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
        }
      };

      worker.postMessage({
        wallet: address,
        epoch: challenge.epoch,
        blockHash: challenge.blockHash,
        difficulty: challenge.difficulty,
        startNonce: i.toString(),
        step: numThreads.toString(),
        brotherId: brotherId
      });
      
      workers.push(worker);
    }
    
    workersRef.current = workers;

    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      if (elapsed > 0) {
        setHashrate(Math.floor(hashrateRef.current / 1));
        hashrateRef.current = 0;
      }
    }, 1000);

    return () => clearInterval(interval);
  };

  const stopMining = () => {
    workersRef.current.forEach(w => w.terminate());
    workersRef.current = [];
    setIsMining(false);
    setHashrate(0);
  };

  const handleSuccess = async (nonce: string, _hash: string) => {
    stopMining();
    setIsSubmitting(true);
    try {
      const res = await mintSBlake(account, nonce, isShieldedMode, brotherId || undefined);
      setLastMint(res.transaction_hash);
      if (res.commitment) {
        setLastCommitment(res.commitment);
        setShieldedNotesCount(getLocalNotes().length);
      }
      await fetchChallenge();
    } catch {
      setError("Transaction failed. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Privacy Mode Banner */}
      <div className="glass-panel p-4 flex flex-col sm:flex-row items-center justify-between gap-4 border border-[#00f3ff]/30 bg-[#00f3ff]/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-sm bg-[#00f3ff]/10 border border-[#00f3ff]/40 flex items-center justify-center text-[#00f3ff]">
            <ShieldCheck size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-wide text-white">STRK20 PRIVACY POOL</span>
              <span className="bg-[#00ff41]/20 text-[#00ff41] text-[10px] px-2 py-0.5 rounded font-mono font-bold flex items-center gap-1">
                <Sparkles size={10} /> +15% YIELD
              </span>
            </div>
            <p className="text-xs text-gray-400">
              {isShieldedMode 
                ? "Mining directly into encrypted note commitments. Zero on-chain trace." 
                : "Standard public minting. Tokens credited to public wallet address."}
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsShieldedMode(!isShieldedMode)}
          className={`px-4 py-2 text-xs font-bold font-mono tracking-wider rounded transition-all ${
            isShieldedMode 
              ? 'bg-[#00f3ff] text-black shadow-[0_0_15px_rgba(0,243,255,0.4)]' 
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
        >
          {isShieldedMode ? "SHIELDED MINING: ACTIVE" : "TRANSPARENT MINING"}
        </button>
      </div>

      {/* Miner Dashboard */}
      <div className="glass-panel p-8 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-widest font-mono">
              <Activity size={14} />
              Miner Engine
            </div>
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${isMining ? 'bg-[#00ff41] animate-pulse' : 'bg-red-500'}`} />
              <span className="text-2xl font-black">{isMining ? 'MINING ACTIVE' : 'MINER STOPPED'}</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center bg-black rounded-sm border border-gray-800">
              <div className="px-4 py-2 border-r border-gray-800 flex items-center gap-2">
                <Cpu size={16} className="text-gray-500" />
                <input 
                  type="number" 
                  value={threads} 
                  min={1}
                  max={32}
                  onChange={(e) => setThreads(Math.max(1, parseInt(e.target.value) || 1))}
                  className="bg-transparent w-8 text-center outline-none font-bold"
                  disabled={isMining}
                />
              </div>
              <button 
                onClick={isMining ? stopMining : startMining}
                disabled={isSubmitting}
                className={`px-8 py-3 font-bold transition-all flex items-center gap-2 ${
                  isMining 
                    ? 'text-red-500 hover:bg-red-500/10' 
                    : 'text-[#00ff41] hover:bg-[#00ff41]/10'
                }`}
              >
                {isMining ? <><Square size={18} fill="currentColor" /> STOP</> : <><Play size={18} fill="currentColor" /> START</>}
              </button>
            </div>
          </div>
        </div>

        {/* Live Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-12 pt-8 border-t border-gray-800">
          <Metric label="Hashrate" value={`${(hashrate / 1000).toFixed(2)} KH/s`} subValue="BLAKE2s (Multi-core)" />
          <Metric label="Total Hashes" value={totalHashes.toLocaleString()} subValue="THIS SESSION" />
          <Metric label="Mint Yield" value={isShieldedMode ? "115 SBLAKE" : "100 SBLAKE"} subValue={isShieldedMode ? "+15% SHIELDED" : "ERA 1 BASE"} />
          <Metric label="Daily Cap" value="0 / 10" subValue={brotherId ? "BROTHER 2X ACTIVE" : "STANDARD"} />
        </div>

        {/* Progress Bar */}
        {isMining && (
          <motion.div 
            className="absolute bottom-0 left-0 h-1 bg-[#00ff41]"
            initial={{ width: 0 }}
            animate={{ width: "100%" }}
            transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          />
        )}
      </div>

      {/* Notifications & Success Telemetry */}
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
            className="bg-[#00ff41]/10 border border-[#00ff41]/20 p-4 rounded text-[#00ff41] space-y-2 text-sm"
          >
            <div className="flex items-center gap-2 font-bold">
              <Trophy size={18} />
              <span>Successfully minted block solution! Tx: <a href={`https://sepolia.starkscan.co/tx/${lastMint}`} target="_blank" rel="noreferrer" className="underline">{lastMint.slice(0, 12)}...</a></span>
            </div>
            {lastCommitment && (
              <div className="text-xs font-mono text-[#00f3ff] break-all bg-black/40 p-2 rounded border border-[#00f3ff]/20">
                🔒 STRK20 Shielded Commitment: {lastCommitment}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

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
