import React, { useState } from 'react';
import { Rocket, CheckCircle2, AlertCircle, ExternalLink, Loader2, RefreshCw, Key, ShieldCheck, Check } from 'lucide-react';
import { WalletAccount } from 'starknet';
import { setCustomContractAddress, provider, CONTRACT_ADDRESS } from '../utils/starknet';
import sierraData from '../../contracts/target/dev/sblake_sblake.contract_class.json';
import casmData from '../../contracts/target/dev/sblake_sblake.compiled_contract_class.json';

// Pre-computed compiled Sierra class hash of contracts/src/sblake.cairo
export const SBLAKE_SIERRA_CLASS_HASH = "0x556770afb20593ae972cc5a68b9338d141f0048dfdca212a4772b52a1ed977e";

interface ContractDeployerProps {
  account: any;
  onDeployed?: (address: string) => void;
}

export const ContractDeployer: React.FC<ContractDeployerProps> = ({ account, onDeployed }) => {
  const [isDeploying, setIsDeploying] = useState(false);
  const [step, setStep] = useState<string>('');
  const [deployedAddress, setDeployedAddress] = useState<string | null>(
    localStorage.getItem('sblake_custom_contract') || null
  );
  const [customInput, setCustomInput] = useState<string>('');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getEffectiveAccount = () => {
    if (!account) return null;
    if (account.execute || account.declareAndDeploy || account.declare) {
      return account;
    }
    if (account.account && (account.account.execute || account.account.declare)) {
      return account.account;
    }
    try {
      return new WalletAccount(provider, account);
    } catch {
      return account;
    }
  };

  const handleDeploy = async () => {
    const activeAcc = getEffectiveAccount();
    if (!activeAcc) {
      setError("Please connect your Argent X or Braavos wallet with Sepolia testnet funds first.");
      return;
    }

    setError(null);
    setIsDeploying(true);
    setStep('Connecting to Starknet Sepolia...');

    try {
      console.log("[Deployer] Executing deployment via wallet:", activeAcc.address || activeAcc);
      setStep('Requesting wallet approval for SBLAKE declaration & deployment...');

      let contractAddress = '';
      let transactionHash = '';

      if (typeof activeAcc.declareAndDeploy === 'function') {
        const res = await activeAcc.declareAndDeploy({
          contract: sierraData,
          casm: casmData,
          constructorCalldata: [],
        });
        contractAddress = res.deploy.contract_address;
        transactionHash = res.deploy.transaction_hash;
      } else {
        // Step 1: Declare Sierra & CASM
        setStep('Step 1/2: Submitting DECLARE transaction in wallet...');
        let classHash = SBLAKE_SIERRA_CLASS_HASH;

        if (typeof activeAcc.declare === 'function') {
          try {
            const declareRes = await activeAcc.declare({
              contract: sierraData,
              casm: casmData,
            });
            classHash = declareRes.class_hash || SBLAKE_SIERRA_CLASS_HASH;
          } catch (declareErr: any) {
            if (declareErr?.message?.includes('already declared') || declareErr?.message?.includes('is not declared')) {
              console.log("[Deployer] Class hash already declared or known:", SBLAKE_SIERRA_CLASS_HASH);
            } else {
              throw declareErr;
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
  };

  return (
    <div id="deploy" className="glass-panel p-6 border border-[#00ff41]/30 bg-black/70 space-y-5">
      <div className="flex items-center justify-between border-b border-gray-800 pb-3">
        <div className="flex items-center gap-2">
          <Rocket size={18} className="text-[#00ff41]" />
          <h3 className="font-bold text-sm tracking-wide text-white uppercase">1-Click Sepolia Contract Deployer</h3>
        </div>
        <span className="text-[10px] bg-[#00ff41]/10 text-[#00ff41] px-2 py-0.5 rounded font-mono font-bold flex items-center gap-1">
          <ShieldCheck size={12} /> ALCHEMY v0_10 READY
        </span>
      </div>

      <p className="text-xs text-gray-400">
        Deploy the compiled <strong>SBLAKE (STRK20 Privacy & Halving)</strong> contract directly to Starknet Sepolia using your connected wallet. No private key exports or CLI required.
      </p>

      {deployedAddress ? (
        <div className="space-y-3 bg-[#00ff41]/5 border border-[#00ff41]/30 p-4 rounded-sm">
          <div className="flex items-center gap-2 text-[#00ff41] font-bold text-xs">
            <CheckCircle2 size={16} />
            LIVE CONTRACT ACTIVE ON SEPOLIA
          </div>
          <div className="font-mono text-xs text-white break-all bg-black/90 p-2.5 rounded border border-gray-800">
            {deployedAddress}
          </div>
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
