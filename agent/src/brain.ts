// Sluice's decisions as pure functions: no network, no clock reads, so every
// rule is testable. The vault enforces its limits again on chain; these
// functions decide what the agent should ask the vault for.

export const DAY = 86_400;
/** Mirrors SluiceVault.EARLY: a period may be settled up to 3 days before it is due. */
export const EARLY = 3 * DAY;
/** Missed periods older than this are left for the owner instead of paid automatically. */
export const CATCH_UP = 30 * DAY;

/** Mirrors SluiceVault.Band. */
export enum Band {
  RunsAlone = 0,
  NeedsApproval = 1,
  Blocked = 2,
}

/** Mirrors SluiceVault.Reason, in the same order. */
export enum Reason {
  Ok,
  Paused,
  NoSession,
  SessionExpired,
  NoSuchBill,
  BillCancelled,
  BadPeriod,
  NotDueYet,
  AlreadySettled,
  AlreadyProposed,
  Blocklisted,
  NotAllowlisted,
  OverPerPaymentCap,
  OverDailyCap,
  OverApprovalThreshold,
  BelowCashBuffer,
}

/** Plain-language text for each vault reason, written for the owner. */
export const REASON_TEXT: Record<Reason, string> = {
  [Reason.Ok]: "inside every limit",
  [Reason.Paused]: "payments are paused by the owner",
  [Reason.NoSession]: "the agent has no session on this vault",
  [Reason.SessionExpired]: "the agent's session has expired",
  [Reason.NoSuchBill]: "no such bill",
  [Reason.BillCancelled]: "the bill was cancelled",
  [Reason.BadPeriod]: "a one-off bill has only one payment",
  [Reason.NotDueYet]: "not due yet",
  [Reason.AlreadySettled]: "already settled",
  [Reason.AlreadyProposed]: "already waiting for the owner",
  [Reason.Blocklisted]: "the payee is on the blocklist",
  [Reason.NotAllowlisted]: "the payee is not on the approved list",
  [Reason.OverPerPaymentCap]: "over the per-payment cap",
  [Reason.OverDailyCap]: "would pass the rolling 24-hour cap",
  [Reason.OverApprovalThreshold]: "above the approval threshold",
  [Reason.BelowCashBuffer]: "would take the vault below its cash buffer",
};

export interface Bill {
  id: number;
  payee: `0x${string}`;
  amount: bigint;
  firstDue: number; // unix seconds
  intervalDays: number; // 0 = one-off
  active: boolean;
  /** Paid first, and never held back for the cash buffer. */
  critical?: boolean;
  label: string;
}

export function dueAt(b: Bill, period: number): number {
  return b.firstDue + period * b.intervalDays * DAY;
}

/**
 * The periods of a bill the agent should look at now: due within EARLY from
 * now, and not older than CATCH_UP. A one-off bill only has period 0.
 */
export function candidatePeriods(b: Bill, now: number): number[] {
  if (!b.active) return [];
  if (b.intervalDays === 0) {
    const due = b.firstDue;
    return due <= now + EARLY && due >= now - CATCH_UP ? [0] : [];
  }
  const step = b.intervalDays * DAY;
  const last = Math.floor((now + EARLY - b.firstDue) / step); // latest period inside EARLY
  if (last < 0) return [];
  const out: number[] = [];
  for (let p = last; p >= 0; p--) {
    if (dueAt(b, p) < now - CATCH_UP) break;
    out.push(p);
  }
  return out.reverse();
}

/** Upcoming payments in the next `days`, for the forecast. */
export function upcoming(bills: Bill[], now: number, days = 14, settled: (id: number, p: number) => boolean = () => false) {
  const end = now + days * DAY;
  const out: { bill: Bill; period: number; due: number }[] = [];
  for (const b of bills) {
    if (!b.active) continue;
    if (b.intervalDays === 0) {
      if (b.firstDue <= end && !settled(b.id, 0)) out.push({ bill: b, period: 0, due: Math.max(b.firstDue, now) });
      continue;
    }
    const step = b.intervalDays * DAY;
    const first = Math.max(0, Math.ceil((now - CATCH_UP - b.firstDue) / step));
    for (let p = first; dueAt(b, p) <= end; p++) {
      if (!settled(b.id, p)) out.push({ bill: b, period: p, due: Math.max(dueAt(b, p), now) });
    }
  }
  return out.sort((a, b) => a.due - b.due);
}

export interface ForecastDay {
  day: number; // unix seconds at the start of the day
  out: bigint;
  balance: bigint;
}

