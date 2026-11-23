// Runs one round over every vault in SLUICE_VAULTS, then exits. Scheduling is
// GitHub Actions' job (.github/workflows/agent.yml), every 15 minutes.
//
// Environment:
//   SLUICE_VAULTS        required, comma-separated vault addresses
//   AGENT_PRIVATE_KEY    required, the agent's session key (0x...)
//   AEVUM_RPC_URL        optional, default https://rpc-test.qday.info
//   ANTHROPIC_API_KEY    optional, enables the Claude review
//   SLUICE_FROM_BLOCK    optional, first block to read receipts from
//   SLUICE_LOCAL=1       optional, use a local Hardhat node instead of Aevum
// Flags: --dry-run decides everything and signs nothing.

import { appendFileSync } from "node:fs";
import { isAddress, type Address, type Hex } from "viem";
import { hardhat } from "viem/chains";
import { aevumTestnet, viemChain } from "./chain.ts";
import { runVault, type Event } from "./loop.ts";
import { makeReviewer } from "./review.ts";

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
  const vaults = need("SLUICE_VAULTS").split(",").map((s) => s.trim()).filter(Boolean);
  for (const v of vaults) if (!isAddress(v)) throw new Error(`not an address: ${v}`);
  const key = need("AGENT_PRIVATE_KEY") as Hex;
  const chain = viemChain({
    rpcUrl: process.env.AEVUM_RPC_URL || "https://rpc-test.qday.info",
    privateKey: key,
    fromBlock: process.env.SLUICE_FROM_BLOCK ? BigInt(process.env.SLUICE_FROM_BLOCK) : undefined,
    // SLUICE_LOCAL=1 runs against a local Hardhat node (chain 31337) for demos and tests.
    chain: process.env.SLUICE_LOCAL === "1" ? (hardhat as unknown as typeof aevumTestnet) : aevumTestnet,
  });
  const reviewer = makeReviewer(process.env.ANTHROPIC_API_KEY);
  console.log(`Sluice agent ${chain.agent}${dryRun ? " (dry run: signs nothing)" : ""}; Claude review ${process.env.ANTHROPIC_API_KEY ? "on" : "off"}`);

  const summary: string[] = [];
  let failed = false;
  for (const vault of vaults as Address[]) {
    console.log(`\n== ${vault}`);
    summary.push(`### ${vault}`);
    try {
      await runVault(chain, vault, {
        dryRun,
        reviewer,
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
    }
  }
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.join("\n") + "\n");
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
