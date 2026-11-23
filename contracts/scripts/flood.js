// Proposal flood: with a stolen agent key, file every proposal the vault will
// accept, then keep trying. Proposals are tied to the owner's listed bills, one
// per bill period that is due, so the flood stops by itself; then check the
// owner can still pause, approve and reject.
//
//   npx hardhat run scripts/flood.js --network localhost
//   AGENT_PRIVATE_KEY=0x... npx hardhat run scripts/flood.js --network aevumTestnet
const { ethers, network, explorerTx, save, load, agentSigner, reason, readable } = require("./lib/common.js");

async function main() {
  const demo = load("demo");
  if (!demo) throw new Error(`Run scripts/setup-demo.js on ${network.name} first`);
  const [owner] = await ethers.getSigners();
  const agent = await agentSigner();
  const vault = await ethers.getContractAt("SluiceVault", demo.vault);
  const A = vault.connect(agent);
  const bills = Number(await vault.billCount());
  const max = Number(process.env.MAX ?? 200);
  const filed = [];
  const refusedWhy = {};
  let tries = 0;

  console.log(`Flooding ${demo.vault}: every bill, periods 0..${Math.ceil(max / bills)}, up to ${max} attempts`);
  outer: for (let period = 0; ; period++) {
    for (let id = 0; id < bills; id++) {
      if (tries++ >= max) break outer;
      try {
        await A.propose.staticCall(id, period, "x".repeat(280));
      } catch (e) {
        const r = readable(reason(e, vault.interface));
        refusedWhy[r] = (refusedWhy[r] ?? 0) + 1;
        continue;
      }
      const r = await (await A.propose(id, period, "x".repeat(280))).wait();
      filed.push({ bill: id, period, tx: r.hash });
      console.log(`  filed bill ${id} period ${period}: ${explorerTx(r.hash)}`);
    }
  }
  console.log(`\n${filed.length} proposals accepted out of ${tries} attempts. Refusals:`);
  for (const [k, v] of Object.entries(refusedWhy)) console.log(`  ${v} x ${k}`);

  // The owner is unaffected.
  const checks = [];
  const o = vault.connect(owner);
  for (const [what, fn] of [
    ["owner pauses", () => o.pause()],
    ["owner resumes", () => o.unpause()],
    ...(filed[0] ? [[`owner rejects bill ${filed[0].bill} period ${filed[0].period}`, () => o.reject(filed[0].bill, filed[0].period)]] : []),
  ]) {
    const r = await (await fn()).wait();
    checks.push({ what, tx: r.hash });
    console.log(`  ${what}: ${explorerTx(r.hash)}`);
  }
  const bounded = filed.length <= bills * 2;
  const file = save("flood", { network: network.name, vault: demo.vault, bills, attempts: tries, accepted: filed.length, refused: refusedWhy, filed, ownerChecks: checks, bounded, at: new Date().toISOString() });
  console.log(`\n${bounded ? "pass" : "FAIL"}: the flood stopped at ${filed.length} proposals for ${bills} listed bills. Saved ${file}`);
  if (!bounded) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
