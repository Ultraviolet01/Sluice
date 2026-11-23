// Fails if a docs link to a line of the contract no longer points at what it names.
// Checks markdown links like [`pay`](../contracts/contracts/SluiceVault.sol#L302)
// and the Security page's [label, ..., line] rows, against the current source.
import { readFileSync } from "node:fs";

const src = readFileSync("contracts/contracts/SluiceVault.sol", "utf8").split("\n");
const bad = [];
const md = readFileSync("docs/SECURITY.md", "utf8");
for (const m of md.matchAll(/\[`([A-Za-z_]+)`\]\([^)]*SluiceVault\.sol#L(\d+)\)/g)) {
  const [, name, line] = m;
  if (!src[Number(line) - 1]?.includes(name)) bad.push(`docs/SECURITY.md: \`${name}\` -> line ${line}: ${src[Number(line) - 1]?.trim()}`);
}
// Security page: function rows name the function in the code text.
const page = readFileSync("web/src/pages/SecurityPage.tsx", "utf8");
const expect = { 219: "addBill", 265: "approve", 203: "setPayeeBlocked", 176: "grantSession", 283: "pause", 292: "withdraw", 302: "pay", 315: "propose" };
for (const m of page.matchAll(/", (\d+)\]/g)) {
  const n = Number(m[1]);
  const line = src[n - 1] ?? "";
  if (expect[n] && !line.includes(expect[n])) bad.push(`SecurityPage.tsx: line ${n} should be ${expect[n]}: ${line.trim()}`);
  if (!line.trim()) bad.push(`SecurityPage.tsx: line ${n} is empty`);
}
if (bad.length) {
  console.error(bad.join("\n"));
  process.exit(1);
}
console.log("contract line links ok");
