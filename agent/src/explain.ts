// Plain-English reasons for proposals, written for the owner. Claude Haiku 5.5
// writes them from Sluice's own facts when ANTHROPIC_API_KEY is set; a template
// otherwise, or when the call fails. The text only explains a decision plain
// code already made; it never decides anything. No outside text (bill names,
// invoice wording) reaches the model, so nothing in a bill can steer it.

import Anthropic from "@anthropic-ai/sdk";
import { clean } from "./guard.ts";

export interface ExplainInput {
  /** Why the rules sent it to the owner, e.g. "over the per-payment cap". */
  rule: string;
  amount: string;
  due: string;
  balance: string;
  balanceAfter: string;
  cashBuffer: string;
  perPaymentCap: string;
  paidBefore: number;
  critical: boolean;
  shortfall?: string;
}

/** The vault stores at most 280 bytes; leave room for multi-byte characters. */
export const MAX = 270;

export function template(x: ExplainInput): string {
  const parts = [`Sluice held this for you: ${x.rule}.`];
  if (/buffer/.test(x.rule)) parts.push(`Paying ${x.amount} leaves ${x.balanceAfter}, under your ${x.cashBuffer} buffer.`);
  else if (/cap|threshold/.test(x.rule)) parts.push(`It is ${x.amount}; the agent may pay up to ${x.perPaymentCap} alone.`);
  else if (/approved list|new payee/.test(x.rule)) parts.push(x.paidBefore ? `Paid ${x.paidBefore} times before.` : "First payment to this payee.");
  parts.push(`Due ${x.due}.`);
  if (x.critical) parts.push("Marked critical.");
  return fit(parts.join(" "));
}

const fit = (s: string) => {
  const t = clean(s);
  return t.length <= MAX ? t : `${t.slice(0, MAX - 1).replace(/\s+\S*$/, "")}…`;
};

const SYSTEM = `You write one short note to a company owner explaining why their treasury agent sent a payment to them for approval instead of paying it.
Use only the facts given. Plain, calm English. Two sentences at most, under 240 characters, no greeting, no markdown, no emoji.
Say what the rule was and what the numbers mean for the company, then what the owner can do (approve, reject, deposit, or change a limit).`;

export async function explain(apiKey: string | undefined, x: ExplainInput, timeoutMs = 20_000): Promise<{ text: string; by: "claude" | "template" }> {
  if (!apiKey) return { text: template(x), by: "template" };
  try {
    const client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 1 });
    const msg = await client.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 1500,
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(x) }],
    });
    if (msg.stop_reason !== "end_turn") return { text: template(x), by: "template" };
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join(" ");
    const out = fit(text);
    return out.length >= 20 ? { text: out, by: "claude" } : { text: template(x), by: "template" };
  } catch {
    return { text: template(x), by: "template" };
  }
}
