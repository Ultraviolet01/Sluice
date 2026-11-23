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
  /** A payment waiting for the owner: shown with Approve and Reject buttons. */
  bill?: { id: number; period: number };
}

export interface Button {
  text: string;
  url?: string;
  callback_data?: string;
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

export async function send(tg: Telegram, text: string, fetcher: typeof fetch = fetch, buttons?: Button[][]): Promise<boolean> {
  try {
    const r = await fetcher(`https://api.telegram.org/bot${tg.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: tg.chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}) }),
    });
    if (!r.ok) console.error(`[telegram] chat ${tg.chatId}: ${r.status} ${(await r.text().catch(() => "")).slice(0, 200)}`);
    return r.ok;
  } catch (e) {
    console.error(`[telegram] chat ${tg.chatId}: ${(e as Error).message}`);
    return false;
  }
}

/** Below this the agent may not afford a round's transactions (tQDAY, 18 decimals). */
export const LOW_GAS = 200_000_000_000_000_000n; // 0.2 tQDAY

/** For the operator who runs the agent (not the founders): it is running out of gas. Once per day while low. */
export function gasAlert(agent: string, balance: bigint, min = LOW_GAS, day = new Date().toISOString().slice(0, 10)): Alert | null {
  if (balance >= min) return null;
  const shown = (Number(balance / 10n ** 14n) / 10_000).toFixed(4);
  const text = balance === 0n
    ? `The agent ${agent} has no tQDAY left for gas, so it cannot pay or propose anything. Send it tQDAY now.`
    : `The agent ${agent} is low on gas: ${shown} tQDAY left. Top it up soon, or it will stop paying bills.`;
  return { key: `lowgas:${agent}:${day}`, text };
}

/**
 * Approve (opens Sluice to sign) and Reject (the bot rejects as the vault's guardian)
 * under a payment that waits for the owner. The bot reads "rj:<factory index>:<bill>:<period>".
 */
export function billButtons(appUrl: string | undefined, vault: string, factoryIndex: number | undefined, bill: { id: number; period: number }): Button[][] | undefined {
  const row: Button[] = [];
  if (appUrl) row.push({ text: "Approve in Sluice", url: `${appUrl.replace(/\/$/, "")}/#/app/approvals?vault=${vault}&bill=${bill.id}&period=${bill.period}` });
  if (factoryIndex !== undefined) row.push({ text: "Reject", callback_data: `rj:${factoryIndex}:${bill.id}:${bill.period}` });
  return row.length ? [row] : undefined;
}
