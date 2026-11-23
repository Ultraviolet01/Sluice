import { test } from "node:test";
import assert from "node:assert/strict";
import { draftToLine } from "./invoice.ts";
import { parseBills } from "./pages/importBills.ts";

const A = "0x2d7a000000000000000000000000000000091f3a";

test("an invoice draft becomes an import line the parser accepts", () => {
  const line = draftToLine({ vendor: "Northwind, Hosting", address: A, amount: "80.00", due: "2026-12-01", summary: "" }, "file");
  const [row] = parseBills(line);
  assert.equal(row.bill?.label, "Northwind, Hosting");
  assert.equal(row.bill?.amount, 80_000_000n);
});

test("a draft with no address is flagged for the owner, named after the file", () => {
  const [row] = parseBills(draftToLine({ vendor: "", address: "", amount: "5", due: "2026-12-01", summary: "" }, "invoice-17"));
  assert.match(row.raw, /^invoice-17/);
  assert.equal(row.error, "payee is not a 0x address");
});
