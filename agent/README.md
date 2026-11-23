# Sluice agent

Settles the bills the owner listed on a SluiceVault, inside the vault's limits, and proposes the rest to the owner. One round per run; GitHub Actions runs it every 15 minutes (`.github/workflows/agent.yml`). No database, no server: the vault's own records are the agent's memory, so a round can never pay a bill period twice.

## A round

| Step | What happens | Where |
|---|---|---|
| Observe | Balance, cash buffer, the agent's session and 24h spend, every bill, past receipts | `src/chain.ts` |
| Forecast | The next 14 days, and the first day the balance would fall below the buffer | `forecast`, `firstShortfall` in `src/brain.ts` |
| Decide | Critical bills first, then oldest due. For each: ask the vault's `checkPayment`, then pay, propose, refuse, wait, or hold a bill that would break the cash buffer until it is due (never a critical one). A bill more than 25% above that payee's last three goes to the owner | `decide`, `workOrder`, `isSpike` |
| Review | Before paying alone: the injection guard, then Claude. Both can only make the decision stricter (pay → propose or refuse) | `src/guard.ts`, `src/review.ts` |
| Act | `pay(billId, period)` or `propose(billId, period, note)`, simulated first, then sent. Claude Haiku 5.5 writes the note from the agent's own facts (never bill or invoice text); a template if it can't | `src/loop.ts`, `src/explain.ts` |
| Alert | A Telegram message when a bill goes to the owner, a payment is refused, a shortfall is ahead, the session is about to expire, or a round fails. The agent's own gas running low (`SLUICE_MIN_GAS`, default 0.2 tQDAY) is the operator's concern, so that alert goes to `OPERATOR_TELEGRAM_CHAT_ID` (default: the same chat). Each situation is sent once | `src/notify.ts` |
| Learn | After three rising owner approvals for one payee, drafts a higher cap. The owner decides | `draftCap` |

Each round has a time limit (`SLUICE_ROUND_SECONDS`, default 420, inside the job's 10 minutes), and each vault at most 90 seconds; bills not reached wait for the next round, which the vault makes safe.

The vault re-checks everything on chain; the agent can only ever be stricter than the vault.

The agent keeps no database. To send each Telegram alert once, it remembers what it sent in `.sluice-alerts.json`, which the workflow keeps between runs with the GitHub Actions cache; losing it only means one repeated alert.

## Run it

```bash
npm install
npm test
```

Against a vault (Aevum Testnet by default):

```bash
SLUICE_VAULTS=0xYourVault AGENT_PRIVATE_KEY=0x... npm run dry-run
```

`npm run dry-run` decides everything and signs nothing. `npm run agent` acts. Set `ANTHROPIC_API_KEY` to turn on the Claude review; without it the guard and the vault's rules still apply.

### Local end-to-end

```bash
cd ../contracts && npx hardhat node
# second terminal
cd contracts && npx hardhat run scripts/local-demo.js --network localhost
cd ../agent && SLUICE_LOCAL=1 AEVUM_RPC_URL=http://127.0.0.1:8545 SLUICE_VAULTS=<vault from above> AGENT_PRIVATE_KEY=<Hardhat account #1 key> npm run agent
```

The demo company has five bills: Northwind (paid alone), Atlas Q4 (over the cap, proposed), Figma (payee not approved, proposed), a "new bank details" bill to a blocklisted address (refused), and an Atlas bill due in 10 days (left for later).

## Hosted schedule

In the GitHub repository, **Settings → Secrets and variables → Actions**:

| Kind | Name | Value |
|---|---|---|
| Secret | `AGENT_PRIVATE_KEY` | The agent's key: create it with `cd contracts && npm run agent:new-key`, then `gh secret set AGENT_PRIVATE_KEY < contracts/agent.key`. Hire it on your vaults with `npm run agent:rotate` or under Settings |
| Secret | `ANTHROPIC_API_KEY` | Optional, for the Claude review |
| Variable | `SLUICE_FACTORY` | Serve every vault the factory created whose current agent is this key, with a live session. New companies are picked up automatically |
| Variable | `SLUICE_VAULTS` | And/or a comma-separated list of vault addresses |
| Variable | `SLUICE_FROM_BLOCK` | Optional, the vault's deployment block |
| Secret | `TELEGRAM_BOT_TOKEN` | Optional, for alerts: create a bot with @BotFather |
| Secret | `TELEGRAM_CHAT_ID` | Optional, the chat to alert: message your bot, then read `chat.id` from `https://api.telegram.org/bot<token>/getUpdates` |
| Variable | `SLUICE_APP_URL` | Optional, the dashboard's address, linked from alerts |

Until `AGENT_PRIVATE_KEY` and either `SLUICE_FACTORY` or `SLUICE_VAULTS` are set, each scheduled run skips with a notice. Run it by hand from the **Actions** tab (`agent` → **Run workflow**), with **dry run** ticked to sign nothing. The agent's address needs a little tQDAY for gas.
