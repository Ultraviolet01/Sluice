// Demo data, shown when no vault is configured (VITE_VAULT_ADDRESS or ?vault=).
// Same shape as live data (see model.ts) and the same contract semantics:
// bills listed by the owner, settled by period, proposals waiting for approval.

import type { Address } from "viem";
import type { Model } from "./model.ts";

export type Kind = "auto" | "approval" | "blocked" | "settled" | "neutral";

export const NETWORK = {
  name: "Aevum Testnet",
  chainId: 44005,
  explorer: "https://explorer-test.qday.info",
  token: "tUSD8",
  gasToken: "tQDAY",
};

const u = (n: number) => BigInt(Math.round(n * 1e6));
const A = (s: string) => `0x${s.padStart(40, "0")}` as Address;
const DAY = 86_400;
// A fixed "now" so the demo reads the same every time: Sunday 1 November 2026, 19:00 UTC.
export const DEMO_NOW = Date.UTC(2026, 10, 1, 19, 0) / 1000;

const NORTHWIND = A("2d7a91f3");
const ATLAS = A("51d09c4e");
const PAYROLL = A("4f1ca21c");
const STIPENDS = A("6e03b5d8");
const FIGMA = A("8f1e0c22");
const SCAM = A("7a3e91");

export function demoModel(): Model {
  const bills = [
    { id: 0, payee: NORTHWIND, amount: u(80), firstDue: DEMO_NOW - 30 * DAY, intervalDays: 30, active: true, label: "Northwind Hosting" },
    { id: 1, payee: ATLAS, amount: u(132), firstDue: DEMO_NOW + 4 * DAY, intervalDays: 0, active: true, label: "Atlas Freight" },
    { id: 2, payee: PAYROLL, amount: u(9600), firstDue: DEMO_NOW + 6 * DAY, intervalDays: 14, active: true, label: "Contractor payroll" },
    { id: 3, payee: STIPENDS, amount: u(2400), firstDue: DEMO_NOW + 14 * DAY, intervalDays: 30, active: true, label: "Design stipends" },
    { id: 4, payee: FIGMA, amount: u(45), firstDue: DEMO_NOW - 2 * DAY, intervalDays: 30, active: true, label: "Figma subscription" },
    { id: 5, payee: SCAM, amount: u(950), firstDue: DEMO_NOW - 1 * DAY, intervalDays: 0, active: true, label: "Northwind Hosting, new bank details" },
  ];
  const balance = u(18215.4);
  // Balance by day: payroll on day 6 is the shortfall the agent proposed to cover.
  const out: Record<number, number> = { 4: 132, 6: 9600 };
  let running = 18215.4;
  const forecast = Array.from({ length: 14 }, (_, i) => {
    running -= out[i] ?? 0;
    return { day: DEMO_NOW + i * DAY, balance: u(running) };
  });
  // The last 14 days: a deposit, the agent paying bills, money coming in.
  const past: Record<number, number> = { [-12]: -2400, [-10]: 6000, [-8]: -80, [-6]: -118, [-3]: 5000, [-1]: -1450 };
  let back = 18215.4;
  const history = Array.from({ length: 14 }, (_, k) => {
    const i = -k;
    const row = { day: DEMO_NOW + i * DAY, balance: u(back) };
    back -= past[i] ?? 0;
    return row;
  }).reverse();
  return {
    live: false,
    history,
    name: "Kora Supply Group",
    vault: A("8c2e41b0"),
    token: "0x456569838f1d43009A91ebA4263147Afd7233483",
    owner: A("71c49ae2"),
    pendingOwner: null,
    guardian: null,
    notifyChat: "",
    paused: false,
    balance,
    cashBuffer: u(10000),
    threshold: u(100),
    session: { agent: A("3a9fc71e"), perPaymentCap: u(100), dailyCap: u(500), expiresAt: DEMO_NOW + 40 * DAY, active: true, spent: u(80) },
    bills,
    upcoming: [
      { billId: 1, period: 0, label: "Atlas Freight", payee: ATLAS, due: DEMO_NOW + 4 * DAY, amount: u(132), kind: "approval", status: "Over cap" },
      { billId: 2, period: 0, label: "Contractor payroll", payee: PAYROLL, due: DEMO_NOW + 6 * DAY, amount: u(9600), kind: "approval", status: "Needs approval" },
      { billId: 0, period: 1, label: "Northwind Hosting", payee: NORTHWIND, due: DEMO_NOW + 11 * DAY, amount: u(80), kind: "auto", status: "Auto-pay" },
      { billId: 3, period: 0, label: "Design stipends", payee: STIPENDS, due: DEMO_NOW + 14 * DAY, amount: u(2400), kind: "settled", status: "Covered" },
    ],
    forecast,
    approvals: [
      { key: "2:0", billId: 2, period: 0, label: "Contractor payroll", payee: PAYROLL, amount: u(9600), note: "Payroll is due Nov 7 and is over the 100 per-payment cap. Paying it leaves 8,483, under your 10,000 buffer: approve to pay anyway, or deposit first.", why: "over the per-payment cap", createdAt: DEMO_NOW - 14 * 60, status: "waiting" },
      { key: "4:0", billId: 4, period: 0, label: "Figma subscription", payee: FIGMA, amount: u(45), note: "First payment to this payee. Figma is not on the approved list yet.", why: "the payee is not on the approved list", createdAt: DEMO_NOW - 3600, status: "waiting" },
      { key: "1:-1", billId: 1, period: 0, label: "Atlas Freight, October", payee: ATLAS, amount: u(118), note: "Over the 100 cap.", why: "over the per-payment cap", createdAt: DEMO_NOW - DAY, status: "approved" },
    ],
    activity: [
      { at: DEMO_NOW - 18 * 60, what: "Paid Northwind Hosting", amount: u(80), sign: "out", kind: "auto", outcome: "Auto", rule: "Inside every limit", tx: "0x8f3a1c9e", type: "auto" },
      { at: DEMO_NOW - 30 * 60, what: "Proposed Contractor payroll", amount: u(9600), sign: "none", kind: "approval", outcome: "Waiting", rule: "over the per-payment cap", tx: "0x60f5721a", type: "proposed" },
      { at: DEMO_NOW - 76 * 60, what: "Refused Northwind Hosting, new bank details", amount: u(950), sign: "none", kind: "blocked", outcome: "Refused", rule: "the payee is on the blocklist", tx: "", type: "blocked" },
      { at: DEMO_NOW - DAY - 3 * 3600, what: "Paid Atlas Freight, October", amount: u(118), sign: "out", kind: "settled", outcome: "Approved", rule: "Approved by you", tx: "0x2a2b9c10", type: "approved" },
      { at: DEMO_NOW - DAY - 10 * 3600, what: "Paid Figma subscription", amount: u(45), sign: "out", kind: "auto", outcome: "Auto", rule: "Inside every limit", tx: "0xe8d13a77", type: "auto" },
      { at: DEMO_NOW - 2 * DAY - 7 * 3600, what: "Agent session: 100.00 per payment, 500.00 per 24 h", amount: null, sign: "none", kind: "settled", outcome: "Signed by you", rule: "grantSession", tx: "0x5c71aa29", type: "rules" },
      { at: DEMO_NOW - 3 * DAY, what: "Received from Lumen Labs", amount: u(6500), sign: "in", kind: "neutral", outcome: "Inflow", rule: "Incoming", tx: "0x2b4c8f31", type: "auto" },
    ],
    payees: [
      { addr: NORTHWIND, label: "Northwind Hosting", allowed: true, blocked: false, paid: 6 },
      { addr: ATLAS, label: "Atlas Freight", allowed: true, blocked: false, paid: 3 },
      { addr: PAYROLL, label: "Contractor payroll", allowed: true, blocked: false, paid: 9 },
      { addr: STIPENDS, label: "Design stipends", allowed: true, blocked: false, paid: 2 },
      { addr: FIGMA, label: "Figma subscription", allowed: false, blocked: false, paid: 1 },
      { addr: SCAM, label: "Northwind Hosting, new bank details", allowed: false, blocked: true, paid: 0 },
    ],
  };
}
