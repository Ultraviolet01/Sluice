// A whole round against a fake vault that applies the same band rules as the contract.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Address, Hex } from "viem";
import { Band, DAY, Reason, type Bill } from "./brain.ts";
import type { Chain, Paid, VaultView } from "./chain.ts";
import { runVault } from "./loop.ts";
import type { Reviewer, Verdict } from "./review.ts";

const u = (n: number) => BigInt(Math.round(n * 1e6));
const NOW = 1_800_000_000;
const VAULT = "0x00000000000000000000000000000000000000f0" as Address;
const OK = "0x00000000000000000000000000000000000000a1" as Address;
const NEW = "0x00000000000000000000000000000000000000a2" as Address;
const BAD = "0x00000000000000000000000000000000000000a3" as Address;

function fakeChain(bills: Bill[], extra: Partial<VaultView> = {}) {
  const status = new Map<string, number>();
  const calls: string[] = [];
  const paid: Paid[] = extra.paid ?? [];
  const view: VaultView = {
    vault: VAULT, paused: false, balance: u(1000), cashBuffer: u(100), approvalThreshold: u(500),
    session: { perPaymentCap: u(500), dailyCap: u(600), expiresAt: NOW + 30 * DAY, active: true },
    spent: 0n, bills, paid, ...extra,
  };
  const chain: Chain = {
    agent: "0x00000000000000000000000000000000000000ee",
    discover: async () => [],
    now: async () => NOW,
    read: async () => view,
    status: async (_v, id, p) => status.get(`${id}:${p}`) ?? 0,
    async check(_v, id, p) {
      const b = bills[id];
      const s = status.get(`${id}:${p}`);
      if (view.paused) return { band: Band.Blocked, reason: Reason.Paused };
      if (s === 2) return { band: Band.Blocked, reason: Reason.AlreadySettled };
      if (s === 1) return { band: Band.Blocked, reason: Reason.AlreadyProposed };
      if (b.payee === BAD) return { band: Band.Blocked, reason: Reason.Blocklisted };
      if (b.payee === NEW) return { band: Band.NeedsApproval, reason: Reason.NotAllowlisted };
      if (b.amount > view.session.perPaymentCap) return { band: Band.NeedsApproval, reason: Reason.OverPerPaymentCap };
      if (view.balance - b.amount < view.cashBuffer) return { band: Band.NeedsApproval, reason: Reason.BelowCashBuffer };
      return { band: Band.RunsAlone, reason: Reason.Ok };
    },
    async pay(_v, id, p) {
      calls.push(`pay ${id}/${p}`);
      status.set(`${id}:${p}`, 2);
      return "0x01" as Hex;
    },
    async propose(_v, id, p, note) {
      calls.push(`propose ${id}/${p}: ${note}`);
      status.set(`${id}:${p}`, 1);
      return "0x02" as Hex;
    },
  };
  return { chain, calls };
}

const reviewer = (v: Verdict | null): Reviewer => ({ review: async () => v });
const bill = (id: number, payee: Address, amount: number, label: string): Bill => ({ id, payee, amount: u(amount), firstDue: NOW, intervalDays: 0, active: true, label });

test("pays what fits, proposes what needs the owner, refuses the blocklist", async () => {
  const { chain, calls } = fakeChain([bill(0, OK, 80, "Northwind"), bill(1, OK, 800, "Payroll"), bill(2, NEW, 50, "New supplier"), bill(3, BAD, 950, "Changed bank details")]);
  const events = await runVault(chain, VAULT, { dryRun: false, reviewer: reviewer(null) });
  assert.deepEqual(calls.map((c) => c.split(":")[0]), ["pay 0/0", "propose 1/0", "propose 2/0"]);
  assert.ok(events.some((e) => e.text.includes("Changed bank details") && e.text.includes("refuse")));
});

test("a second round does nothing new: the vault remembers", async () => {
  const { chain, calls } = fakeChain([bill(0, OK, 80, "Northwind"), bill(1, OK, 800, "Payroll")]);
  await runVault(chain, VAULT, { dryRun: false, reviewer: reviewer(null) });
  await runVault(chain, VAULT, { dryRun: false, reviewer: reviewer(null) });
  assert.equal(calls.length, 2);
});

