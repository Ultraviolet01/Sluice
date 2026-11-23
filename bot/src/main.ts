// Runs the bot. On Railway (or any always-on host) it long-polls Telegram: no
// public URL needed. With PORT and TELEGRAM_WEBHOOK_SECRET set it serves a
// webhook instead, for hosts that sleep between requests.
//
// Environment:
//   TELEGRAM_BOT_TOKEN       required, from @BotFather
//   BOT_GUARDIAN_KEY         required, the bot's own key (0x...); owners make its address the guardian
//   SLUICE_FACTORY           required, the SluiceFactory address
//   SLUICE_APP_URL           required, the dashboard's address, for "sign in Sluice" links
//   AEVUM_RPC_URL            optional, default https://rpc-test.qday.info
//   SLUICE_FROM_BLOCK        optional, first block to read proposals from
//   PORT + TELEGRAM_WEBHOOK_SECRET   optional, webhook mode

import { createServer } from "node:http";
import type { Address, Hex } from "viem";
import { handle, type Deps } from "./handler.ts";
import { telegram, type Update } from "./telegram.ts";
import { viemChain } from "./vaults.ts";

function need(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing ${name}. See bot/README.md.`);
    process.exit(2);
  }
  return v;
}

const tg = telegram(need("TELEGRAM_BOT_TOKEN"));
const chain = viemChain({
  rpcUrl: process.env.AEVUM_RPC_URL || "https://rpc-test.qday.info",
  factory: need("SLUICE_FACTORY") as Address,
  guardianKey: need("BOT_GUARDIAN_KEY") as Hex,
  fromBlock: process.env.SLUICE_FROM_BLOCK ? BigInt(process.env.SLUICE_FROM_BLOCK) : undefined,
});
const deps: Deps = { tg, chain, appUrl: need("SLUICE_APP_URL") };

const safe = async (u: Update) => {
  try {
    await handle(u, deps);
  } catch (e) {
    console.error(`update ${u.update_id}:`, (e as Error).message);
  }
};

async function poll() {
  let offset = 0;
  for (;;) {
    try {
      const updates = await tg.updates(offset, 30);
      for (const u of updates) {
        offset = u.update_id + 1;
        await safe(u);
      }
    } catch (e) {
      console.error("polling:", (e as Error).message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

function webhook(port: number, secret: string) {
  createServer((req, res) => {
    if (req.method !== "POST" || req.headers["x-telegram-bot-api-secret-token"] !== secret) {
      res.writeHead(403).end();
      return;
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.writeHead(200).end();
      try {
        void safe(JSON.parse(body) as Update);
      } catch {
        /* not JSON */
      }
    });
  }).listen(port, () => console.log(`webhook on :${port}`));
}

const me = await tg.me();
console.log(`@${me.username} running. Guardian address ${chain.guardianAddress}. Owners set this as their vault's guardian to allow pause, block and reject from Telegram.`);
if (process.env.PORT && process.env.TELEGRAM_WEBHOOK_SECRET) webhook(Number(process.env.PORT), process.env.TELEGRAM_WEBHOOK_SECRET);
else await poll();
