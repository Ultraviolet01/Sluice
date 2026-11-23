// Generated-case test: random sequences of agent payments, proposals, owner
// approvals and time jumps against a vault with random bills. After every
// step, the money properties must hold. Seeded: FUZZ_SEED=<n> replays a run.
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const SEED = Number(process.env.FUZZ_SEED || Date.now() % 1_000_000);
const RUNS = Number(process.env.FUZZ_RUNS || 4);
const STEPS = Number(process.env.FUZZ_STEPS || 60);
const usd = (n) => ethers.parseUnits(String(n), 6);
const DAY = 86400;

function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  return { next, int, pick: (xs) => xs[int(0, xs.length - 1)] };
}

describe(`SluiceVault under random operations (seed ${SEED})`, function () {
  this.timeout(300_000);
  for (let run = 0; run < RUNS; run++) {
    it(`run ${run}: never pays outside a listed bill, twice, past the 24h cap, or below the buffer`, async () => {
      const r = rng(SEED * 1009 + run);
      const [owner, agent, ...rest] = await ethers.getSigners();
      const payees = rest.slice(0, 5);
      const token = await (await ethers.getContractFactory("MockUSD")).deploy();
      const buffer = usd(r.int(0, 100));
      const per = r.int(20, 200), daily = per + r.int(0, 300);
      // Usually at or above the cap, so the cap and the 24h budget are what get tested; sometimes below it.
      const threshold = r.next() < 0.8 ? per + r.int(0, 100) : r.int(10, per);
      const vault = await (await ethers.getContractFactory("SluiceVault")).deploy(owner.address, await token.getAddress(), buffer, usd(threshold));
      const v = await vault.getAddress();
      await token.mint(v, usd(r.int(400, 3000)));
      await vault.grantSession(agent.address, usd(per), usd(daily), (await time.latest()) + 400 * DAY, "test");
      for (const p of payees) if (r.next() < 0.85) await vault.setPayeeAllowed(p.address, true, "test");
      if (r.next() < 0.5) await vault.setPayeeBlocked(r.pick(payees).address, true, "test");

      const now0 = await time.latest();
      const bills = [];
      for (let i = 0, n = r.int(2, 7); i < n; i++) {
        // Mostly within the per-payment cap; sometimes over it, so proposals and approvals happen too.
        const amt = r.next() < 0.8 ? r.int(1, per) : r.int(per + 1, per * 3);
        const b = { payee: r.pick(payees).address, amount: usd(amt), firstDue: now0 + r.int(-5, 10) * DAY, intervalDays: r.pick([0, 1, 1, 7, 30]) };
        await vault.addBill(b.payee, b.amount, b.firstDue, b.intervalDays, r.next() < 0.2, "b");
        bills.push(b);
      }

      const agentPays = []; // { at, amount }
      const proposed = []; // [id, period] the agent filed
      const settled = new Set();
      const payeeSet = new Set(bills.map((b) => b.payee.toLowerCase()));

      for (let step = 0; step < STEPS; step++) {
        const op = r.next();
        // Mostly listed bills (sometimes one past the end: an unlisted bill), and periods that exist.
        const id = r.next() < 0.92 ? r.int(0, bills.length - 1) : bills.length;
        const period = bills[id]?.intervalDays === 0 ? (r.next() < 0.9 ? 0 : 1) : r.int(0, 6);
        if (op < 0.45) {
          const before = await token.balanceOf(v);
          try {
            await vault.connect(agent).pay(id, period);
            const b = bills[id];
            expect(b, "paid a bill nobody listed").to.exist;
            expect(settled.has(`${id}:${period}`), "paid a period twice").to.equal(false);
            settled.add(`${id}:${period}`);
            agentPays.push({ at: await time.latest(), amount: b.amount });
            expect(before - (await token.balanceOf(v))).to.equal(b.amount);
            expect(await token.balanceOf(v)).to.be.gte(buffer);
          } catch (e) {
            if (e.message.includes("AssertionError") || e.name === "AssertionError") throw e;
          }
        } else if (op < 0.65) {
          try {
            await vault.connect(agent).propose(id, period, "n");
            expect(bills[id], "proposed a bill nobody listed").to.exist;
            proposed.push([id, period]);
          } catch (e) { if (e.name === "AssertionError") throw e; }
        } else if (op < 0.8) {
          // The owner approves something the agent proposed (or, sometimes, something it didn't).
          const [aid, ap] = proposed.length && r.next() < 0.85 ? r.pick(proposed) : [id, period];
          try {
            const st = await vault.settlements(aid, ap);
            await vault.connect(owner).approve(aid, ap);
            expect(st.status, "approved something that was not pending").to.equal(1n);
            expect(settled.has(`${aid}:${ap}`), "approved a period already paid").to.equal(false);
            settled.add(`${aid}:${ap}`);
          } catch (e) { if (e.name === "AssertionError") throw e; }
        } else {
          await time.increase(r.pick([60, 3600, 6 * 3600, DAY, 3 * DAY]));
        }

        // Invariant: agent payments in any 24-hour window stay within the daily cap.
        const nowT = await time.latest();
        const inWindow = agentPays.filter((p) => p.at > nowT - DAY).reduce((s, p) => s + p.amount, 0n);
        expect(inWindow <= usd(daily), "rolling 24h cap exceeded").to.equal(true);
        expect(await vault.spentInWindow(agent.address)).to.equal(inWindow);
      }

      if (process.env.FUZZ_DEBUG) console.log(`      run ${run}: ${bills.length} bills, ${agentPays.length} agent payments, ${proposed.length} proposals, ${settled.size} periods settled`);
      // A run where nothing ever got paid would prove nothing.
      expect(agentPays.length + proposed.length, "no agent operation succeeded in this run").to.be.greaterThan(0);
      // Every token that left the vault went to a payee of a listed bill.
      const logs = await token.queryFilter(token.filters.Transfer(v));
      for (const l of logs) expect(payeeSet.has(l.args.to.toLowerCase()), "money went to a non-bill payee").to.equal(true);
    });
  }
});
