// One shape for every page, filled either from a live SluiceVault on Aevum or
// from demo data (when no vault is configured), so the UI never forks.

import { decodeEventLog, hexToString, type Address, type Log } from "viem";
import { REASON_TEXT, Reason, forecast as runForecast, upcoming as runUpcoming, type Bill } from "../../agent/src/brain.ts";
import { VAULT_ABI, companyName, publicClient } from "./chain.ts";
import type { Kind } from "./data.ts";

export interface Session {
  agent: Address;
  perPaymentCap: bigint;
  dailyCap: bigint;
  expiresAt: number;
  active: boolean;
  spent: bigint;
}

export interface ApprovalRow {
  key: string;
  billId: number;
  period: number;
  label: string;
  payee: Address;
  amount: bigint;
  note: string;
  why: string;
  createdAt: number;
  status: "waiting" | "approved" | "rejected" | "released";
  tx?: string;
}

export interface ActivityRow {
  at: number;
  what: string;
  amount: bigint | null;
  sign: "out" | "in" | "none";
  kind: Kind;
  outcome: string;
  rule: string;
  tx: string;
  type: "auto" | "approved" | "blocked" | "proposed" | "rules";
}

export interface PayeeRow {
  addr: Address;
  label: string;
  allowed: boolean;
  blocked: boolean;
  paid: number;
}

export interface Model {
  live: boolean;
  name: string;
  vault: Address;
  /** The stablecoin the vault holds (tUSD8 on Aevum). */
  token: Address;
  owner: Address | null;
  /** Offered new owner who has not accepted yet (two-step transfer), or null. */
  pendingOwner: Address | null;
  /** The key allowed to make the vault stricter (the Telegram bot), or null. */
  guardian: Address | null;
  /** The Telegram chat the owner linked for alerts, or "". */
  notifyChat: string;
  paused: boolean;
  balance: bigint;
  cashBuffer: bigint;
  threshold: bigint;
  session: Session | null;
  bills: Bill[];
  upcoming: { billId: number; period: number; label: string; payee: Address; due: number; amount: bigint; kind: Kind; status: string }[];
  forecast: { day: number; balance: bigint }[];
  approvals: ApprovalRow[];
  activity: ActivityRow[];
  payees: PayeeRow[];
}

const STATUS = { None: 0, Pending: 1, Paid: 2, Rejected: 3 };

/** The owner's reason for a rule change, or the function name when none was given. */
const why = (reason: unknown, fallback: string) => (typeof reason === "string" && reason.trim() ? `“${reason.trim()}”` : fallback);

