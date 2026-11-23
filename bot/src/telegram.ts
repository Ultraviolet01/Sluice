// The few Telegram Bot API calls the bot uses. https://core.telegram.org/bots/api

export interface Button {
  text: string;
  url?: string;
  callback_data?: string;
}

export interface Update {
  update_id: number;
  message?: { message_id: number; chat: { id: number; type: string }; from?: { id: number; username?: string; first_name?: string }; text?: string };
  callback_query?: {
    id: string;
    from: { id: number; username?: string };
    data?: string;
    message?: { message_id: number; chat: { id: number } };
  };
}

export interface Telegram {
  send(chatId: number | string, text: string, buttons?: Button[][]): Promise<void>;
  answer(callbackId: string, text: string): Promise<void>;
  updates(offset: number, timeoutSec: number): Promise<Update[]>;
  me(): Promise<{ username: string }>;
}

export function telegram(token: string, fetcher: typeof fetch = fetch): Telegram {
  const call = async <T,>(method: string, body: unknown): Promise<T> => {
    // Never wait forever: a long poll is held up to its own timeout, everything else 15 s.
    const wait = method === "getUpdates" ? ((body as { timeout?: number }).timeout ?? 0) * 1000 + 10_000 : 15_000;
    const r = await fetcher(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(wait),
    });
    const j = (await r.json()) as { ok: boolean; result: T; description?: string };
    if (!j.ok) throw new Error(`Telegram ${method}: ${j.description ?? r.status}`);
    return j.result;
  };
  return {
    async send(chatId, text, buttons) {
      await call("sendMessage", {
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
      });
    },
    async answer(callbackId, text) {
      await call("answerCallbackQuery", { callback_query_id: callbackId, text: text.slice(0, 190), show_alert: text.length > 60 });
    },
    updates: (offset, timeoutSec) => call<Update[]>("getUpdates", { offset, timeout: timeoutSec, allowed_updates: ["message", "callback_query"] }),
    me: () => call<{ username: string }>("getMe", {}),
  };
}

/** Escapes text for Telegram's HTML mode. */
export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