test("the review can turn a payment into a proposal, never the reverse", async () => {
  const { chain, calls } = fakeChain([bill(0, OK, 80, "Northwlnd"), bill(1, OK, 800, "Payroll")]);
  await runVault(chain, VAULT, { dryRun: false, reviewer: reviewer({ verdict: "ok", reason: "x", by: "claude" }) });
  assert.deepEqual(calls.map((c) => c.split(":")[0]), ["pay 0/0", "propose 1/0"]);
  const second = fakeChain([bill(0, OK, 80, "Northwlnd")]);
  await runVault(second.chain, VAULT, { dryRun: false, reviewer: reviewer({ verdict: "propose", reason: "lookalike of Northwind", by: "claude" }) });
  assert.match(second.calls[0], /^propose 0\/0: Sluice held this for you: Claude review: lookalike/);
});

test("dry run signs nothing", async () => {
  const { chain, calls } = fakeChain([bill(0, OK, 80, "Northwind"), bill(1, OK, 800, "Payroll")]);
  const events = await runVault(chain, VAULT, { dryRun: true, reviewer: reviewer(null) });
  assert.equal(calls.length, 0);
  assert.equal(events.filter((e) => e.text.startsWith("dry run")).length, 2);
});

test("a spike goes to the owner even inside the limits", async () => {
  const history: Paid[] = [100, 100, 100].map((a, i) => ({ billId: 9, period: i, payee: OK, amount: u(a), ownerApproved: false }));
  const { chain, calls } = fakeChain([bill(0, OK, 200, "Atlas Freight")], { paid: history });
  await runVault(chain, VAULT, { dryRun: false, reviewer: reviewer(null) });
  assert.match(calls[0], /^propose 0\/0: Sluice held this for you: more than 25%/);
});

test("no live session: the round stops before deciding anything", async () => {
  const { chain, calls } = fakeChain([bill(0, OK, 80, "Northwind")], { session: { perPaymentCap: 1n, dailyCap: 1n, expiresAt: NOW - 1, active: true } });
  const events = await runVault(chain, VAULT, { dryRun: false, reviewer: reviewer(null) });
  assert.equal(calls.length, 0);
  assert.match(events[0].text, /no live session/);
});

test("drafts a higher cap after three rising owner approvals", async () => {
  const approved: Paid[] = [104, 112, 118].map((a, i) => ({ billId: 5, period: i, payee: OK, amount: u(a), ownerApproved: true }));
  const { chain } = fakeChain([], { paid: approved, session: { perPaymentCap: u(100), dailyCap: u(600), expiresAt: NOW + DAY, active: true } });
  const events = await runVault(chain, VAULT, { dryRun: false, reviewer: reviewer(null) });
  assert.ok(events.some((e) => e.step === "learn" && e.text.includes("130.00 tUSD8")));
});

test("below the buffer: holds a bill not yet due, proposes a critical one at once, critical first", async () => {
  const later = { ...bill(0, OK, 450, "Office rent"), firstDue: NOW + 2 * DAY };
  const payroll = { ...bill(1, OK, 450, "Payroll"), firstDue: NOW + 2 * DAY, critical: true };
  const { chain, calls } = fakeChain([later, payroll], { balance: u(500) });
  const alerts: { key: string; text: string }[] = [];
  const events = await runVault(chain, VAULT, { dryRun: false, reviewer: reviewer(null), alert: (a) => alerts.push(a) });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^propose 1\/0: Sluice held this for you: critical bill/);
  assert.ok(events.some((e) => e.text.includes("Office rent") && e.text.includes("defer")));
  assert.ok(alerts.some((a) => a.key.startsWith("proposed:") && a.text.includes("Payroll")));
  assert.ok(alerts.some((a) => a.key.startsWith("short:")));
});

test("alerts: refused bills and a custom explainer note", async () => {
  const { chain, calls } = fakeChain([bill(0, BAD, 950, "New bank details"), bill(1, NEW, 50, "Figma")]);
  const alerts: { key: string; text: string }[] = [];
  await runVault(chain, VAULT, { dryRun: false, reviewer: reviewer(null), explain: async () => "Custom note from the explainer.", alert: (a) => alerts.push(a) });
  assert.match(calls[0], /Custom note from the explainer/);
  assert.ok(alerts.some((a) => a.key === "refused:" + VAULT + ":0:0"));
});

test("past the deadline, no new bill is started", async () => {
  const { chain, calls } = fakeChain([bill(0, OK, 80, "Northwind"), bill(1, OK, 90, "Hosting")]);
  const events = await runVault(chain, VAULT, { dryRun: false, reviewer: reviewer(null), deadline: Date.now() - 1 });
  assert.equal(calls.length, 0);
  assert.ok(events.some((e) => e.text.includes("round time is up")));
});
