// Browser console script to deploy SBLAKE via UDC in Xverse / Argent X / Braavos
async function deploySBlakeUDC() {
  const UDC_ADDRESS = "0x041a78e741e5af2fec34b695679bc6891742439f7afb8484ecd7766661ad02bf";
  const SBLAKE_SIERRA_CLASS_HASH = "0x3ddeba723665c7e488f6f85106cadb646101baa7c310be71741394efecd0f2f";

  const wallet = window.starknet;
  if (!wallet) {
    alert("Please install or enable your Xverse / Argent X / Braavos wallet!");
    return;
  }

  console.log("Connecting wallet...");
  if (typeof wallet.enable === 'function') {
    await wallet.enable();
  }

  const account = wallet.account || wallet;
  console.log("Connected account:", account.address || wallet.selectedAddress);

  const salt = '0x' + Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  console.log("Deploying SBLAKE contract instance via UDC...");
  try {
    const res = await account.execute({
      contractAddress: UDC_ADDRESS,
      entrypoint: "deployContract",
      calldata: [
        SBLAKE_SIERRA_CLASS_HASH,
        salt,
        "0", // unique = false
        "0"  // calldata length = 0
      ]
    });

    console.log("--- DEPLOYMENT TRANSACTION SUBMITTED ---");
    console.log("Tx Hash:", res.transaction_hash);
    alert("Transaction submitted! Tx: " + res.transaction_hash);
  } catch (err) {
    console.error("Deploy failed:", err);
    alert("Error: " + err.message);
  }
}

deploySBlakeUDC();
