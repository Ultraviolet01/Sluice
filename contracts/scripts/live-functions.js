// Every function of SluiceFactory and SluiceVault, used for real on the live
// network, with a check of the state after each call. The deploy wallet
// creates a fresh company through the factory and acts as its owner; the agent
// and the Telegram bot act with their own keys. Calls that must fail are
// simulated, so a refusal costs nothing and shows the vault's own reason.
//
//   npx hardhat run scripts/live-functions.js --network aevumTestnet
//   (agent key: contracts/agent.key or AGENT_PRIVATE_KEY; bot key: ../bot.key or BOT_GUARDIAN_KEY)
//
// Writes deployments/<network>-functions.json for verified.mjs.
const fs = require("fs");
const path = require("path");
const { ethers, network, usd, fmt, isLocal, explorerTx, explorerAddr, save, load, agentSigner, reason, readable } = require("./lib/common.js");

function guardianSigner() {
  if (process.env.BOT_GUARDIAN_KEY) return new ethers.Wallet(process.env.BOT_GUARDIAN_KEY, ethers.provider);
  const f = path.join(__dirname, "..", "..", "bot.key");
  if (fs.existsSync(f)) return new ethers.Wallet(fs.readFileSync(f, "utf8").trim(), ethers.provider);
  return null;
}

