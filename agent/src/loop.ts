// One round over one vault: observe -> forecast -> decide -> review -> act -> learn.
// Stateless: the vault's own records (settlements and BillPaid receipts) are
// the agent's memory, so a round can run anywhere, any time, and never pays twice.

import type { Address } from "viem";
import { Band, DAY, Reason, candidatePeriods, decide, dueAt, draftCap, firstShortfall, forecast, isSpike, money, upcoming, workOrder, type Action, type Bill } from "./brain.ts";
import type { Chain, VaultView } from "./chain.ts";
import { template, type ExplainInput } from "./explain.ts";
import { clean } from "./guard.ts";
import type { Alert } from "./notify.ts";
import { stricter, type Reviewer } from "./review.ts";

export interface Event {
  step: "observe" | "forecast" | "decide" | "act" | "learn" | "error";
  text: string;
  bill?: number;
  period?: number;
  tx?: string;
}

export interface RoundOptions {
  dryRun: boolean;
  reviewer: Reviewer;
  /** Writes the owner-facing note on a proposal; defaults to the template. */
  explain?: (x: ExplainInput) => Promise<string>;
  /** Most Claude reviews per vault per round, to bound cost and time. */
  maxReviews?: number;
  say?: (e: Event) => void;
  /** Receives the round's alerts for the owner (Telegram). */
  alert?: (a: Alert) => void;
}

const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);

