# Sluice Telegram bot

Alerts go to the right founder, and a founder can stop trouble from their phone.

| Command | What it does |
|---|---|
| `/balance` | What each linked company holds, its buffer, and whether it is paused |
| `/pending` | Payments waiting for the owner, each with **Approve in Sluice** and **Reject** |
| `/bills` | The bills Sluice may pay |
| `/pause` | Stops every agent payment (asks to confirm) |
| `/block 0x… reason` | Blocks a payee for good (asks to confirm) |
| `/vaults`, `/help` | Linked companies; help |

## Who can do what

- **Linking**: in Sluice, *Settings → Telegram → Connect Telegram* opens the bot. Its reply links back to Sluice, where the **owner signs** `setNotifyChat`. Only the vault's owner can link a chat, and only that chat can use the bot for that company.
- **Guardian actions**: if the owner turns on *Telegram actions* (`setGuardian` to the bot's address), the bot may **pause**, **block a payee** and **reject a proposal**, and nothing else. The vault refuses it anything that loosens the rules or moves money: unpause, unblock, approve, allow a payee, change a limit, withdraw. Those always open Sluice to sign in the owner's wallet.
- **Private chats only**: messages in groups are ignored.
- **If the bot's key were stolen**: someone could pause, block or reject (the owner undoes each in Sluice and turns Telegram actions off), but could not take any money. `contracts/test/attacks.test.js` checks exactly this.

The agent (GitHub Actions) sends each company's alerts to that company's linked chat; the operator's chat (`OPERATOR_TELEGRAM_CHAT_ID`) only gets operator alerts such as the agent's gas running low.

## Run on Railway

1. Create a bot with **@BotFather**; keep its token. Set its username in the website's `VITE_TELEGRAM_BOT`.
2. Create the bot's own key: `cd contracts && node scripts/new-agent-key.js ../bot.key` (any fresh key; it only ever acts as a guardian). Send its address a little tQDAY for gas, and set that address as the website's `VITE_BOT_GUARDIAN`.
3. In Railway: **New Project → Deploy from GitHub repo**, choose this repository, and set **Root Directory** to `bot`, **Build Command** to `npm run build` (bundles the bot into one file) and **Start Command** to `node --max-old-space-size=128 dist/main.mjs`. Plain Node with no compiler in memory: about a quarter of the memory of running the TypeScript directly. Set deployment overlap to 0 so the old and new copies never poll Telegram at once.
4. Add these variables in Railway:

| Variable | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | From @BotFather |
| `BOT_GUARDIAN_KEY` | The contents of `bot.key` |
| `SLUICE_FACTORY` | The deployed SluiceFactory address |
| `SLUICE_APP_URL` | Your dashboard's address |
| `SLUICE_FROM_BLOCK` | Optional, the factory's deployment block |

It long-polls Telegram, so it needs no public URL. Give the GitHub Actions agent the **same** `TELEGRAM_BOT_TOKEN`, so alert buttons reach this bot.

To use a webhook instead (for hosts that sleep), set `PORT` and `TELEGRAM_WEBHOOK_SECRET`, then register the URL with Telegram's `setWebhook` using that secret.

```bash
npm install
npm test
```
