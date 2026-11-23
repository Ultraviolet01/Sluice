// One round over one vault: observe -> forecast -> decide -> review -> act -> learn.
// Stateless: the vault's own records (settlements and BillPaid receipts) are
// the agent's memory, so a round can run anywhere, any time, and never pays twice.

import type { Address } from "viem";
import { Band, Reason, candidatePeriods, decide, draftCap, firstShortfall, forecast, isSpike, money, upcoming, type Action, type Bill } from "./brain.ts";
import type { Chain, VaultView } from "./chain.ts";
import { clean } from "./guard.ts";
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
  /** Most Claude reviews per vault per round, to bound cost and time. */
  maxReviews?: number;
  say?: (e: Event) => void;
}

const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);

export async function runVault(chain: Chain, vault: Address, o: RoundOptions): Promise<Event[]> {
  const events: Event[] = [];
  const say = (e: Event) => {
    events.push(e);
    o.say?.(e);
  };
  let reviews = 0;
  const maxReviews = o.maxReviews ?? 5;

  // Observe
  const now = await chain.now();
  const v: VaultView = await chain.read(vault);
  const m = (u: bigint) => money(u);
  if (!v.session.active || v.session.expiresAt <= now) {
    say({ step: "observe", text: "no live session for this agent on the vault; nothing to do" });
    return events;
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

  // Decide and act, bill period by bill period
  const knownPayees = [...new Map(v.bills.map((b) => [b.payee, `${clean(b.label)} (${b.payee})`])).values()];
  for (const bill of v.bills) {
    for (const period of candidatePeriods(bill, now)) {
      if (settled.has(`${bill.id}:${period}`)) continue;
      const { band, reason } = await chain.check(vault, bill.id, period);
      if (band === Band.Blocked && (reason === Reason.AlreadySettled || reason === Reason.AlreadyProposed)) continue;

      const history = v.paid.filter((p) => p.payee.toLowerCase() === bill.payee.toLowerCase()).map((p) => p.amount);
      let action: Action = decide(band, reason, { spike: isSpike(bill.amount, history) });

      if (action.kind === "pay" && reviews < maxReviews) {
        reviews++;
        const verdict = await o.reviewer.review({
          payee: bill.payee,
          payeeName: bill.label,
          amount: m(bill.amount),
          due: day(bill.firstDue + period * bill.intervalDays * 86_400),
          history: history.map(m),
          knownPayees: knownPayees.filter((k) => !k.endsWith(`(${bill.payee})`)),
        });
        action = stricter(action, verdict);
      } else if (action.kind === "pay") {
        action = { kind: "propose", reason: "needs you: review budget for this round used up" };
      }

      const label = `${clean(bill.label)} #${bill.id}/${period}, ${m(bill.amount)}`;
      say({ step: "decide", text: `${label}: ${action.kind} (${action.reason})`, bill: bill.id, period });
      await act(chain, vault, bill, period, action, o.dryRun, say);
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
    if (d) say({ step: "learn", text: `draft: raise the per-payment cap for ${payee} from ${m(d.currentCap)} to ${m(d.suggestedCap)} (last 3 approvals ${d.evidence.map(m).join(", ")}). Only you can apply it.` });
  }
  return events;
}

async function act(chain: Chain, vault: Address, bill: Bill, period: number, a: Action, dryRun: boolean, say: (e: Event) => void) {
  if (a.kind !== "pay" && a.kind !== "propose") return;
  if (dryRun) {
    say({ step: "act", text: `dry run: would ${a.kind}`, bill: bill.id, period });
    return;
  }
  try {
    const tx = a.kind === "pay" ? await chain.pay(vault, bill.id, period) : await chain.propose(vault, bill.id, period, clean(a.reason).slice(0, 280));
    say({ step: "act", text: a.kind === "pay" ? "paid" : "proposed to the owner", bill: bill.id, period, tx });
  } catch (err) {
    // The vault re-checks everything; a revert here means something changed since the check.
    say({ step: "error", text: `${a.kind} failed: ${clean(String((err as Error).message ?? err)).slice(0, 200)}`, bill: bill.id, period });
  }
}
