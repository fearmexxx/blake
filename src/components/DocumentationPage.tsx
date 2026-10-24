import React, { useState } from 'react';
import {
  BookOpen,
  Cpu,
  GlobeLock,
  Server,
  Shield,
  Flame,
  CheckCircle2,
  Copy,
  Check,
  Terminal,
  ArrowRight,
  Lock,
} from 'lucide-react';
import { AppView } from './BetaHomepage';

interface DocumentationPageProps {
  onNavigate: (view: AppView) => void;
}

export const DocumentationPage: React.FC<DocumentationPageProps> = ({ onNavigate }) => {
  const [activeSection, setActiveSection] = useState<'overview' | 'miner' | 'vpn' | 'node' | 'flywheel'>('overview');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const vpsOneLiner = `curl -sSL https://raw.githubusercontent.com/fearmexxx/blake/master/node-runner/install-vps.sh | sudo STARKNET_OPERATOR="0xYOUR_WALLET" BLAKE_REGION="EU-WEST-1" bash`;

  const dockerComposeCmd = `cd node-runner && STARKNET_OPERATOR="0xYOUR_WALLET" BLAKE_REGION="EU-WEST-1" docker compose up -d`;

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <BookOpen size={24} className="text-[#00ff41]" />
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white uppercase">
              Public Alpha &amp; Protocol Documentation
            </h1>
          </div>
          <p className="text-xs md:text-sm text-gray-400 mt-1">
            Complete technical manual for Browser PC Mining, STRK20 7-Day Privacy Pool, BlakeVPN Client/Extension, and 1-Click VPS BlakeNode Hosting.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onNavigate('miner')}
            className="px-3.5 py-2 bg-[#00ff41] text-black font-black text-xs uppercase rounded-sm hover:bg-[#00cc33] transition-colors flex items-center gap-1.5"
          >
            <Cpu size={14} /> Launch Miner
          </button>
          <button
            onClick={() => onNavigate('vpn')}
            className="px-3.5 py-2 bg-[#00f3ff]/15 text-[#00f3ff] border border-[#00f3ff]/40 font-bold text-xs uppercase rounded-sm hover:bg-[#00f3ff]/25 transition-colors flex items-center gap-1.5"
          >
            <GlobeLock size={14} /> VPN &amp; Node Setup
          </button>
        </div>
      </div>

      {/* Section Navigation Pills */}
      <div className="flex flex-wrap gap-2 bg-black/80 p-1.5 rounded border border-gray-800">
        {[
          { id: 'overview', label: '1. Public Alpha Audit', icon: Shield },
          { id: 'miner', label: '2. Browser PC Miner Guide', icon: Cpu },
          { id: 'vpn', label: '3. BlakeVPN Client & Extension', icon: GlobeLock },
          { id: 'node', label: '4. VPS Host & Node Runner', icon: Server },
          { id: 'flywheel', label: '5. Tokenomics & $5k/mo Floor', icon: Flame },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id as any)}
              className={`px-3.5 py-2 rounded-sm text-xs font-mono font-bold uppercase transition-all flex items-center gap-2 ${
                isActive
                  ? 'bg-[#00ff41] text-black shadow-[0_0_15px_rgba(0,255,65,0.25)]'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Section 1: Public Alpha Audit & Readiness */}
      {activeSection === 'overview' && (
        <div className="space-y-6">
          <div className="glass-panel p-6 border border-[#00ff41]/30 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h2 className="text-base font-black text-white uppercase tracking-wide flex items-center gap-2">
                <CheckCircle2 size={18} className="text-[#00ff41]" />
                Public Alpha Audit Checklist (Draft 1.1 Verified)
              </h2>
              <span className="text-[11px] font-mono bg-[#00ff41]/15 text-[#00ff41] px-2.5 py-0.5 rounded font-bold">
                ALL SYSTEMS READY
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 bg-black/70 border border-gray-800 rounded space-y-2">
                <div className="font-mono font-bold text-[#00ff41] uppercase">
                  ✓ Cairo Smart Contract (sblake.cairo)
                </div>
                <p className="text-gray-300 leading-relaxed">
                  Hard-capped at <strong>21,000,000 SBLAKE</strong>. Era 1 emits <strong>10 SBLAKE</strong> transparent or <strong>11.5 SBLAKE</strong> shielded (+15% STRK20 bonus) with a <strong>900,000-mint halving interval</strong> (~10–14 months).
                </p>
              </div>

              <div className="p-4 bg-black/70 border border-gray-800 rounded space-y-2">
                <div className="font-mono font-bold text-[#00f3ff] uppercase">
                  ✓ Continuous Multi-Core Browser Miner
                </div>
                <p className="text-gray-300 leading-relaxed">
                  Calibrated for high-thread desktop CPUs (e.g. AMD Ryzen 9 5900X) with <strong>21-Bit / 24-Bit (Default) / 26-Bit</strong> targets, non-stop round progression, <strong>10/day (20/day Overclock)</strong> anti-Sybil cap, and 1-Click Starknet Multicall batch settlement.
                </p>
              </div>

              <div className="p-4 bg-black/70 border border-gray-800 rounded space-y-2">
                <div className="font-mono font-bold text-purple-400 uppercase">
                  ✓ Hybrid BlakeVPN Client &amp; Chrome Extension
                </div>
                <p className="text-gray-300 leading-relaxed">
                  Supports system-wide <strong>WireGuard .conf</strong> profiles, zero-driver <strong>Browser Proxy .pac</strong> scripts, and an unpackable <strong>Manifest V3 Chrome/Brave Extension</strong> in <code className="text-white">/extension</code>.
                </p>
              </div>

              <div className="p-4 bg-black/70 border border-gray-800 rounded space-y-2">
                <div className="font-mono font-bold text-yellow-400 uppercase">
                  ✓ 1-Click VPS Host &amp; Docker Node Runner
                </div>
                <p className="text-gray-300 leading-relaxed">
                  Turnkey bash installer (<code className="text-white">node-runner/install-vps.sh</code>) and Docker Compose stack (<code className="text-white">node-runner/docker-compose.yml</code> + <code className="text-white">daemon.mjs</code>) for Ubuntu 22.04+ / Debian 12 VPS operators.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section 2: Browser PC Miner Guide */}
      {activeSection === 'miner' && (
        <div className="glass-panel p-6 border border-gray-800 space-y-5">
          <h2 className="text-base font-black text-white uppercase tracking-wide flex items-center gap-2 border-b border-gray-800 pb-3">
            <Cpu size={18} className="text-[#00ff41]" />
            Browser PC Auto-Mining Architecture &amp; Calibration
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 bg-black/70 border border-gray-800 rounded space-y-2">
              <div className="font-mono font-bold text-[#00ff41]">1. Connect or Burner Mode</div>
              <p className="text-gray-400 leading-relaxed">
                Connect <strong>Xverse, Argent X, or Braavos</strong> on Starknet Sepolia—or click <strong>Instant Burner Session</strong> to start hashing immediately with zero setup.
              </p>
            </div>
            <div className="p-4 bg-black/70 border border-gray-800 rounded space-y-2">
              <div className="font-mono font-bold text-[#00f3ff]">2. Continuous Auto-Mode</div>
              <p className="text-gray-400 leading-relaxed">
                Workers never stop when a block is found. Each solved PoW round is queued in the <strong>Live Auto-Mined Block Stream</strong> until you stop or hit the 10/10 (or 20/20 Overclock) daily anti-Sybil cap.
              </p>
            </div>
            <div className="p-4 bg-black/70 border border-gray-800 rounded space-y-2">
              <div className="font-mono font-bold text-purple-400]">3. 1-Click Batch Multicall</div>
              <p className="text-gray-400 leading-relaxed">
                Instead of signing a wallet popup every few seconds, settle all queued PoW proofs in a single Starknet Multicall transaction with 0x-normalized calldata.
              </p>
            </div>
          </div>

          <div className="p-4 bg-black/90 border border-gray-800 rounded space-y-2 text-xs font-mono">
            <div className="text-white font-bold">CPU Difficulty Presets (Calibrated for 4-Core to 24-Thread Desktop CPUs):</div>
            <div className="text-gray-400">• <span className="text-[#00ff41]">21-Bit Balanced</span>: ~2.1M expected hashes (~3–8s on multi-core desktop)</div>
            <div className="text-gray-400">• <span className="text-[#00f3ff]">24-Bit Standard Beta (Default)</span>: ~16.77M expected hashes (~20–60s on Ryzen 9 5900X)</div>
            <div className="text-gray-400">• <span className="text-purple-400">26-Bit High Diff</span>: ~67.1M expected hashes (~1–3 minutes on high-end desktop)</div>
          </div>
        </div>
      )}

      {/* Section 3: BlakeVPN Client & Extension */}
      {activeSection === 'vpn' && (
        <div className="glass-panel p-6 border border-[#00f3ff]/30 space-y-5">
          <h2 className="text-base font-black text-white uppercase tracking-wide flex items-center gap-2 border-b border-gray-800 pb-3">
            <GlobeLock size={18} className="text-[#00f3ff]" />
            BlakeVPN Client &amp; Browser Extension Testing Guide
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs">
            <div className="p-4 bg-black/70 border border-gray-800 rounded space-y-2">
              <div className="font-mono font-bold text-[#00f3ff] uppercase">Mode A: OS WireGuard (.conf)</div>
              <p className="text-gray-300 leading-relaxed">
                Generates a Curve25519 keypair in-browser and downloads a standard <code className="text-white">blakevpn-*.conf</code> file compatible with official Windows, macOS, Linux, iOS, and Android WireGuard clients.
              </p>
            </div>

            <div className="p-4 bg-black/70 border border-gray-800 rounded space-y-2">
              <div className="font-mono font-bold text-[#00ff41] uppercase">Mode B: Browser Proxy (.pac)</div>
              <p className="text-gray-300 leading-relaxed">
                Zero OS drivers required. Downloads a Proxy Auto-Configuration (<code className="text-white">.pac</code>) script routing browser traffic over SOCKS5 (<code className="text-white">:1080</code>) to your selected BlakeNode.
              </p>
            </div>

            <div className="p-4 bg-black/70 border border-purple-500/40 rounded space-y-2">
              <div className="font-mono font-bold text-purple-400 uppercase">Mode C: Chrome / Brave Extension</div>
              <p className="text-gray-300 leading-relaxed">
                Unpack the <code className="text-white">/extension</code> folder in <code className="text-white">chrome://extensions</code> (Developer Mode). Toggle EU, US, or Asia SOCKS5 relays or enter your own custom VPS IP:Port in 1 click.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Section 4: VPS Host & Node Runner */}
      {activeSection === 'node' && (
        <div className="glass-panel p-6 border border-purple-500/30 space-y-5">
          <div className="flex items-center justify-between border-b border-gray-800 pb-3">
            <h2 className="text-base font-black text-white uppercase tracking-wide flex items-center gap-2">
              <Server size={18} className="text-purple-400" />
              Easy VPS Host &amp; DePIN Node Runner Deployment
            </h2>
            <span className="text-[11px] font-mono text-purple-300 bg-purple-500/15 px-2.5 py-0.5 rounded font-bold">
              UBUNTU 22.04+ / DOCKER READY
            </span>
          </div>

          <p className="text-xs text-gray-300 leading-relaxed">
            Any VPS or dedicated server with a public IPv4 address (1 vCPU, 1 GB RAM, Ubuntu 22.04+ or Debian 12) can become a bonded <strong>BlakeNode Exit &amp; SOCKS5 Relay</strong> in under 60 seconds:
          </p>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-[#00ff41] font-bold flex items-center gap-1.5">
                  <Terminal size={14} /> Option 1: 1-Click Automated Bash VPS Installer (node-runner/install-vps.sh)
                </span>
                <button
                  onClick={() => copyText('vps', vpsOneLiner)}
                  className="text-gray-300 hover:text-white flex items-center gap-1 bg-white/10 px-2.5 py-1 rounded"
                >
                  {copiedId === 'vps' ? <Check size={13} className="text-[#00ff41]" /> : <Copy size={13} />}
                  {copiedId === 'vps' ? 'Copied!' : 'Copy Command'}
                </button>
              </div>
              <pre className="bg-black/95 border border-gray-800 p-3.5 rounded text-[11px] font-mono text-[#00ff41] overflow-x-auto">
                {vpsOneLiner}
              </pre>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-purple-300 font-bold flex items-center gap-1.5">
                  <Terminal size={14} /> Option 2: Docker Compose Verifier &amp; Telemetry Daemon (node-runner/docker-compose.yml)
                </span>
                <button
                  onClick={() => copyText('docker', dockerComposeCmd)}
                  className="text-gray-300 hover:text-white flex items-center gap-1 bg-white/10 px-2.5 py-1 rounded"
                >
                  {copiedId === 'docker' ? <Check size={13} className="text-[#00ff41]" /> : <Copy size={13} />}
                  {copiedId === 'docker' ? 'Copied!' : 'Copy Command'}
                </button>
              </div>
              <pre className="bg-black/95 border border-gray-800 p-3.5 rounded text-[11px] font-mono text-purple-300 overflow-x-auto">
                {dockerComposeCmd}
              </pre>
            </div>
          </div>

          <div className="p-4 bg-black/70 border border-gray-800 rounded text-xs font-mono space-y-1.5">
            <div className="text-white font-bold">Exposed Ports &amp; SLA Verification:</div>
            <div className="text-gray-400">• <strong className="text-[#00f3ff]">51820/udp</strong>: Kernel WireGuard VPN tunnel endpoint</div>
            <div className="text-gray-400">• <strong className="text-[#00ff41]">1080/tcp</strong>: Zero-driver SOCKS5 Browser Extension &amp; PAC relay</div>
            <div className="text-gray-400">• <strong className="text-purple-400">8088/tcp</strong>: JSON Health &amp; Starknet Sepolia block heartbeat endpoint (<code className="text-white">GET /health</code>)</div>
          </div>
        </div>
      )}

      {/* Section 5: Economic Flywheel */}
      {activeSection === 'flywheel' && (
        <div className="glass-panel p-6 border border-gray-800 space-y-5">
          <h2 className="text-base font-black text-white uppercase tracking-wide flex items-center gap-2 border-b border-gray-800 pb-3">
            <Flame size={18} className="text-red-400" />
            Draft 1.1 Economic Flywheel &amp; $5,000/mo Operations Cost Floor
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
            <div className="p-4 bg-black/70 border border-gray-800 rounded space-y-1.5">
              <div className="text-[#00ff41] font-bold">60% OPERATIONS TREASURY</div>
              <div className="text-lg font-black text-white">$5,000/mo Floor</div>
              <p className="text-gray-400 font-sans">
                Covers 15–20 multi-region core exit nodes ($3k–$4k), community growth ($1k–$1.5k), and Starknet RPC/relayer infra ($500–$1k).
              </p>
            </div>

            <div className="p-4 bg-black/70 border border-gray-800 rounded space-y-1.5">
              <div className="text-red-400 font-bold">25% EKUBO TWAP BUYBACK &amp; BURN</div>
              <div className="text-lg font-black text-white">20–30% Band</div>
              <p className="text-gray-400 font-sans">
                Automated on-chain buyback and permanent burn from STRK mint fees and BlakeVPN pass revenue. Scales up as revenue exceeds $7.5k/mo.
              </p>
            </div>

            <div className="p-4 bg-black/70 border border-gray-800 rounded space-y-1.5">
              <div className="text-[#00f3ff] font-bold">15% SHIELDED YIELD &amp; NODES</div>
              <div className="text-lg font-black text-white">10–20% Band</div>
              <p className="text-gray-400 font-sans">
                Rewards STRK20 notes locked &ge;7 days and bonded BlakeNode operators maintaining &ge;95% uptime SLA.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-gray-800 text-xs">
            <span className="text-gray-400 flex items-center gap-1.5">
              <Lock size={14} className="text-[#00f3ff]" />
              Year-1 Net Circulating Free Float Target: <strong>&le; 40–45% of emitted supply</strong>
            </span>
            <button
              onClick={() => onNavigate('status')}
              className="text-[#00ff41] hover:underline font-mono font-bold flex items-center gap-1"
            >
              Open Live Economic Simulator <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
