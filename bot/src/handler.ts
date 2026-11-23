// One Telegram update in, replies out. Every action checks, on chain, that this
// chat is the vault's alert chat (set by the owner's own signature) and that the
// bot is the vault's guardian. Guardian actions only ever make a vault stricter;
// anything that loosens it or moves money becomes a link to sign in Sluice.

import { isAddress, type Address } from "viem";
import type { Chain, VaultInfo } from "./vaults.ts";
import { esc, type Button, type Telegram, type Update } from "./telegram.ts";

export interface Deps {
  tg: Telegram;
  chain: Chain;
  /** The dashboard, e.g. https://sluice.example; links to sign open there. */
  appUrl: string;
}

const money = (u: bigint) => `${(u / 1_000_000n).toLocaleString("en-US")}.${(u % 1_000_000n).toString().padStart(6, "0").slice(0, 2)} tUSD8`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const app = (d: Deps, page: string, vault: string, extra = "") => `${d.appUrl.replace(/\/$/, "")}/#/app/${page}?vault=${vault}${extra}`;

const HELP = [
  "<b>Sluice</b> keeps you posted on your company's treasury and lets you stop trouble from here.",
  "",
  "/balance  what each linked company holds",
  "/pending  payments waiting for you, with Approve and Reject",
  "/bills  the bills Sluice may pay",
  "/pause  stop every agent payment at once",
  "/block 0x… reason  block a payee for good",
  "/vaults  the companies linked to this chat",
  "",
  "Pause, block and reject happen here in one tap. Anything that lets money out (approving, allowing payees, changing limits) opens Sluice to sign in your own wallet.",
].join("\n");

const NOT_LINKED = "This chat isn't linked to a company yet. In Sluice, open <b>Settings → Telegram → Connect</b>.";

/** Callback data, all under Telegram's 64-byte limit: vault by factory index, never free text. */
export const cb = {
  reject: (v: number, bill: number, period: number) => `rj:${v}:${bill}:${period}`,
  pause: (v: number) => `ps:${v}`,
  block: (v: number, payee: Address) => `bk:${v}:${payee.slice(2)}`,
};

export async function handle(u: Update, d: Deps): Promise<void> {
  if (u.callback_query) return onButton(u.callback_query, d);
  const m = u.message;
  if (!m?.text || m.chat.type !== "private") return; // private chats only: a group could leak a treasury
  const chat = String(m.chat.id);
  const [cmd, ...args] = m.text.trim().split(/\s+/);
  const command = cmd.split("@")[0].toLowerCase();

  if (command === "/start") {
    const param = args[0] ?? "";
    const vault = /^[0-9a-fA-F]{40}$/.test(param) ? (`0x${param}` as Address) : null;
    if (!vault) return d.tg.send(chat, HELP);
    if ((await d.chain.notifyChat(vault).catch(() => "")) === chat) return d.tg.send(chat, "This chat is already linked to that company. /help shows what I can do.");
    const name = m.from?.username ? `&tgname=${encodeURIComponent(m.from.username)}` : "";
    return d.tg.send(chat, "Almost done. Open Sluice and sign once to send this company's alerts here. Only the vault's owner can do this.", [
      [{ text: "Link this chat in Sluice", url: app(d, "settings", vault, `&tgchat=${chat}${name}`) }],
    ]);
  }
  if (command === "/help") return d.tg.send(chat, HELP);

  const mine = await d.chain.vaultsForChat(chat);
  if (!mine.length) return d.tg.send(chat, NOT_LINKED);

  if (command === "/vaults") {
    return d.tg.send(chat, ["<b>Linked companies</b>", ...mine.map((v) => `• ${esc(v.name)} <code>${short(v.vault)}</code>`)].join("\n"));
  }
  if (command === "/balance") {
    const lines = ["<b>Balances</b>"];
    for (const v of mine) {
      const s = await d.chain.summary(v.vault);
      lines.push(`• ${esc(v.name)}: ${money(s.balance)} (buffer ${money(s.buffer)})${s.paused ? " · <b>PAUSED</b>" : ""}`);
    }
    return d.tg.send(chat, lines.join("\n"));
  }
  if (command === "/bills") {
    const lines: string[] = [];
    for (const v of mine) {
      const bills = (await d.chain.bills(v.vault)).filter((b) => b.active);
      lines.push(`<b>${esc(v.name)}</b>${bills.length ? "" : ": no bills"}`);
      for (const b of bills.slice(0, 15)) lines.push(`• ${esc(b.label)}: ${money(b.amount)}${b.intervalDays ? `, every ${b.intervalDays} days` : ""}${b.critical ? " · critical" : ""}`);
    }
    return d.tg.send(chat, lines.join("\n"));
  }
  if (command === "/pending") {
    let any = false;
    for (const v of mine) {
      const bills = await d.chain.bills(v.vault);
      for (const p of await d.chain.pending(v.vault)) {
        any = true;
        const b = bills[p.billId];
        await d.tg.send(chat, `<b>${esc(v.name)}</b>: ${esc(b?.label ?? `bill ${p.billId}`)}, ${money(p.amount)}\n${esc(p.note)}`, approveReject(d, v, p.billId, p.period));
      }
    }
    if (!any) return d.tg.send(chat, "Nothing waiting for you.");
    return;
  }
  if (command === "/pause") {
    return d.tg.send(chat, "Pause every agent payment? Only the owner can resume, from Sluice.", mine.map((v) => [{ text: `Pause ${v.name}`, callback_data: cb.pause(v.index) }]));
  }
  if (command === "/block") {
    const payee = args[0];
    if (!payee || !isAddress(payee)) return d.tg.send(chat, "Send <code>/block 0x… reason</code> with the payee's address.");
    return d.tg.send(
      chat,
      `Block <code>${esc(payee)}</code>? It will never be paid again, not even with your approval. Only the owner can unblock it, from Sluice.`,
      mine.map((v) => [{ text: `Block for ${v.name}`, callback_data: cb.block(v.index, payee as Address) }]),
    );
  }
  return d.tg.send(chat, HELP);
}

