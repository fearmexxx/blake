import { Account, CallData } from 'starknet';
import { provider, ALCHEMY_SEPOLIA_URL, createSanitizedProvider } from './starknet';
import sierraData from '../../contracts/target/dev/sblake_sblake.contract_class.json';
import casmData from '../../contracts/target/dev/sblake_sblake.compiled_contract_class.json';

// OpenZeppelin standard account class hash on Starknet Sepolia
export const OZ_ACCOUNT_CLASS_HASH = "0xd632f69c8e02ea43f1d8a7c3eb441c67eb935f460c02e3860f7c410115d10f";

// Dedicated Sepolia Relayer Account (Already deployed on Sepolia)
export const RELAYER_CONFIG = {
  address: "0x35260a1162058d98cda528a7e7484195fda550acc5db70a840e0b89339a1f07",
  privateKey: "0x11643b24a2582fe3e7b6e3cebcab556b7086095b02f533a8ddfbfa94d2ff1b7",
  publicKey: "0x664d48d66d395346567d18c4f6be7105b43e4ca067f559860d67f6d42e421bf",
};

export const STRK_TOKEN_ADDRESS = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

/**
 * Checks the STRK balance of the relayer account on Sepolia.
 */
export const getRelayerBalance = async (): Promise<bigint> => {
  try {
    const res = await provider.callContract({
      contractAddress: STRK_TOKEN_ADDRESS,
      entrypoint: "balanceOf",
      calldata: CallData.compile({ account: RELAYER_CONFIG.address }),
    }, 'latest');
    if (res && res.length >= 2) {
      return BigInt(res[0]) + (BigInt(res[1]) << 128n);
    }
    return 0n;
  } catch {
    return 0n;
  }
};

/**
 * Checks if the relayer account contract is already deployed on Sepolia.
 */
export const isRelayerDeployed = async (): Promise<boolean> => {
  try {
    const classHash = await provider.getClassHashAt(RELAYER_CONFIG.address, 'latest');
    return Boolean(classHash);
  } catch {
    return false;
  }
};

/**
 * Deploys the relayer account (if needed) and submits the DECLARE transaction
 * for the compiled SBLAKE contract class using Starknet v8 V3 resource bounds.
 */
export const deployRelayerAndDeclare = async (
  onProgress?: (status: string) => void
): Promise<string> => {
  const sanitizedProvider = createSanitizedProvider(ALCHEMY_SEPOLIA_URL);
  const relayerAccount = new Account({
    provider: sanitizedProvider,
    address: RELAYER_CONFIG.address,
    signer: RELAYER_CONFIG.privateKey,
  });

  // Step 1: Deploy relayer account if not yet active
  const alreadyDeployed = await isRelayerDeployed();
  if (!alreadyDeployed) {
    onProgress?.("Deploying automated declaration relayer on Sepolia...");
    try {
      const deployRes = await relayerAccount.deployAccount({
        classHash: OZ_ACCOUNT_CLASS_HASH,
        constructorCalldata: CallData.compile({ public_key_: RELAYER_CONFIG.publicKey }),
        addressSalt: RELAYER_CONFIG.publicKey,
      });

      onProgress?.("Waiting for relayer deployment confirmation...");
      await sanitizedProvider.waitForTransaction(deployRes.transaction_hash);
      console.log("[Relayer] Account deployed:", deployRes.contract_address);
    } catch (e: any) {
      if (!e?.message?.includes("already deployed") && !e?.message?.includes("is not deployed")) {
        throw new Error(`Relayer account deployment failed: ${e?.message || e}`);
      }
    }
  }

  // Step 2: Declare SBLAKE contract class on Sepolia
  onProgress?.("Submitting DECLARE transaction for SBLAKE Cairo class...");
  const declareRes = await relayerAccount.declare({
    contract: sierraData as any,
    casm: casmData as any,
  });

  onProgress?.("Waiting for DECLARE transaction confirmation on Sepolia...");
  await sanitizedProvider.waitForTransaction(declareRes.transaction_hash);
  console.log("[Relayer] Declared class hash:", declareRes.class_hash);

  return declareRes.class_hash;
};
