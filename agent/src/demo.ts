// npm run demo: one full round on the demo company, told step by step, for the
// video and for anyone trying Sluice. Uses the vault from
// contracts/deployments/<network>-demo.json (made by setup-demo.js), or DEMO_VAULT.
//
//   npm run demo                 Aevum Testnet (AGENT_PRIVATE_KEY set)
//   npm run demo -- --dry-run    decide everything, sign nothing
//   SLUICE_LOCAL=1 AEVUM_RPC_URL=http://127.0.0.1:8545 npm run demo   the local Hardhat node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Address, Hex } from "viem";
import { hardhat } from "viem/chains";
import { mnemonicToAccount } from "viem/accounts";
import { bytesToHex } from "viem";
import { aevumTestnet, viemChain } from "./chain.ts";
import { explain } from "./explain.ts";
import { runVault, type Event } from "./loop.ts";
import { makeReviewer } from "./review.ts";

const local = process.env.SLUICE_LOCAL === "1";
const net = local ? "localhost" : "aevumTestnet";
const file = resolve(import.meta.dirname, `../../contracts/deployments/${net}-demo.json`);
const saved = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { vault: Address }) : null;
const vault = (process.env.DEMO_VAULT || saved?.vault) as Address | undefined;
// On the local node, Hardhat's account #1 (from its public test mnemonic) is the demo agent.
const HARDHAT_MNEMONIC = "test test test test test test test test test test test junk";
const localKey = () => bytesToHex(mnemonicToAccount(HARDHAT_MNEMONIC, { addressIndex: 1 }).getHdKey().privateKey!);
const key = (process.env.AGENT_PRIVATE_KEY || (local ? localKey() : "")) as Hex;
const dryRun = process.argv.includes("--dry-run");
const EXPLORER = local ? "" : "https://explorer-test.qday.info";

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const pause = (ms: number) => new Promise((r) => setTimeout(r, process.env.DEMO_FAST ? 0 : ms));

const SECTIONS: Record<Event["step"], string> = {
  observe: "1. Observe: what is in the vault, and what the agent may spend",
  forecast: "2. Forecast: the next 14 days, against the cash buffer",
  decide: "3. Each bill that is due: checked with the vault, then paid, sent to the owner, or refused",
  act: "3. Each bill that is due: checked with the vault, then paid, sent to the owner, or refused",
  error: "3. Each bill that is due: checked with the vault, then paid, sent to the owner, or refused",
  learn: "4. Learn: suggestions only the owner can apply",
};

async function main() {
  if (!vault) throw new Error(`No demo vault: run contracts/scripts/setup-demo.js on ${net}, or set DEMO_VAULT`);
  if (!key) throw new Error("Set AGENT_PRIVATE_KEY");
  const chain = viemChain({ rpcUrl: process.env.AEVUM_RPC_URL || "https://rpc-test.qday.info", privateKey: key, chain: local ? (hardhat as unknown as typeof aevumTestnet) : aevumTestnet });

  console.log(bold("\nSluice: one round of the treasury agent\n"));
  console.log(`Company vault  ${vault}${EXPLORER ? `  ${EXPLORER}/address/${vault}` : ""}`);
  console.log(`Agent key      ${chain.agent}`);
  console.log(dim("The agent can only settle bills the owner listed, inside the owner's limits. The vault checks every payment again on chain.\n"));
  if (dryRun) console.log(dim("Dry run: the agent decides everything and signs nothing.\n"));
  await pause(1200);

  let section = "";
  const anthropic = process.env.ANTHROPIC_API_KEY;
  await runVault(chain, vault, {
    dryRun,
    reviewer: makeReviewer(anthropic),
    explain: async (x) => (await explain(anthropic, x)).text,
    say: async (e) => {
      const title = SECTIONS[e.step];
      if (title !== section) {
        section = title;
        console.log(`\n${bold(title)}`);
      }
      const link = e.tx ? dim(EXPLORER ? `  ${EXPLORER}/tx/${e.tx}` : `  ${e.tx}`) : "";
      // A bill's decision starts a block; what was done is indented under it.
      if (e.step === "decide") console.log(`\n  ${e.text}`);
      else if (e.step === "act" || e.step === "error") console.log(`    -> ${e.text}${link}`);
      else console.log(`  ${e.text}${link}`);
    },
    alert: (a) => console.log(dim(`    Telegram to the owner: ${a.text}`)),
  });
  console.log(`\n${bold("Done.")} Run it again: nothing new happens, because the vault remembers what was paid and proposed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
