import React from 'react';
import {
  Cpu,
  GlobeLock,
  Server,
  BarChart3,
  ArrowRight,
  CheckCircle2,
  Lock,
  Zap,
  Layers,
  Terminal,
  BookOpen,
} from 'lucide-react';
import { ProtocolMetrics, TimelineStats } from '../utils/starknet';

export type AppView = 'home' | 'miner' | 'status' | 'vpn' | 'docs';

interface BetaHomepageProps {
  onNavigate: (view: AppView) => void;
  address: string | null;
  onConnect: () => void;
  onStartBurner: () => void;
  metrics: ProtocolMetrics | null;
  timeline: TimelineStats;
}

export const BetaHomepage: React.FC<BetaHomepageProps> = ({
  onNavigate,
  address,
  onConnect,
  onStartBurner,
  metrics,
  timeline,
}) => {
  const activeNodes = metrics?.activeNodesCount ?? 18;
  const activeVpnTesters = metrics?.vpnSessionsCount ?? 64;
  const nodeProgressPct = Math.min(100, Math.round((activeNodes / 25) * 100));
  const vpnProgressPct = Math.min(100, Math.round((activeVpnTesters / 80) * 100));

  return (
    <div className="space-y-10">
      {/* Hero Banner */}
      <div className="glass-panel p-8 md:p-10 border border-[#00ff41]/30 bg-gradient-to-br from-black/90 via-black/80 to-[#00ff41]/5 relative overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="px-2.5 py-1 rounded text-[11px] font-mono font-bold bg-[#00ff41]/15 text-[#00ff41] border border-[#00ff41]/30 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#00ff41] animate-pulse" />
            PUBLIC ALPHA &amp; INVITED BETA LIVE (DRAFT 1.1)
          </span>
          <span className="px-2.5 py-1 rounded text-[11px] font-mono font-bold bg-[#00f3ff]/10 text-[#00f3ff] border border-[#00f3ff]/30">
            STRK20 PRIVACY POOL
          </span>
          <span className="px-2.5 py-1 rounded text-[11px] font-mono font-bold bg-purple-500/10 text-purple-300 border border-purple-500/30">
            1-CLICK VPS NODE &amp; CHROME EXTENSION READY
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-5">
            <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-none text-white">
              PRIVACY-FIRST <span className="text-[#00ff41]">BROWSER MINING</span> &amp;{' '}
              <span className="text-[#00f3ff]">UNLINKABLE dVPN</span>
            </h1>
            <p className="text-gray-300 text-sm md:text-base leading-relaxed max-w-2xl">
              Mine <strong className="text-white">SBLAKE</strong> directly in your PC or mobile browser using multi-core BLAKE2s Web Workers. Lock rewards in the{' '}
              <strong className="text-[#00f3ff]">STRK20 Dark Pool (&ge;7 days)</strong> for a{' '}
              <strong className="text-[#00ff41]">+15% emission boost</strong> and{' '}
              <strong className="text-[#00ff41]">50% Mint Fee discount</strong>, or spend shielded notes to activate unlinkable{' '}
              <strong className="text-white">BlakeVPN WireGuard &amp; Browser Proxy</strong> sessions.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={() => onNavigate('miner')}
                className="px-6 py-3.5 bg-[#00ff41] text-black font-black text-xs uppercase tracking-wider rounded-sm hover:bg-[#00cc33] shadow-[0_0_25px_rgba(0,255,65,0.3)] transition-all flex items-center gap-2"
              >
                <Cpu size={16} />
                Launch Browser PC Miner
                <ArrowRight size={15} />
              </button>

              <button
                onClick={() => onNavigate('vpn')}
                className="px-5 py-3.5 bg-[#00f3ff]/15 text-[#00f3ff] border border-[#00f3ff]/40 font-bold text-xs uppercase tracking-wider rounded-sm hover:bg-[#00f3ff]/25 transition-all flex items-center gap-2"
              >
                <GlobeLock size={16} />
                Setup BlakeVPN &amp; Node
              </button>

              <button
                onClick={() => onNavigate('status')}
                className="px-5 py-3.5 bg-white/5 text-gray-200 border border-gray-700 font-bold text-xs uppercase tracking-wider rounded-sm hover:bg-white/10 transition-all flex items-center gap-2"
              >
                <BarChart3 size={16} />
                Status &amp; Flywheel Audit
              </button>

              <button
                onClick={() => onNavigate('docs')}
                className="px-5 py-3.5 bg-purple-500/15 text-purple-300 border border-purple-500/40 font-bold text-xs uppercase tracking-wider rounded-sm hover:bg-purple-500/25 transition-all flex items-center gap-2"
              >
                <BookOpen size={16} />
                Docs &amp; 1-Click VPS Guide
              </button>
            </div>

            {!address && (
              <div className="pt-2 flex flex-wrap items-center gap-3 text-xs text-gray-400 font-mono">
                <span>No wallet connected yet?</span>
                <button
                  onClick={onConnect}
                  className="text-[#00ff41] underline hover:text-white font-bold"
                >
                  Connect Xverse / Argent X / Braavos
                </button>
                <span>or</span>
                <button
                  onClick={onStartBurner}
                  className="text-[#00f3ff] underline hover:text-white font-bold"
                >
                  Start Instant Burner Session
                </button>
              </div>
            )}
          </div>

          {/* Right Summary Telemetry Box */}
          <div className="lg:col-span-5 bg-black/80 border border-gray-800 p-5 rounded-sm space-y-4">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <span className="text-xs font-mono font-bold text-white uppercase flex items-center gap-2">
                <Zap size={15} className="text-[#00ff41]" />
                Draft 1.1 Protocol Baseline
              </span>
              <span className="text-[10px] font-mono bg-[#00ff41]/10 text-[#00ff41] px-2 py-0.5 rounded font-bold">
                ERA {timeline.era} LIVE
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-3 bg-white/[0.02] border border-gray-800/80 rounded">
                <div className="text-[10px] text-gray-500">ERA 1 MINT REWARD</div>
                <div className="text-base font-black text-white mt-0.5">10 SBLAKE</div>
                <div className="text-[10px] text-[#00f3ff]">11.5 SBLAKE Shielded (+15%)</div>
              </div>
              <div className="p-3 bg-white/[0.02] border border-gray-800/80 rounded">
                <div className="text-[10px] text-gray-500">HALVING INTERVAL</div>
                <div className="text-base font-black text-white mt-0.5">900,000 Mints</div>
                <div className="text-[10px] text-gray-400">~10–14 Mos (400–600 Miners)</div>
              </div>
              <div className="p-3 bg-white/[0.02] border border-gray-800/80 rounded">
                <div className="text-[10px] text-gray-500">PROTOCOL MINT FEE</div>
                <div className="text-base font-black text-white mt-0.5">0.5–1.0 STRK</div>
                <div className="text-[10px] text-[#00ff41]">50% Off w/ &ge;7d STRK20 Lock</div>
              </div>
              <div className="p-3 bg-white/[0.02] border border-gray-800/80 rounded">
                <div className="text-[10px] text-gray-500">REVENUE ROUTING</div>
                <div className="text-base font-black text-white mt-0.5">60 / 25 / 15%</div>
                <div className="text-[10px] text-gray-400">$5k/mo Ops Floor + TWAP Burn</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Invited Beta Validation Gates (3-4 Month Cohort Tracker) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Cohort 1: BlakeNode DePIN Operators */}
        <div className="glass-panel p-6 border border-gray-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
                <Server size={18} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wide">
                  Cohort 1: Invited BlakeNode Operators
                </h3>
                <p className="text-[11px] text-gray-400 font-mono">
                  Target: 15–25 Multi-Region Exit &amp; Relay Nodes (EU / US / Asia)
                </p>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-purple-400 bg-purple-500/10 px-2.5 py-1 rounded border border-purple-500/30">
              {activeNodes} / 25 Nodes
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] font-mono text-gray-400">
              <span>Cohort 1 Onboarding Progress</span>
              <span className="text-purple-300 font-bold">{nodeProgressPct}%</span>
            </div>
            <div className="w-full h-2 bg-black/80 rounded-full overflow-hidden border border-gray-800">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-[#00f3ff]"
                style={{ width: `${nodeProgressPct}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] font-mono">
            <div className="p-2.5 bg-black/60 border border-gray-800/80 rounded">
              <div className="text-gray-500">UPTIME SLA</div>
              <div className="text-white font-bold mt-0.5">&ge; 95.0%</div>
            </div>
            <div className="p-2.5 bg-black/60 border border-gray-800/80 rounded">
              <div className="text-gray-500">BW COST CAP</div>
              <div className="text-white font-bold mt-0.5">&le; $200/mo</div>
            </div>
            <div className="p-2.5 bg-black/60 border border-gray-800/80 rounded">
              <div className="text-gray-500">NODE BOND</div>
              <div className="text-[#00ff41] font-bold mt-0.5">10k SBLAKE*</div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-gray-800/80 text-xs">
            <span className="text-gray-400 text-[11px]">
              *Invited Beta operators qualify for temporary collateral subsidy.
            </span>
            <button
              onClick={() => onNavigate('vpn')}
              className="text-purple-400 hover:text-purple-300 font-mono font-bold flex items-center gap-1 shrink-0"
            >
              Bond Node <ArrowRight size={13} />
            </button>
          </div>
        </div>

        {/* Cohort 2: BlakeVPN Client Testers */}
        <div className="glass-panel p-6 border border-gray-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded bg-[#00f3ff]/10 border border-[#00f3ff]/30 flex items-center justify-center text-[#00f3ff]">
                <GlobeLock size={18} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wide">
                  Cohort 2: Invited BlakeVPN Client Testers
                </h3>
                <p className="text-[11px] text-gray-400 font-mono">
                  Target: 40–80 Unlinkable STRK20 VPN Sessions
                </p>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-[#00f3ff] bg-[#00f3ff]/10 px-2.5 py-1 rounded border border-[#00f3ff]/30">
              {activeVpnTesters} / 80 Testers
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] font-mono text-gray-400">
              <span>Cohort 2 Active Tester Progress</span>
              <span className="text-[#00f3ff] font-bold">{vpnProgressPct}%</span>
            </div>
            <div className="w-full h-2 bg-black/80 rounded-full overflow-hidden border border-gray-800">
              <div
                className="h-full bg-gradient-to-r from-[#00ff41] to-[#00f3ff]"
                style={{ width: `${vpnProgressPct}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] font-mono">
            <div className="p-2.5 bg-black/60 border border-gray-800/80 rounded">
              <div className="text-gray-500">30D RETENTION</div>
              <div className="text-white font-bold mt-0.5">&ge; 40.0%</div>
            </div>
            <div className="p-2.5 bg-black/60 border border-gray-800/80 rounded">
              <div className="text-gray-500">WILLING TO PAY</div>
              <div className="text-white font-bold mt-0.5">&ge; 30.0%</div>
            </div>
            <div className="p-2.5 bg-black/60 border border-gray-800/80 rounded">
              <div className="text-gray-500">BETA PASS RATE</div>
              <div className="text-[#00ff41] font-bold mt-0.5">$5/mo (250 SB)</div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-gray-800/80 text-xs">
            <span className="text-gray-400 text-[11px]">
              Supports WireGuard .conf download + Browser Proxy PAC config.
            </span>
            <button
              onClick={() => onNavigate('vpn')}
              className="text-[#00f3ff] hover:text-white font-mono font-bold flex items-center gap-1 shrink-0"
            >
              Get VPN Pass <ArrowRight size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Architectural Blueprint: Why Browser PC Mining + Hybrid WireGuard/Proxy VPN */}
      <div className="glass-panel p-6 border border-gray-800 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-800 pb-4">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Layers size={16} className="text-[#00ff41]" />
              Beta Architecture: Browser PC Miner + Hybrid WireGuard / Browser Proxy VPN
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Engineered for maximum multi-core hashrate, native Starknet wallet signing, and zero-driver VPN onboarding.
            </p>
          </div>
          <span className="text-[11px] font-mono text-[#00ff41] bg-[#00ff41]/10 px-2.5 py-1 rounded border border-[#00ff41]/20 shrink-0">
            ARCHITECTURE VERIFIED
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="p-4 bg-black/60 border border-gray-800 rounded-sm space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-[#00ff41] uppercase">
                1. Browser PC Web Miner
              </span>
              <Cpu size={16} className="text-[#00ff41]" />
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              Runs directly in your desktop or mobile browser using dedicated Web Workers (`navigator.hardwareConcurrency`) without Chrome Manifest V3 background service-worker throttling.
            </p>
            <div className="pt-1 flex items-center gap-1.5 text-[11px] font-mono text-gray-300">
              <CheckCircle2 size={13} className="text-[#00ff41]" />
              Native Xverse, Argent X &amp; Braavos injection
            </div>
          </div>

          <div className="p-4 bg-black/60 border border-gray-800 rounded-sm space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-[#00f3ff] uppercase">
                2. STRK20 7-Day Dark Pool
              </span>
              <Lock size={16} className="text-[#00f3ff]" />
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              Shielded minting generates Poseidon/SHA-256 commitments (`604,800s` maturity). Holding &ge;7 days unlocks a <strong className="text-white">50% Mint Fee discount</strong> and keeps Year-1 free float &le;45%.
            </p>
            <div className="pt-1 flex items-center gap-1.5 text-[11px] font-mono text-gray-300">
              <CheckCircle2 size={13} className="text-[#00f3ff]" />
              Unlinkable nullifier spending for VPN passes
            </div>
          </div>

          <div className="p-4 bg-black/60 border border-gray-800 rounded-sm space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-purple-400 uppercase">
                3. Hybrid WireGuard + Proxy VPN
              </span>
              <Terminal size={16} className="text-purple-400" />
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              Generate ephemeral WireGuard `.conf` profiles in-browser for full OS-level encryption on PC/iOS/Android, or use our lightweight Browser Proxy mode (`HTTPS/SOCKS5`) with zero OS drivers.
            </p>
            <div className="pt-1 flex items-center gap-1.5 text-[11px] font-mono text-gray-300">
              <CheckCircle2 size={13} className="text-purple-400" />
              60% Ops / 25% Burn / 15% Yield on every pass
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
