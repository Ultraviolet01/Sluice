// Telegram for one vault: alerts to the owner's own chat, and, if the owner turns
// them on, pause / block / reject from Telegram through the bot's guardian key,
// which can only ever make the vault stricter.
import { useApp } from "../state.tsx";
import { BOT_GUARDIAN, TELEGRAM_BOT, short } from "../chain.ts";

const ZERO = "0x0000000000000000000000000000000000000000";

/** ?tgchat=…&tgname=… arrive from the bot's "Link this chat" button. */
function linkRequest(): { chat: string; name: string } | null {
  const q = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
  const chat = q.get("tgchat") ?? "";
  return /^-?\d{1,20}$/.test(chat) ? { chat, name: (q.get("tgname") ?? "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 32) } : null;
}

export function TelegramCard() {
  const { model: m, act, busy } = useApp();
  if (!m) return null;
  const req = linkRequest();
  const linked = Boolean(m.notifyChat);
  const actionsOn = Boolean(m.guardian && BOT_GUARDIAN && m.guardian.toLowerCase() === BOT_GUARDIAN.toLowerCase());
  const startUrl = TELEGRAM_BOT ? `https://t.me/${TELEGRAM_BOT}?start=${m.vault.slice(2)}` : "";

  const link = (chat: string) =>
    act(chat ? "Linked Telegram alerts" : "Unlinked Telegram alerts", { fn: "setNotifyChat", args: [chat] }, (mm) => ({ ...mm, notifyChat: chat })).then((ok) => {
      if (ok && req) window.location.hash = window.location.hash.replace(/&tgchat=[^&]*/, "").replace(/&tgname=[^&]*/, "");
    });
  const setActions = (on: boolean) =>
    act(on ? "Turned on Telegram actions" : "Turned off Telegram actions", (reason) => ({ fn: "setGuardian", args: [on ? (BOT_GUARDIAN as `0x${string}`) : ZERO, reason] }), (mm) => ({ ...mm, guardian: on ? (BOT_GUARDIAN as `0x${string}`) : null }), on ? "Pause, block and reject from my phone" : "No longer needed");

  return (
    <section className="card tg">
      <div className="row-between">
        <div className="grow">
          <p className="card-title">Telegram</p>
          <p className="card-sub">Alerts in your own chat, and one-tap pause, block and reject from your phone.</p>
        </div>
        <span className={`pill ${linked ? "pill-settled" : "pill-neutral"}`}>{linked ? "Linked" : "Not linked"}</span>
      </div>

      {req && req.chat !== m.notifyChat && (
        <div className="tg-confirm">
          <div className="grow">
            <p className="t14">Send this company's alerts to {req.name ? <b>@{req.name}</b> : "this Telegram chat"}?</p>
            <p className="muted xs">Only link a chat you opened yourself from Sluice's bot. Whoever has it sees this company's alerts{actionsOn ? " and can pause, block and reject" : ""}.</p>
          </div>
          <button className="btn btn-primary ac-sm" disabled={!!busy} onClick={() => link(req.chat)}>Link and sign</button>
        </div>
      )}

      <div className="tg-steps">
        <div className="tg-step">
          <span className={`gs-dot${linked ? " on" : ""}`}>{linked ? "✓" : "1"}</span>
          <div className="grow">
            <p className="t14">Alerts in your chat</p>
            <p className="muted xs">Payments waiting for you (with Approve and Reject), refusals, shortfalls ahead and an expiring agent session.</p>
          </div>
          {linked ? (
            <button className="btn btn-ghost ac-sm" disabled={!!busy} onClick={() => link("")}>Unlink</button>
          ) : startUrl ? (
            <a className="btn btn-primary ac-sm" href={startUrl} target="_blank" rel="noreferrer">Connect Telegram</a>
          ) : (
            <span className="faint xs">No bot on this site yet</span>
          )}
        </div>
        <div className="tg-step">
          <span className={`gs-dot${actionsOn ? " on" : ""}`}>{actionsOn ? "✓" : "2"}</span>
          <div className="grow">
            <p className="t14">Telegram actions</p>
            <p className="muted xs">
              Lets the bot pause payments, block a payee and reject a proposal for you. It can never unpause, unblock, approve, change a limit or move money; those always need your wallet.
              {m.guardian && !actionsOn ? ` Another key is guardian now: ${short(m.guardian)}.` : ""}
            </p>
          </div>
          {actionsOn ? (
            <button className="btn btn-ghost ac-sm" disabled={!!busy} onClick={() => setActions(false)}>Turn off</button>
          ) : (
            <button className="btn btn-secondary ac-sm" disabled={!BOT_GUARDIAN || !linked || !!busy} title={!linked ? "Link alerts first" : undefined} onClick={() => setActions(true)}>Turn on</button>
          )}
        </div>
      </div>
    </section>
  );
}
