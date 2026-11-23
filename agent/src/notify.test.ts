import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LOW_GAS, format, fresh, gasAlert, loadSent, saveSent, send } from "./notify.ts";
import { template } from "./explain.ts";

test("each situation is alerted once, and again after a week", () => {
  const a = [{ key: "k1", text: "one" }, { key: "k1", text: "dup" }, { key: "k2", text: "two" }];
  const first = fresh(a, {}, 1000);
  assert.deepEqual(first.todo.map((x) => x.key), ["k1", "k2"]);
  const sent = { k1: 1000, k2: 1000 };
  assert.equal(fresh(a, sent, 2000).todo.length, 0);
  assert.equal(fresh(a, sent, 1000 + 8 * 86_400_000).todo.length, 2);
});

test("the memory survives a round trip and a corrupt file", () => {
  const dir = mkdtempSync(join(tmpdir(), "sluice-"));
  const f = join(dir, "s.json");
  saveSent(f, { a: 1 });
  assert.deepEqual(loadSent(f), { a: 1 });
  assert.deepEqual(loadSent(join(dir, "missing.json")), {});
});

test("messages escape HTML and stay under Telegram's limit", () => {
  const t = format("0xabc…", [{ key: "k", text: "<script>Pay & go</script>" }], "https://app/");
  assert.ok(t.includes("&lt;script&gt;Pay &amp; go"));
  assert.ok(!t.includes("<script>"));
  assert.ok(format("v", Array.from({ length: 200 }, (_, i) => ({ key: `${i}`, text: "x".repeat(100) }))).length <= 3900);
});

test("send posts to the bot API and reports failure without throwing", async () => {
  let url = "";
  let body: { chat_id?: string; parse_mode?: string } = {};
  const ok = await send({ token: "T", chatId: "42" }, "hi", (async (u: string, init: { body: string }) => {
    url = u;
    body = JSON.parse(init.body);
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch);
  assert.equal(ok, true);
  assert.equal(url, "https://api.telegram.org/botT/sendMessage");
  assert.equal(body.chat_id, "42");
  assert.equal(body.parse_mode, "HTML");
  assert.equal(await send({ token: "T", chatId: "1" }, "x", (async () => { throw new Error("offline"); }) as unknown as typeof fetch), false);
});

test("the template explains without a model and fits the vault's note limit", () => {
  const t = template({ rule: "would take the vault below its cash buffer", amount: "9,600.00 tUSD8", due: "2026-12-07", balance: "18,000.00 tUSD8", balanceAfter: "8,400.00 tUSD8", cashBuffer: "10,000.00 tUSD8", perPaymentCap: "100.00 tUSD8", paidBefore: 3, critical: true });
  assert.match(t, /under your 10,000.00 tUSD8 buffer/);
  assert.match(t, /critical/);
  assert.ok(t.length <= 270);
});

test("low gas: alert below the line, once per day, and say plainly when it is empty", () => {
  assert.equal(gasAlert("0xA", LOW_GAS), null);
  const low = gasAlert("0xA", LOW_GAS / 2n, LOW_GAS, "2026-12-01");
  assert.ok(low);
  assert.match(low.text, /0\.1000 tQDAY left/);
  assert.equal(low.key, "lowgas:0xA:2026-12-01");
  assert.match(gasAlert("0xA", 0n)!.text, /no tQDAY left/);
});

test("a waiting payment gets Approve (sign in Sluice) and Reject (the bot, as guardian) buttons", async () => {
  const { billButtons } = await import("./notify.ts");
  const [row] = billButtons("https://sluice.example/", "0xV", 3, { id: 7, period: 2 })!;
  assert.equal(row[0].url, "https://sluice.example/#/app/approvals?vault=0xV&bill=7&period=2");
  assert.equal(row[1].callback_data, "rj:3:7:2");
  // A vault outside the factory has no index: Approve only.
  assert.equal(billButtons("https://x", "0xV", undefined, { id: 1, period: 0 })![0].length, 1);
  assert.equal(billButtons(undefined, "0xV", undefined, { id: 1, period: 0 }), undefined);
});
