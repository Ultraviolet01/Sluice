// The treasury report: the rows of each sheet in the Excel export, built from
// what the dashboard already knows about a company plus its token transfers.
// No network or browser APIs here, so it is unit-tested (report.test.ts).

import type { Address } from "viem";
import type { Model } from "./model.ts";

export type Cell = string | number | null;
export interface Sheet {
  name: string;
  /** Column headers and widths (characters); money columns get two decimals. */
  columns: { header: string; width: number; money?: boolean }[];
  rows: Cell[][];
}

/** A tUSD8 transfer into or out of the vault. */
export interface Transfer {
  at: number; // unix seconds
  from: Address;
  to: Address;
  amount: bigint;
  tx: string;
}

/** Seconds; null ends mean from the start / up to now. */
export interface Range {
  from: number | null;
  to: number | null;
}

export interface ReportInput {
  model: Model;
  /** Seconds. */
  now: number;
  range?: Range;
  /** tUSD8 transfers in and out of the vault, or null when they could not be read. */
  transfers: Transfer[] | null;
  /** Explorer base, e.g. https://explorer-test.qday.info */
  explorer: string;
  token?: string;
}

const day = (s: number) => new Date(s * 1000).toISOString().slice(0, 10);
const stamp = (s: number) => new Date(s * 1000).toISOString().replace("T", " ").slice(0, 16);
/** tUSD8 has 6 decimals, well inside a double. */
export const units = (raw: bigint) => Number(raw) / 1e6;

export function periodLabel(r?: Range): string {
  if (!r || (r.from === null && r.to === null)) return "All time";
  return `${r.from === null ? "Start" : day(r.from)} to ${r.to === null ? "present" : day(r.to)}`;
}

/** Text that a spreadsheet would run as a formula, from on-chain labels or reasons. */
export const looksLikeFormula = (v: Cell) => typeof v === "string" && /^[=+\-@\t\r]/.test(v);

const TYPE: Record<string, string> = { auto: "Paid by Sluice", approved: "Approved by you", proposed: "Sent to you", blocked: "Refused or rejected", rules: "Rule change" };

