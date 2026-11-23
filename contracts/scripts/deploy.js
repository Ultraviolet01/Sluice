// Deploys SluiceVault to Aevum Testnet against the official tUSD8.
// Usage: npx hardhat run scripts/deploy.js --network aevumTestnet
const { ethers, network } = require("hardhat");

async function main() {
  if (network.config.chainId !== 44005) throw new Error("Refusing to deploy: not Aevum Testnet (44005)");
  const tusd8 = process.env.TUSD8_ADDRESS || "0x456569838f1d43009A91ebA4263147Afd7233483";
  const [deployer] = await ethers.getSigners();
  const usd = (n) => ethers.parseUnits(String(n), 6);

  const vault = await (await ethers.getContractFactory("SluiceVault")).deploy(
    deployer.address, tusd8, usd(1), usd(2) // buffer 1 tUSD8, approval above 2 tUSD8 (faucet-sized)
  );
  await vault.waitForDeployment();
  console.log("SluiceVault:", await vault.getAddress());
  console.log("Explorer:   ", `https://explorer-test.qday.info/address/${await vault.getAddress()}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
