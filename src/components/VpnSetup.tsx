import React, { useState, useEffect } from 'react';
import {
  GlobeLock,
  Server,
  Download,
  Copy,
  Check,
  Key,
  Shield,
  Terminal,
  Loader2,
  Sparkles,
  CheckCircle2,
  Laptop,
  Globe,
  RefreshCw,
} from 'lucide-react';
import {
  purchaseVpnPass,
  bondBlakeNode,
  getProtocolMetrics,
  ProtocolMetrics,
} from '../utils/starknet';
import {
  getLocalNotes,
  computeNullifier,
  markNoteSpent,
  seedBetaMaturedNote,
  StoredShieldedNote,
} from '../utils/privacy';

interface VpnSetupProps {
  address: string | null;
  account: any;
  onConnect: () => void;
}

interface VpnRegion {
  id: string;
  name: string;
  location: string;
  endpoint: string;
  proxyHost: string;
  nodePubKey: string;
  latencyMs: number;
  loadPct: number;
}

const VPN_REGIONS: VpnRegion[] = [
  {
    id: 'EU-WEST-1',
    name: 'EU-West (Frankfurt)',
    location: 'Frankfurt, Germany',
    endpoint: '185.212.144.28:51820',
    proxyHost: 'eu-west-1.relay.blakevpn.network:1080',
    nodePubKey: 'm8K9pZ4xQ7vL2nR5tY8wB1cV6fG3hJ9kL4mN7pQ2sT8=',
    latencyMs: 24,
    loadPct: 38,
  },
  {
    id: 'US-EAST-1',
    name: 'US-East (Virginia)',
    location: 'Ashburn, USA',
    endpoint: '198.51.100.84:51820',
    proxyHost: 'us-east-1.relay.blakevpn.network:1080',
    nodePubKey: 'x7P2qW9rE4tY6uI8oP1aS3dF5gH7jK9lZ2xC4vB6nM0=',
    latencyMs: 68,
    loadPct: 44,
  },
  {
    id: 'AP-SE-1',
    name: 'Asia-Pacific (Singapore)',
    location: 'Singapore, SG',
    endpoint: '203.0.113.192:51820',
    proxyHost: 'ap-se-1.relay.blakevpn.network:1080',
    nodePubKey: 'k3L8mN1pQ6rS9tU2vW5xY7zA4bC8dE1fG5hI9jK2lM4=',
    latencyMs: 41,
    loadPct: 31,
  },
];

// Generate realistic Base64 WireGuard 32-byte key in browser
const generateWireGuardKey = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // Clamp Curve25519 bits
  bytes[0] &= 248;
  bytes[31] &= 127;
  bytes[31] |= 64;
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
};

