import React, { useState, useEffect } from 'react';
import { connect, disconnect } from '@starknet-io/get-starknet';
import { Wallet, LogOut, Shield, Zap, Info, Menu } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Miner from './components/Miner';

const App: React.FC = () => {
  const [address, setAddress] = useState<string | null>(null);
  const [wallet, setWallet] = useState<any>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleConnect = async () => {
    const res = await connect();
    if (res && res.isConnected) {
      setAddress(res.selectedAddress);
      setWallet(res);
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
    setAddress(null);
    setWallet(null);
  };

  return (
    <div className="min-h-screen relative text-white font-sans">
      <div className="matrix-bg" />
      
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 px-6 py-4 flex justify-between items-center glass-panel rounded-none border-t-0 border-x-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#00ff41] rounded-sm flex items-center justify-center font-bold text-black text-xl">S</div>
          <span className="text-xl font-bold tracking-tighter">STARK<span className="text-[#00ff41]">BLAKE</span></span>
        </div>
        
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-400">
          <a href="#" className="hover:text-[#00ff41] transition-colors">DASHBOARD</a>
          <a href="#" className="hover:text-[#00ff41] transition-colors">GENESIS SALE</a>
          <a href="#" className="hover:text-[#00ff41] transition-colors">TOKENOMICS</a>
          <a href="#" className="hover:text-[#00ff41] transition-colors">DOCS</a>
        </div>

        <div className="flex items-center gap-4">
          {address ? (
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col items-end text-xs">
                <span className="text-gray-500">CONNECTED</span>
                <span className="text-[#00ff41] font-mono">{address.slice(0, 6)}...{address.slice(-4)}</span>
              </div>
              <button 
                onClick={handleDisconnect}
                className="p-2 hover:bg-white/10 rounded-full transition-colors text-red-400"
              >
                <LogOut size={20} />
              </button>
            </div>
          ) : (
            <button 
              onClick={handleConnect}
              className="px-6 py-2 bg-[#00ff41] text-black font-bold text-sm rounded-sm hover:bg-[#00cc33] transition-all flex items-center gap-2"
            >
              <Wallet size={16} />
              CONNECT WALLET
            </button>
          )}
          <button className="md:hidden p-2" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            <Menu size={24} />
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pt-28 pb-12 px-6 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Miner Status & Controls */}
          <div className="lg:col-span-2 space-y-8">
            <header className="space-y-2">
              <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-none">
                BROWSER <span className="text-[#00ff41]">MINING</span>
              </h1>
              <p className="text-gray-400 max-w-lg">
                Mine SBLAKE tokens directly in your browser. Multi-threaded PoW optimized for modern CPUs.
              </p>
            </header>

            {address ? (
              <Miner address={address} account={wallet?.account} />
            ) : (
              <div className="glass-panel p-12 flex flex-col items-center justify-center gap-6 border-dashed border-2 border-gray-800">
                <Shield size={64} className="text-gray-700" />
                <div className="text-center">
                  <h3 className="text-xl font-bold">Wallet Connection Required</h3>
                  <p className="text-gray-500 mt-2">Connect your Starknet wallet to start mining SBLAKE.</p>
                </div>
                <button 
                  onClick={handleConnect}
                  className="px-8 py-3 bg-white text-black font-black text-sm hover:bg-gray-200 transition-all rounded-sm"
                >
                  CONNECT NOW
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Global Stats */}
          <div className="space-y-6">
            <div className="glass-panel p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-gray-800 pb-4">
                <h3 className="font-bold flex items-center gap-2">
                  <Zap size={18} className="text-[#00ff41]" />
                  ERA INFO
                </h3>
                <span className="text-xs bg-[#00ff41]/10 text-[#00ff41] px-2 py-1 rounded">ERA 1</span>
              </div>
              
              <div className="space-y-4">
                <StatItem label="Block Reward" value="100 SBLAKE" />
                <StatItem label="Halving In" value="84,231 Mints" />
                <StatItem label="Next Difficulty" value="+12.4%" />
                <StatItem label="Total Minted" value="1,245,000" />
              </div>

              <div className="pt-4 border-t border-gray-800">
                <div className="flex justify-between text-xs text-gray-500 mb-2">
                  <span>ERA PROGRESS</span>
                  <span>15.7%</span>
                </div>
                <div className="w-full h-1 bg-gray-900 rounded-full overflow-hidden">
                  <div className="h-full bg-[#00ff41]" style={{ width: '15.7%' }} />
                </div>
              </div>
            </div>

            <div className="glass-panel p-6 space-y-4 bg-[#00f3ff]/5 border-[#00f3ff]/20">
              <h3 className="font-bold flex items-center gap-2 text-[#00f3ff]">
                <Info size={18} />
                GENESIS SALE
              </h3>
              <p className="text-sm text-gray-400">
                5% of supply is available at fixed price to seed liquidity.
              </p>
              <div className="flex justify-between items-end">
                <div>
                  <div className="text-2xl font-bold">$0.02</div>
                  <div className="text-[10px] text-gray-500 tracking-widest uppercase">Per SBLAKE</div>
                </div>
                <button className="px-4 py-2 bg-[#00f3ff] text-black text-xs font-bold rounded-sm">BUY NOW</button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Info */}
      <footer className="mt-12 py-12 border-t border-gray-900 bg-black/50 text-gray-600">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-xs font-mono uppercase tracking-widest">
          <div>
            <div className="text-gray-400 mb-4">Network</div>
            <div>Starknet Mainnet</div>
          </div>
          <div>
            <div className="text-gray-400 mb-4">Algorithm</div>
            <div>BLAKE2s (PoW)</div>
          </div>
          <div>
            <div className="text-gray-400 mb-4">Contract</div>
            <div className="truncate">0x0123...bcde</div>
          </div>
          <div>
            <div className="text-gray-400 mb-4">Status</div>
            <div className="text-[#00ff41]">Healthy</div>
          </div>
        </div>
      </footer>
    </div>
  );
};

const StatItem = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between items-center">
    <span className="text-gray-500 text-sm">{label}</span>
    <span className="font-mono text-[#00ff41]">{value}</span>
  </div>
);

export default App;
