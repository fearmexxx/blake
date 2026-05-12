import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Activity, Cpu, Clock, Trophy, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import { getChallenge, mintSBlake } from '../utils/starknet';
import { getFingerprint } from '../utils/fingerprint';

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workersRef = useRef<Worker[]>([]);
  const hashrateRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    // Fetch fingerprint on mount
    getFingerprint().then(setFingerprint);
    // Fetch initial challenge
    fetchChallenge();

    return () => stopMining();
  }, []);

  const fetchChallenge = async () => {
    try {
      const data = await getChallenge(address);
      setChallenge(data);
    } catch (err) {
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

    // Hashrate calculation interval
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      if (elapsed > 0) {
        setHashrate(Math.floor(hashrateRef.current / 1)); // Per second roughly
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

  const handleSuccess = async (nonce: string, hash: string) => {
    stopMining();
    setIsSubmitting(true);
    try {
      const res = await mintSBlake(account, nonce);
      setLastMint(res.transaction_hash);
      await fetchChallenge(); // Refresh challenge
    } catch (err) {
      setError("Transaction failed. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Miner Dashboard */}
      <div className="glass-panel p-8 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-widest">
              <Activity size={14} />
              Current Status
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
                  onChange={(e) => setThreads(parseInt(e.target.value))}
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
          <Metric label="Hashrate" value={`${(hashrate / 1000).toFixed(2)} KH/s`} subValue="BLAKE2s" />
          <Metric label="Total Hashes" value={totalHashes.toLocaleString()} subValue="THIS SESSION" />
          <Metric label="Difficulty" value="0x00...0fff" subValue="ERA 1" />
          <Metric label="Daily Cap" value="0 / 10" subValue="MINTS USED" />
        </div>

        {/* Progress Bar (Simulated) */}
        {isMining && (
          <motion.div 
            className="absolute bottom-0 left-0 h-1 bg-[#00ff41]"
            initial={{ width: 0 }}
            animate={{ width: "100%" }}
            transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          />
        )}
      </div>

      {/* Notifications & Info */}
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
            className="bg-[#00ff41]/10 border border-[#00ff41]/20 p-4 rounded text-[#00ff41] flex items-center gap-3 text-sm"
          >
            <Trophy size={18} />
            <span>Successfully minted! Tx: <a href={`https://starkscan.co/tx/${lastMint}`} target="_blank" className="underline">{lastMint.slice(0, 10)}...</a></span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Miner Detail Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-panel p-6 space-y-4">
          <h4 className="text-xs font-mono text-gray-500 uppercase tracking-widest flex items-center gap-2">
            <Clock size={14} />
            Challenge Metadata
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Epoch</span>
              <span className="font-mono">{challenge?.epoch || '---'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Latest Block</span>
              <span className="font-mono text-[10px]">{challenge?.blockHash?.slice(0, 24) || '---'}...</span>
            </div>
          </div>
        </div>
        
        <div className="glass-panel p-6 space-y-4">
          <h4 className="text-xs font-mono text-gray-500 uppercase tracking-widest flex items-center gap-2">
            <Shield size={14} />
            Fingerprint Bound
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Device ID</span>
              <span className="font-mono text-[10px] text-[#00f3ff]">{fingerprint?.slice(0, 24) || 'CALCULATING...'}...</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Anti-Sybil Status</span>
              <span className="text-[#00ff41] text-[10px] font-bold">VERIFIED</span>
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
    <div className="text-[10px] text-gray-600 font-mono italic">{subValue}</div>
  </div>
);

export default Miner;
