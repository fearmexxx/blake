import { RpcProvider, Account, CallData, json, hash, constants } from 'starknet';
import fs from 'fs';

const ALCHEMY_SEPOLIA_URL = "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/qXU4ta4yLmxUhIoLb-cZ7KtsNn808Pjw";
const UDC_ADDRESS = constants.UDC.ADDRESS;
const SBLAKE_SIERRA_CLASS_HASH = "0x3ddeba723665c7e488f6f85106cadb646101baa7c310be71741394efecd0f2f";

const provider = new RpcProvider({ nodeUrl: ALCHEMY_SEPOLIA_URL });

// Intercept RPC calls to sanitize 'pending' block IDs and adapt v0.10 gas params
provider.channel.fetchEndpoint = (orig => async (m, p) => {
  if (p && p.block_id === 'pending') p.block_id = 'latest';
  if (p && p.request && Array.isArray(p.request)) {
    for (const req of p.request) {
      if (req && req.resource_bounds && !req.resource_bounds.l1_data_gas) {
        req.resource_bounds.l1_data_gas = { max_amount: '0x0', max_price_per_unit: '0x0' };
      }
    }
  }
  const res = await orig(m, p);
  if (m === 'starknet_estimateFee' && Array.isArray(res)) {
    for (const item of res) {
      if (item && !item.gas_consumed) item.gas_consumed = item.l2_gas_consumed || item.l1_gas_consumed || '0x0';
      if (item && !item.gas_price) item.gas_price = item.l2_gas_price || item.l1_gas_price || '0x0';
    }
  }
  return res;
})(provider.channel.fetchEndpoint.bind(provider.channel));

async function main() {
  console.log("=== STARKBLAKE SEPOLIA DEPLOYER ===");
  console.log("RPC:", ALCHEMY_SEPOLIA_URL);
  console.log("UDC:", UDC_ADDRESS);
  console.log("SBLAKE Class Hash:", SBLAKE_SIERRA_CLASS_HASH);

  // Check if class is declared
  let isDeclared = false;
  try {
    await provider.getClassByHash(SBLAKE_SIERRA_CLASS_HASH, 'latest');
    isDeclared = true;
    console.log("Status: Class IS ALREADY DECLARED on Sepolia.");
  } catch {
    console.log("Status: Class NOT YET declared on Sepolia.");
  }

  // Load account data if present
  let accountData = null;
  if (fs.existsSync('./account_sepolia.json')) {
    accountData = JSON.parse(fs.readFileSync('./account_sepolia.json', 'utf8'));
    console.log("Loaded account:", accountData.address);
  }

  console.log("\n-> For Xverse Browser Wallet:");
  console.log("1. Open the StarkBlake UI in your browser (http://localhost:5173).");
  console.log("2. Connect your Xverse wallet (must have Sepolia STRK).");
  console.log("3. Click 'DEPLOY SBLAKE CONTRACT TO SEPOLIA'.");
  console.log("4. Xverse will approve the 1-click UDC deployment without 'Not implemented' errors.");
}

main().catch(console.error);
