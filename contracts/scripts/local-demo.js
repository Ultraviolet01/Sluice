// Sets up a demo company on a local Hardhat node for the agent to run against.
// Usage: npx hardhat node   (in one terminal), then
//        npx hardhat run scripts/local-demo.js --network localhost
const { ethers, network } = require("hardhat");

async function main() {
  if (network.config.chainId !== 31337 && network.name !== "localhost") throw new Error("local only");
  const [owner, agent, northwind, atlas, scammer, newVendor] = await ethers.getSigners();
  const usd = (n) => ethers.parseUnits(String(n), 6);
  const token = await (await ethers.getContractFactory("MockUSD")).deploy();
  const vault = await (await ethers.getContractFactory("SluiceVault")).deploy(owner.address, await token.getAddress(), usd(100), usd(500));
  const v = await vault.getAddress();
  await token.mint(v, usd(5_000));
  const now = (await ethers.provider.getBlock("latest")).timestamp;
  await vault.grantSession(agent.address, usd(500), usd(600), now + 30 * 86400);
  await vault.setPayeeAllowed(northwind.address, true);
  await vault.setPayeeAllowed(atlas.address, true);
  await vault.setPayeeBlocked(scammer.address, true);
  await vault.addBill(northwind.address, usd(80), now, 30, false, "Northwind Hosting");
  await vault.addBill(atlas.address, usd(800), now, 0, false, "Atlas Freight, Q4 shipping");
  await vault.addBill(newVendor.address, usd(45), now, 0, false, "Figma subscription");
  await vault.addBill(scammer.address, usd(950), now, 0, false, "Northwind Hosting - new bank details");
  await vault.addBill(atlas.address, usd(120), now + 10 * 86400, 0, false, "Atlas Freight, December");
  console.log(JSON.stringify({ vault: v, token: await token.getAddress(), agent: agent.address }));
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
