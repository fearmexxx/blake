// Use this script in the browser console of starkscan.co or voyager.online
async function deploySBlake() {
    if (typeof window.starknet === 'undefined') {
        alert("Please install Argent X or Braavos wallet!");
        return;
    }

    console.log("Connecting wallet...");
    const wallet = await window.starknet.enable();
    if (!wallet) return;

    const provider = window.starknet.provider;
    const address = window.starknet.selectedAddress;

    console.log("Connected:", address);
    console.log("Please copy the Sierra and Casm JSON contents from your local files:");
    console.log("1. e:/2026/starkmine/contracts/target/dev/sblake_sblake.contract_class.json");
    console.log("2. e:/2026/starkmine/contracts/target/dev/sblake_sblake.compiled_contract_class.json");
    
    alert("Check the console for instructions. You will need to paste the file contents when prompted.");

    const sierraStr = prompt("Paste the content of sblake_sblake.contract_class.json here:");
    const casmStr = prompt("Paste the content of sblake_sblake.compiled_contract_class.json here:");

    const sierra = JSON.parse(sierraStr);
    const casm = JSON.parse(casmStr);

    console.log("Declaring and Deploying...");
    try {
        // Using starknet.js version usually available on these sites
        const account = window.starknet.account;
        const deployResponse = await account.declareAndDeploy({
            contract: sierra,
            casm: casm,
            constructorCalldata: [],
        });

        console.log("--- DEPLOYMENT SUCCESSFUL ---");
        console.log("Contract Address:", deployResponse.deploy.contract_address);
        console.log("Transaction Hash:", deployResponse.deploy.transaction_hash);
        alert("Success! Contract Address: " + deployResponse.deploy.contract_address);
    } catch (e) {
        console.error("Deployment failed:", e);
        alert("Error: " + e.message);
    }
}

deploySBlake();
