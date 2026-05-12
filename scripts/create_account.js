import { ec, hash, CallData, RpcProvider, Account, stark } from 'starknet';
import fs from 'fs';

const provider = new RpcProvider({ nodeUrl: "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/qXU4ta4yLmxUhIoLb-cZ7KtsNn808Pjw" });

async function createAccount() {
  // Generate private key
  const privateKey = stark.randomAddress();
  const publicKey = ec.starkCurve.getStarkKey(privateKey);
  
  // Calculate account address (OZ account)
  const OZaccountClassHash = '0x061efe27df9de75ef16ed6ca873446bfe96c2dae719117f77958cfcc589B79d0';
  const OZaccountConstructorCallData = CallData.compile({ publicKey });
  const accountAddress = hash.calculateContractAddressFromHash(
    publicKey,
    OZaccountClassHash,
    OZaccountConstructorCallData,
    0
  );

  const accountData = {
    address: accountAddress,
    privateKey: privateKey,
    publicKey: publicKey
  };

  fs.writeFileSync('./account_sepolia.json', JSON.stringify(accountData, null, 2));
  
  console.log('--- NEW SEPOLIA ACCOUNT GENERATED ---');
  console.log('Address:', accountAddress);
  console.log('Public Key:', publicKey);
  console.log('------------------------------------');
  console.log('PLEASE FUND THIS ADDRESS WITH SEPOLIA ETH THEN PRESS ENTER');
}

createAccount();