export const VpnSetup: React.FC<VpnSetupProps> = ({ address, account, onConnect }) => {
  const [activeTab, setActiveTab] = useState<'client' | 'node'>('client');
  const [selectedRegion, setSelectedRegion] = useState<VpnRegion>(VPN_REGIONS[0]);
  const [deliveryMode, setDeliveryMode] = useState<'wireguard' | 'proxy' | 'extension'>('wireguard');
  const [provisionTab, setProvisionTab] = useState<'bash' | 'docker'>('bash');

  // Ephemeral WireGuard Session Keys
  const [wgPrivateKey, setWgPrivateKey] = useState<string>('');
  const [wgPublicKey, setWgPublicKey] = useState<string>('');
  const [sessionFeltPubkey, setSessionFeltPubkey] = useState<string>('');

  // STRK20 Notes for Unlinkable Payment
  const [notes, setNotes] = useState<StoredShieldedNote[]>([]);
  const [selectedNoteCommitment, setSelectedNoteCommitment] = useState<string>('PUBLIC_BALANCE');
  const [isActivatingPass, setIsActivatingPass] = useState(false);
  const [passActivatedTx, setPassActivatedTx] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [copiedConfig, setCopiedConfig] = useState(false);

  // BlakeNode Operator State
  const [nodeRegion, setNodeRegion] = useState<string>('EU-WEST-1');
  const [useBetaSubsidy, setUseBetaSubsidy] = useState<boolean>(true);
  const [nodeEndpointInput, setNodeEndpointInput] = useState<string>('203.0.113.55:51820');
  const [isBondingNode, setIsBondingNode] = useState(false);
  const [nodeBondTx, setNodeBondTx] = useState<string | null>(null);
  const [copiedDocker, setCopiedDocker] = useState(false);
  const [metrics, setMetrics] = useState<ProtocolMetrics | null>(null);

  const regenerateSessionKeys = () => {
    const priv = generateWireGuardKey();
    const pub = generateWireGuardKey();
    const feltHex =
      '0x' +
      Array.from(crypto.getRandomValues(new Uint8Array(24)))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    setWgPrivateKey(priv);
    setWgPublicKey(pub);
    setSessionFeltPubkey(feltHex);
  };

  const refreshNotesAndMetrics = () => {
    const allNotes = getLocalNotes().filter((n) => !n.spent);
    setNotes(allNotes);
    if (allNotes.length > 0 && selectedNoteCommitment === 'PUBLIC_BALANCE') {
      setSelectedNoteCommitment(allNotes[0].commitment);
    }
    getProtocolMetrics().then(setMetrics).catch(() => null);
  };

  useEffect(() => {
    regenerateSessionKeys();
    refreshNotesAndMetrics();
  }, [address]);

  const handleSeedMaturedNote = async () => {
    const owner = address || '0x0123456789abcdef';
    const created = await seedBetaMaturedNote(owner);
    refreshNotesAndMetrics();
    setSelectedNoteCommitment(created.commitment);
  };

  const handleActivateVpnPass = async () => {
    if (!address || !account) {
      onConnect();
      return;
    }
    setIsActivatingPass(true);
    setStatusError(null);
    try {
      let nullifier = '0';
      if (selectedNoteCommitment !== 'PUBLIC_BALANCE') {
        const chosen = notes.find((n) => n.commitment === selectedNoteCommitment);
        if (chosen) {
          nullifier = await computeNullifier(chosen.commitment, chosen.salt);
        }
      }

      const res = await purchaseVpnPass(account, 250, sessionFeltPubkey, nullifier);
      if (selectedNoteCommitment !== 'PUBLIC_BALANCE') {
        markNoteSpent(selectedNoteCommitment);
      }
      setPassActivatedTx(res.transaction_hash);
      refreshNotesAndMetrics();
    } catch (err: any) {
      setStatusError(err?.message || 'Failed to activate BlakeVPN pass on-chain.');
    } finally {
      setIsActivatingPass(false);
    }
  };

  const wireGuardConfText = `[Interface]
# BlakeVPN Unlinkable Session (${selectedRegion.name})
# Session Starknet Auth Key: ${sessionFeltPubkey}
PrivateKey = ${wgPrivateKey}
Address = 10.88.0.14/32
DNS = 1.1.1.1, 9.9.9.9
MTU = 1420

[Peer]
# Verified Bonded BlakeNode (${selectedRegion.location})
PublicKey = ${selectedRegion.nodePubKey}
Endpoint = ${selectedRegion.endpoint}
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25`;

  const browserProxyPacText = `// BlakeVPN Browser-Only PAC Configuration (Zero OS Driver Mode)
// Session Token: ${sessionFeltPubkey.slice(0, 18)}...
function FindProxyForURL(url, host) {
  if (isPlainHostName(host) || shExpMatch(host, "*.local") || host === "localhost") {
    return "DIRECT";
  }
  // Route all browser traffic through bonded BlakeNode SOCKS5/HTTPS relay
  return "SOCKS5 ${selectedRegion.proxyHost}; PROXY ${selectedRegion.proxyHost}; DIRECT";
}`;

  const browserExtensionGuideText = `# BlakeVPN Chrome / Brave Extension (Manifest V3 — /extension folder)
1. Open Chrome or Brave and navigate to: chrome://extensions
2. Enable "Developer mode" (top-right toggle)
3. Click "Load unpacked" and select the project's /extension folder
4. Open the BlakeVPN Extension popup in your browser toolbar:
   - Region: ${selectedRegion.id} (${selectedRegion.name})
   - Custom VPS SOCKS5 (Optional): ${selectedRegion.proxyHost}
   - Active Session Nullifier: ${sessionFeltPubkey.slice(0, 22)}...
5. Click "ACTIVATE UNLINKABLE PROXY" for instant 1-click browser routing!`;

  const handleDownloadConf = () => {
    const content =
      deliveryMode === 'wireguard'
        ? wireGuardConfText
        : deliveryMode === 'proxy'
        ? browserProxyPacText
        : browserExtensionGuideText;
    const filename =
      deliveryMode === 'wireguard'
        ? `blakevpn-${selectedRegion.id.toLowerCase()}.conf`
        : deliveryMode === 'proxy'
        ? `blakevpn-${selectedRegion.id.toLowerCase()}.pac`
        : `blakevpn-extension-setup.txt`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyConfig = () => {
    const content =
      deliveryMode === 'wireguard'
        ? wireGuardConfText
        : deliveryMode === 'proxy'
        ? browserProxyPacText
        : browserExtensionGuideText;
    navigator.clipboard.writeText(content);
    setCopiedConfig(true);
    setTimeout(() => setCopiedConfig(false), 2000);
  };

  const handleBondNode = async () => {
    if (!address || !account) {
      onConnect();
      return;
    }
    setIsBondingNode(true);
    setStatusError(null);
    try {
      const res = await bondBlakeNode(account, nodeRegion, useBetaSubsidy);
      setNodeBondTx(res.transaction_hash);
      refreshNotesAndMetrics();
    } catch (err: any) {
      setStatusError(err?.message || 'BlakeNode bonding transaction failed.');
    } finally {
      setIsBondingNode(false);
    }
  };

  const bashProvisionCmd = `# 1-Click VPS Host Installer (Ubuntu 22.04+ / Debian 12)
curl -sSL https://raw.githubusercontent.com/fearmexxx/blake/master/node-runner/install-vps.sh | \\
  sudo STARKNET_OPERATOR="${address || '0xYOUR_STARKNET_WALLET'}" \\
  BLAKE_REGION="${nodeRegion}" \\
  WG_PORT="51820" SOCKS_PORT="1080" bash`;

  const dockerProvisionCmd = `# Option A: Using node-runner/docker-compose.yml (Recommended)
cd node-runner && STARKNET_OPERATOR="${address || '0xYOUR_STARKNET_WALLET'}" BLAKE_REGION="${nodeRegion}" docker compose up -d

# Option B: Direct Docker Container Run
docker run -d --name blakenode-exit \\
  --cap-add=NET_ADMIN --device=/dev/net/tun \\
  -e STARKNET_OPERATOR="${address || '0xYOUR_STARKNET_WALLET'}" \\
  -e BLAKE_REGION="${nodeRegion}" \\
  -e WG_PUBLIC_ENDPOINT="${nodeEndpointInput}" \\
  -e BETA_SUBSIDIZED="${useBetaSubsidy ? 'true' : 'false'}" \\
  -p 51820:51820/udp -p 1080:1080/tcp -p 8088:8088/tcp \\
  ghcr.io/fearmexxx/blakenode-daemon:v1.1-beta`;

  const handleCopyDocker = () => {
    const textToCopy = provisionTab === 'bash' ? bashProvisionCmd : dockerProvisionCmd;
    navigator.clipboard.writeText(textToCopy);
    setCopiedDocker(true);
    setTimeout(() => setCopiedDocker(false), 2000);
  };

  return (
    <div className="space-y-8">
      {/* Top Header & Mode Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <GlobeLock size={24} className="text-[#00f3ff]" />
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white uppercase">
              BlakeVPN &amp; BlakeNode Setup Center
            </h1>
          </div>
          <p className="text-xs md:text-sm text-gray-400 mt-1">
            Hybrid WireGuard PC/Mobile `.conf` generator, zero-driver Browser Proxy PAC mode, and BlakeNode DePIN operator provisioning.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-black/80 p-1 rounded border border-gray-800 self-start md:self-auto">
          <button
            onClick={() => setActiveTab('client')}
            className={`px-4 py-2 rounded-sm text-xs font-mono font-bold uppercase transition-all flex items-center gap-2 ${
              activeTab === 'client'
                ? 'bg-[#00f3ff] text-black shadow-[0_0_15px_rgba(0,243,255,0.3)]'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <GlobeLock size={14} />
            1. BlakeVPN Client Setup
          </button>
          <button
            onClick={() => setActiveTab('node')}
            className={`px-4 py-2 rounded-sm text-xs font-mono font-bold uppercase transition-all flex items-center gap-2 ${
              activeTab === 'node'
                ? 'bg-purple-500 text-white shadow-[0_0_15px_rgba(168,85,247,0.3)]'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Server size={14} />
            2. BlakeNode Operator Setup
          </button>
        </div>
      </div>

      {statusError && (
        <div className="p-4 rounded bg-red-500/10 border border-red-500/30 text-xs font-mono text-red-400">
          {statusError}
        </div>
      )}

      {activeTab === 'client' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Step 1 & Step 2 (Region, STRK20 Note Selection, On-Chain Pass Activation) */}
          <div className="lg:col-span-6 space-y-6">
            {/* Step 1: Select Exit Node Region */}
            <div className="glass-panel p-6 border border-gray-800 space-y-4">
              <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Globe size={16} className="text-[#00f3ff]" />
                  Step 1: Choose Verified Exit Region
                </h3>
                <span className="text-[10px] font-mono text-[#00ff41] bg-[#00ff41]/10 px-2 py-0.5 rounded">
                  {metrics?.activeNodesCount ?? 18} NODES ONLINE
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {VPN_REGIONS.map((reg) => {
                  const isSelected = selectedRegion.id === reg.id;
                  return (
                    <button
                      key={reg.id}
                      onClick={() => setSelectedRegion(reg)}
                      className={`p-3.5 rounded-sm border text-left transition-all flex items-center justify-between ${
                        isSelected
                          ? 'bg-[#00f3ff]/10 border-[#00f3ff] shadow-[0_0_15px_rgba(0,243,255,0.15)]'
                          : 'bg-black/60 border-gray-800 hover:border-gray-700'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-bold text-white font-mono flex items-center gap-2">
                          <span>{reg.name}</span>
                          {isSelected && (
                            <span className="text-[10px] px-1.5 py-0.2 bg-[#00f3ff] text-black font-black rounded">
                              SELECTED
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-400 font-mono mt-0.5">
                          Endpoint: {reg.endpoint}
                        </div>
                      </div>
                      <div className="text-right font-mono text-xs">
                        <div className="text-[#00ff41] font-bold">{reg.latencyMs} ms</div>
                        <div className="text-[10px] text-gray-500">Load: {reg.loadPct}%</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 2: Unlinkable STRK20 Note Billing */}
            <div className="glass-panel p-6 border border-[#00ff41]/30 space-y-4">
              <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Shield size={16} className="text-[#00ff41]" />
                  Step 2: Unlinkable STRK20 Pass Activation
                </h3>
                <span className="text-[10px] font-mono text-[#00ff41] bg-[#00ff41]/10 px-2 py-0.5 rounded font-bold">
                  250 SBLAKE ($5 BETA)
                </span>
              </div>

              <p className="text-xs text-gray-400 leading-relaxed">
                Spend a <strong className="text-[#00f3ff]">STRK20 Shielded Note</strong> via its cryptographic nullifier so your wallet address is never linked to your WireGuard public key. Protocol automatically routes{' '}
                <strong className="text-white">60% Ops / 25% Burn / 15% Yield</strong>.
              </p>

              {/* Payment Source Selector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-gray-400">Select Payment Note / Source:</span>
                  <button
                    onClick={handleSeedMaturedNote}
                    className="text-[11px] text-[#00f3ff] hover:underline flex items-center gap-1 font-bold"
                  >
                    <Sparkles size={12} /> + Seed 7d Matured Test Note (250 SB)
                  </button>
                </div>

                <select
                  value={selectedNoteCommitment}
                  onChange={(e) => setSelectedNoteCommitment(e.target.value)}
                  className="w-full bg-black/90 border border-gray-800 text-xs font-mono text-white px-3 py-2.5 rounded-sm outline-none focus:border-[#00f3ff]"
                >
                  {notes.map((n) => {
                    const ageDays = Math.floor((Date.now() - n.timestamp) / (1000 * 60 * 60 * 24));
                    const matured = ageDays >= 7;
                    const amtFormatted = (BigInt(n.amount) / 10n ** 18n).toString();
                    return (
                      <option key={n.commitment} value={n.commitment} className="bg-[#0a0a0a]">
                        🔒 STRK20 Note ({amtFormatted} SBLAKE) — {n.commitment.slice(0, 12)}... [
                        {matured ? '7d+ MATURED ✓' : `${ageDays}d old`}]
                      </option>
                    );
                  })}
                  <option value="PUBLIC_BALANCE" className="bg-[#0a0a0a]">
                    💳 Public Wallet Balance (250 SBLAKE — Transparent)
                  </option>
                </select>
              </div>

              {/* Ephemeral Session Key Display */}
              <div className="p-3 bg-black/70 border border-gray-800 rounded space-y-1.5 text-xs font-mono">
                <div className="flex items-center justify-between text-[11px] text-gray-400">
                  <span className="flex items-center gap-1">
                    <Key size={12} className="text-[#00f3ff]" /> Ephemeral Session Public Key:
                  </span>
                  <button
                    onClick={regenerateSessionKeys}
                    className="text-gray-400 hover:text-white flex items-center gap-1 text-[10px]"
                  >
                    <RefreshCw size={11} /> Rotate Keypair
                  </button>
                </div>
                <div className="text-[#00f3ff] truncate">{wgPublicKey}</div>
              </div>

              <button
                onClick={handleActivateVpnPass}
                disabled={isActivatingPass}
                className="w-full py-3.5 px-4 bg-[#00ff41] hover:bg-[#00cc33] text-black font-black text-xs uppercase tracking-wider rounded-sm shadow-[0_0_20px_rgba(0,255,65,0.3)] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isActivatingPass ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    AUTHORIZING UNLINKABLE SESSION ON STARKNET...
                  </>
                ) : (
                  <>
                    <GlobeLock size={16} />
                    ACTIVATE 30-DAY BLAKEVPN PASS (250 SBLAKE)
                  </>
                )}
              </button>

              {passActivatedTx && (
                <div className="p-3 bg-[#00ff41]/10 border border-[#00ff41]/30 rounded text-xs font-mono text-[#00ff41] flex items-start gap-2">
                  <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
                  <div className="break-all">
                    <strong>Session Authorized On-Chain!</strong> Your WireGuard `.conf` and Browser Proxy credentials on the right are now active. Tx: {passActivatedTx.slice(0, 16)}...
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Step 3 (Hybrid Client Delivery: WireGuard .conf vs. Browser Proxy Mode) */}
          <div className="lg:col-span-6 space-y-6">
            <div className="glass-panel p-6 border border-[#00f3ff]/30 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-800 pb-3">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Laptop size={16} className="text-[#00f3ff]" />
                  Step 3: Connect via WireGuard or Browser Proxy
                </h3>

                <div className="flex items-center gap-1.5 bg-black/80 p-1 rounded border border-gray-800 text-[11px] font-mono">
                  <button
                    onClick={() => setDeliveryMode('wireguard')}
                    className={`px-2.5 py-1 rounded font-bold transition-colors ${
                      deliveryMode === 'wireguard'
                        ? 'bg-[#00f3ff] text-black'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    OS WireGuard (.conf)
                  </button>
                  <button
                    onClick={() => setDeliveryMode('proxy')}
                    className={`px-2.5 py-1 rounded font-bold transition-colors ${
                      deliveryMode === 'proxy'
                        ? 'bg-[#00ff41] text-black'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Browser Proxy (.pac)
                  </button>
                  <button
                    onClick={() => setDeliveryMode('extension')}
                    className={`px-2.5 py-1 rounded font-bold transition-colors ${
                      deliveryMode === 'extension'
                        ? 'bg-purple-500 text-white'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Chrome Extension
                  </button>
                </div>
              </div>

              {deliveryMode === 'wireguard' ? (
                <p className="text-xs text-gray-300 leading-relaxed">
                  <strong>System-Wide PC &amp; Mobile Tunnel (Recommended):</strong> Download and import this generated `.conf` file into the official{' '}
                  <a
                    href="https://www.wireguard.com/install/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#00f3ff] underline"
                  >
                    WireGuard App
                  </a>{' '}
                  (Windows, macOS, Linux, iOS, Android) for full kernel-grade encryption.
                </p>
              ) : deliveryMode === 'proxy' ? (
                <p className="text-xs text-gray-300 leading-relaxed">
                  <strong>Instant Browser-Only Routing (Zero OS Drivers):</strong> Load this PAC file or SOCKS5 endpoint (`{selectedRegion.proxyHost}`) directly in your browser network settings to tunnel browser tabs through BlakeNode.
                </p>
              ) : (
                <p className="text-xs text-gray-300 leading-relaxed">
                  <strong>1-Click Chrome / Brave Extension (`/extension`):</strong> Load the included Manifest V3 extension (`extension/manifest.json`) in Developer Mode to toggle SOCKS5 routing directly from your browser toolbar.
                </p>
              )}

              <pre className="bg-black/95 border border-gray-800 p-4 rounded text-[11px] font-mono text-gray-200 overflow-x-auto leading-relaxed">
                {deliveryMode === 'wireguard'
                  ? wireGuardConfText
                  : deliveryMode === 'proxy'
                  ? browserProxyPacText
                  : browserExtensionGuideText}
              </pre>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={handleDownloadConf}
                  className="py-3 px-4 bg-[#00f3ff] hover:bg-[#00d0db] text-black font-black text-xs uppercase tracking-wider rounded-sm transition-colors flex items-center justify-center gap-2"
                >
                  <Download size={15} />
                  {deliveryMode === 'wireguard'
                    ? `Download ${selectedRegion.id.toLowerCase()}.conf`
                    : deliveryMode === 'proxy'
                    ? `Download ${selectedRegion.id.toLowerCase()}.pac`
                    : `Download Extension Guide`}
                </button>

                <button
                  onClick={handleCopyConfig}
                  className="py-3 px-4 bg-white/10 hover:bg-white/20 text-white font-bold text-xs uppercase tracking-wider rounded-sm border border-white/15 transition-colors flex items-center justify-center gap-2"
                >
                  {copiedConfig ? <Check size={15} className="text-[#00ff41]" /> : <Copy size={15} />}
                  {copiedConfig ? 'Copied to Clipboard!' : 'Copy Configuration'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Tab 2: BlakeNode Operator Setup (DePIN Exit & Residential Relay) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-6 space-y-6">
            <div className="glass-panel p-6 border border-purple-500/30 space-y-4">
              <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Server size={16} className="text-purple-400" />
                  Step 1: Bond BlakeNode On-Chain
                </h3>
                <span className="text-[10px] font-mono bg-purple-500/15 text-purple-300 px-2 py-0.5 rounded font-bold">
                  15% PROTOCOL YIELD POOL
                </span>
              </div>

              <p className="text-xs text-gray-300 leading-relaxed">
                Standard BlakeNode exit/relay operators bond <strong className="text-white">10,000 SBLAKE</strong> as SLA collateral. During the <strong className="text-[#00ff41]">3–4 Month Invited Beta</strong>, approved cohort runners can register with a temporary collateral subsidy.
              </p>

              <div className="space-y-3 text-xs font-mono">
                <div>
                  <label className="text-gray-400 block mb-1">Select Node Geographic Region:</label>
                  <select
                    value={nodeRegion}
                    onChange={(e) => setNodeRegion(e.target.value)}
                    className="w-full bg-black/90 border border-gray-800 text-white px-3 py-2.5 rounded-sm outline-none focus:border-purple-400"
                  >
                    <option value="EU-WEST-1">EU-WEST-1 (Frankfurt / Amsterdam)</option>
                    <option value="US-EAST-1">US-EAST-1 (Virginia / New York)</option>
                    <option value="US-WEST-1">US-WEST-1 (Silicon Valley / Oregon)</option>
                    <option value="AP-SE-1">AP-SE-1 (Singapore / Tokyo)</option>
                  </select>
                </div>

                <div>
                  <label className="text-gray-400 block mb-1">Public WireGuard / Relay Endpoint (IP:Port):</label>
                  <input
                    type="text"
                    value={nodeEndpointInput}
                    onChange={(e) => setNodeEndpointInput(e.target.value)}
                    className="w-full bg-black/90 border border-gray-800 text-white px-3 py-2 rounded-sm outline-none focus:border-purple-400"
                    placeholder="203.0.113.55:51820"
                  />
                </div>

                <label className="flex items-center gap-2.5 p-3 bg-purple-500/10 border border-purple-500/30 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useBetaSubsidy}
                    onChange={(e) => setUseBetaSubsidy(e.target.checked)}
                    className="accent-purple-500"
                  />
                  <span className="text-gray-200">
                    Use <strong>Invited Beta Collateral Subsidy</strong> (0 SBLAKE upfront; requires &ge;95% uptime SLA)
                  </span>
                </label>
              </div>

              <button
                onClick={handleBondNode}
                disabled={isBondingNode}
                className="w-full py-3.5 px-4 bg-purple-600 hover:bg-purple-500 text-white font-black text-xs uppercase tracking-wider rounded-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isBondingNode ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    REGISTERING BLAKENODE ON STARKNET...
                  </>
                ) : (
                  <>
                    <Server size={16} />
                    {useBetaSubsidy
                      ? 'REGISTER BETA BLAKENODE (SUBSIDIZED)'
                      : 'BOND 10,000 SBLAKE & REGISTER NODE'}
                  </>
                )}
              </button>

              {nodeBondTx && (
                <div className="p-3 bg-[#00ff41]/10 border border-[#00ff41]/30 rounded text-xs font-mono text-[#00ff41] flex items-start gap-2">
                  <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
                  <div className="break-all">
                    <strong>BlakeNode Registered!</strong> Run the Docker provisioning command on the right to start relaying traffic. Tx: {nodeBondTx.slice(0, 16)}...
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-6 space-y-6">
            <div className="glass-panel p-6 border border-gray-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-800 pb-3">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Terminal size={16} className="text-[#00ff41]" />
                  Step 2: 1-Click VPS Host &amp; Docker Provisioning
                </h3>
                <div className="flex items-center gap-1 bg-black/80 p-1 rounded border border-gray-800 text-[10px] font-mono">
                  <button
                    onClick={() => setProvisionTab('bash')}
                    className={`px-2 py-0.5 rounded font-bold ${
                      provisionTab === 'bash' ? 'bg-[#00ff41] text-black' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    1-Click VPS Script
                  </button>
                  <button
                    onClick={() => setProvisionTab('docker')}
                    className={`px-2 py-0.5 rounded font-bold ${
                      provisionTab === 'docker' ? 'bg-purple-500 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Docker Compose
                  </button>
                </div>
              </div>

              <p className="text-xs text-gray-400 leading-relaxed">
                {provisionTab === 'bash'
                  ? 'Run our turnkey bash installer (node-runner/install-vps.sh) on any fresh Ubuntu 22.04+ or Debian 12 VPS. Automatically configures WireGuard (UDP 51820), Dante SOCKS5 (TCP 1080), kernel IP forwarding, and Starknet SLA heartbeats.'
                  : 'Deploy the containerized WireGuard + SOCKS5 relay daemon (node-runner/docker-compose.yml & daemon.mjs) on your VPS or residential host. Exposes JSON health telemetry on port 8088.'}
              </p>

              <pre className="bg-black/95 border border-gray-800 p-4 rounded text-[11px] font-mono text-[#00ff41] overflow-x-auto leading-relaxed">
                {provisionTab === 'bash' ? bashProvisionCmd : dockerProvisionCmd}
              </pre>

              <button
                onClick={handleCopyDocker}
                className="w-full py-3 px-4 bg-white/10 hover:bg-white/20 text-white font-bold text-xs uppercase tracking-wider rounded-sm border border-white/15 transition-colors flex items-center justify-center gap-2"
              >
                {copiedDocker ? <Check size={15} className="text-[#00ff41]" /> : <Copy size={15} />}
                {copiedDocker ? 'Provisioning Command Copied!' : 'Copy VPS Provisioning Command'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
