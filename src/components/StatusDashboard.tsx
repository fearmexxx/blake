import React, { useState, useEffect } from 'react';
import {
  Activity,
  Shield,
  Server,
  Flame,
  TrendingUp,
  RefreshCw,
  CheckCircle2,
  GlobeLock,
  Lock,
  DollarSign,
  ExternalLink,
} from 'lucide-react';
import {
  getTimelineStats,
  getProtocolMetrics,
  TimelineStats,
  ProtocolMetrics,
  CONTRACT_ADDRESS,
} from '../utils/starknet';
import { getLocalNotes } from '../utils/privacy';
import { EconomicSimulator } from './EconomicSimulator';
import { ContractDeployer } from './ContractDeployer';

interface StatusDashboardProps {
  account: any;
  wallet: any;
}

export const StatusDashboard: React.FC<StatusDashboardProps> = ({ account, wallet }) => {
  const [timeline, setTimeline] = useState<TimelineStats>({
    era: 1,
    blockReward: '10',
    totalMints: 0,
    mintsInEra: 0,
    mintsUntilHalving: 900000,
    totalSupply: '0',
    maxSupply: '21000000',
  });
  const [metrics, setMetrics] = useState<ProtocolMetrics>({
    isBetaPhase: true,
    activeNodesCount: 18,
    totalNodeCollateral: '180000',
    totalBurned: '0',
    vpnSessionsCount: 64,
    opsSharePct: 60,
    buybackBurnPct: 25,
    yieldSharePct: 15,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [localNotesCount, setLocalNotesCount] = useState(0);

  const refreshAll = async () => {
    setIsRefreshing(true);
    try {
      const [tStats, pMetrics] = await Promise.all([
        getTimelineStats(),
        getProtocolMetrics(),
      ]);
      setTimeline(tStats);
      setMetrics(pMetrics);
      setLocalNotesCount(getLocalNotes().filter((n) => !n.spent).length);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    refreshAll();
  }, []);

  const isLiveContract =
    CONTRACT_ADDRESS && !CONTRACT_ADDRESS.startsWith('0x0123456789');

  return (
    <div className="space-y-8">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <Activity size={22} className="text-[#00ff41]" />
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white uppercase">
              Mining &amp; Protocol Status Dashboard
            </h1>
          </div>
          <p className="text-xs md:text-sm text-gray-400 mt-1">
            Live Starknet Sepolia telemetry, Era 1 halving progress, Year-1 free-float lock audit, and $5,000/mo Operations Floor tracking.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <span
            className={`px-3 py-1.5 rounded text-xs font-mono font-bold flex items-center gap-1.5 border ${
              metrics.isBetaPhase
                ? 'bg-[#00ff41]/10 text-[#00ff41] border-[#00ff41]/30'
                : 'bg-[#00f3ff]/10 text-[#00f3ff] border-[#00f3ff]/30'
            }`}
          >
            <CheckCircle2 size={14} />
            {metrics.isBetaPhase ? 'INVITED BETA PHASE' : 'MAINNET PRODUCTION'}
          </span>

          <button
            onClick={refreshAll}
            disabled={isRefreshing}
            className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-gray-800 rounded text-xs font-mono text-gray-300 flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw size={13} className={isRefreshing ? 'animate-spin text-[#00ff41]' : ''} />
            Refresh Telemetry
          </button>
        </div>
      </div>

      {/* Top 4 Live Protocol Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-5 border border-[#00ff41]/25 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-gray-400">
            <span>ERA {timeline.era} EMISSION</span>
            <TrendingUp size={15} className="text-[#00ff41]" />
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {timeline.blockReward} SBLAKE
          </div>
          <div className="text-[11px] font-mono text-[#00f3ff]">
            11.5 SBLAKE w/ STRK20 (+15%)
          </div>
          <div className="text-[10px] font-mono text-gray-500 pt-1 border-t border-gray-800/80">
            Halving in {timeline.mintsUntilHalving.toLocaleString()} mints (900k cadence)
          </div>
        </div>

        <div className="glass-panel p-5 border border-purple-500/25 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-gray-400">
            <span>BLAKENODE DEPIN FLEET</span>
            <Server size={15} className="text-purple-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {metrics.activeNodesCount} / 25 Nodes
          </div>
          <div className="text-[11px] font-mono text-purple-300">
            {Number(metrics.totalNodeCollateral).toLocaleString()} SBLAKE Bonded
          </div>
          <div className="text-[10px] font-mono text-gray-500 pt-1 border-t border-gray-800/80">
            10,000 SBLAKE / node (or Beta Subsidy)
          </div>
        </div>

        <div className="glass-panel p-5 border border-[#00f3ff]/25 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-gray-400">
            <span>UNLINKABLE VPN SESSIONS</span>
            <GlobeLock size={15} className="text-[#00f3ff]" />
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {metrics.vpnSessionsCount} / 80 Beta
          </div>
          <div className="text-[11px] font-mono text-[#00ff41]">
            {localNotesCount} Local STRK20 Notes Ready
          </div>
          <div className="text-[10px] font-mono text-gray-500 pt-1 border-t border-gray-800/80">
            $5/mo Beta Pass (250 SBLAKE via Nullifier)
          </div>
        </div>

        <div className="glass-panel p-5 border border-red-500/25 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-gray-400">
            <span>REVENUE &amp; BURN ROUTER</span>
            <Flame size={15} className="text-red-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {metrics.opsSharePct} / {metrics.buybackBurnPct} / {metrics.yieldSharePct}%
          </div>
          <div className="text-[11px] font-mono text-red-400">
            {Number(metrics.totalBurned).toLocaleString()} SBLAKE Burned On-Chain
          </div>
          <div className="text-[10px] font-mono text-gray-500 pt-1 border-t border-gray-800/80">
            Ops / Ekubo TWAP Burn / Shielded Yield
          </div>
        </div>
      </div>

      {/* Supply Lock & Revenue Allocation Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Year-1 Supply Lock Breakdown */}
        <div className="glass-panel p-6 border border-gray-800 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-800 pb-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Lock size={16} className="text-[#00f3ff]" />
              Year-1 Supply Lock &amp; Free Float Target (&le; 40–45%)
            </h3>
            <span className="text-[11px] font-mono text-[#00ff41] font-bold">
              21,000,000 MAX CAP
            </span>
          </div>

          <p className="text-xs text-gray-400 leading-relaxed">
            Draft 1.1 caps Year-1 gross issuance at <strong className="text-white">6–9M SBLAKE</strong> (`900,000` mints &times; `10 SBLAKE`) and enforces three structural supply sinks so liquid DEX float remains under <strong className="text-[#00ff41]">40–45%</strong>:
          </p>

          <div className="space-y-3 text-xs font-mono">
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-300">1. STRK20 Dark Pool Lock (&ge;7-Day Maturity)</span>
                <span className="text-[#00f3ff] font-bold">~38% of Emitted Supply</span>
              </div>
              <div className="w-full h-2 bg-black/80 rounded-full overflow-hidden border border-gray-800">
                <div className="h-full bg-[#00f3ff]" style={{ width: '38%' }} />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-300">2. BlakeNode Collateral Bonds (10,000 SBLAKE / Node)</span>
                <span className="text-purple-400 font-bold">~10% of Emitted Supply</span>
              </div>
              <div className="w-full h-2 bg-black/80 rounded-full overflow-hidden border border-gray-800">
                <div className="h-full bg-purple-500" style={{ width: '10%' }} />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-300">3. Ekubo TWAP Buyback + Utility &amp; Unshield Burns</span>
                <span className="text-red-400 font-bold">~12% Permanently Burned</span>
              </div>
              <div className="w-full h-2 bg-black/80 rounded-full overflow-hidden border border-gray-800">
                <div className="h-full bg-red-500" style={{ width: '12%' }} />
              </div>
            </div>

            <div className="space-y-1 pt-1 border-t border-gray-800">
              <div className="flex justify-between">
                <span className="text-white font-bold">Net Circulating Free Float</span>
                <span className="text-[#00ff41] font-bold">~40.0% (Within &le;45% Target)</span>
              </div>
              <div className="w-full h-2 bg-black/80 rounded-full overflow-hidden border border-gray-800">
                <div className="h-full bg-[#00ff41]" style={{ width: '40%' }} />
              </div>
            </div>
          </div>
        </div>

        {/* $5,000/mo Operations Cost Floor & Revenue Taper Governance */}
        <div className="glass-panel p-6 border border-gray-800 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-800 pb-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <DollarSign size={16} className="text-[#00ff41]" />
              $5,000/mo Operations Floor &amp; Taper Governance
            </h3>
            <span className="text-[11px] font-mono text-[#00f3ff] font-bold">
              60 / 25 / 15 SPLIT
            </span>
          </div>

          <p className="text-xs text-gray-400 leading-relaxed">
            Protocol fees (`0.5–1.0 STRK` mint fee, `$5–$10/mo` BlakeVPN passes, and `$0.12` STRK20 action fees) prioritize covering the <strong className="text-white">$5,000/mo Operations Cost Floor</strong> before tapering into accelerated Ekubo TWAP buyback &amp; burns:
          </p>

          <div className="space-y-2.5 text-xs">
            <div className="p-3 bg-black/60 border border-gray-800 rounded flex items-center justify-between">
              <div>
                <div className="font-bold text-white">Core Exit &amp; Residential Relay Nodes (15–20 Nodes)</div>
                <div className="text-[11px] text-gray-400">Multi-region EU, US, and Asia high-bandwidth WireGuard endpoints</div>
              </div>
              <span className="font-mono text-[#00ff41] font-bold shrink-0">$3,000–$4,000/mo</span>
            </div>

            <div className="p-3 bg-black/60 border border-gray-800 rounded flex items-center justify-between">
              <div>
                <div className="font-bold text-white">Lean Community Growth &amp; Beta Incentives</div>
                <div className="text-[11px] text-gray-400">Targeted node runner &amp; tester onboarding campaigns</div>
              </div>
              <span className="font-mono text-[#00f3ff] font-bold shrink-0">$1,000–$1,500/mo</span>
            </div>

            <div className="p-3 bg-black/60 border border-gray-800 rounded flex items-center justify-between">
              <div>
                <div className="font-bold text-white">Starknet Relayer, RPC &amp; Security Contingency</div>
                <div className="text-[11px] text-gray-400">Alchemy v0.10 failover pool &amp; automated proof verification</div>
              </div>
              <span className="font-mono text-purple-300 font-bold shrink-0">$500–$1,000/mo</span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-gray-800 text-[11px] font-mono text-gray-400">
            <span>
              Active Contract: <strong className="text-white">{CONTRACT_ADDRESS.slice(0, 12)}...{CONTRACT_ADDRESS.slice(-6)}</strong>
            </span>
            {isLiveContract && (
              <a
                href={`https://sepolia.starkscan.co/contract/${CONTRACT_ADDRESS}`}
                target="_blank"
                rel="noreferrer"
                className="text-[#00f3ff] hover:underline flex items-center gap-1"
              >
                Starkscan <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Interactive Economic Flywheel Simulator */}
      <EconomicSimulator />

      {/* 1-Click Sepolia Contract Deployer & Governance Panel */}
      <ContractDeployer
        account={account}
        wallet={wallet}
        onDeployed={() => refreshAll()}
      />
    </div>
  );
};
