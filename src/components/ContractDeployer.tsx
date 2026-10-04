import React, { useState, useEffect } from 'react';
import { 
  Rocket, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink, 
  Loader2, 
  RefreshCw, 
  Key, 
  ShieldCheck, 
  Check, 
  Cpu, 
  SlidersHorizontal,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { WalletAccount, CallData, Contract } from 'starknet';
import { 
  setCustomContractAddress, 
  provider, 
  CONTRACT_ADDRESS, 
  bindAccountToCustomProvider,
  upgradeContract,
  getActiveRpcUrl
} from '../utils/starknet';
import sierraData from '../../contracts/target/dev/sblake_sblake.contract_class.json';
import casmData from '../../contracts/target/dev/sblake_sblake.compiled_contract_class.json';

// Pre-computed compiled Sierra class hash of contracts/src/sblake.cairo
export const SBLAKE_SIERRA_CLASS_HASH = "0x3ddeba723665c7e488f6f85106cadb646101baa7c310be71741394efecd0f2f";
export const SBLAKE_CASM_CLASS_HASH = "0x30f8a00a86afe3393a7d1d9829bc3e7648828c0229a424b530818d75a6cc606";

interface ContractDeployerProps {
  account: any;
  wallet?: any;
  onDeployed?: (address: string) => void;
}

export const ContractDeployer: React.FC<ContractDeployerProps> = ({ account, wallet, onDeployed }) => {
  const [isDeploying, setIsDeploying] = useState(false);
  const [step, setStep] = useState<string>('');
  const [deployedAddress, setDeployedAddress] = useState<string | null>(
    localStorage.getItem('sblake_custom_contract') || null
  );
  const [customInput, setCustomInput] = useState<string>('');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Upgrade & Governance state
  const [showUpgradePanel, setShowUpgradePanel] = useState(false);
  const [newClassHash, setNewClassHash] = useState<string>('');
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [upgradeSuccess, setUpgradeSuccess] = useState<string | null>(null);
  const [contractOwner, setContractOwner] = useState<string | null>(null);
  const [newHalvingInterval, setNewHalvingInterval] = useState<string>('');
  const [isUpdatingInterval, setIsUpdatingInterval] = useState(false);

  // Load contract owner if deployed
  useEffect(() => {
    if (deployedAddress && !deployedAddress.startsWith("0x0123456789")) {
      const contract = new Contract(sierraData.abi, deployedAddress, provider);
      contract.get_owner({ blockIdentifier: 'latest' })
        .then((owner: any) => {
          setContractOwner('0x' + BigInt(owner).toString(16));
        })
        .catch(() => setContractOwner(null));
    }
  }, [deployedAddress]);

  const getEffectiveAccount = () => {
    if (wallet && typeof WalletAccount === 'function') {
      try {
        const wa = new WalletAccount(provider, wallet);
        if (wa) {
          wa.channel = (provider as any).channel;
          return wa;
        }
      } catch (err) {
        console.warn("[Deployer] WalletAccount creation fallback:", err);
      }
    }
    if (account) {
      return bindAccountToCustomProvider(account, provider);
    }
    return null;
  };

  const handleDeploy = async () => {
    const activeAcc = getEffectiveAccount();
    if (!activeAcc) {
      setError("Please connect your Argent X or Braavos wallet with Sepolia testnet funds first.");
      return;
    }

    setError(null);
    setIsDeploying(true);
    setStep('Connecting to Starknet Sepolia via Alchemy v0_10...');

    try {
      console.log("[Deployer] Executing deployment via wallet:", activeAcc.address || activeAcc);
      let contractAddress = '';
      let transactionHash = '';

      // Check if Sierra class hash is already declared on Sepolia
      let isAlreadyDeclared = false;
      try {
        await provider.getClassByHash(SBLAKE_SIERRA_CLASS_HASH);
        isAlreadyDeclared = true;
        console.log("[Deployer] Class hash is already declared on Sepolia:", SBLAKE_SIERRA_CLASS_HASH);
      } catch {
        console.log("[Deployer] Class hash not found on-chain, proceeding with declaration...");
      }

      let classHash = SBLAKE_SIERRA_CLASS_HASH;

      if (!isAlreadyDeclared) {
        setStep('Step 1/2: Submitting DECLARE transaction in wallet...');
        if (typeof activeAcc.declare === 'function') {
          try {
            const declareRes = await activeAcc.declare({
              contract: sierraData,
              casm: casmData,
            });
            classHash = declareRes.class_hash || SBLAKE_SIERRA_CLASS_HASH;
            console.log("[Deployer] Declared class hash:", classHash);
          } catch (declareErr: any) {
            if (
              declareErr?.message?.includes('already declared') || 
              declareErr?.message?.includes('is not declared')
            ) {
              console.log("[Deployer] Class hash already declared:", SBLAKE_SIERRA_CLASS_HASH);
            } else {
              throw declareErr;
            }
          }
        }
      }

      // Step 2: Deploy Contract via UDC
      setStep('Step 2/2: Submitting DEPLOY transaction in wallet...');
      if (typeof activeAcc.deployContract === 'function') {
        const deployRes = await activeAcc.deployContract({
          classHash,
          constructorCalldata: [],
        });
        contractAddress = deployRes.contract_address;
        transactionHash = deployRes.transaction_hash;
      } else if (typeof activeAcc.deploy === 'function') {
        const deployRes = await activeAcc.deploy({
          classHash,
          constructorCalldata: [],
        });
        contractAddress = deployRes.contract_address;
        transactionHash = deployRes.transaction_hash;
      } else {
        throw new Error("Connected wallet does not support contract deployment methods.");
      }

      setDeployedAddress(contractAddress);
      setTxHash(transactionHash);
      setCustomContractAddress(contractAddress);
      setStep('Contract deployed successfully on Sepolia!');

      if (onDeployed) {
        onDeployed(contractAddress);
      }
    } catch (err: any) {
      console.error("[Deployer Error]:", err);
      setError(err?.message || "Deployment failed. Ensure your wallet has testnet STRK/ETH for gas.");
    } finally {
      setIsDeploying(false);
    }
  };

  const handleManualSave = () => {
    if (customInput.trim().startsWith("0x")) {
      const trimmed = customInput.trim();
      setCustomContractAddress(trimmed);
      setDeployedAddress(trimmed);
      setCustomInput('');
      if (onDeployed) onDeployed(trimmed);
    }
  };

  const handleReset = () => {
    localStorage.removeItem('sblake_custom_contract');
    setDeployedAddress(null);
    setTxHash(null);
    setError(null);
    setStep('');
    setUpgradeSuccess(null);
  };

  const handleUpgradeContract = async () => {
    if (!newClassHash.trim().startsWith("0x")) {
      setError("Please enter a valid Cairo Class Hash (0x...)");
      return;
    }
    const activeAcc = getEffectiveAccount();
    if (!activeAcc) {
      setError("Connect wallet to execute upgrade");
      return;
    }

    setIsUpgrading(true);
    setError(null);
    setUpgradeSuccess(null);

    try {
      const res = await upgradeContract(activeAcc, newClassHash.trim());
      setUpgradeSuccess(`Contract upgraded successfully! Tx: ${res.transaction_hash}`);
      setNewClassHash('');
    } catch (err: any) {
      console.error("[Upgrade Error]:", err);
      setError(err?.message || "Failed to upgrade contract class");
    } finally {
      setIsUpgrading(false);
    }
  };

  const handleUpdateHalvingInterval = async () => {
    const intervalVal = parseInt(newHalvingInterval.trim());
    if (isNaN(intervalVal) || intervalVal <= 0) {
      setError("Please enter a valid positive integer for halving interval.");
      return;
    }
    const activeAcc = getEffectiveAccount();
    if (!activeAcc) return;

    setIsUpdatingInterval(true);
    setError(null);

    try {
      const contract = new Contract(sierraData.abi, deployedAddress!, activeAcc);
      const res = await contract.set_halving_interval(intervalVal);
      setUpgradeSuccess(`Halving interval updated to ${intervalVal} mints! Tx: ${res.transaction_hash}`);
      setNewHalvingInterval('');
    } catch (err: any) {
      setError(err?.message || "Failed to update halving interval");
    } finally {
      setIsUpdatingInterval(false);
    }
  };

  return (
    <div id="deploy" className="glass-panel p-6 border border-[#00ff41]/30 bg-black/70 space-y-5">
      <div className="flex items-center justify-between border-b border-gray-800 pb-3">
        <div className="flex items-center gap-2">
          <Rocket size={18} className="text-[#00ff41]" />
          <h3 className="font-bold text-sm tracking-wide text-white uppercase">1-Click Sepolia Contract Deployer</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-[#00ff41]/10 text-[#00ff41] px-2 py-0.5 rounded font-mono font-bold flex items-center gap-1">
            <ShieldCheck size={12} /> ALCHEMY v0_10 PROTECTED
          </span>
          <span className="text-[10px] bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded font-mono font-bold">
            UPGRADEABLE
          </span>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Deploy the compiled <strong>SBLAKE (STRK20 Halving & Privacy)</strong> contract directly to Starknet Sepolia using your connected wallet. Rate limits and block-id inconsistencies are automatically bypassed.
      </p>

      {deployedAddress ? (
        <div className="space-y-4">
          <div className="space-y-3 bg-[#00ff41]/5 border border-[#00ff41]/30 p-4 rounded-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#00ff41] font-bold text-xs">
                <CheckCircle2 size={16} />
                LIVE CONTRACT ACTIVE ON SEPOLIA
              </div>
              <span className="text-[10px] text-gray-400 font-mono">
                Class: {SBLAKE_SIERRA_CLASS_HASH.slice(0, 10)}...
              </span>
            </div>

            <div className="font-mono text-xs text-white break-all bg-black/90 p-2.5 rounded border border-gray-800">
              {deployedAddress}
            </div>

            {contractOwner && (
              <div className="text-[11px] text-gray-400 font-mono flex items-center gap-1.5">
                <span className="text-gray-500">Contract Owner:</span>
                <span className="text-[#00f3ff] break-all">{contractOwner}</span>
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <a
                href={`https://sepolia.starkscan.co/contract/${deployedAddress}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-[#00f3ff] hover:underline flex items-center gap-1 font-mono"
              >
                View on Starkscan <ExternalLink size={12} />
              </a>
              {txHash && (
                <a
                  href={`https://sepolia.starkscan.co/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-gray-400 hover:text-white flex items-center gap-1 font-mono"
                >
                  Tx Hash <ExternalLink size={12} />
                </a>
              )}
              <button
                onClick={handleReset}
                className="text-xs text-gray-500 hover:text-gray-300 ml-auto flex items-center gap-1"
              >
                <RefreshCw size={12} /> Redeploy
              </button>
            </div>
          </div>

          {/* Upgradeability & Timeline Governance Accordion */}
          <div className="border border-purple-500/30 rounded-sm bg-purple-500/5 p-4 space-y-3">
            <button
              onClick={() => setShowUpgradePanel(!showUpgradePanel)}
              className="w-full flex items-center justify-between text-xs font-bold text-purple-400 uppercase tracking-wide hover:text-purple-300 transition-colors"
            >
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={14} />
                <span>Contract Upgrade & Timeline Management</span>
              </div>
              {showUpgradePanel ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showUpgradePanel && (
              <div className="pt-3 border-t border-purple-500/20 space-y-4 text-xs">
                {/* Contract Class Upgrade */}
                <div className="space-y-2">
                  <div className="text-gray-300 font-medium">Upgrade Contract Implementation (replace_class_syscall):</div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="New Class Hash (0x...)"
                      value={newClassHash}
                      onChange={(e) => setNewClassHash(e.target.value)}
                      className="bg-black/90 border border-gray-800 text-xs px-3 py-1.5 rounded-sm font-mono w-full outline-none focus:border-purple-400"
                    />
                    <button
                      onClick={handleUpgradeContract}
                      disabled={isUpgrading || !newClassHash.trim().startsWith("0x")}
                      className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-sm disabled:opacity-40 transition-colors flex items-center gap-1 shrink-0"
                    >
                      {isUpgrading ? <Loader2 size={12} className="animate-spin" /> : null}
                      Upgrade Class
                    </button>
                  </div>
                </div>

                {/* Halving Timeline Adjustment */}
                <div className="space-y-2">
                  <div className="text-gray-300 font-medium">Rework Halving Interval (Mints per Era):</div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="e.g. 100000 (standard) or 1000 (test)"
                      value={newHalvingInterval}
                      onChange={(e) => setNewHalvingInterval(e.target.value)}
                      className="bg-black/90 border border-gray-800 text-xs px-3 py-1.5 rounded-sm font-mono w-full outline-none focus:border-purple-400"
                    />
                    <button
                      onClick={handleUpdateHalvingInterval}
                      disabled={isUpdatingInterval || !newHalvingInterval.trim()}
                      className="px-4 py-1.5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-sm disabled:opacity-40 transition-colors flex items-center gap-1 shrink-0"
                    >
                      {isUpdatingInterval ? <Loader2 size={12} className="animate-spin" /> : null}
                      Update Interval
                    </button>
                  </div>
                </div>

                {upgradeSuccess && (
                  <div className="bg-[#00ff41]/10 border border-[#00ff41]/20 p-2.5 rounded text-[#00ff41] text-xs font-mono">
                    {upgradeSuccess}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 p-3 rounded text-red-400 flex items-center gap-2 text-xs">
              <AlertCircle size={16} className="shrink-0" />
              <span className="break-all">{error}</span>
            </div>
          )}

          {step && (
            <div className="text-xs text-[#00f3ff] font-mono flex items-center gap-2 bg-[#00f3ff]/5 p-2 rounded">
              {isDeploying && <Loader2 size={14} className="animate-spin" />}
              <span>{step}</span>
            </div>
          )}

          <button
            onClick={handleDeploy}
            disabled={isDeploying || !account}
            className={`w-full py-3 px-4 font-bold text-xs uppercase tracking-wider rounded-sm transition-all flex items-center justify-center gap-2 ${
              isDeploying || !account
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                : 'bg-[#00ff41] text-black hover:bg-[#00cc33] shadow-[0_0_15px_rgba(0,255,65,0.3)]'
            }`}
          >
            {isDeploying ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                DEPLOYING TO SEPOLIA...
              </>
            ) : (
              <>
                <Rocket size={16} />
                DEPLOY SBLAKE CONTRACT TO SEPOLIA
              </>
            )}
          </button>

          {/* Manual Contract Address Override */}
          <div className="pt-2 border-t border-gray-800/80">
            <div className="text-[11px] text-gray-500 mb-1.5 flex items-center gap-1">
              <Key size={12} /> Or link existing deployed contract address:
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="0x..."
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                className="bg-black/80 border border-gray-800 text-xs px-3 py-1.5 rounded-sm font-mono w-full outline-none focus:border-[#00ff41]"
              />
              <button
                onClick={handleManualSave}
                disabled={!customInput.trim().startsWith("0x")}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-xs font-bold text-white rounded-sm disabled:opacity-40 transition-colors flex items-center gap-1 shrink-0"
              >
                <Check size={14} /> Link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
