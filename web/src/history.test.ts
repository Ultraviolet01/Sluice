import { test } from "node:test";
import assert from "node:assert/strict";
import { balanceHistory } from "./history.ts";

const DAY = 86_400;
const now = 20_000 * DAY + 15 * 3600; // 15:00 on some day

test("walks back from today's balance through each day's transfers", () => {
  const moves = [
    { at: now - 2 * DAY, delta: 5_000_000n }, // deposit 5, two days ago
    { at: now - 3600, delta: -1_000_000n }, // paid 1, today
  ];
  const h = balanceHistory(4_000_000n, moves, now, 4);
  assert.deepEqual(h.map((d) => d.balance), [0n, 5_000_000n, 5_000_000n, 4_000_000n]);
  assert.equal(h[3].day, 20_000 * DAY);
  assert.equal(h[0].day, 19_997 * DAY);
});

test("no transfers: a flat line at today's balance", () => {
  assert.deepEqual(balanceHistory(7n, [], now, 3).map((d) => d.balance), [7n, 7n, 7n]);
});
