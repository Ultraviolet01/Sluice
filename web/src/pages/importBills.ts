// Bulk bill import: one bill per line, comma-separated, parsed and checked in
// the browser before a single addBills signature. Pure, so it is unit-tested.
//
//   name, payee, amount, first due (YYYY-MM-DD), repeat, critical
//   Northwind Hosting, 0x2d7a…, 80, 2026-12-01, monthly, no
//
// repeat: once | weekly | 2 weeks | monthly | yearly | a number of days. critical: yes | no.

import { isAddress, type Address } from "viem";
import type { BillInput } from "../chain.ts";
import { toUnits } from "../units.ts";

export interface Parsed {
  line: number;
  raw: string;
  bill?: BillInput;
  error?: string;
}

const REPEAT: Record<string, number> = { once: 0, "": 0, none: 0, weekly: 7, week: 7, "2 weeks": 14, biweekly: 14, fortnightly: 14, monthly: 30, month: 30, yearly: 365, annual: 365, annually: 365 };

/** Splits one CSV line, honouring double-quoted fields. */
export function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === "," || c === ";" || c === "\t") { out.push(cur.trim()); cur = ""; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

export function parseBills(text: string): Parsed[] {
  const out: Parsed[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    if (!raw.trim() || raw.trim().startsWith("#")) return;
    const [name = "", payee = "", amount = "", due = "", repeat = "", critical = ""] = splitCsv(raw);
    if (i === 0 && /name/i.test(name) && /payee/i.test(payee)) return; // header row
    const p: Parsed = { line: i + 1, raw };
    try {
      if (!name) throw new Error("missing name");
      if (name.length > 64) throw new Error("name over 64 characters");
      if (!isAddress(payee)) throw new Error("payee is not a 0x address");
      const units = toUnits(amount);
      if (units <= 0n) throw new Error("amount must be above zero");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || Number.isNaN(Date.parse(`${due}T09:00:00Z`))) throw new Error("due date must be YYYY-MM-DD");
      const r = repeat.toLowerCase();
      const interval = r in REPEAT ? REPEAT[r] : /^\d+$/.test(r) ? Number(r) : NaN;
      if (!Number.isInteger(interval) || interval < 0 || interval > 3650) throw new Error(`unknown repeat "${repeat}"`);
      const c = critical.toLowerCase();
      if (c && !["yes", "no", "y", "n", "true", "false"].includes(c)) throw new Error(`critical must be yes or no`);
      p.bill = {
        payee: payee as Address,
        amount: units,
        firstDue: BigInt(Math.floor(Date.parse(`${due}T09:00:00Z`) / 1000)),
        intervalDays: interval,
        critical: ["yes", "y", "true"].includes(c),
        label: name,
      };
    } catch (e) {
      p.error = (e as Error).message;
    }
    out.push(p);
  });
  return out;
}
