// The stolen-key attacks, run against a live vault: the demo company from
// setup-demo.js. Each attack is tried with the agent's key (or an outsider's)
// as a call, which costs nothing and returns the vault's own refusal. The
// allowed actions run as real transactions, so the record shows both sides.
//
//   npx hardhat run scripts/live-attacks.js --network localhost
//   AGENT_PRIVATE_KEY=0x... npx hardhat run scripts/live-attacks.js --network aevumTestnet
//
// The owner (DEPLOYER_PRIVATE_KEY on Aevum) owns the demo vault. The agent needs
// a little tQDAY for the allowed payment and proposal. Writes
// deployments/<network>-attacks.json.
const { ethers, network, usd, isLocal, explorerTx, save, load, agentSigner, reason, readable } = require("./lib/common.js");

async function main() {
  const demo = load("demo");
  if (!demo) throw new Error(`Run scripts/setup-demo.js on ${network.name} first`);
  const [owner] = await ethers.getSigners();
  const agent = await agentSigner();
  const outsider = ethers.Wallet.createRandom().connect(ethers.provider);
  const vault = await ethers.getContractAt("SluiceVault", demo.vault);
  const token = await ethers.getContractAt("MockUSD", demo.token);
  const iface = vault.interface;
  const thief = demo.payees["Scammer (new bank details)"];
  const rows = [];

  const refused = async (who, what, fn) => {
    try {
      await fn();
      rows.push({ who, what, result: "ALLOWED", ok: false });
      console.log(`  FAIL  ${who}: ${what} was allowed`);
    } catch (e) {
      const r = readable(reason(e, iface));
      rows.push({ who, what, result: r, ok: true });
      console.log(`  pass  ${who}: ${what} -> ${r}`);
    }
  };
  const allowed = async (who, what, fn) => {
    try {
      const tx = await fn();
      const r = await tx.wait();
      rows.push({ who, what, result: "done", tx: r.hash, ok: true, control: true });
      console.log(`  pass  ${who}: ${what} -> ${explorerTx(r.hash)}`);
    } catch (e) {
      rows.push({ who, what, result: `FAILED: ${reason(e, iface)}`, ok: false, control: true });
      console.log(`  FAIL  ${who}: ${what} -> ${reason(e, iface)}`);
    }
  };

  const A = vault.connect(agent);
  const far = 9_999_999_999n;
  console.log(`Vault ${demo.vault} on ${network.name}\nAgent ${agent.address}\n\nWith the agent's key, try to change the rules`);
  await refused("agent", "grant itself a bigger session", () => A.grantSession.staticCall(agent.address, usd(1e6), usd(1e6), far, "live check"));
  await refused("agent", "allowlist an address it controls", () => A.setPayeeAllowed.staticCall(agent.address, true, "live check"));
  await refused("agent", "unblock the scammer", () => A.setPayeeBlocked.staticCall(thief, false, "live check"));
  await refused("agent", "list a bill to itself", () => A.addBill.staticCall(agent.address, usd(1000), 1, 0, false, "x"));
  await refused("agent", "bulk-list bills to itself", () => A.addBills.staticCall([{ payee: agent.address, amount: usd(1000), firstDue: 1, intervalDays: 0, critical: true, label: "x" }]));
  await refused("agent", "lower the cash buffer", () => A.setCashBuffer.staticCall(0, "live check"));
  await refused("agent", "raise the approval threshold", () => A.setApprovalThreshold.staticCall(usd(1e6), "live check"));
  await refused("agent", "withdraw the vault", () => A.withdraw.staticCall(agent.address, 1));
  await refused("agent", "take ownership", () => A.transferOwnership.staticCall(agent.address));
  await refused("agent", "cancel a bill", () => A.cancelBill.staticCall(0, "live check"));

  console.log("\nWith the agent's key, try to move money outside the bills");
  await refused("agent", "pay a bill nobody listed", () => A.pay.staticCall(99, 0));
  await refused("agent", "pay a future period of a monthly bill", () => A.pay.staticCall(0, 5));
  await refused("agent", "pay a bill not yet due (payroll, in 10 days)", () => A.pay.staticCall(4, 0));
  await refused("agent", "pay the blocklisted scammer", () => A.pay.staticCall(3, 0));
  await refused("agent", "propose the blocklisted scammer to the owner", () => A.propose.staticCall(3, 0, "urgent"));
  await refused("agent", "pull tokens with transferFrom", () => token.connect(agent).transferFrom.staticCall(demo.vault, agent.address, 1));
  console.log("  note  pay(billId, period) takes no payee or amount, so a bill can't be redirected or resized");

  console.log("\nAllowed actions (real transactions)");
  const [band0] = await vault.checkPayment(agent.address, 0, 0);
  if (band0 === 0n) await allowed("agent", "pay Northwind Hosting (listed, approved, under the cap)", () => A.pay(0, 0));
  else console.log("  note  Northwind Hosting was already paid by an agent round");
  await refused("agent", "pay Northwind Hosting a second time", () => A.pay.staticCall(0, 0));
  const st = await vault.settlements(1, 0);
  if (st.status === 0n) await allowed("agent", "propose Atlas Freight (over the cap) to the owner", () => A.propose(1, 0, "Over the 3 tUSD8 cap"));
  else console.log("  note  Atlas Freight was already proposed by an agent round");
  await refused("agent", "approve its own proposal", () => A.approve.staticCall(1, 0));
  await refused("agent", "propose Atlas Freight again", () => A.propose.staticCall(1, 0, "again"));

  console.log("\nOwner controls");
  await allowed("owner", "pause every payment", () => vault.connect(owner).pause());
  await refused("agent", "propose while paused", () => A.propose.staticCall(2, 0, "x"));
  await allowed("owner", "resume", () => vault.connect(owner).unpause());
  const rotated = ethers.Wallet.createRandom().address;
  const now = (await ethers.provider.getBlock("latest")).timestamp;
  await allowed("owner", "rotate the agent key to a new address", () => vault.connect(owner).grantSession(rotated, usd(3), usd(6), now + 86400, "live check"));
  await refused("agent", "act with the rotated-out key", () => A.propose.staticCall(2, 0, "x"));
  await allowed("owner", "rotate back to the agent", () => vault.connect(owner).grantSession(agent.address, usd(3), usd(6), now + 30 * 86400, "live check"));

  console.log("\nAn outsider");
  await refused("outsider", "pay a listed bill", () => vault.connect(outsider).pay.staticCall(2, 0));
  await refused("outsider", "propose a bill", () => vault.connect(outsider).propose.staticCall(2, 0, "x"));
  await refused("outsider", "withdraw", () => vault.connect(outsider).withdraw.staticCall(outsider.address, 1));

  const failed = rows.filter((r) => !r.ok).length;
  const file = save("attacks", { network: network.name, vault: demo.vault, agent: agent.address, at: new Date().toISOString(), rows });
  console.log(`\n${rows.length - failed} passed, ${failed} failed. Saved ${file}`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
