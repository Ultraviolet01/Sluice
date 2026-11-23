// The calls that move money, used for real: deposit, the agent paying a bill
// alone, the owner approving one the agent had to propose, and a withdrawal.
// Each is checked against token balances after it lands. Runs on the
// function-check company (deployments/<network>-functions.json), owned by the
// deploy wallet, which needs about 2 tUSD8.
//
//   npx hardhat run scripts/live-money.js --network aevumTestnet
const { ethers, network, usd, fmt, isLocal, explorerTx, save, load, agentSigner, reason, readable } = require("./lib/common.js");

async function main() {
  const [owner] = await ethers.getSigners();
  const agent = await agentSigner();
  const fns = load("functions");
  if (!fns) throw new Error("Run scripts/live-functions.js first");
  const vault = await ethers.getContractAt("SluiceVault", fns.vault);
  const token = await ethers.getContractAt("MockUSD", await vault.token());
  if (isLocal()) await (await token.mint(owner.address, usd(2))).wait();
  const O = vault.connect(owner), A = vault.connect(agent);
  const bal = (a) => token.balanceOf(a);
  const V = fns.vault;

  const rows = [];
  let failed = 0;
  const step = async (fn, who, p, check) => {
    let tx, ok = false, note;
    try {
      const r = await (await p()).wait();
      tx = r.hash;
      const res = await check(r);
      ok = res.ok;
      note = res.note;
    } catch (e) {
      note = `reverted: ${readable(reason(e, vault.interface))}`;
    }
    rows.push({ fn, who, kind: "tx", tx, ok, check: note });
    if (!ok) failed++;
    console.log(`  ${ok ? "pass" : "FAIL"}  ${fn.padEnd(14)} ${who.padEnd(6)} ${note}${tx ? "  " + explorerTx(tx) : ""}`);
  };

  const payeeA = ethers.Wallet.createRandom().address, payeeB = ethers.Wallet.createRandom().address;
  const t = (await ethers.provider.getBlock("latest")).timestamp;
  const have = await bal(owner.address);
  if (have < usd(2)) throw new Error(`The deploy wallet holds ${fmt(have)}; send it 2 tUSD8 first`);
  console.log(`Money checks on ${V}`);

  // Set-up for the checks (recorded too): two new payees, two bills due now, a session.
  await step("setPayeesAllowed", "owner", () => O.setPayeesAllowed([payeeA, payeeB], true, "money check: two payees"), async () => ({ ok: (await vault.isAllowedPayee(payeeA)) && (await vault.isAllowedPayee(payeeB)), note: "two payees approved" }));
  await step("addBills", "owner", () => O.addBills([
    { payee: payeeA, amount: usd(0.3), firstDue: t, intervalDays: 0, critical: false, label: "Small invoice (agent pays alone)" },
    { payee: payeeB, amount: usd(0.8), firstDue: t, intervalDays: 0, critical: false, label: "Larger invoice (over the agent's cap)" },
  ]), async () => ({ ok: true, note: "two bills due now" }));
  const n = Number(await vault.billCount());
  const small = n - 2, large = n - 1;
  await step("setCashBuffer", "owner", () => O.setCashBuffer(usd(0.1), "money check: keep 0.1 back"), async () => ({ ok: (await vault.cashBuffer()) === usd(0.1), note: "buffer 0.1 tUSD8" }));
  await step("grantSession", "owner", () => O.grantSession(agent.address, usd(0.5), usd(1), t + 86400, "money check"), async () => ({ ok: (await vault.sessions(agent.address)).active, note: "agent may pay up to 0.5 per payment" }));

  // 1. Deposit.
  const v0 = await bal(V);
  await step("deposit", "owner", () => token.connect(owner).transfer(V, usd(2)), async () => ({ ok: (await bal(V)) - v0 === usd(2), note: `vault ${fmt(v0)} -> ${fmt(await bal(V))}` }));

  // 2. The agent pays a bill alone.
  const [band] = await vault.checkPayment(agent.address, small, 0);
  console.log(`  checkPayment(small bill) = ${["RunsAlone", "NeedsApproval", "Blocked"][Number(band)]}`);
  const a0 = await bal(payeeA), va = await bal(V);
  await step("pay", "agent", () => A.pay(small, 0), async () => ({
    ok: (await bal(payeeA)) - a0 === usd(0.3) && va - (await bal(V)) === usd(0.3),
    note: `0.3 tUSD8 left the vault and reached the bill's own payee (payee ${fmt(a0)} -> ${fmt(await bal(payeeA))})`,
  }));
  let again = "NOT refused";
  try { await A.pay.staticCall(small, 0); } catch (e) { again = readable(reason(e, vault.interface)); }
  rows.push({ fn: "pay", who: "agent", kind: "refused", ok: again !== "NOT refused", check: `same bill again refused: ${again}` });
  console.log(`  ${again !== "NOT refused" ? "pass" : "FAIL"}  pay again: ${again}`);
  if (again === "NOT refused") failed++;

  // 3. Over the cap: the agent proposes, the owner approves, the vault pays.
  await step("propose", "agent", () => A.propose(large, 0, "0.8 is over my 0.5 cap"), async () => ({ ok: true, note: "the agent filed the 0.8 bill for the owner" }));
  const b0 = await bal(payeeB), vb = await bal(V);
  await step("approve", "owner", () => O.approve(large, 0), async () => ({
    ok: (await bal(payeeB)) - b0 === usd(0.8) && vb - (await bal(V)) === usd(0.8),
    note: `owner approved; 0.8 tUSD8 reached the bill's payee (payee ${fmt(b0)} -> ${fmt(await bal(payeeB))})`,
  }));

  // 4. The owner withdraws what is left.
  const left = await bal(V), o0 = await bal(owner.address);
  await step("withdraw", "owner", () => O.withdraw(owner.address, left), async () => ({
    ok: (await bal(V)) === 0n && (await bal(owner.address)) - o0 === left,
    note: `${fmt(left)} back to the owner; vault now ${fmt(await bal(V))}`,
  }));

  const out = { network: network.name, vault: V, owner: owner.address, agent: agent.address, rows, passed: rows.filter((r) => r.ok).length, failed, at: new Date().toISOString() };
  const file = save("money", out);
  console.log(`\n${out.passed} passed, ${failed} failed. Saved ${file}`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
