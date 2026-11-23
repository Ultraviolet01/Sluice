// Downloads the treasury report as an Excel workbook (.xlsx), built in the
// browser from the vault's live data. ExcelJS loads only when asked.

import { parseAbiItem, type Address } from "viem";
import { EXPLORER, publicClient } from "./chain.ts";
import { DEPLOY_BLOCK, logsFrom } from "./logs.ts";
import type { Model } from "./model.ts";
import { buildReport, looksLikeFormula, type Range, type Transfer } from "./report.ts";

const TEAL = "FF0B5C55";
const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

/** tUSD8 transfers into and out of the vault, with block times. Null if they could not be read. */
async function transfers(m: Model): Promise<Transfer[] | null> {
  if (!m.live) return null;
  try {
    const from = publicClient.chain?.id === 44005 ? DEPLOY_BLOCK : 0n;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pub = publicClient as any;
    const [ins, outs] = await Promise.all([
      logsFrom<{ args: { from: Address; to: Address; value: bigint }; transactionHash: string; blockNumber: bigint }>(pub, { address: m.token, event: TRANSFER, args: { to: m.vault } }, from),
      logsFrom<{ args: { from: Address; to: Address; value: bigint }; transactionHash: string; blockNumber: bigint }>(pub, { address: m.token, event: TRANSFER, args: { from: m.vault } }, from),
    ]);
    const all = [...ins, ...outs];
    const times = new Map<bigint, number>();
    for (const b of [...new Set(all.map((l) => l.blockNumber))]) times.set(b, Number((await publicClient.getBlock({ blockNumber: b })).timestamp));
    return all.map((l) => ({ at: times.get(l.blockNumber)!, from: l.args.from, to: l.args.to, amount: l.args.value, tx: l.transactionHash }));
  } catch {
    return null;
  }
}

export async function downloadReport(m: Model, range: Range = { from: null, to: null }): Promise<void> {
  const [{ default: ExcelJS }, moves] = await Promise.all([import("exceljs"), transfers(m)]);
  const now = Math.floor(Date.now() / 1000);
  const sheets = buildReport({ model: m, now, range, transfers: moves, explorer: EXPLORER });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Sluice";
  wb.created = new Date(now * 1000);
  for (const s of sheets) {
    const summary = s.name === "Summary";
    const ws = wb.addWorksheet(s.name, { views: [{ state: "frozen", ySplit: summary ? 0 : 1 }] });
    ws.columns = s.columns.map((c) => ({ header: summary ? undefined : c.header, width: c.width }));
    if (!summary) {
      const head = ws.getRow(1);
      head.font = { bold: true, color: { argb: "FFFFFFFF" } };
      head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
      head.alignment = { vertical: "middle" };
      head.height = 20;
    }
    for (const row of s.rows) {
      const added = ws.addRow(row);
      // Labels and reasons come from the chain: anything that looks like a formula stays text.
      added.eachCell((c) => {
        if (looksLikeFormula(c.value as string)) c.numFmt = "@";
      });
    }
    s.columns.forEach((c, i) => {
      if (c.money) ws.getColumn(i + 1).numFmt = "#,##0.00;[Red]-#,##0.00";
    });
    const linkCol = s.columns.findIndex((c) => c.header === "Link") + 1;
    if (linkCol > 0) {
      ws.eachRow((row, n) => {
        const cell = row.getCell(linkCol);
        if (n > 1 && typeof cell.value === "string" && cell.value) {
          cell.value = { text: "View", hyperlink: cell.value };
          cell.font = { color: { argb: "FF0563C1" }, underline: true };
        }
      });
    }
    if (summary) {
      ws.getCell("A1").font = { bold: true, size: 14, color: { argb: TEAL } };
      for (const label of ["Balances (now)", "Activity in the period", "Rules (now)"]) {
        const r = s.rows.findIndex((x) => x[0] === label) + 1;
        if (r > 0) {
          ws.getRow(r).font = { bold: true, color: { argb: "FFFFFFFF" } };
          ["A", "B"].forEach((col) => (ws.getCell(`${col}${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } }));
        }
      }
      s.rows.forEach((x, k) => {
        if (typeof x[1] === "number" && /\(tUSD8\)/.test(String(x[0]))) ws.getCell(`B${k + 1}`).numFmt = "#,##0.00;[Red]-#,##0.00";
      });
      ws.getColumn(2).alignment = { horizontal: "right" };
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const d = (s: number) => new Date(s * 1000).toISOString().slice(0, 10);
  const span = range.from === null && range.to === null ? "all-time" : `${range.from === null ? "start" : d(range.from)}-to-${range.to === null ? "present" : d(range.to)}`;
  const slug = m.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || m.vault.slice(0, 10);
  a.download = `sluice-${slug}-${span}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
