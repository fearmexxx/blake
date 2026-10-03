import React, { useState, useEffect } from 'react';
import { connect, disconnect } from '@starknet-io/get-starknet';
import { Wallet, LogOut, Shield, Zap, Info, Menu, Flame, Loader2 } from 'lucide-react';
import Miner from './components/Miner';
import { ContractDeployer } from './components/ContractDeployer';
import { EconomicSimulator } from './components/EconomicSimulator';

const App: React.FC = () => {
  const [address, setAddress] = useState<string | null>(null);
  const [wallet, setWallet] = useState<any>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // Auto-connect on load if already authorized
  useEffect(() => {
    const tryAutoConnect = async () => {
      try {
        const savedBurner = localStorage.getItem('sblake_burner_address');
        const savedMode = localStorage.getItem('sblake_wallet_mode');

        if (savedMode === 'burner' && savedBurner) {
          setAddress(savedBurner);
          setWallet({ account: { address: savedBurner } });
          return;
        }

        const res: any = await connect({ modalMode: "neverAsk" });
        if (res) {
          let addr = res.selectedAddress || res.account?.address || null;
          if (!addr && typeof res.request === 'function') {
            const accounts = await res.request({ type: 'wallet_requestAccounts', params: { silentMode: true } }).catch(() => null);
            if (Array.isArray(accounts) && accounts.length > 0) addr = accounts[0];
          }
          if (addr) {
            setAddress(addr);
            setWallet(res);
          }
        }
      } catch {
        // Silently ignore if not authorized
      }
    };
    tryAutoConnect();
  }, []);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const res: any = await connect({ modalMode: "alwaysAsk", modalTheme: "dark" });
      if (res) {
        let addr: string | null = res.selectedAddress || res.account?.address || null;

        // EIP-6963 / Starknet standard requestAccounts call
        if (!addr && typeof res.request === 'function') {
          try {
            const accounts = await res.request({ type: 'wallet_requestAccounts' });
            if (Array.isArray(accounts) && accounts.length > 0) {
              addr = accounts[0];
            }
          } catch (err) {
            console.warn("wallet_requestAccounts call failed, trying enable:", err);
          }
        }

        // Legacy enable() fallback
        if (!addr && typeof res.enable === 'function') {
          try {
            const accounts = await res.enable();
            if (Array.isArray(accounts) && accounts.length > 0) {
              addr = accounts[0];
            } else {
              addr = res.selectedAddress || res.account?.address || null;
            }
          } catch (err) {
            console.warn("enable() failed:", err);
          }
        }

        // Window extension fallback
        if (!addr && typeof window !== 'undefined') {
          const winStarknet = (window as any).starknet;
          if (winStarknet) {
            addr = winStarknet.selectedAddress || winStarknet.account?.address || null;
          }
        }

        if (addr) {
          setAddress(addr);
          setWallet(res);
          localStorage.setItem('sblake_wallet_mode', 'extension');
          localStorage.removeItem('sblake_burner_address');

          // Listen to account changes
          if (typeof res.on === 'function') {
            res.on('accountsChanged', (accounts: string[]) => {
              if (accounts && accounts.length > 0) {
                setAddress(accounts[0]);
              } else {
                setAddress(null);
                setWallet(null);
              }
            });
          }
        } else {
          console.warn("Wallet modal closed or no account authorized");
        }
      }
    } catch (e) {
      console.error("Wallet connection failed:", e);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleStartBurner = () => {
    // Generate an instant felt252 compatible burner address for quick mining testing
    const bytes = new Uint8Array(31);
    crypto.getRandomValues(bytes);
    const burner = '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    setAddress(burner);
    setWallet({ account: { address: burner } });
    localStorage.setItem('sblake_wallet_mode', 'burner');
    localStorage.setItem('sblake_burner_address', burner);
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
    } catch {
      // Ignore disconnect errors
    }
    setAddress(null);
    setWallet(null);
    localStorage.removeItem('sblake_wallet_mode');
    localStorage.removeItem('sblake_burner_address');
  };

  return (
    <div className="min-h-screen relative text-white font-sans bg-[#050505]">
      <div className="matrix-bg" />
      
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 px-6 py-4 flex justify-between items-center glass-panel rounded-none border-t-0 border-x-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#00ff41] rounded-sm flex items-center justify-center font-bold text-black text-xl">S</div>
          <span className="text-xl font-bold tracking-tighter">STARK<span className="text-[#00ff41]">BLAKE</span></span>
        </div>
        
        <div className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-400">
          <a href="#" className="hover:text-[#00ff41] transition-colors">DASHBOARD</a>
          <a href="#deploy" className="hover:text-[#00ff41] text-[#00ff41] transition-colors font-bold">DEPLOY CONTRACT</a>
          <a href="#simulator" className="hover:text-[#00f3ff] text-[#00f3ff] transition-colors font-bold">FLYWEALTH SIMULATOR</a>
          <a href="#" className="hover:text-[#00ff41] transition-colors">STRK20 POOL</a>
          <a href="#" className="hover:text-[#00ff41] transition-colors">TOKENOMICS</a>
        </div>

        <div className="flex items-center gap-4">
          {address ? (
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col items-end text-xs">
                <span className="text-gray-500 font-mono">
                  {localStorage.getItem('sblake_wallet_mode') === 'burner' ? 'BURNER SESSION' : 'CONNECTED'}
                </span>
                <span className="text-[#00ff41] font-mono">{address.slice(0, 6)}...{address.slice(-4)}</span>
              </div>
              <button 
                onClick={handleDisconnect}
                className="p-2 hover:bg-white/10 rounded-full transition-colors text-red-400"
                title="Disconnect Wallet"
              >
                <LogOut size={20} />
              </button>
            </div>
          ) : (
            <button 
              onClick={handleConnect}
              disabled={isConnecting}
              className="px-6 py-2 bg-[#00ff41] text-black font-bold text-sm rounded-sm hover:bg-[#00cc33] transition-all flex items-center gap-2"
            >
              {isConnecting ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
              {isConnecting ? 'CONNECTING...' : 'CONNECT WALLET'}
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
                Mine SBLAKE tokens directly in your browser. Multi-threaded PoW optimized for modern CPUs with STRK20 privacy shielding.
              </p>
            </header>

            {address ? (
              <Miner address={address} account={wallet?.account || wallet} />
            ) : (
              <div className="glass-panel p-10 flex flex-col items-center justify-center gap-6 border-dashed border-2 border-gray-800 text-center">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-gray-400">
                  <Shield size={36} />
                </div>
                <div className="max-w-md">
                  <h3 className="text-xl font-bold text-white">Wallet Connection Required</h3>
                  <p className="text-gray-400 text-sm mt-2">
                    Connect your Starknet wallet (Argent X or Braavos) to start mining SBLAKE, or test immediately using an instant guest session.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-md justify-center">
                  <button 
                    onClick={handleConnect}
                    disabled={isConnecting}
                    className="w-full sm:w-auto px-8 py-3 bg-[#00ff41] text-black font-black text-sm hover:bg-[#00cc33] transition-all rounded-sm flex items-center justify-center gap-2"
                  >
                    {isConnecting ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
                    {isConnecting ? 'CONNECTING...' : 'CONNECT WALLET'}
                  </button>

                  <button 
                    onClick={handleStartBurner}
                    className="w-full sm:w-auto px-6 py-3 bg-white/10 text-white font-bold text-sm hover:bg-white/20 transition-all rounded-sm border border-white/20 flex items-center justify-center gap-2"
                  >
                    <Flame size={16} className="text-[#00f3ff]" />
                    QUICK BURNER MINER
                  </button>
                </div>
              </div>
            )}

            {/* 1-Click Sepolia Contract Deployer */}
            <ContractDeployer account={wallet?.account || wallet} />

            {/* Economic Flywheel & Feasibility Simulator */}
            <EconomicSimulator />
          </div>

          {/* Right Column: Global Stats */}
          <div className="space-y-6">
            <div className="glass-panel p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-gray-800 pb-4">
                <h3 className="font-bold flex items-center gap-2">
                  <Zap size={18} className="text-[#00ff41]" />
                  ERA INFO
                </h3>
                <span className="text-xs bg-[#00ff41]/10 text-[#00ff41] px-2 py-1 rounded font-mono font-bold">ERA 1</span>
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
              <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                <h3 className="font-bold flex items-center gap-2 text-[#00f3ff] text-sm">
                  <Shield size={16} />
                  STRK20 DARK POOL
                </h3>
                <span className="text-[10px] bg-[#00f3ff]/10 text-[#00f3ff] px-2 py-0.5 rounded font-mono font-bold">SNIP-36</span>
              </div>
              <p className="text-xs text-gray-400">
                Privacy-preserving note commitments with deflationary buyback & burn.
              </p>
              <div className="space-y-3 pt-2">
                <StatItem label="Shielded Staked" value="48.5%" />
                <StatItem label="Mining Boost" value="+15% Yield" />
                <StatItem label="Burn Sink Rate" value="0.25% Tx" />
              </div>
            </div>

            <div className="glass-panel p-6 space-y-4 bg-[#00ff41]/5 border-[#00ff41]/20">
              <h3 className="font-bold flex items-center gap-2 text-[#00ff41]">
                <Info size={18} />
                GENESIS SALE
              </h3>
              <p className="text-sm text-gray-400">
                5% of supply is available at fixed price to seed DEX pool & lock LP.
              </p>
              <div className="flex justify-between items-end">
                <div>
                  <div className="text-2xl font-bold">$0.02</div>
                  <div className="text-[10px] text-gray-500 tracking-widest uppercase">Per SBLAKE</div>
                </div>
                <button className="px-4 py-2 bg-[#00ff41] text-black text-xs font-bold rounded-sm hover:bg-[#00cc33] transition-colors">BUY NOW</button>
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
            <div>Starknet Sepolia</div>
          </div>
          <div>
            <div className="text-gray-400 mb-4">Algorithm</div>
            <div>BLAKE2s (PoW)</div>
          </div>
          <div>
            <div className="text-gray-400 mb-4">Privacy Framework</div>
            <div className="text-[#00f3ff]">STRK20 (SNIP-36)</div>
          </div>
          <div>
            <div className="text-gray-400 mb-4">Status</div>
            <div className="text-[#00ff41]">Operational</div>
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
