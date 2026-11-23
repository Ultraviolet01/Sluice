// Hires a new agent key on every vault the signer owns. Each vault keeps one
// current agent, so granting the new key revokes the old one in the same
// transaction: from that block on, the old key can do nothing.
//
//   NEW_AGENT=0x... npx hardhat run scripts/rotate-agent-key.js --network aevumTestnet
//
// Which vaults: VAULTS=0x..,0x.. if set; otherwise every vault the signer
// created through the factory (FACTORY, or the saved deployment) that it still owns.
// Caps: each vault's current per-payment and 24-hour caps are kept unless
// PER_PAYMENT / DAILY (tUSD8) are set. DAYS sets the new expiry (default 30).
// DRY_RUN=1 shows the plan and signs nothing.
const { ethers, network, usd, fmt, explorerTx, save, load } = require("./lib/common.js");

async function main() {
  const next = process.env.NEW_AGENT;
  if (!next || !ethers.isAddress(next)) throw new Error("Set NEW_AGENT to the new agent's 0x address");
  const dry = process.env.DRY_RUN === "1";
  const [owner] = await ethers.getSigners();

  let vaults = (process.env.VAULTS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!vaults.length) {
    const f = process.env.FACTORY || load("deploy")?.factory || load("demo")?.factory;
    if (!f) throw new Error("Set VAULTS, or FACTORY to find the vaults you created");
    const factory = await ethers.getContractAt("SluiceFactory", f);
    vaults = [...(await factory.vaultsCreatedBy(owner.address))];
    const deployed = load("deploy");
    if (deployed?.vault && deployed.owner?.toLowerCase() === owner.address.toLowerCase()) vaults.push(deployed.vault);
  }

  const days = Number(process.env.DAYS || 30);
  const expiry = (await ethers.provider.getBlock("latest")).timestamp + days * 86400;
  const done = [];
  console.log(`${dry ? "Plan" : "Rotating"} to ${next} on ${network.name}, as ${owner.address}`);
  for (const addr of [...new Set(vaults.map((v) => v.toLowerCase()))]) {
    const vault = await ethers.getContractAt("SluiceVault", addr);
    if ((await vault.owner()).toLowerCase() !== owner.address.toLowerCase()) {
      console.log(`  skip ${addr}: owned by someone else now`);
      continue;
    }
    const old = await vault.agent();
    const cur = old === ethers.ZeroAddress ? null : await vault.sessions(old);
    const per = process.env.PER_PAYMENT ? usd(process.env.PER_PAYMENT) : cur?.perPaymentCap || usd(100);
    const daily = process.env.DAILY ? usd(process.env.DAILY) : cur?.dailyCap || usd(500);
    const line = `${addr}: ${old === ethers.ZeroAddress ? "no agent" : old} -> ${next}, ${fmt(per)} per payment, ${fmt(daily)} per 24 h, ${days} days`;
    if (dry) {
      console.log(`  would rotate ${line}`);
      continue;
    }
    const r = await (await vault.grantSession(next, per, daily, expiry, "agent key rotation")).wait();
    const stillOld = old !== ethers.ZeroAddress && old.toLowerCase() !== next.toLowerCase() ? (await vault.sessions(old)).active : false;
    if (stillOld) throw new Error(`${addr}: the old key is still active after rotation`);
    done.push({ vault: addr, from: old, to: next, tx: r.hash });
    console.log(`  rotated ${line}: ${explorerTx(r.hash)}`);
  }
  if (!dry) {
    const file = save("rotation", { network: network.name, to: next, done, at: new Date().toISOString() });
    console.log(`\n${done.length} vault(s) rotated; old keys revoked. Saved ${file}`);
    console.log("Update the GitHub secret AGENT_PRIVATE_KEY to the new key before the next scheduled round.");
  }
}

main().catch((e) => { console.error(e.message || e); process.exitCode = 1; });
