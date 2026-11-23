// Text that reaches the agent from outside (bill labels typed from invoices,
// invoice text, payee names) is data. Before any model reads it, plain code
// checks it for attempts to instruct the reviewer, so no wording can talk a
// model past this check. It also cleans text before it is logged or put on chain.

/** Removes control, bidi and zero-width characters and collapses whitespace. */
export function clean(s: string): string {
  return s
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯﻿]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Latin lookalikes from other scripts, so "Ⅰgnore" or Cyrillic "ignоre" read as "ignore".
const FOLD: Record<string, string> = {
  а: "a", в: "b", е: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", у: "y", х: "x", і: "i", ј: "j", ѕ: "s",
  α: "a", β: "b", ε: "e", ι: "i", κ: "k", ν: "v", ο: "o", ρ: "p", τ: "t", υ: "u", χ: "x",
};
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s" };

/** Lower-cased, lookalikes folded, leetspeak undone, separators inside words removed. */
export function normalise(s: string): string {
  // Invisible characters are deleted, not turned into spaces, so "dis\u200bregard" reads "disregard".
  const visible = s.replace(/[\u00ad\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "");
  const folded = [...clean(visible).normalize("NFKC").toLowerCase()].map((c) => FOLD[c] ?? c).join("");
  // "i.g.n.o.r.e" / "i-g-n-o-r-e" -> "ignore"
  const joined = folded.replace(/\b(?:\w[._\-*·]){2,}\w\b/g, (m) => m.replace(/[._\-*·]/g, ""));
  return joined.replace(/[013457@$]/g, (c) => LEET[c] ?? c);
}

const PATTERNS: RegExp[] = [
  // Direct attempts to override instructions.
  /\b(ignore|disregard|forget|override|bypass|skip)\b[^.]{0,40}\b(instruction|rule|check|prompt|polic|guideline|limit|review)/,
  /\b(new|updated|real|actual) (instruction|rule|task|system prompt)/,
  // Role play and fake turns.
  /\b(system|assistant|developer)\s*(prompt|message)?\s*:/,
  /\byou are (now )?(an? |the )?(ai|assistant|model|reviewer|agent|bot)\b/,
  /\bas an? (ai|language model)\b/,
  // Telling the reviewer what to answer.
  /\b(answer|respond|reply|return|output|say|classify|mark|label|treat)\b[^.]{0,30}\b(ok|okay|approved?|safe|legit|legitimate|clean|fine|routine)\b/,
  /\bverdict\b/,
  /\{\s*"/,
  // Claims that checks do not apply.
  /\b(pre-?approved|pre-?authori[sz]ed|already (approved|verified|checked))\b/,
  /\bno (need|reason) (for|to) (review|check|approv|verif)/,
  /\b(do not|don't|never)\b[^.]{0,30}\b(flag|escalate|propose|refuse|report|review|check|verify)\b/,
  // Addressed to the automated checker.
  /\b(automated|ai|llm) (review|reviewer|check|checker|agent|system)\b/,
  /\b(treasury|payment|payments) (agent|bot|ai)\b/,
];

/** Whether a piece of outside text tries to steer whoever reviews the payment. */
export function steers(text: string | undefined | null): boolean {
  if (!text) return false;
  const n = normalise(text);
  return PATTERNS.some((r) => r.test(n));
}

/** Pairs of fields can carry an instruction neither carries alone. */
export function anySteers(fields: (string | undefined | null)[]): boolean {
  const xs = fields.filter((f): f is string => Boolean(f));
  if (xs.some(steers)) return true;
  for (let i = 0; i < xs.length; i++) for (let j = 0; j < xs.length; j++) if (i !== j && steers(`${xs[i]} ${xs[j]}`)) return true;
  return false;
}