/** Balance at the end of each of the next `days` days, paying each bill on its due date. */
export function forecast(balance: bigint, items: { due: number; bill: Bill }[], now: number, days = 14): ForecastDay[] {
  const start = Math.floor(now / DAY) * DAY;
  const out: ForecastDay[] = [];
  let running = balance;
  for (let i = 0; i < days; i++) {
    const from = start + i * DAY;
    const to = from + DAY;
    const spend = items.filter((x) => (i === 0 ? x.due < to : x.due >= from && x.due < to)).reduce((s, x) => s + x.bill.amount, 0n);
    running -= spend;
    out.push({ day: from, out: spend, balance: running });
  }
  return out;
}

/** The first day the forecast drops below `floor` (the cash buffer), if any. */
export function firstShortfall(days: ForecastDay[], floor = 0n): ForecastDay | undefined {
  return days.find((d) => d.balance < floor);
}

/**
 * A spike: more than `pct`% above the average of the payee's last three
 * payments. Needs three payments of history to say anything.
 */
export function isSpike(amount: bigint, history: bigint[], pct = 25): boolean {
  const last = history.slice(-3);
  if (last.length < 3) return false;
  const avg = last.reduce((s, x) => s + x, 0n) / 3n;
  return amount * 100n > avg * BigInt(100 + pct);
}

export type Action =
  | { kind: "pay"; reason: string }
  | { kind: "propose"; reason: string }
  | { kind: "refuse"; reason: string }
  | { kind: "wait"; reason: string }
  | { kind: "defer"; reason: string }
  | { kind: "skip"; reason: string };

/**
 * What to do with one bill period, from the vault's own checkPayment answer
 * plus Sluice's extra caution (spikes). Never more permissive than the vault.
 *
 * A bill that would take the vault below its cash buffer and is not due yet is
 * held (deferred) instead of sent to the owner at once: money may come in
 * before it is due, and it is proposed on its due date if not. A critical bill
 * is never held: it goes to the owner straight away.
 */
export function decide(band: Band, reason: Reason, opts: { spike?: boolean; critical?: boolean; due?: number; now?: number } = {}): Action {
  const why = REASON_TEXT[reason];
  if (band === Band.Blocked) {
    if (reason === Reason.AlreadySettled || reason === Reason.AlreadyProposed) return { kind: "skip", reason: why };
    if (reason === Reason.Blocklisted) return { kind: "refuse", reason: `refused: ${why}` };
    return { kind: "wait", reason: why };
  }
  if (band === Band.NeedsApproval) {
    if (reason === Reason.BelowCashBuffer) {
      if (opts.critical) return { kind: "propose", reason: "needs you: critical bill, but paying it would take the vault below its cash buffer" };
      if (opts.due !== undefined && opts.now !== undefined && opts.due > opts.now) {
        return { kind: "defer", reason: "held until it is due: paying now would take the vault below its cash buffer" };
      }
    }
    return { kind: "propose", reason: `needs you: ${why}` };
  }
  if (opts.spike) return { kind: "propose", reason: "needs you: more than 25% above this payee's last 3 payments" };
  return { kind: "pay", reason: why };
}

/** The order to work through due bills: critical first, then oldest due first. */
export function workOrder<T extends { bill: Bill; due: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => Number(Boolean(b.bill.critical)) - Number(Boolean(a.bill.critical)) || a.due - b.due);
}

// ---------------------------------------------------------------- learning

export interface RuleDraft {
  payee: `0x${string}`;
  currentCap: bigint;
  suggestedCap: bigint;
  evidence: bigint[];
}

/**
 * Suggests a higher per-payment cap when the owner approved the same payee
 * three times in a row, every amount over the cap and rising steadily (each
 * at most 25% above the one before). Only ever a suggestion: the owner signs
 * any change. Rounds up to a whole token plus 10% headroom.
 */
export function draftCap(payee: `0x${string}`, approved: bigint[], currentCap: bigint, decimals = 6): RuleDraft | null {
  const last = approved.slice(-3);
  if (last.length < 3 || currentCap === 0n) return null;
  if (!last.every((a) => a > currentCap)) return null;
  for (let i = 1; i < last.length; i++) {
    if (last[i] < last[i - 1] || last[i] * 100n > last[i - 1] * 125n) return null;
  }
  const max = last[last.length - 1];
  const unit = 10n ** BigInt(decimals);
  const withRoom = (max * 110n) / 100n;
  const suggested = ((withRoom + unit - 1n) / unit) * unit;
  return { payee, currentCap, suggestedCap: suggested, evidence: last };
}

export function money(units: bigint, decimals = 6, symbol = "tUSD8"): string {
  const neg = units < 0n;
  const u = neg ? -units : units;
  const whole = u / 10n ** BigInt(decimals);
  const frac = (u % 10n ** BigInt(decimals)).toString().padStart(decimals, "0").slice(0, 2);
  return `${neg ? "-" : ""}${whole.toLocaleString("en-US")}.${frac} ${symbol}`.trim();
}
