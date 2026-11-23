// Runs one round over every vault in SLUICE_VAULTS, then exits. Scheduling is
// GitHub Actions' job (.github/workflows/agent.yml), every 15 minutes.
//
// Environment:
//   SLUICE_VAULTS        comma-separated vault addresses, and/or
//   SLUICE_FACTORY       serve every vault the factory created whose agent is this key
//   SLUICE_ROUND_SECONDS optional, time limit for the whole round (default 420)
//   AGENT_PRIVATE_KEY    required, the agent's session key (0x...)
//   AEVUM_RPC_URL        optional, default https://rpc-test.qday.info
//   ANTHROPIC_API_KEY    optional, enables the Claude review
//   SLUICE_FROM_BLOCK    optional, first block to read receipts from
//   SLUICE_LOCAL=1       optional, use a local Hardhat node instead of Aevum
//   TELEGRAM_BOT_TOKEN   optional: alerts to each company's linked chat when something needs its owner
//   SLUICE_APP_URL       optional, the dashboard's address, linked from alerts
//   SLUICE_ALERT_STATE   optional, file remembering alerts already sent (default .sluice-alerts.json)
//   SLUICE_MIN_GAS       optional, alert the operator when the agent's tQDAY falls below this (default 0.2)
//   OPERATOR_TELEGRAM_CHAT_ID  optional, the operator's chat (agent gas); TELEGRAM_CHAT_ID also works
// A company's own alerts go to the chat its owner linked on the vault (Settings -> Telegram),
// never to the operator. A vault with no linked chat gets no Telegram alerts.
// Flags: --dry-run decides everything and signs nothing.

import { appendFileSync } from "node:fs";
import { isAddress, type Address, type Hex } from "viem";
import { hardhat } from "viem/chains";
import { aevumTestnet, viemChain } from "./chain.ts";
import { runVault, type Event } from "./loop.ts";
import { makeReviewer } from "./review.ts";
import { explain } from "./explain.ts";
import { LOW_GAS, billButtons, format, fresh, gasAlert, loadSent, saveSent, send, type Alert } from "./notify.ts";

const EXPLORER = process.env.SLUICE_LOCAL === "1" ? "" : "https://explorer-test.qday.info";

