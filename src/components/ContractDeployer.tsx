import React, { useState } from 'react';
import { Rocket, CheckCircle2, AlertCircle, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { setCustomContractAddress } from '../utils/starknet';
import sierraData from '../../contracts/target/dev/sblake_sblake.contract_class.json';
import casmData from '../../contracts/target/dev/sblake_sblake.compiled_contract_class.json';

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
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDeploy = async () => {
    if (!account) {
      setError("Please connect an Argent X or Braavos wallet with Sepolia testnet funds first.");
      return;
    }

    setError(null);
    setIsDeploying(true);
    setStep('Preparing contract artifacts...');

    try {
      console.log("[Deployer] Account address:", account.address);
      setStep('Declaring & Deploying SBLAKE contract on Sepolia...');

      let contractAddress = '';
      let transactionHash = '';

      if (typeof account.declareAndDeploy === 'function') {
        const res = await account.declareAndDeploy({
          contract: sierraData,
          casm: casmData,
          constructorCalldata: [],
        });
        contractAddress = res.deploy.contract_address;
        transactionHash = res.deploy.transaction_hash;
      } else if (typeof account.declare === 'function') {
        setStep('Step 1/2: Declaring Sierra & CASM class...');
        let classHash = '';
        try {
          const declareRes = await account.declare({
            contract: sierraData,
            casm: casmData,
          });
          classHash = declareRes.class_hash;
        } catch (declareErr: any) {
          if (declareErr?.message?.includes('already declared')) {
            console.log("[Deployer] Class already declared on network.");
          } else {
            throw declareErr;
          }
        }

        setStep('Step 2/2: Deploying contract instance...');
        const deployRes = await account.deployContract({
          classHash: classHash || '0x0',
          constructorCalldata: [],
        });
        contractAddress = deployRes.contract_address;
        transactionHash = deployRes.transaction_hash;
      } else {
        throw new Error("Connected wallet account does not support contract declaration/deployment.");
      }

      setDeployedAddress(contractAddress);
      setTxHash(transactionHash);
      setCustomContractAddress(contractAddress);
      setStep('Deployment successful!');

      if (onDeployed) {
        onDeployed(contractAddress);
      }
    } catch (err: any) {
      console.error("[Deployer Error]:", err);
      setError(err?.message || "Deployment failed. Check wallet balance on Sepolia.");
    } finally {
      setIsDeploying(false);
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
    <div className="glass-panel p-6 border border-[#00ff41]/30 bg-black/60 space-y-4">
      <div className="flex items-center justify-between border-b border-gray-800 pb-3">
        <div className="flex items-center gap-2">
          <Rocket size={18} className="text-[#00ff41]" />
          <h3 className="font-bold text-sm tracking-wide text-white">SEPOLIA 1-CLICK CONTRACT DEPLOYER</h3>
        </div>
        <span className="text-[10px] bg-[#00ff41]/10 text-[#00ff41] px-2 py-0.5 rounded font-mono font-bold">
          CAIRO 2.8.0
        </span>
      </div>

      <p className="text-xs text-gray-400">
        Deploy the compiled <strong>SBLAKE (STRK20)</strong> smart contract directly to Starknet Sepolia using your connected wallet. No command line or private key export needed.
      </p>

      {deployedAddress ? (
        <div className="space-y-3 bg-[#00ff41]/5 border border-[#00ff41]/30 p-4 rounded-sm">
          <div className="flex items-center gap-2 text-[#00ff41] font-bold text-xs">
            <CheckCircle2 size={16} />
            LIVE CONTRACT ACTIVE ON SEPOLIA
          </div>
          <div className="font-mono text-xs text-white break-all bg-black/80 p-2 rounded border border-gray-800">
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
            <button
              onClick={handleReset}
              className="text-xs text-gray-500 hover:text-gray-300 ml-auto flex items-center gap-1"
            >
              <RefreshCw size={12} /> Redeploy
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 p-3 rounded text-red-400 flex items-center gap-2 text-xs">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
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
        </div>
      )}
    </div>
  );
};
