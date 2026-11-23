// Re-points docs links at contract lines after the contract changes. For each
// SluiceVault.sol line linked from docs/SECURITY.md and the Security page, it reads
// that line's text in the last commit and finds the same text in the current file.
//   node scripts/fix-links.mjs [git-ref]   (default HEAD)
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const ref = process.argv[2] || "HEAD";
const PATH = "contracts/contracts/SluiceVault.sol";
const before = execSync(`git show ${ref}:${PATH}`, { encoding: "utf8" }).split("\n");
const now = readFileSync(PATH, "utf8").split("\n");
const missing = [];
const map = (n) => {
  const text = before[n - 1]?.trim();
  if (!text) return n;
  const hits = now.map((l, i) => (l.trim() === text ? i + 1 : 0)).filter(Boolean);
  if (hits.length === 1) return hits[0];
  // Fall back to the function signature's start when the line itself changed.
  const sig = /function\s+(\w+)\s*\(/.exec(text)?.[1];
  if (sig) {
    const i = now.findIndex((l) => new RegExp(`function\\s+${sig}\\s*\\(`).test(l));
    if (i >= 0) return i + 1;
  }
  missing.push(`${n}: ${text}`);
  return n;
};

// Run once per contract change, against the commit before it (default HEAD). Writes nothing unless every link maps.
let md = readFileSync("docs/SECURITY.md", "utf8");
md = md.replace(/(SluiceVault\.sol#L)(\d+)/g, (_, a, n) => a + map(Number(n)));
md = md.replace(/\[L(\d+)\]\(/g, (_, n) => `[L${map(Number(n))}](`);
const mdOut = md;

let page = readFileSync("web/src/pages/SecurityPage.tsx", "utf8");
const a = page.indexOf("const WHO"), b = page.indexOf("const ATTACKS");
page = page.slice(0, a) + page.slice(a, b).replace(/(", )(\d+)\]/g, (_, p, n) => `${p}${map(Number(n))}]`) + page.slice(b);
if (missing.length) {
  console.error("Could not place (nothing written; were the links already updated?):\n" + missing.join("\n"));
  process.exit(1);
}
writeFileSync("docs/SECURITY.md", mdOut);
writeFileSync("web/src/pages/SecurityPage.tsx", page);
console.log("docs line links updated");
