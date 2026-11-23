// Deploys the ERC-8004 Identity Registry on Aevum (there is no canonical one on chain 44005)
// and registers the demo vendors, each from its own wallet, so each identity's agentWallet
// is a wallet that really signed for it. Vendor keys go to identities.key (git-ignored).
// Usage: npx hardhat run scripts/register-identities.js --network aevumTestnet
const fs = require("node:fs");
const path = require("node:path");
const { ethers, network } = require("hardhat");
const { save, load, explorerAddr, explorerTx } = require("./lib/common.js");

const VENDORS = [
  { name: "Northwind Hosting Ltd", domain: "northwind-hosting.example", description: "Cloud hosting. Invoices monthly." },
  { name: "Atlas Freight", domain: "atlasfreight.example", description: "Freight and shipping." },
  { name: "Figma", domain: "figma.example", description: "Design software subscription." },
];

const card = (v) => "data:application/json;base64," + Buffer.from(JSON.stringify({
  type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  name: v.name, description: v.description, image: "",
  services: [{ name: "web", endpoint: `https://${v.domain}` }],
  x402Support: false, active: true, registrations: [], supportedTrust: ["reputation"],
})).toString("base64");

async function main() {
  const [deployer] = await ethers.getSigners();
  let reg;
  const prev = load("identity");
  if (prev?.registry) reg = await ethers.getContractAt("IdentityRegistry", prev.registry);
  else {
    reg = await (await ethers.getContractFactory("IdentityRegistry")).deploy();
    await reg.waitForDeployment();
  }
  const registry = await reg.getAddress();
  console.log("IdentityRegistry:", explorerAddr(registry));
  const keyFile = path.join(__dirname, "..", "identities.key");
  const keys = fs.existsSync(keyFile) ? JSON.parse(fs.readFileSync(keyFile, "utf8")) : {};
  const out = { registry, fromBlock: prev?.fromBlock ?? (await reg.deploymentTransaction()?.wait())?.blockNumber, vendors: prev?.vendors ?? [] };
  for (const v of VENDORS) {
    if (out.vendors.find((x) => x.name === v.name)) continue;
    keys[v.name] ??= ethers.Wallet.createRandom().privateKey;
    fs.writeFileSync(keyFile, JSON.stringify(keys, null, 2));
    const w = new ethers.Wallet(keys[v.name], ethers.provider);
    if ((await ethers.provider.getBalance(w.address)) < ethers.parseEther("0.004")) {
      await (await deployer.sendTransaction({ to: w.address, value: ethers.parseEther("0.006") })).wait();
    }
    const tx = await reg.connect(w)["register(string,(string,bytes)[])"](card(v), [["domain", ethers.toUtf8Bytes(v.domain)]]);
    await tx.wait();
    const agentId = await reg.agentOfWallet(w.address);
    out.vendors.push({ name: v.name, agentId: Number(agentId), wallet: w.address, tx: tx.hash });
    console.log(`${v.name}: agent #${agentId}, wallet ${w.address}`, explorerTx(tx.hash));
  }
  console.log("Saved:", save("identity", out));
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
