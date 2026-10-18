import React, { useState } from 'react';
import {
  TrendingUp,
  ShieldAlert,
  Flame,
  DollarSign,
  Cpu,
  Clock,
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  Server,
  GlobeLock,
  Sliders,
} from 'lucide-react';

export const EconomicSimulator: React.FC = () => {
  // Draft 1.1 (Oct 2026) Configurable Simulation Parameters
  const [scenario, setScenario] = useState<'beta' | 'target' | 'growth'>('target');
  const [activeMiners, setActiveMiners] = useState<number>(600);
  const [shieldedRatio, setShieldedRatio] = useState<number>(70); // % miners locking in STRK20 >= 7 days (+15% reward & 50% fee discount)
  const [avgDailyMints, setAvgDailyMints] = useState<number>(4); // avg mints/miner/day (~876k mints/yr at 600 miners)
  const [vpnSubscribers, setVpnSubscribers] = useState<number>(650); // Paying BlakeVPN subscribers
  const [vpnPriceUSD, setVpnPriceUSD] = useState<number>(8); // $5 Beta min, $8-$10 Post-Beta target
  const [bondedNodes, setBondedNodes] = useState<number>(50); // 10,000 SBLAKE per node
  const [mintFeeSTRK, setMintFeeSTRK] = useState<number>(0.8); // 0.5 - 1.0 STRK protocol fee per mint
  const [tokenPriceUSD, setTokenPriceUSD] = useState<number>(0.025);
  const [strkPriceUSD, setStrkPriceUSD] = useState<number>(0.45);

  const applyPreset = (type: 'beta' | 'target' | 'growth') => {
    setScenario(type);
    if (type === 'beta') {
      // Scenario A: Minimum Conservative (Invited Beta)
      setActiveMiners(400);
      setAvgDailyMints(3.5);
      setShieldedRatio(65);
      setVpnSubscribers(120);
      setVpnPriceUSD(5);
      setBondedNodes(20);
      setMintFeeSTRK(0.6);
      setTokenPriceUSD(0.02);
    } else if (type === 'target') {
      // Scenario B: Balanced Target (Post-Beta)
      setActiveMiners(600);
      setAvgDailyMints(4);
      setShieldedRatio(70);
      setVpnSubscribers(650);
      setVpnPriceUSD(8);
      setBondedNodes(50);
      setMintFeeSTRK(0.8);
      setTokenPriceUSD(0.025);
    } else {
      // Scenario C: Growth Scale
      setActiveMiners(1200);
      setAvgDailyMints(4.5);
      setShieldedRatio(75);
      setVpnSubscribers(2500);
      setVpnPriceUSD(9);
      setBondedNodes(120);
      setMintFeeSTRK(1.0);
      setTokenPriceUSD(0.04);
    }
  };

  // --- 1. Emission & Halving Calculations (Draft 1.1: Era 1 = 10 SBLAKE, 900k mint interval) ---
  const dailyMints = activeMiners * avgDailyMints;
  const monthlyMints = dailyMints * 30;
  const yearlyMints = dailyMints * 365;

  // Era 1 base = 10 SBLAKE, Shielded = 11.5 SBLAKE (+15%)
  const effectiveRewardPerMint = (10 * (100 - shieldedRatio) + 11.5 * shieldedRatio) / 100;
  const monthlyGrossTokens = monthlyMints * effectiveRewardPerMint;
  const year1GrossTokens = Math.min(9800000, yearlyMints * effectiveRewardPerMint);
  const monthsToEra1Halving = monthlyMints > 0 ? (900000 / monthlyMints).toFixed(1) : '---';

  // --- 2. Protocol Revenue Streams (Draft 1.1 Section 4) ---
  // Miners locking >= 7 days in STRK20 get a 50% protocol mint fee discount
  const effectiveMintFeeSTRK =
    mintFeeSTRK * ((100 - shieldedRatio) / 100 + (shieldedRatio / 100) * 0.5);
  const monthlyMintFeeRevenueUSD = monthlyMints * effectiveMintFeeSTRK * strkPriceUSD;

  // BlakeVPN Subscription Revenue
  const monthlyVpnRevenueUSD = vpnSubscribers * vpnPriceUSD;

  // STRK20 Action Fees ($0.12 flat fee per unshield/private transfer, est. 20% monthly note velocity)
  const monthlyStrk20ActionFeeUSD = monthlyMints * (shieldedRatio / 100) * 0.2 * 0.12;

  const totalMonthlyRevenueUSD =
    monthlyMintFeeRevenueUSD + monthlyVpnRevenueUSD + monthlyStrk20ActionFeeUSD;

  // --- 3. Revenue Allocation Split (60% Ops / 25% Buyback & Burn / 15% Yield & Node Incentives) ---
  const opsCostFloorUSD = 5000; // $3k-$4k 15-20 nodes + $1k-$1.5k lean marketing + $500-$1k contingency
  const rawOpsAllocationUSD = totalMonthlyRevenueUSD * 0.6;
  // Taper rule: Once $5,000/mo Ops Floor is comfortably covered, excess tapers into Buyback & Burn
  const effectiveOpsAllocationUSD =
    rawOpsAllocationUSD > 6500 ? 6000 + (rawOpsAllocationUSD - 6000) * 0.5 : rawOpsAllocationUSD;
  const opsFloorCoveragePct = Math.min(200, (effectiveOpsAllocationUSD / opsCostFloorUSD) * 100);

  const buybackBurnUSD =
    totalMonthlyRevenueUSD * 0.25 + Math.max(0, rawOpsAllocationUSD - effectiveOpsAllocationUSD);
  const shieldedAndNodeYieldUSD = totalMonthlyRevenueUSD * 0.15;

  // Monthly Tokens Burned (Ekubo TWAP Buyback + 0.25% STRK20 Unshield Burn + Overclock/Stealth ID Utility Burns)
  const monthlyTwapBurnTokens = tokenPriceUSD > 0 ? buybackBurnUSD / tokenPriceUSD : 0;
  const monthlyUtilityAndUnshieldBurnTokens =
    monthlyGrossTokens * (shieldedRatio / 100) * 0.0025 + activeMiners * 12; // est. 12 SBLAKE/mo utility burn per miner
  const totalMonthlyBurnTokens = monthlyTwapBurnTokens + monthlyUtilityAndUnshieldBurnTokens;

  // --- 4. Year-1 Supply Lock & Free Float Audit (Target <= 40-45% Free Float) ---
  const nodeCollateralLocked = bondedNodes * 10000; // 10,000 SBLAKE per BlakeNode
  const year1BurnedTokens = Math.min(year1GrossTokens * 0.35, totalMonthlyBurnTokens * 12);
  const year1ShieldedLocked = (year1GrossTokens - year1BurnedTokens) * (shieldedRatio / 100) * 0.65; // 65% retained in 7-day+ dark pool
  const year1LiquidFreeFloat = Math.max(
    0,
    year1GrossTokens - nodeCollateralLocked - year1BurnedTokens - year1ShieldedLocked
  );
  const freeFloatPct = year1GrossTokens > 0 ? (year1LiquidFreeFloat / year1GrossTokens) * 100 : 0;

  const isFlywheelHealthy = effectiveOpsAllocationUSD >= opsCostFloorUSD && freeFloatPct <= 45;

  return (
    <div id="simulator" className="glass-panel p-6 border border-[#00f3ff]/30 bg-black/80 space-y-6">
      {/* Header & Scenario Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 size={20} className="text-[#00f3ff]" />
            <h2 className="text-lg font-black text-white tracking-wide uppercase">
              BlakeVPN & BlakeNode Economic Flywheel Simulator (Draft 1.1)
            </h2>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Auditing the $5,000/mo Ops Cost Floor, 60/25/15 Revenue Split, 10 SBLAKE Era-1 Emission, and Year-1 Free Float (&le;45%).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => applyPreset('beta')}
            className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold transition-all border ${
              scenario === 'beta'
                ? 'bg-[#00ff41]/20 text-[#00ff41] border-[#00ff41]'
                : 'bg-black/60 text-gray-400 border-gray-800 hover:text-white'
            }`}
          >
            1. Invited Beta (Min)
          </button>
          <button
            onClick={() => applyPreset('target')}
            className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold transition-all border ${
              scenario === 'target'
                ? 'bg-[#00f3ff]/20 text-[#00f3ff] border-[#00f3ff]'
                : 'bg-black/60 text-gray-400 border-gray-800 hover:text-white'
            }`}
          >
            2. Post-Beta Target
          </button>
          <button
            onClick={() => applyPreset('growth')}
            className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold transition-all border ${
              scenario === 'growth'
                ? 'bg-purple-500/20 text-purple-400 border-purple-400'
                : 'bg-black/60 text-gray-400 border-gray-800 hover:text-white'
            }`}
          >
            3. Growth Scale
          </button>
        </div>
      </div>

      {/* Interactive Sliders (6 Core Draft 1.1 Levers) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 bg-black/50 p-4 rounded-sm border border-gray-800/80">
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-gray-400 font-mono">Active Miners (400–600 Target)</span>
            <span className="font-bold text-[#00ff41] font-mono">{activeMiners.toLocaleString()}</span>
          </div>
          <input
            type="range"
            min={100}
            max={3000}
            step={50}
            value={activeMiners}
            onChange={(e) => setActiveMiners(Number(e.target.value))}
            className="w-full accent-[#00ff41] cursor-pointer"
          />
          <div className="text-[10px] text-gray-500">
            Era 1: 10 SBLAKE/mint ({monthsToEra1Halving} mos to 900k halving)
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-gray-400 font-mono">Paying BlakeVPN Users</span>
            <span className="font-bold text-[#00f3ff] font-mono">{vpnSubscribers.toLocaleString()}</span>
          </div>
          <input
            type="range"
            min={50}
            max={5000}
            step={50}
            value={vpnSubscribers}
            onChange={(e) => setVpnSubscribers(Number(e.target.value))}
            className="w-full accent-[#00f3ff] cursor-pointer"
          />
          <div className="text-[10px] text-gray-500">
            At ${vpnPriceUSD}/mo subscription (${monthlyVpnRevenueUSD.toLocaleString()}/mo)
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-gray-400 font-mono">7-Day STRK20 Lock Ratio</span>
            <span className="font-bold text-[#00f3ff] font-mono">{shieldedRatio}%</span>
          </div>
          <input
            type="range"
            min={20}
            max={95}
            step={5}
            value={shieldedRatio}
            onChange={(e) => setShieldedRatio(Number(e.target.value))}
            className="w-full accent-[#00f3ff] cursor-pointer"
          />
          <div className="text-[10px] text-gray-500">
            Unlocks +15% reward &amp; 50% Mint Fee discount
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-gray-400 font-mono">Protocol Mint Fee (STRK)</span>
            <span className="font-bold text-white font-mono">{mintFeeSTRK.toFixed(2)} STRK</span>
          </div>
          <input
            type="range"
            min={0.5}
            max={1.0}
            step={0.05}
            value={mintFeeSTRK}
            onChange={(e) => setMintFeeSTRK(Number(e.target.value))}
            className="w-full accent-white cursor-pointer"
          />
          <div className="text-[10px] text-gray-500">
            Eff. avg: {effectiveMintFeeSTRK.toFixed(2)} STRK after 7d lock discount
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-gray-400 font-mono">Bonded BlakeNodes</span>
            <span className="font-bold text-purple-400 font-mono">{bondedNodes} Nodes</span>
          </div>
          <input
            type="range"
            min={15}
            max={250}
            step={5}
            value={bondedNodes}
            onChange={(e) => setBondedNodes(Number(e.target.value))}
            className="w-full accent-purple-400 cursor-pointer"
          />
          <div className="text-[10px] text-gray-500">
            Locks {(nodeCollateralLocked / 1000).toFixed(0)}k SBLAKE (10,000 / node)
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-gray-400 font-mono">SBLAKE Reference Price</span>
            <span className="font-bold text-[#00ff41] font-mono">${tokenPriceUSD.toFixed(3)}</span>
          </div>
          <input
            type="range"
            min={0.01}
            max={0.15}
            step={0.005}
            value={tokenPriceUSD}
            onChange={(e) => setTokenPriceUSD(Number(e.target.value))}
            className="w-full accent-[#00ff41] cursor-pointer"
          />
          <div className="text-[10px] text-gray-500">
            VPN Tier: ${vpnPriceUSD}/mo | STRK: ${strkPriceUSD}
          </div>
        </div>
      </div>

      {/* Top-Level Monthly Revenue & Burn Matrix */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricBox
          title="Monthly Protocol Revenue"
          value={`$${totalMonthlyRevenueUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })} / mo`}
          subtext={`VPN: $${monthlyVpnRevenueUSD.toLocaleString()} + Fees: $${(monthlyMintFeeRevenueUSD + monthlyStrk20ActionFeeUSD).toFixed(0)}`}
          icon={<DollarSign size={16} className="text-[#00ff41]" />}
        />
        <MetricBox
          title="60% Ops Treasury Floor"
          value={`$${effectiveOpsAllocationUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })} / mo`}
          subtext={`${opsFloorCoveragePct.toFixed(0)}% of $5,000/mo Ops Floor`}
          icon={<Server size={16} className="text-[#00f3ff]" />}
        />
        <MetricBox
          title="25%+ Ekubo TWAP Burn"
          value={`${(totalMonthlyBurnTokens / 1000).toFixed(1)}k SBLAKE`}
          subtext={`$${buybackBurnUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo buyback + utility burn`}
          icon={<Flame size={16} className="text-red-400" />}
        />
        <MetricBox
          title="Year-1 Free Float %"
          value={`${freeFloatPct.toFixed(1)}% Float`}
          subtext={freeFloatPct <= 45 ? 'Target <= 45% Achieved' : 'Above 45% Float Target'}
          icon={<ShieldAlert size={16} className={freeFloatPct <= 45 ? 'text-[#00ff41]' : 'text-yellow-400'} />}
        />
      </div>

      {/* Deep-Dive: Ops Cost Floor Breakdown & Supply Lock Audit */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
        {/* Left: $5,000/mo Ops Cost Floor & Revenue Split */}
        <div className="p-4 bg-black/60 rounded-sm border border-gray-800 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
              <GlobeLock size={14} className="text-[#00ff41]" />
              Monthly Operations Floor ($5,000/mo Baseline)
            </h4>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                effectiveOpsAllocationUSD >= opsCostFloorUSD
                  ? 'bg-[#00ff41]/10 text-[#00ff41]'
                  : 'bg-yellow-500/10 text-yellow-400'
              }`}
            >
              {effectiveOpsAllocationUSD >= opsCostFloorUSD ? 'OPS SELF-SUSTAINING' : 'BETA TREASURY SUBSIDY'}
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-gray-800/60">
              <span className="text-gray-400">15–20 Core Exit/Relay Nodes (EU/US/Asia)</span>
              <span className="font-mono text-white font-bold">$3,000 – $4,000 / mo</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-800/60">
              <span className="text-gray-400">Lean Growth &amp; Community Incentives</span>
              <span className="font-mono text-gray-300">$1,000 – $1,500 / mo</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-800/60">
              <span className="text-gray-400">RPC, Relayer &amp; Security Contingency</span>
              <span className="font-mono text-gray-300">$500 – $1,000 / mo</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-gray-400">15% Shielded Pool &amp; Node Bandwidth Yield</span>
              <span className="font-mono text-[#00f3ff] font-bold">
                +${shieldedAndNodeYieldUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })} / mo
              </span>
            </div>
          </div>
        </div>

        {/* Right: Year-1 Emission & Free-Float Audit */}
        <div className="p-4 bg-black/60 rounded-sm border border-gray-800 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
              <Sliders size={14} className="text-[#00f3ff]" />
              Year-1 Supply Distribution &amp; Float Lock
            </h4>
            <span className="text-[10px] font-mono text-gray-400">
              Gross: {(year1GrossTokens / 1000000).toFixed(2)}M / 21M Max
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-gray-800/60">
              <span className="text-gray-400">STRK20 Dark Pool Locked (&ge;7d Maturity)</span>
              <span className="font-mono text-[#00f3ff] font-bold">
                {(year1ShieldedLocked / 1000000).toFixed(2)}M SBLAKE
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-800/60">
              <span className="text-gray-400">BlakeNode Collateral ({bondedNodes} Nodes &times; 10k)</span>
              <span className="font-mono text-purple-400 font-bold">
                {(nodeCollateralLocked / 1000000).toFixed(2)}M SBLAKE
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-800/60">
              <span className="text-gray-400">Cumulative TWAP Buyback &amp; Utility Burns</span>
              <span className="font-mono text-red-400 font-bold">
                -{(year1BurnedTokens / 1000000).toFixed(2)}M SBLAKE
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-gray-400">Net Circulating Free Float</span>
              <span
                className={`font-mono font-bold ${
                  freeFloatPct <= 45 ? 'text-[#00ff41]' : 'text-yellow-400'
                }`}
              >
                {(year1LiquidFreeFloat / 1000000).toFixed(2)}M SBLAKE ({freeFloatPct.toFixed(1)}%)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Beta-First Execution Verdict */}
      <div className="p-3.5 rounded bg-[#00ff41]/5 border border-[#00ff41]/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5 text-gray-300">
          {isFlywheelHealthy ? (
            <CheckCircle2 size={18} className="text-[#00ff41] shrink-0" />
          ) : (
            <AlertTriangle size={18} className="text-yellow-400 shrink-0" />
          )}
          <span>
            <strong>Beta-First Validation Gate:</strong> Public presale is deferred until the 3–4 month Invited Beta validates{' '}
            <span className="text-[#00ff41] font-mono">15–25 BlakeNodes (&ge;95% uptime)</span> and{' '}
            <span className="text-[#00f3ff] font-mono">40–80 VPN testers (&ge;40% 30d retention)</span>.
          </span>
        </div>
        <span className="font-mono text-[11px] text-[#00ff41] shrink-0 uppercase font-bold">
          Draft 1.1 Compliant
        </span>
      </div>
    </div>
  );
};

const MetricBox = ({
  title,
  value,
  subtext,
  icon,
}: {
  title: string;
  value: string;
  subtext: string;
  icon: React.ReactNode;
}) => (
  <div className="p-3 bg-black/60 border border-gray-800/80 rounded-sm space-y-1">
    <div className="flex items-center justify-between text-[11px] text-gray-400 font-mono">
      <span>{title}</span>
      {icon}
    </div>
    <div className="text-base font-black text-white font-mono">{value}</div>
    <div className="text-[10px] text-gray-500 font-mono">{subtext}</div>
  </div>
);