export async function runVault(chain: Chain, vault: Address, o: RoundOptions): Promise<Event[]> {
  const events: Event[] = [];
  const say = (e: Event) => {
    events.push(e);
    o.say?.(e);
  };
  const alert = (a: Alert) => o.alert?.(a);
  let reviews = 0;
  const maxReviews = o.maxReviews ?? 5;

  // Observe
  const now = await chain.now();
  const v: VaultView = await chain.read(vault);
  const m = (u: bigint) => money(u);
  if (!v.session.active || v.session.expiresAt <= now) {
    say({ step: "observe", text: "no live session for this agent on the vault; nothing to do" });
    alert({ key: `nosession:${vault}:${v.session.expiresAt}`, text: "The agent has no live session on this vault, so it can pay nothing. Grant one under Settings." });
    return events;
  }
  if (v.session.expiresAt - now < 3 * DAY) {
    alert({ key: `expiring:${vault}:${v.session.expiresAt}`, text: `The agent's session ends on ${day(v.session.expiresAt)}. Renew it under Settings to keep bills paid.` });
  }
  say({
    step: "observe",
    text: `balance ${m(v.balance)}, buffer ${m(v.cashBuffer)}, ${v.bills.filter((b) => b.active).length} active bills, ${m(v.spent)} of ${m(v.session.dailyCap)} used in 24h${v.paused ? ", PAUSED" : ""}`,
  });

  // Forecast
  const settled = new Set(v.paid.map((p) => `${p.billId}:${p.period}`));
  const items = upcoming(v.bills, now, 14, (id, p) => settled.has(`${id}:${p}`));
  const days = forecast(v.balance, items, now);
  const short = firstShortfall(days, v.cashBuffer);
  say({
    step: "forecast",
    text: short
      ? `balance falls to ${m(short.balance)} on ${day(short.day)}, below the ${m(v.cashBuffer)} buffer`
      : `14 days covered: ${m(items.reduce((s, x) => s + x.bill.amount, 0n))} due, lowest balance ${m(days.reduce((lo, d) => (d.balance < lo ? d.balance : lo), v.balance))}`,
  });
  if (short) alert({ key: `short:${vault}:${day(short.day)}`, text: `Shortfall ahead: the balance falls to ${m(short.balance)} on ${day(short.day)}, below your ${m(v.cashBuffer)} buffer. Deposit tUSD8 or review the bills due.` });

  // Decide and act, critical bills first, then oldest due first
  const knownPayees = [...new Map(v.bills.map((b) => [b.payee, `${clean(b.label)} (${b.payee})`])).values()];
  const work = workOrder(
    v.bills.flatMap((bill) => candidatePeriods(bill, now).filter((p) => !settled.has(`${bill.id}:${p}`)).map((period) => ({ bill, period, due: dueAt(bill, period) }))),
  );
  for (const { bill, period, due } of work) {
    const { band, reason } = await chain.check(vault, bill.id, period);
    if (band === Band.Blocked && (reason === Reason.AlreadySettled || reason === Reason.AlreadyProposed)) continue;

    const history = v.paid.filter((p) => p.payee.toLowerCase() === bill.payee.toLowerCase()).map((p) => p.amount);
    let action: Action = decide(band, reason, { spike: isSpike(bill.amount, history), critical: bill.critical, due, now });

    if (action.kind === "pay" && reviews < maxReviews) {
      reviews++;
      const verdict = await o.reviewer.review({
        payee: bill.payee,
        payeeName: bill.label,
        amount: m(bill.amount),
        due: day(due),
        history: history.map(m),
        knownPayees: knownPayees.filter((k) => !k.endsWith(`(${bill.payee})`)),
      });
      action = stricter(action, verdict);
    } else if (action.kind === "pay") {
      action = { kind: "propose", reason: "needs you: review budget for this round used up" };
    }

    const label = `${clean(bill.label)} #${bill.id}/${period}, ${m(bill.amount)}${bill.critical ? " (critical)" : ""}`;
    say({ step: "decide", text: `${label}: ${action.kind} (${action.reason})`, bill: bill.id, period });

    if (action.kind === "refuse") {
      alert({ key: `refused:${vault}:${bill.id}:${period}`, text: `Refused ${clean(bill.label)}, ${m(bill.amount)}: ${action.reason.replace(/^refused: /, "")}.` });
      continue;
    }
    if (action.kind !== "pay" && action.kind !== "propose") continue;

    let note = "";
    if (action.kind === "propose") {
      const facts: ExplainInput = {
        rule: action.reason.replace(/^needs you: /, ""),
        amount: m(bill.amount),
        due: day(due),
        balance: m(v.balance),
        balanceAfter: m(v.balance - bill.amount),
        cashBuffer: m(v.cashBuffer),
        perPaymentCap: m(v.session.perPaymentCap),
        paidBefore: history.length,
        critical: Boolean(bill.critical),
        shortfall: short ? `${m(short.balance)} on ${day(short.day)}` : undefined,
      };
      note = o.explain ? await o.explain(facts) : template(facts);
    }
    const tx = await act(chain, vault, bill, period, action.kind, note, o.dryRun, say);
    if (action.kind === "propose" && (tx || o.dryRun)) {
      alert({ key: `proposed:${vault}:${bill.id}:${period}`, text: `Needs you: ${clean(bill.label)}, ${m(bill.amount)}. ${note}`, link: tx });
    }
  }

  // Learn: suggest a higher cap where the owner keeps approving the same payee
  const byPayee = new Map<string, bigint[]>();
  for (const p of v.paid.filter((x) => x.ownerApproved)) {
    const k = p.payee.toLowerCase();
    byPayee.set(k, [...(byPayee.get(k) ?? []), p.amount]);
  }
  for (const [payee, amounts] of byPayee) {
    const d = draftCap(payee as Address, amounts, v.session.perPaymentCap);
    if (d) {
      say({ step: "learn", text: `draft: raise the per-payment cap for ${payee} from ${m(d.currentCap)} to ${m(d.suggestedCap)} (last 3 approvals ${d.evidence.map(m).join(", ")}). Only you can apply it.` });
      alert({ key: `draft:${vault}:${payee}:${d.suggestedCap}`, text: `Suggestion: you approved ${payee.slice(0, 8)}… three times in a row (${d.evidence.map(m).join(", ")}). Consider a per-payment cap of ${m(d.suggestedCap)}.` });
    }
  }
  if (events.some((e) => e.step === "error")) alert({ key: `error:${vault}:${day(now)}`, text: "A payment failed this round; see the agent's run log." });
  return events;
}

async function act(chain: Chain, vault: Address, bill: Bill, period: number, kind: "pay" | "propose", note: string, dryRun: boolean, say: (e: Event) => void): Promise<string | undefined> {
  if (dryRun) {
    say({ step: "act", text: `dry run: would ${kind}${note ? ` with note: ${note}` : ""}`, bill: bill.id, period });
    return undefined;
  }
  try {
    const tx = kind === "pay" ? await chain.pay(vault, bill.id, period) : await chain.propose(vault, bill.id, period, note);
    say({ step: "act", text: kind === "pay" ? "paid" : `proposed to the owner: ${note}`, bill: bill.id, period, tx });
    return tx;
  } catch (err) {
    // The vault re-checks everything; a revert here means something changed since the check.
    say({ step: "error", text: `${kind} failed: ${clean(String((err as Error).message ?? err)).slice(0, 200)}`, bill: bill.id, period });
    return undefined;
  }
}
