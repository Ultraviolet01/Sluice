// Fails if a docs link to a contract line no longer points at what it names.
// Named links ([`pay`](…#L302)) must land on a line containing that name; every
// linked line must hold code (a function, a check or a declaration).
// After changing the contract, run: node scripts/fix-links.mjs
import { readFileSync } from "node:fs";

const src = readFileSync("contracts/contracts/SluiceVault.sol", "utf8").split("\n");
const bad = [];
const code = (n) => /function |if \(|revert |contract |emit |require/.test(src[n - 1] ?? "");
const md = readFileSync("docs/SECURITY.md", "utf8");
for (const m of md.matchAll(/\[`([A-Za-z_]+)`\]\([^)]*SluiceVault\.sol#L(\d+)\)/g)) {
  if (!src[Number(m[2]) - 1]?.includes(m[1])) bad.push(`docs/SECURITY.md: \`${m[1]}\` -> line ${m[2]}: ${src[Number(m[2]) - 1]?.trim()}`);
}
for (const m of md.matchAll(/SluiceVault\.sol#L(\d+)/g)) if (!code(Number(m[1]))) bad.push(`docs/SECURITY.md: line ${m[1]} is not code: ${src[Number(m[1]) - 1]?.trim()}`);
const page = readFileSync("web/src/pages/SecurityPage.tsx", "utf8");
const seg = page.slice(page.indexOf("const WHO"), page.indexOf("const ATTACKS"));
for (const m of seg.matchAll(/", (\d+)\]/g)) if (!code(Number(m[1]))) bad.push(`SecurityPage.tsx: line ${m[1]} is not code: ${src[Number(m[1]) - 1]?.trim()}`);
if (bad.length) {
  console.error(bad.join("\n") + "\nRun: node scripts/fix-links.mjs");
  process.exit(1);
}
console.log("contract line links ok");
