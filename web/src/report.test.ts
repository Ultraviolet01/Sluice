import { test } from "node:test";
import assert from "node:assert/strict";
import { demoModel } from "./data.ts";
import { buildReport, looksLikeFormula, periodLabel, units, type Transfer } from "./report.ts";

const X = "https://explorer-test.qday.info";
const sheet = (s: ReturnType<typeof buildReport>, name: string) => s.find((x) => x.name === name)!;
const H = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;

test("the workbook has the six sheets, every row as wide as its header", () => {
  const s = buildReport({ model: demoModel(), now: 1_800_000_000, transfers: null, explorer: X });
  assert.deepEqual(s.map((x) => x.name), ["Summary", "Activity", "Payments", "Ledger", "Rule changes", "Wallets"]);
  for (const x of s) for (const r of x.rows) assert.equal(r.length, x.columns.length, `${x.name}: ${JSON.stringify(r)}`);
});

test("the summary names the company, the period and the vault's rules", () => {
  const m = demoModel();
  const s = buildReport({ model: m, now: 1_800_000_000, transfers: null, explorer: X });
  const sum = sheet(s, "Summary").rows;
  assert.equal(sum[0][0], `Sluice treasury report: ${m.name}`);
  assert.deepEqual(sum.find((r) => r[0] === "Period"), ["Period", "All time"]);
  assert.equal(sum.find((r) => r[0] === "Cash in the vault (tUSD8)")![1], units(m.balance));
  assert.ok(sum.some((r) => r[0] === "Note"), "says the ledger was built without the transfer index");
});

test("activity is in time order, numbered, with money out negative and a link per transaction", () => {
  const m = demoModel();
  const rows = sheet(buildReport({ model: m, now: 1_800_000_000, transfers: null, explorer: X }), "Activity").rows;
  assert.equal(rows.length, m.activity.length);
  rows.forEach((r, i) => assert.equal(r[0], i + 1));
  const times = rows.map((r) => String(r[1]));
  assert.deepEqual(times, [...times].sort());
  const paid = m.activity.find((a) => a.sign === "out" && a.amount)!;
  assert.ok(rows.some((r) => r[2] === paid.what && (r[4] as number) < 0));
});

test("a date range keeps only what happened inside it", () => {
  const m = demoModel();
  const at = [...m.activity].sort((a, b) => a.at - b.at);
  const mid = at[Math.floor(at.length / 2)].at;
  const rows = sheet(buildReport({ model: m, now: 1_800_000_000, range: { from: mid, to: null }, transfers: null, explorer: X }), "Activity").rows;
  assert.equal(rows.length, at.filter((a) => a.at >= mid).length);
  assert.equal(periodLabel({ from: mid, to: null }).endsWith("to present"), true);
});

test("the ledger names each transfer from the vault's own record of that transaction", () => {
  const m = demoModel();
  const auto = m.activity.find((a) => a.type === "auto" && a.amount)!;
  auto.tx = H(1);
  m.activity.push({ at: auto.at + 60, what: "Withdrew", amount: 2_000_000n, sign: "out", kind: "neutral", outcome: "Withdrawn", rule: "withdraw", tx: H(2), type: "rules" });
  const someone = "0x00000000000000000000000000000000000000aa" as const;
  const t: Transfer[] = [
    { at: auto.at - 60, from: someone, to: m.vault, amount: 10_000_000n, tx: H(3) },
    { at: auto.at, from: m.vault, to: someone, amount: auto.amount!, tx: H(1) },
    { at: auto.at + 60, from: m.vault, to: someone, amount: 2_000_000n, tx: H(2) },
  ];
  const s = buildReport({ model: m, now: auto.at + 3600, transfers: t, explorer: X });
  const ledger = sheet(s, "Ledger").rows;
  assert.deepEqual(ledger.map((r) => r[1]), ["Deposit", "Bill payment", "Owner withdrawal"]);
  assert.deepEqual(ledger.map((r) => r[2]), [10, -units(auto.amount!), -2]);
  assert.equal(ledger[1][6], "Sluice, inside your limits");
  assert.equal(ledger[0][8], `${X}/tx/${H(3)}`);
  const sum = sheet(s, "Summary").rows;
  assert.equal(sum.find((r) => r[0] === "Deposited (tUSD8)")![1], 10);
  assert.equal(sum.find((r) => r[0] === "Withdrawn by you (tUSD8)")![1], 2);
  assert.ok(!sum.some((r) => r[0] === "Note"));
});

test("rule changes carry the owner's reason without the quote marks", () => {
  const m = demoModel();
  m.activity.push({ at: 1_790_000_000, what: "Cash buffer 1 → 2", amount: null, sign: "none", kind: "settled", outcome: "Signed by you", rule: "“payroll next week”", tx: H(9), type: "rules" });
  const rows = sheet(buildReport({ model: m, now: 1_800_000_000, transfers: null, explorer: X }), "Rule changes").rows;
  assert.ok(rows.some((r) => r[1] === "Cash buffer 1 → 2" && r[2] === "payroll next week"));
});

test("text that a spreadsheet would run as a formula is spotted", () => {
  for (const v of ["=HYPERLINK(\"x\")", "+1", "-2+3", "@SUM(A1)"]) assert.equal(looksLikeFormula(v), true, v);
  for (const v of ["Northwind Hosting", "0x12", 5, null]) assert.equal(looksLikeFormula(v), false, String(v));
});