async function main() {
  const [owner] = await ethers.getSigners();
  const agent = await agentSigner();
  let bot = guardianSigner();
  let token, factory;
  if (isLocal()) {
    token = await (await ethers.getContractFactory("MockUSD")).deploy();
    factory = await (await ethers.getContractFactory("SluiceFactory")).deploy(await token.getAddress());
    bot = (await ethers.getSigners())[2];
    await (await token.mint(owner.address, usd(5))).wait();
  } else {
    const d = load("deploy");
    if (!d) throw new Error("Deploy first");
    factory = await ethers.getContractAt("SluiceFactory", d.factory);
    token = await ethers.getContractAt("MockUSD", d.token);
  }
  if (!bot) throw new Error("No guardian key (bot.key or BOT_GUARDIAN_KEY)");

  const rows = [];
  let failed = 0;
  const record = (row) => {
    rows.push(row);
    if (!row.ok) failed++;
    console.log(`  ${row.ok ? "pass" : "FAIL"}  ${row.fn.padEnd(22)} ${row.who.padEnd(9)} ${row.check}${row.tx ? "  " + explorerTx(row.tx) : ""}`);
  };
  // A real transaction, then a check of the state it should have produced.
  const call = async (fn, who, p, check) => {
    let tx, ok = false, note;
    try {
      const r = await (await p()).wait();
      tx = r.hash;
      const res = await check(r);
      ok = res === true || (res && res.ok);
      note = res && res.note ? res.note : (ok ? "state checked" : "state NOT as expected");
    } catch (e) {
      note = `reverted: ${readable(reason(e, vault?.interface ?? factory.interface))}`;
    }
    record({ fn, who, kind: "tx", tx, ok, check: note });
    return tx;
  };
  // A call that must be refused, simulated.
  const refused = async (fn, who, p, expect) => {
    let got = "NOT refused";
    try { await p(); } catch (e) { got = readable(reason(e, vault.interface)); }
    const ok = got !== "NOT refused" && (!expect || got.includes(expect));
    record({ fn, who, kind: "refused", ok, check: `refused: ${got}` });
  };
  const view = (fn, value, ok) => record({ fn, who: "anyone", kind: "view", ok, check: value });

  const now = async () => (await ethers.provider.getBlock("latest")).timestamp;
  const ev = (r, c, name) => r.logs.map((l) => { try { return c.interface.parseLog(l); } catch { return null; } }).find((e) => e?.name === name);

  console.log(`Network ${network.name}. Owner ${owner.address}, agent ${agent.address}, guardian ${bot.address}`);
  console.log("\nSluiceFactory");
  let vault;
  const before = Number(await factory.vaultCount());
  const name = `Function check ${new Date().toISOString().slice(0, 16)}`;
  await call("createVault", "owner", () => factory.createVault(name, usd(0.1), usd(2)), async (r) => {
    vault = await ethers.getContractAt("SluiceVault", ev(r, factory, "VaultCreated").args.vault);
    const v = await vault.getAddress();
    return { ok: (await vault.owner()) === owner.address && (await factory.isVault(v)), note: `new company ${v}, owned by the caller` };
  });
  const V = await vault.getAddress();
  view("vaultCount", `${before} -> ${await factory.vaultCount()}`, Number(await factory.vaultCount()) === before + 1);
  view("vaultAt", await factory.vaultAt(before), (await factory.vaultAt(before)) === V);
  view("nameOf", await factory.nameOf(V), (await factory.nameOf(V)) === name);
  view("vaultsCreatedBy", `includes ${V}`, (await factory.vaultsCreatedBy(owner.address)).includes(V));

  const O = vault.connect(owner), A = vault.connect(agent), G = vault.connect(bot);
  const outsider = ethers.Wallet.createRandom().connect(ethers.provider);
  const p = Object.fromEntries(["hosting", "freight", "tools", "spare", "scam", "lookalike", "extra"].map((k) => [k, ethers.Wallet.createRandom().address]));

  console.log("\nRules (owner, each with a reason recorded on chain)");
  await call("setCashBuffer", "owner", () => O.setCashBuffer(0, "function check: no buffer on an empty vault"), async () => (await vault.cashBuffer()) === 0n);
  await call("setApprovalThreshold", "owner", () => O.setApprovalThreshold(usd(1), "function check"), async () => (await vault.approvalThreshold()) === usd(1));
  await call("setPayeeAllowed", "owner", () => O.setPayeeAllowed(p.hosting, true, "function check"), async () => vault.isAllowedPayee(p.hosting));
  await call("setPayeesAllowed", "owner", () => O.setPayeesAllowed([p.freight, p.tools], true, "function check: two at once"), async () => (await vault.isAllowedPayee(p.freight)) && (await vault.isAllowedPayee(p.tools)));
  await call("setPayeeBlocked", "owner", () => O.setPayeeBlocked(p.scam, true, "function check"), async () => vault.isBlockedPayee(p.scam));
  await call("setPayeesBlocked", "owner", () => O.setPayeesBlocked([p.spare, p.extra], true, "function check: two at once"), async () => (await vault.isBlockedPayee(p.spare)) && (await vault.isBlockedPayee(p.extra)));
  await call("setPayeesBlocked", "owner", () => O.setPayeesBlocked([p.spare], false, "function check: unblock"), async () => !(await vault.isBlockedPayee(p.spare)));
  const t = await now();
  await call("grantSession", "owner", () => O.grantSession(agent.address, usd(1), usd(2), t + 7 * 86400, "function check"), async () => {
    const s = await vault.sessions(agent.address);
    return { ok: s.perPaymentCap === usd(1) && s.dailyCap === usd(2), note: "agent may pay 1 per payment, 2 per 24 h, for 7 days" };
  });
  await refused("setCashBuffer", "agent", () => A.setCashBuffer.staticCall(0, "x"), "OwnableUnauthorizedAccount");
  await refused("grantSession", "outsider", () => vault.connect(outsider).grantSession.staticCall(outsider.address, usd(100), usd(100), t + 86400, "x"), "OwnableUnauthorizedAccount");

  console.log("\nBills");
  await call("addBill", "owner", () => O.addBill(p.hosting, usd(0.5), t, 30, false, "Hosting, monthly"), async () => (await vault.billCount()) === 1n);
  await call("addBills", "owner", () => O.addBills([
    { payee: p.freight, amount: usd(3), firstDue: t, intervalDays: 0, critical: false, label: "Freight invoice (over the cap)" },
    { payee: p.tools, amount: usd(0.2), firstDue: t + 20 * 86400, intervalDays: 30, critical: false, label: "Tools, not due yet" },
    { payee: p.lookalike, amount: usd(0.3), firstDue: t, intervalDays: 0, critical: false, label: "New payee" },
    { payee: p.scam, amount: usd(0.4), firstDue: t, intervalDays: 0, critical: false, label: "Blocked payee" },
  ]), async () => (await vault.billCount()) === 5n);
  view("billCount", String(await vault.billCount()), (await vault.billCount()) === 5n);
  const b0 = await vault.getBill(0);
  view("getBill", `bill 0: ${b0.label}, ${fmt(b0.amount)} to ${b0.payee.slice(0, 10)}…, every ${b0.intervalDays} days`, b0.payee === p.hosting && b0.amount === usd(0.5));
  view("dueAt", `bill 0 period 1 due ${new Date(Number(await vault.dueAt(0, 1)) * 1000).toISOString().slice(0, 10)} (30 days after period 0)`, (await vault.dueAt(0, 1)) - (await vault.dueAt(0, 0)) === 30n * 86400n);

  if ((await token.balanceOf(owner.address)) >= usd(1)) {
    await call("deposit (tUSD8 transfer)", "owner", () => token.connect(owner).transfer(V, usd(1)), async () => (await vault.balance()) === usd(1));
  }
  console.log("\ncheckPayment: the vault's answer for each bill, before anything moves");
  const BAND = ["RunsAlone", "NeedsApproval", "Blocked"];
  const funded = (await vault.balance()) >= usd(0.5);
  const expectBand = [
    funded ? [0, "RunsAlone", "listed, approved payee, under the caps"] : [0, "NeedsApproval", "the vault is empty, so even this would break the cash buffer"],
    [1, "NeedsApproval", "over the per-payment cap"],
    [3, "NeedsApproval", "payee not on the approved list"],
    [4, "Blocked", "payee is blocked"],
    [2, "Blocked", "not due yet"],
  ];
  for (const [id, want, why] of expectBand) {
    const [band, rsn] = await vault.checkPayment(agent.address, id, 0);
    view("checkPayment", `bill ${id} (${why}): ${BAND[Number(band)]}, reason ${Number(rsn)}`, BAND[Number(band)] === want);
  }
  view("balance", `${fmt(await vault.balance())} in the vault`, true);
  view("spentInWindow", `${fmt(await vault.spentInWindow(agent.address))} spent by the agent in 24 h`, (await vault.spentInWindow(agent.address)) === 0n);
  view("remainingDailyBudget", `${fmt(await vault.remainingDailyBudget(agent.address))} left today`, (await vault.remainingDailyBudget(agent.address)) === usd(2));

  console.log("\nThe agent's two moves");
  if (!funded) await refused("pay", "agent", () => A.pay.staticCall(0, 0), "BelowCashBuffer");
  await call("propose", "agent", () => A.propose(1, 0, "Over the 1 tUSD8 cap; please approve"), async (r) => ({ ok: !!ev(r, vault, "PaymentProposed"), note: "PaymentProposed emitted for bill 1 period 0" }));
  await refused("propose", "agent", () => A.propose.staticCall(1, 0, "again"), "");
  await refused("approve", "agent", () => A.approve.staticCall(1, 0), "OwnableUnauthorizedAccount");
  await refused("approve", "owner", () => O.approve.staticCall(1, 0), "");

  console.log("\nThe owner's answer");
  await call("reject", "owner", () => O.reject(1, 0), async (r) => ({ ok: !!ev(r, vault, "PaymentRejected"), note: "PaymentRejected; the period is closed" }));
  await refused("propose", "agent", () => A.propose.staticCall(1, 0, "after rejection"), "");
  await call("releaseBill", "owner", () => O.releaseBill(1, 0), async (r) => ({ ok: !!ev(r, vault, "BillReleased"), note: "BillReleased; the period may be filed again" }));
  await call("propose", "agent", () => A.propose(1, 0, "Filed again after release"), async (r) => !!ev(r, vault, "PaymentProposed"));
  await call("cancelBill", "owner", () => O.cancelBill(3, "function check: payee unknown"), async () => !(await vault.getBill(3)).active);

  console.log("\nThe guardian (Telegram bot key): stricter only");
  await call("setGuardian", "owner", () => O.setGuardian(bot.address, "function check: Telegram actions on"), async () => (await vault.guardian()) === bot.address);
  await call("setNotifyChat", "owner", () => O.setNotifyChat("function-check"), async () => (await vault.notifyChat()) === "function-check");
  await call("guardianBlock", "guardian", () => G.guardianBlock(p.lookalike, "function check"), async () => vault.isBlockedPayee(p.lookalike));
  await call("reject", "guardian", () => G.reject(1, 0), async (r) => !!ev(r, vault, "PaymentRejected"));
  await call("pause", "guardian", () => G.pause(), async () => vault.paused());
  await refused("unpause", "guardian", () => G.unpause.staticCall(), "OwnableUnauthorizedAccount");
  await refused("setPayeeAllowed", "guardian", () => G.setPayeeAllowed.staticCall(p.scam, true, "x"), "OwnableUnauthorizedAccount");
  await refused("withdraw", "guardian", () => G.withdraw.staticCall(bot.address, 1), "OwnableUnauthorizedAccount");
  await refused("propose", "agent", () => A.propose.staticCall(0, 1, "while paused"), "");
  await call("unpause", "owner", () => O.unpause(), async () => !(await vault.paused()));
  await call("pause", "owner", () => O.pause(), async () => vault.paused());
  await call("unpause", "owner", () => O.unpause(), async () => !(await vault.paused()));
  await call("setGuardian", "owner", () => O.setGuardian(ethers.ZeroAddress, "function check: Telegram actions off"), async () => (await vault.guardian()) === ethers.ZeroAddress);
  await refused("pause", "guardian", () => G.pause.staticCall(), "NotOwnerOrGuardian");

  console.log("\nMoney in and out");
  const bal = await vault.balance();
  if (bal >= usd(1)) {
    await call("pay", "agent", () => A.pay(0, 0), async (r) => ({ ok: !!ev(r, vault, "BillPaid") && (await token.balanceOf(p.hosting)) === usd(0.5), note: "BillPaid; 0.5 tUSD8 reached the bill's own payee" }));
    await refused("pay", "agent", () => A.pay.staticCall(0, 0), "");
    await call("withdraw", "owner", () => O.withdraw(owner.address, usd(0.5)), async () => (await vault.balance()) === 0n);
  } else {
    record({ fn: "pay / withdraw / approve", who: "—", kind: "skipped", ok: true, check: `skipped here: no tUSD8 to move (${fmt(bal)} in the vault). A real agent payment is recorded on the demo company` });
  }
  await refused("withdraw", "agent", () => A.withdraw.staticCall(agent.address, 1), "OwnableUnauthorizedAccount");

  console.log("\nSessions and ownership");
  await call("revokeSession", "owner", () => O.revokeSession(agent.address, "function check"), async () => !(await vault.sessions(agent.address)).active);
  await refused("propose", "agent", () => A.propose.staticCall(0, 0, "after revocation"), "");
  const next = ethers.Wallet.createRandom().address;
  await call("transferOwnership", "owner", () => O.transferOwnership(next), async () => (await vault.pendingOwner()) === next);
  await refused("acceptOwnership", "agent", () => A.acceptOwnership.staticCall(), "OwnableUnauthorizedAccount");
  await call("transferOwnership(0)", "owner", () => O.transferOwnership(ethers.ZeroAddress), async () => ({ ok: (await vault.pendingOwner()) === ethers.ZeroAddress && (await vault.owner()) === owner.address, note: "offer cancelled; the owner is unchanged" }));

  const out = { network: network.name, factory: await factory.getAddress(), vault: V, owner: owner.address, agent: agent.address, guardian: bot.address, rows, passed: rows.filter((r) => r.ok).length, failed, at: new Date().toISOString() };
  const file = save("functions", out);
  console.log(`\n${out.passed} passed, ${failed} failed. Company ${explorerAddr(V)}. Saved ${file}`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