/** The buttons under a payment that waits for the owner. */
export function approveReject(d: Deps, v: VaultInfo, billId: number, period: number): Button[][] {
  return [[
    { text: "Approve in Sluice", url: app(d, "approvals", v.vault, `&bill=${billId}&period=${period}`) },
    { text: "Reject", callback_data: cb.reject(v.index, billId, period) },
  ]];
}

async function onButton(q: NonNullable<Update["callback_query"]>, d: Deps): Promise<void> {
  const chat = String(q.message?.chat.id ?? "");
  const [kind, idx, a, b] = (q.data ?? "").split(":");
  const v = /^\d+$/.test(idx ?? "") ? await d.chain.vaultAt(Number(idx)) : null;
  if (!v || !chat) return d.tg.answer(q.id, "That button is no longer valid.");
  // The chat must be the one the owner linked, on chain, for this vault.
  if ((await d.chain.notifyChat(v.vault)) !== chat) return d.tg.answer(q.id, "This chat isn't linked to that company.");
  if (!(await d.chain.isGuardian(v.vault))) {
    await d.tg.answer(q.id, "Telegram actions are off for this company.");
    return d.tg.send(chat, `To pause, block and reject from here, turn on <b>Telegram actions</b> for ${esc(v.name)} in Sluice.`, [[{ text: "Open Settings", url: app(d, "settings", v.vault) }]]);
  }
  try {
    let done = "";
    if (kind === "rj" && /^\d+$/.test(a ?? "") && /^\d+$/.test(b ?? "")) {
      const tx = await d.chain.reject(v.vault, Number(a), Number(b));
      done = `Rejected in ${v.name}. You can release it in Sluice if this was a mistake. ${tx}`;
    } else if (kind === "ps") {
      const tx = await d.chain.pause(v.vault);
      done = `${v.name} is paused: the agent can pay nothing until you resume in Sluice. ${tx}`;
    } else if (kind === "bk" && /^[0-9a-fA-F]{40}$/.test(a ?? "")) {
      const tx = await d.chain.block(v.vault, `0x${a}` as Address, `Blocked from Telegram by @${q.from.username ?? q.from.id}`);
      done = `Blocked 0x${a.slice(0, 4)}…${a.slice(-4)} in ${v.name}. ${tx}`;
    } else {
      return d.tg.answer(q.id, "Unknown action.");
    }
    await d.tg.answer(q.id, "Done");
    await d.tg.send(chat, esc(done));
  } catch (e) {
    await d.tg.answer(q.id, `The vault refused: ${String((e as Error).message ?? e).split("\n")[0].slice(0, 150)}`);
  }
}
