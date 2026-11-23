// Deploys a SluiceVault (owned by OWNER_ADDRESS) and the SluiceFactory to Aevum Testnet, against the official tUSD8.
// Usage: npx hardhat run scripts/deploy.js --network aevumTestnet
const { ethers, network } = require("hardhat");
const { save } = require("./lib/common.js");

async function main() {
  if (network.config.chainId !== 44005) throw new Error("Refusing to deploy: not Aevum Testnet (44005)");
  const tusd8 = process.env.TUSD8_ADDRESS || "0x456569838f1d43009A91ebA4263147Afd7233483";
  const [deployer] = await ethers.getSigners();
  const usd = (n) => ethers.parseUnits(String(n), 6);
  // The vault owner should be your own wallet, not the throwaway deploy key.
  const owner = process.env.OWNER_ADDRESS;
  if (!owner || !ethers.isAddress(owner)) throw new Error("Set OWNER_ADDRESS in .env to the wallet that will own the vault");
  const gas = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer:", deployer.address, "balance:", ethers.formatEther(gas), "tQDAY");
  if (gas === 0n) throw new Error("Deployer has no tQDAY. Claim gas at https://faucet.qday.info/en");

  const vault = await (await ethers.getContractFactory("SluiceVault")).deploy(
    owner, tusd8, usd(1), usd(2) // buffer 1 tUSD8, approval above 2 tUSD8 (faucet-sized)
  );
  await vault.waitForDeployment();
  // The factory lets anyone create their own company's vault from the app.
  const factory = await (await ethers.getContractFactory("SluiceFactory")).deploy(tusd8);
  await factory.waitForDeployment();
  console.log("SluiceVault:", await vault.getAddress());
  console.log("Owner:      ", owner);
  console.log("Factory:    ", await factory.getAddress());
  const block = (await vault.deploymentTransaction().wait()).blockNumber;
  const file = save("deploy", {
    network: network.name,
    vault: await vault.getAddress(),
    vaultTx: vault.deploymentTransaction().hash,
    factory: await factory.getAddress(),
    factoryTx: factory.deploymentTransaction().hash,
    owner,
    token: tusd8,
    fromBlock: block,
    at: new Date().toISOString(),
  });
  console.log("Saved:      ", file);
  console.log("Explorer:   ", `https://explorer-test.qday.info/address/${await vault.getAddress()}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
