import { test } from "node:test";
import assert from "node:assert/strict";
import { Band, DAY, Reason, candidatePeriods, decide, draftCap, firstShortfall, forecast, isSpike, money, upcoming, type Bill } from "./brain.ts";

const P = "0x00000000000000000000000000000000000000a1" as const;
const u = (n: number) => BigInt(Math.round(n * 1e6));
const NOW = 1_800_000_000;
const bill = (x: Partial<Bill>): Bill => ({ id: 0, payee: P, amount: u(10), firstDue: NOW, intervalDays: 0, active: true, label: "x", ...x });

test("one-off bill: candidate only within 3 days before and 30 days after its due date", () => {
  assert.deepEqual(candidatePeriods(bill({ firstDue: NOW + 2 * DAY }), NOW), [0]);
  assert.deepEqual(candidatePeriods(bill({ firstDue: NOW + 4 * DAY }), NOW), []);
  assert.deepEqual(candidatePeriods(bill({ firstDue: NOW - 31 * DAY }), NOW), []);
  assert.deepEqual(candidatePeriods(bill({ active: false }), NOW), []);
});

test("recurring bill: current and recent periods, never far-future ones", () => {
  const b = bill({ firstDue: NOW - 65 * DAY, intervalDays: 30 });
  // periods due at -65d, -35d, -5d, +25d: only the last 30 days and the next 3
  assert.deepEqual(candidatePeriods(b, NOW), [2]);
  assert.deepEqual(candidatePeriods(bill({ firstDue: NOW - 20 * DAY, intervalDays: 7 }), NOW), [0, 1, 2, 3]);
});

test("upcoming and forecast find the first shortfall below the buffer", () => {
  const bills = [bill({ id: 0, amount: u(50), firstDue: NOW + 1 * DAY }), bill({ id: 1, amount: u(100), firstDue: NOW + 5 * DAY })];
  const items = upcoming(bills, NOW);
  assert.equal(items.length, 2);
  const days = forecast(u(160), items, NOW);
  assert.equal(days.length, 14);
  assert.equal(days[13].balance, u(10));
  const short = firstShortfall(days, u(20));
  assert.ok(short);
  assert.equal(short.balance, u(10));
  assert.equal(firstShortfall(days, 0n), undefined);
  // already-settled periods are left out
  assert.equal(upcoming(bills, NOW, 14, (id) => id === 0).length, 1);
});

test("spike: more than 25% above the last three, and only with three of history", () => {
  assert.equal(isSpike(u(130), [u(100), u(100), u(100)]), true);
  assert.equal(isSpike(u(125), [u(100), u(100), u(100)]), false);
  assert.equal(isSpike(u(500), [u(100), u(100)]), false);
});

test("decide follows the vault's band and never pays what the vault would not", () => {
  assert.equal(decide(Band.RunsAlone, Reason.Ok).kind, "pay");
  assert.equal(decide(Band.RunsAlone, Reason.Ok, { spike: true }).kind, "propose");
  assert.equal(decide(Band.NeedsApproval, Reason.OverPerPaymentCap).kind, "propose");
  assert.match(decide(Band.NeedsApproval, Reason.NotAllowlisted).reason, /approved list/);
  assert.equal(decide(Band.Blocked, Reason.Blocklisted).kind, "refuse");
  assert.equal(decide(Band.Blocked, Reason.AlreadySettled).kind, "skip");
  assert.equal(decide(Band.Blocked, Reason.Paused).kind, "wait");
  assert.equal(decide(Band.Blocked, Reason.SessionExpired).kind, "wait");
  for (const r of Object.values(Reason).filter((x) => typeof x === "number") as Reason[]) {
    assert.notEqual(decide(Band.Blocked, r).kind, "pay");
    assert.notEqual(decide(Band.NeedsApproval, r).kind, "pay");
  }
});

test("cap draft: three rising approvals over the cap, never otherwise", () => {
  const d = draftCap(P, [u(104), u(112), u(118)], u(100));
  assert.ok(d);
  assert.equal(d.suggestedCap, u(130)); // 118 * 1.1 = 129.8 -> 130
  assert.equal(draftCap(P, [u(104), u(112)], u(100)), null);
  assert.equal(draftCap(P, [u(104), u(99), u(118)], u(100)), null); // one under the cap
  assert.equal(draftCap(P, [u(104), u(112), u(200)], u(100)), null); // a jump, not a steady rise
  assert.equal(draftCap(P, [u(118), u(112), u(104)], u(100)), null); // falling
});

test("money formats 6-decimal tUSD8", () => {
  assert.equal(money(u(1234.5)), "1,234.50 tUSD8");
  assert.equal(money(-u(80)), "-80.00 tUSD8");
});