function need(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing ${name}. See agent/README.md.`);
    process.exit(2);
  }
  return v;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const listed = (process.env.SLUICE_VAULTS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const factory = process.env.SLUICE_FACTORY?.trim();
  if (!listed.length && !factory) need("SLUICE_VAULTS");
  for (const v of [...listed, ...(factory ? [factory] : [])]) if (!isAddress(v)) throw new Error(`not an address: ${v}`);
  const roundEnds = Date.now() + Number(process.env.SLUICE_ROUND_SECONDS || 420) * 1000;
  const key = need("AGENT_PRIVATE_KEY") as Hex;
  const chain = viemChain({
    rpcUrl: process.env.AEVUM_RPC_URL || "https://rpc-test.qday.info",
    privateKey: key,
    fromBlock: process.env.SLUICE_FROM_BLOCK ? BigInt(process.env.SLUICE_FROM_BLOCK) : undefined,
    // SLUICE_LOCAL=1 runs against a local Hardhat node (chain 31337) for demos and tests.
    chain: process.env.SLUICE_LOCAL === "1" ? (hardhat as unknown as typeof aevumTestnet) : aevumTestnet,
  });
  const reviewer = makeReviewer(process.env.ANTHROPIC_API_KEY);
  const found = factory ? await chain.discover(factory as Address).catch((e) => {
    console.error(`[error] reading the factory: ${(e as Error).message}`);
    return [] as { vault: Address; index: number }[];
  }) : [];
  const indexOf = new Map(found.map((f) => [f.vault.toLowerCase(), f.index]));
  const vaults = [...new Map([...listed, ...found.map((f) => f.vault)].map((v) => [v.toLowerCase(), v])).values()];
  if (factory) console.log(`Factory ${factory}: ${found.length} vault(s) gave this agent a live session`);
  console.log(`Sluice agent ${chain.agent}${dryRun ? " (dry run: signs nothing)" : ""}; Claude review ${process.env.ANTHROPIC_API_KEY ? "on" : "off"}`);

  // The bot token alone turns alerts on: each company's alerts go to the chat its owner linked on
  // chain. The operator's own chat (agent gas) is optional and only used for the operator's alerts.
  const tg = process.env.TELEGRAM_BOT_TOKEN ? { token: process.env.TELEGRAM_BOT_TOKEN, chatId: "" } : null;
  const stateFile = process.env.SLUICE_ALERT_STATE || ".sluice-alerts.json";
  let sent = loadSent(stateFile);
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const operatorChat = process.env.OPERATOR_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID || "";
  console.log(`Telegram alerts ${tg ? `on (to each company's linked chat${operatorChat ? "; operator alerts to the operator's chat" : "; no operator chat set"})` : "off (no TELEGRAM_BOT_TOKEN)"}`);

  const summary: string[] = [];
  let failed = false;

  // The agent's gas is the operator's job, not the founders': this alert goes to the operator's chat.
  const operator = tg && operatorChat ? { ...tg, chatId: operatorChat } : null;
  const minGas = process.env.SLUICE_MIN_GAS ? BigInt(Math.round(Number(process.env.SLUICE_MIN_GAS) * 1e6)) * 10n ** 12n : LOW_GAS;
  const gasLeft = await chain.gas().catch(() => null);
  if (gasLeft !== null) {
    console.log(`Gas left: ${(Number(gasLeft / 10n ** 14n) / 10_000).toFixed(4)} tQDAY`);
    const low = gasAlert(chain.agent, gasLeft, minGas);
    if (low) {
      console.log(`[alert] ${low.text}`);
      const g = fresh([low], sent);
      sent = g.sent;
      if (g.todo.length && operator && !dryRun && (await send(operator, format("operator", g.todo)))) sent[low.key] = Date.now();
    }
  }
  for (const vault of vaults as Address[]) {
    if (Date.now() > roundEnds) {
      console.log(`\n[round] time is up; ${vault} and later vaults wait for the next round`);
      break;
    }
    console.log(`\n== ${vault}`);
    summary.push(`### ${vault}`);
    const alerts: Alert[] = [];
    try {
      await runVault(chain, vault, {
        dryRun,
        reviewer,
        explain: async (x) => (await explain(anthropicKey, x)).text,
        alert: (a) => alerts.push(a),
        // Each vault gets at most 90 seconds, and none runs past the round's end.
        deadline: Math.min(roundEnds, Date.now() + 90_000),
        say: (e: Event) => {
          const link = e.tx ? (EXPLORER ? ` ${EXPLORER}/tx/${e.tx}` : ` ${e.tx}`) : "";
          console.log(`[${e.step}] ${e.text}${link}`);
          summary.push(`- **${e.step}** ${e.text}${e.tx ? ` ([tx](${EXPLORER}/tx/${e.tx}))` : ""}`);
          if (e.step === "error") failed = true;
        },
      });
    } catch (err) {
      failed = true;
      console.error(`[error] ${(err as Error).message}`);
      summary.push(`- **error** ${(err as Error).message}`);
      alerts.push({ key: `crash:${vault}:${new Date().toISOString().slice(0, 10)}`, text: `The agent could not finish a round: ${(err as Error).message.slice(0, 160)}` });
    }
    const { todo, sent: kept } = fresh(alerts, sent);
    sent = kept;
    if (todo.length) {
      // The founder's own chat, from the vault; the operator never receives a company's alerts.
      const chat = await chain.notifyChat(vault as Address);
      const appUrl = process.env.SLUICE_APP_URL;
      const label = `${vault.slice(0, 6)}…${vault.slice(-4)}`;
      const explorer = (a: Alert) => ({ ...a, link: a.link && EXPLORER ? `${EXPLORER}/tx/${a.link}` : undefined });
      const plain = todo.filter((a) => !a.bill);
      const bills = todo.filter((a) => a.bill);
      if (dryRun || !tg || !chat) {
        console.log(`[alert] ${todo.length} new${!tg ? " (Telegram not set up)" : !chat ? " (no chat linked on this vault)" : " (dry run: not sent)"}:\n${todo.map((a) => `  - ${a.text}`).join("\n")}`);
      } else {
        const to = { ...tg, chatId: chat };
        const app = appUrl ? `${appUrl.replace(/\/$/, "")}/#/app/overview?vault=${vault}` : undefined;
        if (plain.length && (await send(to, format(label, plain.map(explorer), app)))) for (const a of plain) sent[a.key] = Date.now();
        // One message per waiting payment, so its buttons act on that payment.
        for (const a of bills) {
          if (await send(to, format(label, [explorer(a)]), fetch, billButtons(appUrl, vault, indexOf.get(vault.toLowerCase()), a.bill!))) sent[a.key] = Date.now();
          else console.error("[alert] Telegram send failed");
        }
      }
    }
  }
  if (!dryRun) saveSent(stateFile, sent);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.join("\n") + "\n");
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
