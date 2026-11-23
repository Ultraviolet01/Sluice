import { test } from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { handle } from "./read-invoice.ts";

const fake = (text: string) => ({ messages: { create: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text }] }) } }) as unknown as Anthropic;
const req = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://x/api/read-invoice", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

test("returns a cleaned draft and drops fields in the wrong shape", async () => {
  const r = await handle(req({ data: "QUJD", media_type: "application/pdf" }), fake(JSON.stringify({ vendor: "Northwind‮ Hosting", address: "0x123", amount: "80.00", due: "2026-12-01", summary: "Hosting" })));
  const { draft } = await r.json();
  assert.equal(r.status, 200);
  assert.equal(draft.vendor, "Northwind  Hosting");
  assert.equal(draft.address, ""); // not a full address: the owner types it
  assert.equal(draft.amount, "80.00");
});

test("refuses bad input before calling the model", async () => {
  assert.equal((await handle(req({ data: "QUJD", media_type: "text/html" }), fake("{}"))).status, 400);
  assert.equal((await handle(req({ data: "<script>", media_type: "application/pdf" }), fake("{}"))).status, 400);
  assert.equal((await handle(new Request("http://x", { method: "GET" }), fake("{}"))).status, 405);
  assert.equal((await handle(req({ data: "QUJD", media_type: "application/pdf" }, { origin: "https://evil.example", host: "sluice.app" }), fake("{}"))).status, 403);
});
