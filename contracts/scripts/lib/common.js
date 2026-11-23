// Shared helpers for the demo, attack and flood scripts. They run on the local
// Hardhat node (`--network localhost`) or on Aevum Testnet (`--network aevumTestnet`).
const fs = require("node:fs");
const path = require("node:path");
const { ethers, network } = require("hardhat");

const TUSD8 = "0x456569838f1d43009A91ebA4263147Afd7233483";
const usd = (n) => ethers.parseUnits(String(n), 6);
const fmt = (u) => `${ethers.formatUnits(u, 6)} tUSD8`;
const isLocal = () => network.name === "localhost" || network.name === "hardhat";
const explorerTx = (h) => (isLocal() ? h : `https://explorer-test.qday.info/tx/${h}`);
const explorerAddr = (a) => (isLocal() ? a : `https://explorer-test.qday.info/address/${a}`);

const outDir = path.join(__dirname, "..", "..", "deployments");
function save(name, data) {
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${network.name}-${name}.json`);
  fs.writeFileSync(file, JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  return file;
}
function load(name) {
  const file = path.join(outDir, `${network.name}-${name}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

/** The agent's signer: AGENT_PRIVATE_KEY, or Hardhat account #1 on the local node. */
async function agentSigner() {
  if (process.env.AGENT_PRIVATE_KEY) return new ethers.Wallet(process.env.AGENT_PRIVATE_KEY, ethers.provider);
  if (isLocal()) return (await ethers.getSigners())[1];
  // The key written by `npm run agent:new-key` (git-ignored).
  const file = require("path").join(__dirname, "..", "..", "agent.key");
  if (require("fs").existsSync(file)) return new ethers.Wallet(require("fs").readFileSync(file, "utf8").trim(), ethers.provider);
  throw new Error("Set AGENT_PRIVATE_KEY (the agent's key) for this network, or run npm run agent:new-key");
}

/** The revert reason of a call that should fail, decoded against the vault's errors. */
function reason(err, iface) {
  const data = err?.data ?? err?.info?.error?.data ?? err?.error?.data;
  if (data && typeof data === "string" && iface) {
    try {
      const e = iface.parseError(data);
      if (e) return `${e.name}(${e.args.map(String).join(", ")})`;
    } catch {}
  }
  const msg = err?.shortMessage || err?.reason || err?.message || String(err);
  // Hardhat's node puts the decoded error in the message: reverted with custom error 'Name(args)'
  const m = /custom error '([A-Za-z0-9_]+)\(([^)]*)\)'/.exec(msg);
  if (m) {
    const args = m[2].split(",").map((a) => a.trim().replace(/^"|"$/g, "")).filter(Boolean);
    const shown = args.map((a) => (/^0x[0-9a-fA-F]{40}$/.test(a) ? `${a.slice(0, 6)}…${a.slice(-4)}` : a));
    return `${m[1]}(${shown.join(", ")})`;
  }
  return msg.split("\n")[0].slice(0, 120);
}

const REASONS = ["Ok", "Paused", "NoSession", "SessionExpired", "NoSuchBill", "BillCancelled", "BadPeriod", "NotDueYet", "AlreadySettled", "AlreadyProposed", "Blocklisted", "NotAllowlisted", "OverPerPaymentCap", "OverDailyCap", "OverApprovalThreshold", "BelowCashBuffer"];
const readable = (r) => r.replace(/\((\d+)\)$/, (_, n) => `(${REASONS[Number(n)] ?? n})`);

module.exports = { ethers, network, TUSD8, usd, fmt, isLocal, explorerTx, explorerAddr, save, load, agentSigner, reason, readable };
