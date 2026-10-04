import { Account, RpcProvider, CallData } from 'starknet';
import fs from 'fs';

const ALCHEMY_SEPOLIA_URL = "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/qXU4ta4yLmxUhIoLb-cZ7KtsNn808Pjw";
const OZ_ACCOUNT_CLASS_HASH = "0xd632f69c8e02ea43f1d8a7c3eb441c67eb935f460c02e3860f7c410115d10f";
const RELAYER_CONFIG = {
  address: "0x35260a1162058d98cda528a7e7484195fda550acc5db70a840e0b89339a1f07",
  privateKey: "0x11643b24a2582fe3e7b6e3cebcab556b7086095b02f533a8ddfbfa94d2ff1b7",
  publicKey: "0x664d48d66d395346567d18c4f6be7105b43e4ca067f559860d67f6d42e421bf",
};
const STRK_TOKEN = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

const provider = new RpcProvider({ nodeUrl: ALCHEMY_SEPOLIA_URL });
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
  console.log("=== SBLAKE SEPOLIA DECLARATION CHECK ===");
  console.log("Relayer address:", RELAYER_CONFIG.address);

  // Check relayer STRK balance
  try {
    const balRes = await provider.callContract({
      contractAddress: STRK_TOKEN,
      entrypoint: "balanceOf",
      calldata: CallData.compile({ account: RELAYER_CONFIG.address }),
    }, 'latest');
    const balance = (BigInt(balRes[0]) + (BigInt(balRes[1]) << 128n));
    console.log("Relayer STRK balance:", (Number(balance) / 1e18).toFixed(4), "STRK");
  } catch (e) {
    console.warn("Could not fetch balance:", e.message);
  }

  const sierra = JSON.parse(fs.readFileSync('./contracts/target/dev/sblake_sblake.contract_class.json', 'utf8'));
  const casm = JSON.parse(fs.readFileSync('./contracts/target/dev/sblake_sblake.compiled_contract_class.json', 'utf8'));

  const sierraClassHash = "0x3ddeba723665c7e488f6f85106cadb646101baa7c310be71741394efecd0f2f";

  // Check if class is declared
  try {
    await provider.getClassByHash(sierraClassHash, 'latest');
    console.log("Class IS ALREADY DECLARED on Starknet Sepolia:", sierraClassHash);
    return;
  } catch {
    console.log("Class is NOT YET declared. Relayer will declare it once funded with 0.1 STRK.");
  }
}

main().catch(console.error);
