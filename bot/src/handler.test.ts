import { test } from "node:test";
import assert from "node:assert/strict";
import type { Address } from "viem";
import { cb, handle, type Deps } from "./handler.ts";
import type { Button, Telegram, Update } from "./telegram.ts";
import type { Chain } from "./vaults.ts";

const V = "0x00000000000000000000000000000000000000f0" as Address;
const PAYEE = "0x00000000000000000000000000000000000000a1" as Address;
const OWNER_CHAT = 111, STRANGER_CHAT = 222;

function setup(opts: { guardian?: boolean; linked?: string } = {}) {
  const sent: { chat: string; text: string; buttons?: Button[][] }[] = [];
  const answers: string[] = [];
  const txs: string[] = [];
  const tg: Telegram = {
    send: async (chat, text, buttons) => void sent.push({ chat: String(chat), text, buttons }),
    answer: async (_id, text) => void answers.push(text),
    updates: async () => [],
    me: async () => ({ username: "SluiceBot" }),
  };
  const linked = opts.linked ?? String(OWNER_CHAT);
  const chain: Chain = {
    guardianAddress: "0x00000000000000000000000000000000000000b0",
    vaultAt: async (i) => (i === 0 ? { index: 0, vault: V, name: "Kora" } : null),
    vaultsForChat: async (c) => (c === linked ? [{ index: 0, vault: V, name: "Kora" }] : []),
    notifyChat: async () => linked,
    isGuardian: async () => opts.guardian ?? true,
    summary: async () => ({ balance: 18_215_400_000n, buffer: 10_000_000_000n, paused: false, owner: V }),
    bills: async () => [{ id: 0, payee: PAYEE, amount: 800_000_000n, firstDue: 0, intervalDays: 0, active: true, critical: false, label: "Atlas <Freight>" }],
    pending: async () => [{ billId: 0, period: 0, amount: 800_000_000n, note: "over the cap" }],
    pause: async () => (txs.push("pause"), "0x01"),
    reject: async (_v, b, p) => (txs.push(`reject ${b}/${p}`), "0x02"),
    block: async (_v, payee) => (txs.push(`block ${payee}`), "0x03"),
  };
  const d: Deps = { tg, chain, appUrl: "https://sluice.example/" };
  return { d, sent, answers, txs };
}

const msg = (text: string, chat = OWNER_CHAT, type = "private"): Update => ({ update_id: 1, message: { message_id: 1, chat: { id: chat, type }, from: { id: chat, username: "ada" }, text } });
const tap = (data: string, chat = OWNER_CHAT): Update => ({ update_id: 2, callback_query: { id: "q", from: { id: chat, username: "ada" }, data, message: { message_id: 9, chat: { id: chat } } } });

test("/start with a vault sends a link to sign in Sluice, carrying this chat", async () => {
  const { d, sent } = setup({ linked: "" });
  await handle(msg(`/start ${V.slice(2)}`), d);
  const url = sent[0].buttons![0][0].url!;
  assert.match(url, /^https:\/\/sluice\.example\/#\/app\/settings\?vault=0x0+f0&tgchat=111&tgname=ada$/);
});

test("an unlinked chat gets nothing about any vault", async () => {
  const { d, sent } = setup();
  await handle(msg("/balance", STRANGER_CHAT), d);
  assert.match(sent[0].text, /isn't linked/);
});

test("the linked chat reads balances and pending payments, with names escaped", async () => {
  const { d, sent } = setup();
  await handle(msg("/balance"), d);
  assert.match(sent[0].text, /Kora: 18,215\.40 tUSD8 \(buffer 10,000\.00 tUSD8\)/);
  await handle(msg("/pending"), d);
  assert.match(sent[1].text, /Atlas &lt;Freight&gt;, 800\.00 tUSD8/);
  const [approve, reject] = sent[1].buttons![0];
  assert.match(approve.url!, /#\/app\/approvals\?vault=.*&bill=0&period=0$/);
  assert.equal(reject.callback_data, "rj:0:0:0");
});

test("group chats are ignored: a treasury is never discussed in a group", async () => {
  const { d, sent } = setup();
  await handle(msg("/balance", OWNER_CHAT, "group"), d);
  assert.equal(sent.length, 0);
});

test("reject from the linked chat sends the guardian transaction", async () => {
  const { d, txs, answers } = setup();
  await handle(tap(cb.reject(0, 0, 0)), d);
  assert.deepEqual(txs, ["reject 0/0"]);
  assert.equal(answers[0], "Done");
});

test("a button tapped from another chat does nothing", async () => {
  const { d, txs, answers } = setup();
  await handle(tap(cb.pause(0), STRANGER_CHAT), d);
  assert.equal(txs.length, 0);
  assert.match(answers[0], /isn't linked/);
});

test("with Telegram actions off (bot not guardian), nothing is sent and the owner is told how to turn them on", async () => {
  const { d, txs, sent } = setup({ guardian: false });
  await handle(tap(cb.pause(0)), d);
  assert.equal(txs.length, 0);
  assert.match(sent[0].text, /turn on <b>Telegram actions<\/b>/);
});

test("/block needs a real address and asks for confirmation before blocking", async () => {
  const { d, sent, txs } = setup();
  await handle(msg("/block nonsense"), d);
  assert.match(sent[0].text, /payee's address/);
  await handle(msg(`/block ${PAYEE} scam`), d);
  assert.equal(txs.length, 0);
  await handle(tap(sent[1].buttons![0][0].callback_data!), d);
  assert.deepEqual(txs, [`block ${PAYEE}`]);
});

test("forged or unknown button data does nothing", async () => {
  const { d, txs } = setup();
  for (const data of ["rj:0:x:0", "bk:0:zz", "zz:0", "ps:9", "", "rj:-1:0:0"]) await handle(tap(data), d);
  assert.equal(txs.length, 0);
});

test("button data always fits Telegram's 64-byte limit", () => {
  const big = cb.block(999_999, "0xffffffffffffffffffffffffffffffffffffffff");
  assert.ok(Buffer.byteLength(big) <= 64, big);
  assert.ok(Buffer.byteLength(cb.reject(999_999, 999_999, 4_294_967_295)) <= 64);
});
