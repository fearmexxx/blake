import React, { useState, useEffect } from 'react';
import { connect, disconnect } from '@starknet-io/get-starknet';
import {
  Wallet,
  LogOut,
  Shield,
  Zap,
  Menu,
  Flame,
  Loader2,
  Server,
  GlobeLock,
  CheckCircle2,
  Cpu,
  Activity,
  Home,
} from 'lucide-react';
import Miner from './components/Miner';
import { BetaHomepage, AppView } from './components/BetaHomepage';
import { StatusDashboard } from './components/StatusDashboard';
import { VpnSetup } from './components/VpnSetup';
import {
  getProtocolMetrics,
  getTimelineStats,
  bondBlakeNode,
  purchaseVpnPass,
  ProtocolMetrics,
  TimelineStats,
} from './utils/starknet';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<AppView>('home');
  const [address, setAddress] = useState<string | null>(null);
  const [wallet, setWallet] = useState<any>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [metrics, setMetrics] = useState<ProtocolMetrics | null>(null);
  const [timeline, setTimeline] = useState<TimelineStats>({
    era: 1,
    blockReward: '10',
    totalMints: 0,
    mintsInEra: 0,
    mintsUntilHalving: 900000,
    totalSupply: '0',
    maxSupply: '21000000',
  });
  const [betaStatusMsg, setBetaStatusMsg] = useState<string | null>(null);
  const [isBetaLoading, setIsBetaLoading] = useState<boolean>(false);

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

        const res: any = await connect({ modalMode: 'neverAsk' });
        if (res) {
          let addr = res.selectedAddress || res.account?.address || null;
          if (!addr && typeof res.request === 'function') {
            const accounts = await res
              .request({ type: 'wallet_requestAccounts', params: { silentMode: true } })
              .catch(() => null);
            if (Array.isArray(accounts) && accounts.length > 0) addr = accounts[0];
          }
          if (addr) {
            try {
              res.selectedAddress = addr;
              if (res.account) res.account.address = addr;
            } catch {
              // ignore read-only property errors
            }
            localStorage.setItem('sblake_connected_address', addr);
            setAddress(addr);
            setWallet(res);
          }
        }
      } catch {
        // Silently ignore if not authorized
      }
    };
    tryAutoConnect();
    getProtocolMetrics().then(setMetrics).catch(() => null);
    getTimelineStats().then(setTimeline).catch(() => null);
  }, []);

  const handleBetaVpnTest = async () => {
    const activeAcc = wallet?.account || wallet;
    if (!activeAcc || !address) {
      setBetaStatusMsg('Connect your Starknet wallet first to test Unlinkable VPN Pass billing.');
      return;
    }
    setIsBetaLoading(true);
    setBetaStatusMsg(null);
    try {
      const sessionPubkey =
        '0x' +
        Array.from(crypto.getRandomValues(new Uint8Array(16)))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
      const res = await purchaseVpnPass(activeAcc, 250, sessionPubkey);
      setBetaStatusMsg(
        `VPN Pass Activated! 60% Ops / 25% Burn / 15% Yield routed. Tx: ${res.transaction_hash.slice(0, 10)}...`
      );
      getProtocolMetrics().then(setMetrics).catch(() => null);
    } catch (err: any) {
      setBetaStatusMsg(err?.message || 'VPN Pass test transaction failed.');
    } finally {
      setIsBetaLoading(false);
    }
  };

  const handleBetaNodeBond = async () => {
    const activeAcc = wallet?.account || wallet;
    if (!activeAcc || !address) {
      setBetaStatusMsg('Connect your Starknet wallet first to test Invited Beta BlakeNode bonding.');
      return;
    }
    setIsBetaLoading(true);
    setBetaStatusMsg(null);
    try {
      const res = await bondBlakeNode(activeAcc, 'EU-WEST-1', true);
      setBetaStatusMsg(
        `BlakeNode Bonded (Beta Subsidized)! Tx: ${res.transaction_hash.slice(0, 10)}...`
      );
      getProtocolMetrics().then(setMetrics).catch(() => null);
    } catch (err: any) {
      setBetaStatusMsg(err?.message || 'BlakeNode bonding test failed.');
    } finally {
      setIsBetaLoading(false);
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const res: any = await connect({ modalMode: 'alwaysAsk', modalTheme: 'dark' });
      if (res) {
        let addr: string | null = res.selectedAddress || res.account?.address || null;

        if (!addr && typeof res.request === 'function') {
          try {
            const accounts = await res.request({ type: 'wallet_requestAccounts' });
            if (Array.isArray(accounts) && accounts.length > 0) {
              addr = accounts[0];
            }
          } catch (err) {
            console.warn('wallet_requestAccounts call failed, trying enable:', err);
          }
        }

        if (!addr && typeof res.enable === 'function') {
          try {
            const accounts = await res.enable();
            if (Array.isArray(accounts) && accounts.length > 0) {
              addr = accounts[0];
            } else {
              addr = res.selectedAddress || res.account?.address || null;
            }
          } catch (err) {
            console.warn('enable() failed:', err);
          }
        }

        if (!addr && typeof window !== 'undefined') {
          const winStarknet = (window as any).starknet;
          if (winStarknet) {
            addr = winStarknet.selectedAddress || winStarknet.account?.address || null;
          }
        }

        if (addr) {
          try {
            res.selectedAddress = addr;
            if (res.account) res.account.address = addr;
          } catch {
            // ignore read-only property errors
          }
          localStorage.setItem('sblake_connected_address', addr);
          setAddress(addr);
          setWallet(res);
          localStorage.setItem('sblake_wallet_mode', 'extension');
          localStorage.removeItem('sblake_burner_address');

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
        }
      }
    } catch (e) {
      console.error('Wallet connection failed:', e);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleStartBurner = () => {
    const bytes = new Uint8Array(31);
    crypto.getRandomValues(bytes);
    const burner =
      '0x' +
      Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
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

  const navItems: { id: AppView; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: 'home', label: 'BETA HOME', icon: <Home size={14} /> },
    { id: 'miner', label: 'MINING CLIENT', icon: <Cpu size={14} />, badge: '10 SB' },
    { id: 'status', label: 'STATUS DASHBOARD', icon: <Activity size={14} /> },
    { id: 'vpn', label: 'BLAKEVPN & NODE SETUP', icon: <GlobeLock size={14} />, badge: 'HYBRID' },
  ];

  return (
    <div className="min-h-screen relative text-white font-sans bg-[#050505]">
      <div className="matrix-bg" />

      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 px-6 py-3.5 flex justify-between items-center glass-panel rounded-none border-t-0 border-x-0">
        <button
          onClick={() => setActiveView('home')}
          className="flex items-center gap-2.5 text-left"
        >
          <div className="w-8 h-8 bg-[#00ff41] rounded-sm flex items-center justify-center font-black text-black text-xl">
            S
          </div>
          <div>
            <span className="text-xl font-black tracking-tighter block leading-none">
              STARK<span className="text-[#00ff41]">BLAKE</span>
            </span>
            <span className="text-[9px] font-mono text-[#00f3ff] tracking-widest uppercase">
              INVITED BETA v1.1
            </span>
          </div>
        </button>

        {/* Desktop Navigation Tabs */}
        <div className="hidden lg:flex items-center gap-2 bg-black/60 p-1 rounded border border-gray-800">
          {navItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`px-3.5 py-2 rounded-sm text-xs font-mono font-bold transition-all flex items-center gap-2 ${
                  isActive
                    ? 'bg-[#00ff41] text-black shadow-[0_0_15px_rgba(0,255,65,0.25)]'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.badge && (
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded font-black ${
                      isActive ? 'bg-black/20 text-black' : 'bg-[#00f3ff]/15 text-[#00f3ff]'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          {address ? (
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col items-end text-xs">
                <span className="text-gray-500 font-mono text-[10px]">
                  {localStorage.getItem('sblake_wallet_mode') === 'burner'
                    ? 'BURNER SESSION'
                    : 'STARKNET WALLET'}
                </span>
                <span className="text-[#00ff41] font-mono">
                  {address.slice(0, 6)}...{address.slice(-4)}
                </span>
              </div>
              <button
                onClick={handleDisconnect}
                className="p-2 hover:bg-white/10 rounded-full transition-colors text-red-400"
                title="Disconnect Wallet"
              >
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleStartBurner}
                className="hidden sm:flex px-3 py-2 bg-white/10 hover:bg-white/20 text-white font-mono font-bold text-xs rounded-sm border border-white/15 items-center gap-1.5 transition-all"
              >
                <Flame size={14} className="text-[#00f3ff]" />
                BURNER
              </button>
              <button
                onClick={handleConnect}
                disabled={isConnecting}
                className="px-5 py-2 bg-[#00ff41] text-black font-bold text-xs uppercase tracking-wider rounded-sm hover:bg-[#00cc33] transition-all flex items-center gap-2"
              >
                {isConnecting ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Wallet size={15} />
                )}
                {isConnecting ? 'CONNECTING...' : 'CONNECT WALLET'}
              </button>
            </div>
          )}
          <button
            className="lg:hidden p-2 text-gray-300 hover:text-white"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            <Menu size={22} />
          </button>
        </div>
      </nav>

      {/* Mobile Navigation Drawer */}
      {isMenuOpen && (
        <div className="fixed top-16 left-0 w-full z-40 bg-black/95 border-b border-gray-800 p-4 flex flex-col gap-2 lg:hidden">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveView(item.id);
                setIsMenuOpen(false);
              }}
              className={`p-3 rounded text-left font-mono text-xs font-bold flex items-center justify-between ${
                activeView === item.id
                  ? 'bg-[#00ff41] text-black'
                  : 'text-gray-300 hover:bg-white/5'
              }`}
            >
              <span className="flex items-center gap-2">
                {item.icon}
                {item.label}
              </span>
              {item.badge && <span className="text-[10px] opacity-80">{item.badge}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Main Content Container */}
      <main className="pt-28 pb-12 px-6 max-w-6xl mx-auto">
        {activeView === 'home' && (
          <BetaHomepage
            onNavigate={setActiveView}
            address={address}
            onConnect={handleConnect}
            onStartBurner={handleStartBurner}
            metrics={metrics}
            timeline={timeline}
          />
        )}

        {activeView === 'miner' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column (2/3): Dedicated Browser PC Mining Workstation */}
            <div className="lg:col-span-2 space-y-6">
              <header className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-mono text-[#00ff41]">
                  <Cpu size={14} />
                  <span>BROWSER PC MULTI-CORE WORKSTATION (ERA {timeline.era})</span>
                </div>
                <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-none">
                  BROWSER <span className="text-[#00ff41]">MINING CLIENT</span>
                </h1>
                <p className="text-gray-400 text-xs md:text-sm max-w-xl">
                  Direct Web Worker BLAKE2s hashing without Chrome MV3 extension throttling. Lock rewards in STRK20 (&ge;7 days) for +15% SBLAKE and 50% Mint Fee discount.
                </p>
              </header>

              {address ? (
                <Miner address={address} account={wallet?.account || wallet} />
              ) : (
                <div className="glass-panel p-10 flex flex-col items-center justify-center gap-6 border-dashed border-2 border-gray-800 text-center">
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-[#00ff41]">
                    <Shield size={36} />
                  </div>
                  <div className="max-w-md">
                    <h3 className="text-xl font-bold text-white">
                      Connect Wallet or Start Burner Miner
                    </h3>
                    <p className="text-gray-400 text-sm mt-2">
                      Connect Xverse, Argent X, or Braavos on Starknet Sepolia to start mining `SBLAKE`, or launch an instant guest burner session in 1 click.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-md justify-center">
                    <button
                      onClick={handleConnect}
                      disabled={isConnecting}
                      className="w-full sm:w-auto px-8 py-3 bg-[#00ff41] text-black font-black text-sm hover:bg-[#00cc33] transition-all rounded-sm flex items-center justify-center gap-2"
                    >
                      {isConnecting ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Wallet size={16} />
                      )}
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
            </div>

            {/* Right Column (1/3): Era 1 Schedule, STRK20 Rules & Quick Beta Actions */}
            <div className="space-y-6">
              <div className="glass-panel p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                  <h3 className="font-bold flex items-center gap-2 text-sm">
                    <Zap size={16} className="text-[#00ff41]" />
                    ERA 1 SCHEDULE
                  </h3>
                  <span className="text-[10px] bg-[#00ff41]/10 text-[#00ff41] px-2 py-0.5 rounded font-mono font-bold">
                    DRAFT 1.1
                  </span>
                </div>

                <div className="space-y-3">
                  <StatItem label="Era 1 Base Reward" value="10 SBLAKE" />
                  <StatItem label="Shielded Reward (+15%)" value="11.5 SBLAKE" />
                  <StatItem label="Halving Interval" value="900,000 Mints" />
                  <StatItem label="Year-1 Target Float" value="<= 40–45%" />
                </div>

                <button
                  onClick={() => setActiveView('status')}
                  className="w-full py-2 px-3 bg-white/5 hover:bg-white/10 border border-gray-800 text-xs font-mono text-gray-300 rounded-sm transition-colors"
                >
                  Open Full Status Dashboard &rarr;
                </button>
              </div>

              <div className="glass-panel p-6 space-y-4 bg-[#00f3ff]/5 border-[#00f3ff]/20">
                <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                  <h3 className="font-bold flex items-center gap-2 text-[#00f3ff] text-sm">
                    <Shield size={16} />
                    STRK20 DARK POOL
                  </h3>
                  <span className="text-[10px] bg-[#00f3ff]/10 text-[#00f3ff] px-2 py-0.5 rounded font-mono font-bold">
                    7-DAY MATURITY
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  Miners locking rewards in STRK20 for &ge;7 days earn +15% SBLAKE and a 50% protocol mint fee discount.
                </p>
                <div className="space-y-2.5 pt-1">
                  <StatItem label="Mint Protocol Fee" value="0.5–1.0 STRK" />
                  <StatItem label="7-Day Lock Discount" value="50% Off Fee" />
                  <StatItem label="STRK20 Action Fee" value="~$0.12 Flat" />
                  <StatItem label="Unshield Burn Rate" value="0.25% Burn" />
                </div>
              </div>

              {/* Quick BlakeVPN & BlakeNode Beta Actions */}
              <div className="glass-panel p-6 space-y-4 bg-[#00ff41]/5 border-[#00ff41]/30">
                <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                  <h3 className="font-bold flex items-center gap-2 text-[#00ff41] text-sm uppercase">
                    <GlobeLock size={16} />
                    BlakeVPN &amp; Node Beta
                  </h3>
                  <span className="text-[10px] bg-[#00ff41]/15 text-[#00ff41] px-2 py-0.5 rounded font-mono font-bold">
                    INVITED BETA
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <StatItem
                    label="Active Beta Nodes"
                    value={`${metrics?.activeNodesCount ?? 18} / 25 Target`}
                  />
                  <StatItem label="VPN Pass Billing" value="$5/mo (250 SBLAKE)" />
                  <StatItem label="Revenue Split" value="60% Ops / 25% Burn / 15% Yield" />
                </div>

                <div className="grid grid-cols-1 gap-2 pt-1">
                  <button
                    onClick={() => setActiveView('vpn')}
                    className="w-full py-2.5 px-3 bg-[#00ff41] text-black text-xs font-black uppercase tracking-wider rounded-sm hover:bg-[#00cc33] transition-colors flex items-center justify-center gap-1.5"
                  >
                    <GlobeLock size={14} />
                    Configure WireGuard / Proxy VPN
                  </button>

                  <button
                    onClick={handleBetaVpnTest}
                    disabled={isBetaLoading}
                    className="w-full py-2 px-3 bg-white/10 text-white text-xs font-bold uppercase tracking-wider rounded-sm hover:bg-white/20 border border-white/15 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {isBetaLoading ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Server size={13} className="text-[#00f3ff]" />
                    )}
                    Quick Test 250 SB VPN Pass Tx
                  </button>

                  <button
                    onClick={handleBetaNodeBond}
                    disabled={isBetaLoading}
                    className="w-full py-2 px-3 bg-purple-500/15 text-purple-300 text-xs font-bold uppercase tracking-wider rounded-sm hover:bg-purple-500/25 border border-purple-500/30 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <Server size={13} />
                    Quick Bond Beta BlakeNode
                  </button>
                </div>

                {betaStatusMsg && (
                  <div className="text-[11px] font-mono text-[#00f3ff] bg-black/60 border border-[#00f3ff]/30 p-2.5 rounded break-all flex items-start gap-1.5">
                    <CheckCircle2 size={13} className="shrink-0 mt-0.5 text-[#00ff41]" />
                    <span>{betaStatusMsg}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeView === 'status' && (
          <StatusDashboard
            account={wallet?.account || wallet}
            wallet={wallet}
            address={address || undefined}
          />
        )}

        {activeView === 'vpn' && (
          <VpnSetup
            address={address}
            account={wallet?.account || wallet}
            onConnect={handleConnect}
          />
        )}
      </main>

      {/* Footer Info */}
      <footer className="mt-12 py-10 border-t border-gray-900 bg-black/60 text-gray-500">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-xs font-mono uppercase tracking-widest">
          <div>
            <div className="text-gray-400 mb-2">Network</div>
            <div className="text-white">Starknet Sepolia (v0.10)</div>
          </div>
          <div>
            <div className="text-gray-400 mb-2">Mining Engine</div>
            <div className="text-[#00ff41]">Browser PC Web Workers (BLAKE2s)</div>
          </div>
          <div>
            <div className="text-gray-400 mb-2">Privacy &amp; VPN Stack</div>
            <div className="text-[#00f3ff]">STRK20 + WireGuard / PAC Proxy</div>
          </div>
          <div>
            <div className="text-gray-400 mb-2">Phase Status</div>
            <div className="text-purple-400">Invited Beta (Draft 1.1)</div>
          </div>
        </div>
      </footer>
    </div>
  );
};

const StatItem = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between items-center text-xs">
    <span className="text-gray-400">{label}</span>
    <span className="font-mono text-[#00ff41] font-bold">{value}</span>
  </div>
);

export default App;
