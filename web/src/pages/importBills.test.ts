import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBills, splitCsv } from "./importBills.ts";

const A = "0x2d7a000000000000000000000000000000091f3a";

test("parses rows, skips the header and comments, and reports bad rows by line", () => {
  const rows = parseBills(`name, payee, amount, due, repeat, critical
# a comment
Northwind Hosting, ${A}, 80, 2026-12-01, monthly, no
"Payroll, contractors", ${A}, "9,600.50", 2026-12-07, 2 weeks, yes
Bad, 0x123, 5, 2026-12-01, once, no
Late, ${A}, 5, 12/01/2026, once, no`);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].bill?.intervalDays, 30);
  assert.equal(rows[0].bill?.amount, 80_000_000n);
  assert.equal(rows[1].bill?.label, "Payroll, contractors");
  assert.equal(rows[1].bill?.amount, 9_600_500_000n);
  assert.equal(rows[1].bill?.critical, true);
  assert.equal(rows[2].error, "payee is not a 0x address");
  assert.equal(rows[2].line, 5);
  assert.match(rows[3].error ?? "", /YYYY-MM-DD/);
});

test("repeat accepts words or a number of days", () => {
  assert.equal(parseBills(`X, ${A}, 1, 2026-12-01, 10, no`)[0].bill?.intervalDays, 10);
  assert.equal(parseBills(`X, ${A}, 1, 2026-12-01, yearly`)[0].bill?.intervalDays, 365);
  assert.match(parseBills(`X, ${A}, 1, 2026-12-01, sometimes`)[0].error ?? "", /unknown repeat/);
});

test("splitCsv handles quotes, semicolons and tabs", () => {
  assert.deepEqual(splitCsv('a;"b ""c""";d\te'), ["a", 'b "c"', "d", "e"]);
});
