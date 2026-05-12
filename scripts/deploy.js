import { RpcProvider, Account, Contract, CallData, json, ec, hash, stark } from 'starknet';
import fs from 'fs';

const provider = new RpcProvider({ nodeUrl: "https://rpc.starknet-testnet.lava.build" });

async function deploy() {
  const accountData = JSON.parse(fs.readFileSync('./account_sepolia.json', 'utf8'));

  // 1. Deploy the Account Contract (if needed)
  const OZaccountClassHash = '0x061efe27df9de75ef16ed6ca873446bfe96c2dae719117f77958cfcc589B79d0';
  const account = new Account(provider, accountData.address, accountData.privateKey);

  console.log('Checking account status on Lava RPC...');
  try {
    await provider.getClassHashAt(account.address, 'latest');
    console.log('Account already deployed.');
  } catch (e) {
    console.log('Account not detected. Attempting to deploy account contract...');
    try {
      const { transaction_hash, contract_address } = await account.deployAccount({
        classHash: OZaccountClassHash,
        constructorCalldata: CallData.compile({ publicKey: accountData.publicKey }),
        addressSalt: accountData.publicKey,
      });
      console.log('Deployment TX sent:', transaction_hash);
      await provider.waitForTransaction(transaction_hash);
      console.log('Account deployed at:', contract_address);
    } catch (deployError) {
      console.error('Account deployment failed:', deployError);
      throw deployError;
    }
  }

  // 2. Declare and Deploy SBLAKE
  console.log('Reading artifacts...');
  const sierra = json.parse(fs.readFileSync('./contracts/target/dev/sblake_sblake.contract_class.json', 'utf8'));
  const casm = json.parse(fs.readFileSync('./contracts/target/dev/sblake_sblake.compiled_contract_class.json', 'utf8'));

  console.log('Declaring and Deploying SBLAKE...');
  const deployResponse = await account.declareAndDeploy({
    contract: sierra,
    casm: casm,
    constructorCalldata: [],
  });

  console.log('--- DEPLOYMENT SUCCESSFUL ---');
  console.log('Contract Address:', deployResponse.deploy.contract_address);
  console.log('Transaction Hash:', deployResponse.deploy.transaction_hash);
  console.log('-----------------------------');

  // Update frontend config
  const utilsPath = './src/utils/starknet.ts';
  let utilsContent = fs.readFileSync(utilsPath, 'utf8');
  utilsContent = utilsContent.replace(
    /export const CONTRACT_ADDRESS = "0x[a-fA-F0-9]+";/,
    `export const CONTRACT_ADDRESS = "${deployResponse.deploy.contract_address}";`
  );
  fs.writeFileSync(utilsPath, utilsContent);
  console.log('Updated src/utils/starknet.ts with new address.');
}

deploy().catch(console.error);
