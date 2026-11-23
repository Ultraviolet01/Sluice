// Telegram alerts when something needs the owner: a bill sent for approval, a
// refused payment, a shortfall ahead, a session about to expire, or an error.
// The agent keeps no database, so to avoid repeating itself every 15 minutes it
// remembers what it already sent in a small JSON file (kept between scheduled
// runs by the GitHub Actions cache). Losing the file only means one repeat.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { clean } from "./guard.ts";

export interface Alert {
  /** Stable key: the same situation produces the same key, so it is sent once. */
  key: string;
  text: string;
  link?: string;
}

/** Sent keys with the time sent; forgotten after `keepDays`, so a lasting problem is repeated weekly. */
export type Sent = Record<string, number>;

export function loadSent(file: string): Sent {
  try {
    return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Sent) : {};
  } catch {
    return {};
  }
}

export function saveSent(file: string, sent: Sent) {
  writeFileSync(file, JSON.stringify(sent));
}

/** The alerts not sent before, and the updated memory. */
export function fresh(alerts: Alert[], sent: Sent, now = Date.now(), keepDays = 7): { todo: Alert[]; sent: Sent } {
  const keep: Sent = {};
  for (const [k, t] of Object.entries(sent)) if (now - t < keepDays * 86_400_000) keep[k] = t;
  const todo: Alert[] = [];
  const seen = new Set<string>();
  for (const a of alerts) {
    if (keep[a.key] || seen.has(a.key)) continue;
    seen.add(a.key);
    todo.push(a);
  }
  return { todo, sent: keep };
}

const esc = (s: string) => clean(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** One Telegram message for a vault's new alerts (HTML parse mode, under Telegram's 4096 limit). */
export function format(vaultLabel: string, alerts: Alert[], appUrl?: string): string {
  const lines = alerts.map((a) => `• ${esc(a.text)}${a.link ? ` (<a href="${esc(a.link)}">tx</a>)` : ""}`);
  const open = appUrl ? `\n\n<a href="${esc(appUrl)}">Open Sluice</a>` : "";
  let body = `<b>Sluice · ${esc(vaultLabel)}</b>\n${lines.join("\n")}${open}`;
  if (body.length > 3900) body = `${body.slice(0, 3890)}…`;
  return body;
}

export interface Telegram {
  token: string;
  chatId: string;
}

export async function send(tg: Telegram, text: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  try {
    const r = await fetcher(`https://api.telegram.org/bot${tg.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: tg.chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    return r.ok;
  } catch {
    return false;
  }
}
