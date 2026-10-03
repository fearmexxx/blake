import React, { useState } from 'react';
import { TrendingUp, ShieldAlert, Flame, DollarSign, Cpu, Clock, CheckCircle2, AlertTriangle, ArrowRight, BarChart3 } from 'lucide-react';

export const EconomicSimulator: React.FC = () => {
  // Configurable Simulation Parameters
  const [activeMiners, setActiveMiners] = useState<number>(1500);
  const [shieldedRatio, setShieldedRatio] = useState<number>(70); // % miners choosing STRK20 (+15%)
  const [avgDailyMints, setAvgDailyMints] = useState<number>(6); // average mints per miner per day (cap: 10 or 20)
  const [tokenPriceUSD, setTokenPriceUSD] = useState<number>(0.035);
  const [strkPriceUSD, setStrkPriceUSD] = useState<number>(0.45);
  const [gasPerMintSTRK, setGasPerMintSTRK] = useState<number>(0.0025); // actual Starknet Fri cost

  // Calculated Metrics
  const dailyMints = activeMiners * avgDailyMints;
  
  // Reward: 100 base or 115 shielded
  const effectiveRewardPerMint = (100 * (100 - shieldedRatio) + 115 * shieldedRatio) / 100;
  const dailyGrossTokens = dailyMints * effectiveRewardPerMint;
  const dailyGrossUSD = dailyGrossTokens * tokenPriceUSD;

  // Supply Distribution
  const dailyShieldedTokens = (dailyGrossTokens * shieldedRatio) / 100;
  const dailyLiquidSellPressureTokens = dailyGrossTokens - dailyShieldedTokens;
  const dailyLiquidSellPressureUSD = dailyLiquidSellPressureTokens * tokenPriceUSD;

  // Burn Sinks (0.25% unshielding fee + DEX fee allocation)
  const dailyBurnTokens = (dailyShieldedTokens * 0.0025) + (dailyLiquidSellPressureTokens * 0.003);
  const dailyBurnUSD = dailyBurnTokens * tokenPriceUSD;

  // Miner Unit Economics
  const minerDailyTokens = avgDailyMints * (shieldedRatio > 50 ? 115 : 100);
  const minerDailyGrossRevenue = minerDailyTokens * tokenPriceUSD;
  const minerDailyGasCostUSD = avgDailyMints * gasPerMintSTRK * strkPriceUSD;
  const minerDailyNetProfit = minerDailyGrossRevenue - minerDailyGasCostUSD;
  const minerProfitMargin = minerDailyGrossRevenue > 0 
    ? ((minerDailyNetProfit / minerDailyGrossRevenue) * 100).toFixed(1) 
    : '0';

  // Halving Projections (Era 1 = 100,000 mints)
  const daysToHalving = dailyMints > 0 ? (100000 / dailyMints).toFixed(1) : '---';

  // Liquidity Sustainability Assessment (Assume $42,000 initial DEX LP: $21k SBLAKE + $21k STRK/ETH)
  const initialPoolLiquidityUSD = 42000;
  const liquidPressureToPoolRatio = initialPoolLiquidityUSD > 0 
    ? (dailyLiquidSellPressureUSD / (initialPoolLiquidityUSD / 2)) * 100 
    : 0;

  const isHealthy = liquidPressureToPoolRatio < 35 && shieldedRatio >= 50;

  return (
    <div id="simulator" className="glass-panel p-6 border border-[#00f3ff]/30 bg-black/80 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 size={20} className="text-[#00f3ff]" />
            <h2 className="text-lg font-black text-white tracking-wide uppercase">
              SBLAKE Economic Flywheel & Feasibility Simulator
            </h2>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Real-world Starknet market condition stress-testing: STRK20 Dark Pool absorption, DEX liquidity resilience, and miner ROI.
          </p>
        </div>

        <div className={`px-3 py-1 rounded text-xs font-mono font-bold flex items-center gap-1.5 shrink-0 ${
          isHealthy ? 'bg-[#00ff41]/10 text-[#00ff41] border border-[#00ff41]/30' : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30'
        }`}>
          {isHealthy ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          {isHealthy ? 'FLYWHEEL SUSTAINABLE' : 'HIGH SELL PRESSURE'}
        </div>
      </div>

      {/* Interactive Sliders */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-black/50 p-4 rounded-sm border border-gray-800/80">
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-gray-400 font-mono">Active Daily Miners</span>
            <span className="font-bold text-[#00ff41] font-mono">{activeMiners.toLocaleString()}</span>
          </div>
          <input
            type="range"
            min={100}
            max={25000}
            step={100}
            value={activeMiners}
            onChange={(e) => setActiveMiners(Number(e.target.value))}
            className="w-full accent-[#00ff41] cursor-pointer"
          />
          <div className="text-[10px] text-gray-500">Targeting mobile & desktop browser miners</div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-gray-400 font-mono">STRK20 Shielded Ratio</span>
            <span className="font-bold text-[#00f3ff] font-mono">{shieldedRatio}%</span>
          </div>
          <input
            type="range"
            min={10}
            max={95}
            step={5}
            value={shieldedRatio}
            onChange={(e) => setShieldedRatio(Number(e.target.value))}
            className="w-full accent-[#00f3ff] cursor-pointer"
          />
          <div className="text-[10px] text-gray-500">+15% yield boost incentivizes dark pool lockup</div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-gray-400 font-mono">SBLAKE Market Price</span>
            <span className="font-bold text-white font-mono">${tokenPriceUSD.toFixed(3)}</span>
          </div>
          <input
            type="range"
            min={0.005}
            max={0.25}
            step={0.005}
            value={tokenPriceUSD}
            onChange={(e) => setTokenPriceUSD(Number(e.target.value))}
            className="w-full accent-white cursor-pointer"
          />
          <div className="text-[10px] text-gray-500">Genesis baseline: $0.02 / SBLAKE</div>
        </div>
      </div>

      {/* Flywheel Simulation Visual Matrix */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricBox
          title="Daily Gross Issuance"
          value={`${(dailyGrossTokens / 1000).toFixed(1)}k SBLAKE`}
          subtext={`$${dailyGrossUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })} / day`}
          icon={<DollarSign size={16} className="text-[#00ff41]" />}
        />
        <MetricBox
          title="STRK20 Absorbed & Locked"
          value={`${(dailyShieldedTokens / 1000).toFixed(1)}k SBLAKE`}
          subtext={`${shieldedRatio}% kept off DEX books`}
          icon={<ShieldAlert size={16} className="text-[#00f3ff]" />}
        />
        <MetricBox
          title="Liquid DEX Sell Pressure"
          value={`$${dailyLiquidSellPressureUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })} / day`}
          subtext={`${(dailyLiquidSellPressureTokens / 1000).toFixed(1)}k SBLAKE float`}
          icon={<TrendingUp size={16} className="text-orange-400" />}
        />
        <MetricBox
          title="Deflationary Burn Sinks"
          value={`${dailyBurnTokens.toFixed(0)} SBLAKE / day`}
          subtext="0.25% Unshield + LP fee burn"
          icon={<Flame size={16} className="text-red-400" />}
        />
      </div>

      {/* Deep-Dive Unit Economics & Feasibility Verdict */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
        {/* Miner Economics */}
        <div className="p-4 bg-black/60 rounded-sm border border-gray-800 space-y-3">
          <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
            <Cpu size={14} className="text-[#00ff41]" />
            Miner Unit Economics (Per Device / Day)
          </h4>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-gray-800/60">
              <span className="text-gray-400">Daily Mined Reward</span>
              <span className="font-mono text-white font-bold">{minerDailyTokens} SBLAKE (~${minerDailyGrossRevenue.toFixed(2)})</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-800/60">
              <span className="text-gray-400">Starknet Sepolia Gas Cost</span>
              <span className="font-mono text-gray-300">{(avgDailyMints * gasPerMintSTRK).toFixed(4)} STRK (~${minerDailyGasCostUSD.toFixed(4)})</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-800/60">
              <span className="text-gray-400">Net Miner Profit</span>
              <span className="font-mono text-[#00ff41] font-bold">+${minerDailyNetProfit.toFixed(2)} / day</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-gray-400">Net Mining Profit Margin</span>
              <span className="font-mono text-[#00ff41] font-bold">{minerProfitMargin}%</span>
            </div>
          </div>
        </div>

        {/* Halving & Feasibility Verdict */}
        <div className="p-4 bg-black/60 rounded-sm border border-gray-800 space-y-3">
          <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
            <Clock size={14} className="text-[#00f3ff]" />
            Halving Cadence & Feasibility Assessment
          </h4>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-gray-800/60">
              <span className="text-gray-400">Days to Era 1 Halving (100k Mints)</span>
              <span className="font-mono text-white font-bold">{daysToHalving} Days</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-800/60">
              <span className="text-gray-400">DEX Daily Absorption Ratio</span>
              <span className={`font-mono font-bold ${liquidPressureToPoolRatio < 30 ? 'text-[#00ff41]' : 'text-yellow-400'}`}>
                {liquidPressureToPoolRatio.toFixed(1)}% of Seed LP
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-gray-400">Phase 2 dVPN Staking Utility</span>
              <span className="font-mono text-[#00f3ff] font-bold">+40% Bandwidth Yield Sink</span>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 italic pt-1 leading-relaxed">
            {shieldedRatio >= 60 
              ? "✓ Feasibility Confirmed: The +15% STRK20 Shielded emission bonus absorbs sufficient circulating supply to prevent DEX order book collapse during early eras."
              : "! Risk Notice: A low shielding ratio leaves high liquid supply. Enforcing the 10 mints/day cap and Brother ID bonus is mandatory to preserve liquidity depth."}
          </p>
        </div>
      </div>
    </div>
  );
};

const MetricBox = ({ title, value, subtext, icon }: { title: string; value: string; subtext: string; icon: React.ReactNode }) => (
  <div className="p-3 bg-black/60 border border-gray-800/80 rounded-sm space-y-1">
    <div className="flex items-center justify-between text-[11px] text-gray-400 font-mono">
      <span>{title}</span>
      {icon}
    </div>
    <div className="text-base font-black text-white font-mono">{value}</div>
    <div className="text-[10px] text-gray-500 font-mono">{subtext}</div>
  </div>
);