export async function loadLive(vault: Address, fromBlock = 0n): Promise<Model> {
  const read = <T,>(functionName: string, args: unknown[] = []) =>
    publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: functionName as never, args: args as never }) as Promise<T>;
  const [guardianRaw, notifyChat, token, owner, pendingRaw, paused, balance, cashBuffer, threshold, count, block] = await Promise.all([
    read<Address>("guardian"),
    read<string>("notifyChat"),
    read<Address>("token"),
    read<Address>("owner"),
    read<Address>("pendingOwner"), read<boolean>("paused"), read<bigint>("balance"), read<bigint>("cashBuffer"),
    read<bigint>("approvalThreshold"), read<bigint>("billCount"), publicClient.getBlock(),
  ]);
  const now = Number(block.timestamp);

  const bills: Bill[] = [];
  for (let i = 0; i < Number(count); i++) {
    const b = await read<{ payee: Address; amount: bigint; firstDue: bigint; intervalDays: number; active: boolean; critical: boolean; label: string }>("getBill", [BigInt(i)]);
    bills.push({ id: i, payee: b.payee, amount: b.amount, firstDue: Number(b.firstDue), intervalDays: Number(b.intervalDays), active: b.active, critical: b.critical, label: b.label });
  }

  // Every event the vault ever emitted, oldest first, with block times.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const logs = await logsFrom<Log>(publicClient as any, { address: vault }, fromBlock);
  const times = new Map<bigint, number>();
  for (const n of [...new Set(logs.map((l) => l.blockNumber!))].slice(-80)) {
    times.set(n, Number((await publicClient.getBlock({ blockNumber: n })).timestamp));
  }
  type Ev = { name: string; args: Record<string, unknown>; at: number; tx: string };
  const events: Ev[] = [];
  for (const l of logs) {
    try {
      const d = decodeEventLog({ abi: VAULT_ABI, data: l.data, topics: l.topics });
      events.push({ name: d.eventName, args: (d.args ?? {}) as Record<string, unknown>, at: times.get(l.blockNumber!) ?? now, tx: l.transactionHash! });
    } catch {
      /* not one of ours */
    }
  }

  const label = (id: number) => bills[id]?.label ?? `Bill #${id}`;
  const payeeOf = (id: number) => bills[id]?.payee;

  // The agent: the vault's one current agent (granting a new one revokes the old).
  let session: Session | null = null;
  const current = await read<Address>("agent");
  const lastGranted = [...events].reverse().find((e) => e.name === "SessionGranted")?.args.agent as Address | undefined;
  const agent = current !== "0x0000000000000000000000000000000000000000" ? current : lastGranted;
  if (agent) {
    const [s, spent] = await Promise.all([read<readonly [bigint, bigint, bigint, boolean]>("sessions", [agent]), read<bigint>("spentInWindow", [agent])]);
    session = { agent, perPaymentCap: s[0], dailyCap: s[1], expiresAt: Number(s[2]), active: s[3], spent };
  }

  // Proposals and their current status.
  const approvals: ApprovalRow[] = [];
  for (const e of events.filter((x) => x.name === "PaymentProposed")) {
    const billId = Number(e.args.billId);
    const period = Number(e.args.period);
    const st = await read<readonly [number, Address, bigint, number, string]>("settlements", [BigInt(billId), period]);
    approvals.push({
      key: `${billId}:${period}`,
      billId,
      period,
      label: label(billId),
      payee: payeeOf(billId)!,
      amount: e.args.amount as bigint,
      note: String(e.args.note ?? ""),
      why: REASON_TEXT[Number(e.args.reason) as Reason],
      createdAt: e.at,
      // None after a proposal means the owner released a rejected period: it can be proposed again.
      status: st[0] === STATUS.Paid ? "approved" : st[0] === STATUS.Rejected ? "rejected" : st[0] === STATUS.Pending ? "waiting" : "released",
      tx: e.tx,
    });
  }
  // A released period can be proposed again: keep only the latest proposal per period.
  const latest = new Map(approvals.map((a) => [a.key, a]));

  // Activity, newest first.
  const activity: ActivityRow[] = [];
  for (const e of events) {
    const a = e.args;
    if (e.name === "BillPaid") {
      const approved = Boolean(a.ownerApproved);
      activity.push({ at: e.at, what: `Paid ${label(Number(a.billId))}`, amount: a.amount as bigint, sign: "out", kind: approved ? "settled" : "auto", outcome: approved ? "Approved" : "Auto", rule: approved ? "Approved by you" : "Inside every limit", tx: e.tx, type: approved ? "approved" : "auto" });
    } else if (e.name === "PaymentProposed") {
      const p = latest.get(`${a.billId}:${a.period}`);
      activity.push({ at: e.at, what: `Proposed ${label(Number(a.billId))}`, amount: a.amount as bigint, sign: "none", kind: "approval", outcome: p?.status === "waiting" ? "Waiting" : "Proposed", rule: REASON_TEXT[Number(a.reason) as Reason], tx: e.tx, type: "proposed" });
    } else if (e.name === "PaymentRejected") {
      activity.push({ at: e.at, what: `Rejected ${label(Number(a.billId))}`, amount: null, sign: "none", kind: "blocked", outcome: "Rejected", rule: "Rejected by you", tx: e.tx, type: "blocked" });
    } else if (e.name === "PolicyChanged") {
      const field = hexToString(a.field as `0x${string}`, { size: 32 }).replace(/\0/g, "");
      activity.push({ at: e.at, what: `${field === "cashBuffer" ? "Cash buffer" : "Approval threshold"} ${fmt(a.oldValue as bigint)} → ${fmt(a.newValue as bigint)}`, amount: null, sign: "none", kind: "settled", outcome: "Signed by you", rule: why(a.reason, field), tx: e.tx, type: "rules" });
    } else if (e.name === "BillAdded") {
      activity.push({ at: e.at, what: `Listed bill: ${a.label}`, amount: a.amount as bigint, sign: "none", kind: "neutral", outcome: "Listed", rule: "Listed by you", tx: e.tx, type: "rules" });
    } else if (e.name === "SessionGranted") {
      activity.push({ at: e.at, what: `Agent session: ${fmt(a.perPaymentCap as bigint)} per payment, ${fmt(a.dailyCap as bigint)} per 24 h`, amount: null, sign: "none", kind: "settled", outcome: "Signed by you", rule: why(a.reason, "grantSession"), tx: e.tx, type: "rules" });
    } else if (e.name === "SessionRevoked") {
      activity.push({ at: e.at, what: "Agent session revoked", amount: null, sign: "none", kind: "blocked", outcome: "Signed by you", rule: why(a.reason, "revokeSession"), tx: e.tx, type: "rules" });
    } else if (e.name === "PayeeAllowed" || e.name === "PayeeBlocked") {
      const on = Boolean(e.name === "PayeeAllowed" ? a.allowed : a.blocked);
      const who = bills.find((b) => b.payee.toLowerCase() === String(a.payee).toLowerCase())?.label || `${String(a.payee).slice(0, 8)}…`;
      const what = e.name === "PayeeAllowed" ? (on ? `Approved payee ${who}` : `Removed ${who} from approved payees`) : on ? `Blocked ${who}` : `Unblocked ${who}`;
      activity.push({ at: e.at, what, amount: null, sign: "none", kind: e.name === "PayeeBlocked" && on ? "blocked" : "settled", outcome: "Signed by you", rule: why(a.reason, e.name === "PayeeAllowed" ? "setPayeeAllowed" : "setPayeeBlocked"), tx: e.tx, type: "rules" });
    } else if (e.name === "BillCancelled") {
      activity.push({ at: e.at, what: `Cancelled bill: ${label(Number(a.billId))}`, amount: null, sign: "none", kind: "neutral", outcome: "Signed by you", rule: why(a.reason, "cancelBill"), tx: e.tx, type: "rules" });
    } else if (e.name === "Paused" || e.name === "Unpaused") {
      activity.push({ at: e.at, what: e.name === "Paused" ? "All payments paused" : "Payments resumed", amount: null, sign: "none", kind: e.name === "Paused" ? "blocked" : "settled", outcome: "Signed by you", rule: e.name === "Paused" ? "pause" : "unpause", tx: e.tx, type: "rules" });
    } else if (e.name === "GuardianSet") {
      const off = String(a.guardian) === "0x0000000000000000000000000000000000000000";
      activity.push({ at: e.at, what: off ? "Telegram actions turned off" : "Telegram actions turned on (pause, block, reject)", amount: null, sign: "none", kind: off ? "neutral" : "settled", outcome: "Signed by you", rule: why(a.reason, "setGuardian"), tx: e.tx, type: "rules" });
    } else if (e.name === "NotifyChatSet") {
      activity.push({ at: e.at, what: String(a.chat) ? "Telegram alerts linked" : "Telegram alerts unlinked", amount: null, sign: "none", kind: "neutral", outcome: "Signed by you", rule: "setNotifyChat", tx: e.tx, type: "rules" });
    } else if (e.name === "BillReleased") {
      activity.push({ at: e.at, what: `Released ${label(Number(a.billId))}, payment ${Number(a.period) + 1}`, amount: null, sign: "none", kind: "neutral", outcome: "Signed by you", rule: "Can be paid again", tx: e.tx, type: "rules" });
    } else if (e.name === "OwnershipTransferStarted") {
      const to = String(a.newOwner);
      const cancelled = to === "0x0000000000000000000000000000000000000000";
      activity.push({ at: e.at, what: cancelled ? "Ownership offer cancelled" : `Ownership offered to ${to.slice(0, 8)}…`, amount: null, sign: "none", kind: "approval", outcome: "Signed by you", rule: cancelled ? "transferOwnership(0x0)" : "Waits for them to accept", tx: e.tx, type: "rules" });
    } else if (e.name === "OwnershipTransferred" && String(a.previousOwner) !== "0x0000000000000000000000000000000000000000") {
      activity.push({ at: e.at, what: `Ownership accepted by ${String(a.newOwner).slice(0, 8)}…`, amount: null, sign: "none", kind: "settled", outcome: "New owner", rule: "acceptOwnership", tx: e.tx, type: "rules" });
    } else if (e.name === "Withdrawn") {
      activity.push({ at: e.at, what: `Withdrew to ${String(a.to).slice(0, 8)}…`, amount: a.amount as bigint, sign: "out", kind: "neutral", outcome: "Withdrawn", rule: "withdraw", tx: e.tx, type: "rules" });
    }
  }
  activity.reverse();

  // Payees: latest allow/block state, labelled from bills.
  const payees = new Map<string, PayeeRow>();
  const row = (addr: Address) => {
    const k = addr.toLowerCase();
    if (!payees.has(k)) payees.set(k, { addr, label: bills.find((b) => b.payee.toLowerCase() === k)?.label ?? "", allowed: false, blocked: false, paid: 0 });
    return payees.get(k)!;
  };
  for (const b of bills) row(b.payee);
  for (const e of events) {
    if (e.name === "PayeeAllowed") row(e.args.payee as Address).allowed = Boolean(e.args.allowed);
    if (e.name === "PayeeBlocked") row(e.args.payee as Address).blocked = Boolean(e.args.blocked);
    if (e.name === "BillPaid") row(e.args.payee as Address).paid++;
  }

  // Upcoming and forecast.
  const settledKeys = new Set(events.filter((e) => e.name === "BillPaid").map((e) => `${e.args.billId}:${e.args.period}`));
  const items = runUpcoming(bills, now, 14, (id, p) => settledKeys.has(`${id}:${p}`));
  const p = (k: string) => latest.get(k);
  const upcoming = items.map((x) => {
    const k = `${x.bill.id}:${x.period}`;
    const pr = p(k);
    const pay = payees.get(x.bill.payee.toLowerCase());
    const [kind, status]: [Kind, string] = pay?.blocked ? ["blocked", "Blocked"]
      : pr?.status === "waiting" ? ["approval", "Needs approval"]
      : pr?.status === "rejected" ? ["blocked", "Rejected"]
      : !pay?.allowed ? ["approval", "New payee"]
      : session && x.bill.amount > session.perPaymentCap ? ["approval", "Over cap"]
      : ["auto", "Auto-pay"];
    return { billId: x.bill.id, period: x.period, label: x.bill.label, payee: x.bill.payee, due: x.due, amount: x.bill.amount, kind, status };
  });
  const forecast = runForecast(balance, items.filter((x) => !payees.get(x.bill.payee.toLowerCase())?.blocked), now).map((d) => ({ day: d.day, balance: d.balance }));

  return {
    live: true,
    name: (await companyName(vault)) || import.meta.env.VITE_COMPANY_NAME || "Your company",
    vault, token, owner, paused,
    pendingOwner: pendingRaw === "0x0000000000000000000000000000000000000000" ? null : pendingRaw,
    guardian: guardianRaw === "0x0000000000000000000000000000000000000000" ? null : guardianRaw,
    notifyChat,
    balance, cashBuffer, threshold, session, bills, upcoming, forecast,
    approvals: [...latest.values()].sort((a, b) => b.createdAt - a.createdAt),
    activity,
    payees: [...payees.values()],
  };
}

export { fmt, toUnits } from "./units.ts";
import { logsFrom } from "./logs.ts";
import { fmt } from "./units.ts";

export const when = (t: number) =>
  new Date(t * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
export const dayLabel = (t: number) => new Date(t * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
export const ago = (t: number, now = Date.now() / 1000) => {
  const s = Math.max(0, now - t);
  return s < 3600 ? `${Math.max(1, Math.round(s / 60))} min` : s < 86400 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86400)} d`;
};
