// Demo data for the dashboard. Shapes mirror SluiceVault: sessions, payees,
// invoices (paid / pending / rejected) and receipts. Amounts are in tUSD8.
// Replace with live reads from the vault once deployed on Aevum Testnet.

export const NETWORK = {
  name: "Aevum Testnet",
  chainId: 44005,
  rpc: "https://rpc-test.qday.info",
  explorer: "https://explorer-test.qday.info",
  token: "tUSD8",
  gasToken: "tQDAY",
};

export const ORG = {
  name: "Kora Supply Group",
  vault: "0x8c2e…41b0",
  vaultFull: "0x8c2e6f1a9d03b7c45e2a18f90d6c3b7e5a9241b0",
  owner: "0x71C4…9aE2",
  agentKey: "0x3a9f…c71e",
};

export type Kind = "auto" | "approval" | "blocked" | "settled" | "neutral";

export const wallets = [
  { id: "treasury", name: "Treasury vault", addr: "0x8c2e…41b0", full: "0x8c2e6f1a…5a9241b0", balance: 31240, min: 10000, note: "Min 10,000, covered for 14 days", fill: 0.92, color: "var(--status-success)", status: { kind: "settled" as Kind, label: "Healthy" } },
  { id: "payroll", name: "Payroll", addr: "0x4f1c…a21c", full: "0x4f1c8e…7b3fa21c", balance: 4180, min: 1500, note: "Min 1,500, 9,600 due Nov 7", fill: 0.35, color: "var(--accent-brass)", status: { kind: "approval" as Kind, label: "Short for Nov 7" } },
  { id: "vendors", name: "Vendors", addr: "0x9b2e…07de", full: "0x9b2e41…c0a907de", balance: 12795.4, min: 4000, note: "Min 4,000, 132 due Nov 5", fill: 0.92, color: "var(--status-success)", status: { kind: "auto" as Kind, label: "8,795 above minimum" } },
];

export const decisions = [
  { kind: "auto" as Kind, pill: "Auto", title: "Paid Northwind Hosting", amount: "80.00", when: "2 min ago", why: "Allowlisted payee, under the 100 cap" },
  { kind: "approval" as Kind, pill: "Needs approval", title: "Proposed Vendors → Payroll", amount: "8,000.00", when: "14 min ago", why: "Payroll short 6,920 for Nov 7" },
  { kind: "blocked" as Kind, pill: "Blocked", title: "Refused payment to 0x7a3…e91", amount: "950.00", when: "1 h ago", why: "Blocklisted payee" },
  { kind: "settled" as Kind, pill: "Settled", title: "Moved Treasury → Payroll", amount: "2,000.00", when: "3 h ago", why: "Vault-to-vault on Aevum, settled in 2 s" },
];

export const upcoming = [
  { payee: "Atlas Freight", due: "Nov 5", amount: "132.00", kind: "approval" as Kind, label: "Needs approval" },
  { payee: "Contractor payroll", due: "Nov 7", amount: "9,600.00", kind: "approval" as Kind, label: "Short 6,920" },
  { payee: "Northwind Hosting", due: "Nov 12", amount: "80.00", kind: "auto" as Kind, label: "Auto-pay" },
  { payee: "Design stipends", due: "Nov 15", amount: "2,400.00", kind: "settled" as Kind, label: "Covered" },
];

export type Approval = {
  id: string;
  tag: string;
  tagKind: Kind;
  title: string;
  amount: string;
  sub: string;
  age: string;
  status: "waiting" | "approved" | "rejected";
};

export const initialApprovals: Approval[] = [
  { id: "inv-041", tag: "Vault move", tagKind: "approval", title: "Fund Payroll from Vendors", amount: "8,000.00 tUSD8", sub: "Vendors → Payroll, on Aevum", age: "14 min", status: "waiting" },
  { id: "rule-007", tag: "Rule update", tagKind: "approval", title: "Atlas Freight cap", amount: "100 → 140", sub: "3 approvals in a row for this payee", age: "1 h", status: "waiting" },
  { id: "inv-038", tag: "Approved", tagKind: "settled", title: "Atlas Freight", amount: "118.00 tUSD8", sub: "Approved by you, Oct 31", age: "1 d", status: "approved" },
  { id: "inv-036", tag: "Rejected", tagKind: "blocked", title: "Pay 0x7a3…e91", amount: "950.00 tUSD8", sub: "Blocklisted payee, auto-rejected", age: "1 d", status: "rejected" },
];

export const activity = [
  { when: "Nov 1, 18:42", what: "Paid Northwind Hosting", wallet: "Treasury vault", amount: "−80.00", kind: "auto" as Kind, outcome: "Auto", rule: "Under 100 per payment", proof: "0x8f3a…kP21", type: "auto" },
  { when: "Nov 1, 18:30", what: "Proposed Vendors → Payroll", wallet: "Vendors", amount: "8,000.00", kind: "approval" as Kind, outcome: "Waiting", rule: "Over approval threshold", proof: "inv-041", type: "moves" },
  { when: "Nov 1, 17:44", what: "Refused 0x7a3…e91", wallet: "Treasury vault", amount: "950.00", kind: "blocked" as Kind, outcome: "Refused", rule: "Blocklist", proof: "0xd71e…0aQ4", type: "blocked" },
  { when: "Nov 1, 15:51", what: "Moved Treasury → Payroll", wallet: "Treasury vault", amount: "2,000.00", kind: "settled" as Kind, outcome: "Settled", rule: "Approved by you", proof: "0x3f9c…b21a", type: "moves" },
  { when: "Oct 31, 16:02", what: "Paid Atlas Freight", wallet: "Vendors", amount: "−118.00", kind: "settled" as Kind, outcome: "Approved", rule: "Approved by you", proof: "0x2a2P…9Lw0", type: "approved" },
  { when: "Oct 31, 09:00", what: "Paid Figma subscription", wallet: "Treasury vault", amount: "−45.00", kind: "auto" as Kind, outcome: "Auto", rule: "Under 100 per payment", proof: "0xe8d1…3Tx7", type: "auto" },
  { when: "Oct 30, 12:10", what: "Daily cap 400 → 500", wallet: "Vault rules", amount: "—", kind: "settled" as Kind, outcome: "Signed by you", rule: "grantSession", proof: "0x5c71…Q2c9", type: "rules" },
  { when: "Oct 29, 08:15", what: "Received from Lumen Labs", wallet: "Treasury vault", amount: "+6,500.00", kind: "neutral" as Kind, outcome: "Inflow", rule: "Incoming", proof: "0x2bLm…8sF3", type: "inflow" },
];

export const payees = [
  { name: "Northwind Hosting", addr: "0x2d7a…91f3", note: "cap 100", kind: "auto" as Kind, label: "Allowed" },
  { name: "Atlas Freight", addr: "0x51d0…9c4e", note: "cap 100", kind: "approval" as Kind, label: "Draft: 140" },
  { name: "Kora Payroll", addr: "0x4f1c…a21c", note: "own vault", kind: "auto" as Kind, label: "Allowed" },
  { name: "Kora Vendors", addr: "0x9b2e…07de", note: "own vault", kind: "auto" as Kind, label: "Allowed" },
  { name: "Design stipends", addr: "0x6e03…b5d8", note: "cap 100", kind: "auto" as Kind, label: "Allowed" },
];

export const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
