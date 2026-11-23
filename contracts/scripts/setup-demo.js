// Sets up the demo company for the video and the live checks: a vault created
// through the factory (owned by the signer), five demo payees, the five demo
// bills, the agent's session, and some tUSD8.
//
//   npx hardhat run scripts/setup-demo.js --network localhost
//   FACTORY=0x... AGENT_ADDRESS=0x... npx hardhat run scripts/setup-demo.js --network aevumTestnet
//
// On Aevum the signer (DEPLOYER_PRIVATE_KEY) needs tQDAY for gas and the
// faucet's tUSD8 to fund the vault. Writes deployments/<network>-demo.json.
const { ethers, network, TUSD8, usd, fmt, isLocal, explorerAddr, explorerTx, save, load, agentSigner } = require("./lib/common.js");

async function main() {
  const [owner] = await ethers.getSigners();
  const txs = [];
  const step = async (what, p) => {
    const tx = await p;
    const r = await tx.wait();
    txs.push({ what, tx: r.hash });
    console.log(`  ${what}: ${explorerTx(r.hash)}`);
    return r;
  };

  // Token and factory: local ones on the Hardhat node, the official ones on Aevum.
  let token, factory;
  if (isLocal()) {
    token = await (await ethers.getContractFactory("MockUSD")).deploy();
    factory = await (await ethers.getContractFactory("SluiceFactory")).deploy(await token.getAddress());
  } else {
    token = await ethers.getContractAt("MockUSD", TUSD8); // ERC-20 calls only
    const f = process.env.FACTORY || load("deploy")?.factory;
    if (!f) throw new Error("Set FACTORY to the deployed SluiceFactory address");
    factory = await ethers.getContractAt("SluiceFactory", f);
  }
  const agent = process.env.AGENT_ADDRESS || (await agentSigner()).address;
  console.log(`Network ${network.name}, owner ${owner.address}, agent ${agent}`);

  // Payees: fresh addresses (they only receive), and one blocklisted "scammer".
  const names = ["Northwind Hosting", "Atlas Freight", "Figma", "Contractor payroll", "Scammer (new bank details)"];
  const payees = Object.fromEntries(names.map((n) => [n, ethers.Wallet.createRandom().address]));

  console.log("Creating the company through the factory");
  const created = await step("createVault Kora Supply Group", factory.createVault("Kora Supply Group", usd(5), usd(5)));
  const ev = created.logs.map((l) => { try { return factory.interface.parseLog(l); } catch { return null; } }).find((e) => e?.name === "VaultCreated");
  const vaultAddr = ev.args.vault;
  const vault = await ethers.getContractAt("SluiceVault", vaultAddr);

  // Faucet-sized amounts: the whole demo fits in about 20 tUSD8.
  const fund = usd(process.env.FUND ?? 20);
  if (isLocal()) await step("mint test tUSD8", token.mint(vaultAddr, fund));
  else {
    const bal = await token.balanceOf(owner.address);
    if (bal < fund) console.log(`  ! signer has ${fmt(bal)}; send at least ${fmt(fund)} to ${vaultAddr} before the agent runs`);
    else await step(`fund the vault with ${fmt(fund)}`, token.transfer(vaultAddr, fund));
  }

  const now = (await ethers.provider.getBlock("latest")).timestamp;
  console.log("Rules, payees and bills");
  await step("grant the agent a 30-day session: 3 per payment, 6 per 24 h", vault.grantSession(agent, usd(3), usd(6), now + 30 * 86400, "demo company setup"));
  await step("approve Northwind Hosting", vault.setPayeeAllowed(payees["Northwind Hosting"], true, "demo company setup"));
  await step("approve Atlas Freight", vault.setPayeeAllowed(payees["Atlas Freight"], true, "demo company setup"));
  await step("approve Contractor payroll", vault.setPayeeAllowed(payees["Contractor payroll"], true, "demo company setup"));
  await step("block the scammer", vault.setPayeeBlocked(payees["Scammer (new bank details)"], true, "demo company setup"));
  await step(
    "list the five demo bills in one signature",
    vault.addBills([
      { payee: payees["Northwind Hosting"], amount: usd(1), firstDue: now, intervalDays: 30, critical: false, label: "Northwind Hosting" },
      { payee: payees["Atlas Freight"], amount: usd(4), firstDue: now, intervalDays: 0, critical: false, label: "Atlas Freight, Q4 shipping" },
      { payee: payees["Figma"], amount: usd(0.5), firstDue: now, intervalDays: 30, critical: false, label: "Figma subscription" },
      { payee: payees["Scammer (new bank details)"], amount: usd(2), firstDue: now, intervalDays: 0, critical: false, label: "Northwind Hosting, new bank details" },
      { payee: payees["Contractor payroll"], amount: usd(2), firstDue: now + 10 * 86400, intervalDays: 14, critical: true, label: "Contractor payroll" },
    ]),
  );

  const out = { network: network.name, vault: vaultAddr, factory: await factory.getAddress(), token: await token.getAddress(), owner: owner.address, agent, payees, txs, at: new Date().toISOString() };
  const file = save("demo", out);
  console.log(`\nDemo company ready: ${explorerAddr(vaultAddr)}\nSaved ${file}`);
  console.log("Expected on the agent's first round: Northwind paid alone, Atlas proposed (over the 3 tUSD8 cap), Figma proposed (new payee), the scam refused (blocklisted), payroll left for later (critical, due in 10 days).");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
