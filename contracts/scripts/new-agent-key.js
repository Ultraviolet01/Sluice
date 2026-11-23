#!/usr/bin/env node
// Generates the agent's key. Writes the private key to a file only you can read
// (default contracts/agent.key, which git ignores) and prints the address.
// The private key is never printed unless you pass --print.
//
//   node scripts/new-agent-key.js [file] [--print]
//
// Then put it in GitHub, without it passing through your clipboard history:
//   gh secret set AGENT_PRIVATE_KEY < contracts/agent.key
// or paste the file's contents into Settings > Secrets and variables > Actions.
const fs = require("node:fs");
const path = require("node:path");
const { Wallet } = require("ethers");

const args = process.argv.slice(2);
const print = args.includes("--print");
const file = path.resolve(args.find((a) => !a.startsWith("--")) || path.join(__dirname, "..", "agent.key"));

if (fs.existsSync(file)) {
  console.error(`${file} already exists. Move it away first: overwriting would lose the current agent key.`);
  process.exit(1);
}
const w = Wallet.createRandom();
fs.writeFileSync(file, w.privateKey + "\n", { mode: 0o600 });
console.log(`Agent address: ${w.address}`);
console.log(`Private key written to ${file} (readable only by you)`);
if (print) console.log(`Private key: ${w.privateKey}`);
console.log(`
Next:
  1. Send the agent a little gas:  AGENT_ADDRESS=${w.address} npx hardhat run scripts/fund-agent.js --network aevumTestnet
  2. Give it to GitHub:            gh secret set AGENT_PRIVATE_KEY < ${path.relative(process.cwd(), file) || file}
  3. Hire it on your vaults:       NEW_AGENT=${w.address} npx hardhat run scripts/rotate-agent-key.js --network aevumTestnet
     (or Settings in the dashboard, or set VITE_AGENT_ADDRESS so new companies are offered it)`);