export function buildReport(r: ReportInput): Sheet[] {
  const m = r.model;
  const sym = r.token ?? "tUSD8";
  const range = r.range ?? { from: null, to: null };
  const inRange = (s: number) => (range.from === null || s >= range.from) && (range.to === null || s <= range.to);
  const link = (tx: string) => (tx && tx.startsWith("0x") && tx.length === 66 ? `${r.explorer}/tx/${tx}` : "");
  const payeeName = (a: Address) => m.payees.find((p) => p.addr.toLowerCase() === a.toLowerCase())?.label ?? m.bills.find((b) => b.payee.toLowerCase() === a.toLowerCase())?.label ?? a;
  const acts = m.activity.filter((a) => inRange(a.at)).sort((a, b) => a.at - b.at);

  // ------------------------------------------------------------- activity
  const activity: Cell[][] = acts.map((a, i) => [
    i + 1, stamp(a.at), a.what, TYPE[a.type] ?? a.type,
    a.amount === null ? null : units(a.amount) * (a.sign === "out" ? -1 : 1), a.amount === null ? "" : sym,
    a.outcome, a.rule, a.tx, link(a.tx),
  ]);

  // --------------------------------------------------------- rule changes
  const rules: Cell[][] = acts.filter((a) => a.type === "rules").map((a) => [stamp(a.at), a.what, a.rule.replace(/^“|”$/g, ""), a.outcome, a.tx, link(a.tx)]);

  // -------------------------------------------------------------- payments
  const payments: Cell[][] = m.upcoming
    .filter((u) => inRange(u.due) || (range.to === null && u.due >= r.now))
    .sort((a, b) => a.due - b.due)
    .map((u) => {
      const bill = m.bills.find((b) => b.id === u.billId);
      const repeats = !bill || bill.intervalDays === 0 ? "Once" : `Every ${bill.intervalDays} days`;
      return [day(u.due), u.label, payeeName(u.payee), units(u.amount), sym, repeats, u.status, bill?.critical ? "Yes" : "No", `Bill ${u.billId}, payment ${u.period + 1}`];
    });

  // ---------------------------------------------------------------- ledger
  // Each movement is named from the vault's own record of the same transaction.
  const byTx = new Map(m.activity.map((a) => [a.tx.toLowerCase(), a]));
  const vault = m.vault.toLowerCase();
  let deposits = 0, depositsIn = 0n, paidOut = 0n, withdrawn = 0n;
  const ledger: Cell[][] = [];
  if (r.transfers) {
    for (const t of [...r.transfers].filter((x) => inRange(x.at)).sort((a, b) => a.at - b.at)) {
      const into = t.to.toLowerCase() === vault;
      const other = into ? t.from : t.to;
      const a = byTx.get(t.tx.toLowerCase());
      let movement = into ? "Deposit" : "Payment";
      let by = into ? other : "Unknown";
      if (into) { deposits++; depositsIn += t.amount; }
      else if (a?.type === "auto") { movement = "Bill payment"; by = "Sluice, inside your limits"; paidOut += t.amount; }
      else if (a?.type === "approved") { movement = "Bill payment"; by = "Approved by you"; paidOut += t.amount; }
      else if (a?.rule === "withdraw") { movement = "Owner withdrawal"; by = "You"; withdrawn += t.amount; }
      else paidOut += t.amount;
      ledger.push([stamp(t.at), movement, units(t.amount) * (into ? 1 : -1), sym, into ? other : payeeName(other), other, by, t.tx, link(t.tx)]);
    }
  } else {
    // No transfer index: the vault's own payment records still show money out.
    for (const a of acts.filter((x) => x.amount !== null && x.sign !== "none")) {
      if (a.type === "auto" || a.type === "approved") paidOut += a.amount!;
      if (a.rule === "withdraw") withdrawn += a.amount!;
      ledger.push([stamp(a.at), a.rule === "withdraw" ? "Owner withdrawal" : "Bill payment", units(a.amount!) * (a.sign === "out" ? -1 : 1), sym, a.what, "", a.type === "auto" ? "Sluice, inside your limits" : "You", a.tx, link(a.tx)]);
    }
  }

  // --------------------------------------------------------------- wallets
  const above = m.balance > m.cashBuffer ? m.balance - m.cashBuffer : 0n;
  const wallets: Cell[][] = [["Company vault on Aevum", m.vault, units(m.balance), sym, units(m.cashBuffer), units(above), "Holds the company's cash; pays only listed bills, inside the rules"]];
  if (m.session) wallets.push(["Sluice agent (session key)", m.session.agent, null, "", null, null, m.session.active ? `May pay up to ${units(m.session.perPaymentCap)} per payment and ${units(m.session.dailyCap)} per 24 h, until ${day(m.session.expiresAt)}. Holds no ${sym}.` : "Session revoked or expired"]);
  if (m.guardian) wallets.push(["Telegram bot (guardian)", m.guardian, null, "", null, null, "May pause, block a payee or reject a proposal. Cannot move money."]);
  if (m.owner) wallets.push(["Owner", m.owner, null, "", null, null, "Signs every rule change, approval and withdrawal"]);

  // --------------------------------------------------------------- summary
  const n = (t: string) => acts.filter((a) => a.type === t).length;
  const paidAlone = acts.filter((a) => a.type === "auto" && a.sign === "out").length;
  const summary: Cell[][] = [
    [`Sluice treasury report: ${m.name}`, ""],
    ["Period", periodLabel(r.range)],
    ["Generated", `${stamp(r.now)} UTC`],
    ["Vault", m.vault],
    ["Owner", m.owner ?? "—"],
    ["Network", m.live ? "QDay Aevum Testnet (chain 44005)" : "Demo data"],
    ["", ""],
    ["Balances (now)", ""],
    [`Cash in the vault (${sym})`, units(m.balance)],
    [`Cash buffer (${sym})`, units(m.cashBuffer)],
    [`Above the buffer (${sym})`, units(above)],
    ["", ""],
    ["Activity in the period", ""],
    ["Bills paid by Sluice alone", paidAlone],
    ["Bills approved by you and paid", n("approved")],
    ["Sent to you for approval", n("proposed")],
    ["Refused or rejected", n("blocked")],
    ["Rule changes", n("rules")],
    ["Deposits", deposits],
    [`Deposited (${sym})`, units(depositsIn)],
    [`Paid out (${sym})`, units(paidOut)],
    [`Withdrawn by you (${sym})`, units(withdrawn)],
    ["", ""],
    ["Rules (now)", ""],
    [`Agent per-payment cap (${sym})`, m.session ? units(m.session.perPaymentCap) : "No agent"],
    [`Agent 24-hour cap (${sym})`, m.session ? units(m.session.dailyCap) : "No agent"],
    [`Agent spent, last 24 h (${sym})`, m.session ? units(m.session.spent) : 0],
    [`Approval threshold (${sym})`, units(m.threshold)],
    ["Payments", m.paused ? "Paused" : "Running"],
    ["Approved payees", m.payees.filter((p) => p.allowed && !p.blocked).length],
    ["Blocked payees", m.payees.filter((p) => p.blocked).length],
    ["Listed bills", m.bills.filter((b) => b.active).length],
    ["Telegram actions", m.guardian ? "On (pause, block, reject)" : "Off"],
  ];
  if (!r.transfers) summary.push(["", ""], ["Note", "Token transfers could not be read, so Ledger lists the vault's own payment records and deposits are not counted."]);

  const money = true;
  return [
    { name: "Summary", columns: [{ header: "", width: 40 }, { header: "", width: 48 }], rows: summary },
    {
      name: "Activity",
      columns: [
        { header: "#", width: 5 }, { header: "When (UTC)", width: 17 }, { header: "What happened", width: 40 }, { header: "Type", width: 18 },
        { header: "Amount", width: 12, money }, { header: "Token", width: 7 }, { header: "Outcome", width: 14 },
        { header: "Rule checked or your reason", width: 46 }, { header: "Transaction", width: 30 }, { header: "Link", width: 14 },
      ],
      rows: activity,
    },
    {
      name: "Payments",
      columns: [
        { header: "Due", width: 11 }, { header: "Bill", width: 30 }, { header: "Payee", width: 30 }, { header: "Amount", width: 12, money },
        { header: "Token", width: 7 }, { header: "Repeats", width: 15 }, { header: "Status", width: 22 }, { header: "Critical", width: 8 }, { header: "Reference", width: 22 },
      ],
      rows: payments,
    },
    {
      name: "Ledger",
      columns: [
        { header: "When (UTC)", width: 17 }, { header: "Movement", width: 18 }, { header: "Amount", width: 12, money }, { header: "Token", width: 7 },
        { header: "Counterparty", width: 30 }, { header: "Address", width: 44 }, { header: "By", width: 26 }, { header: "Transaction", width: 30 }, { header: "Link", width: 14 },
      ],
      rows: ledger,
    },
    {
      name: "Rule changes",
      columns: [{ header: "When (UTC)", width: 17 }, { header: "Change", width: 46 }, { header: "Your reason (on chain)", width: 50 }, { header: "Signed", width: 14 }, { header: "Transaction", width: 30 }, { header: "Link", width: 14 }],
      rows: rules,
    },
    {
      name: "Wallets",
      columns: [
        { header: "Wallet", width: 30 }, { header: "Address", width: 44 }, { header: "Balance", width: 12, money }, { header: "Token", width: 7 },
        { header: "Cash buffer", width: 12, money }, { header: "Above buffer", width: 12, money }, { header: "Note", width: 70 },
      ],
      rows: wallets,
    },
  ];
}
