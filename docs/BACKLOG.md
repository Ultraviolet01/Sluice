# Backlog

[Back to the README](../README.md)

Everything not yet in Sluice, in the order we plan to do it. Updated as items land.

## Do at deployment (needs the contracts live on Aevum)

| # | Item | What it involves | Needs from the owner |
|---|---|---|---|
| 1 | Deploy the vault and the factory | `cd contracts && npm run deploy` prints both addresses; check them on the explorer | tQDAY for the deploy wallet; the owner's MetaMask address |
| 2 | Agent key | Generate the agent's key; send its address a little tQDAY; set `AGENT_PRIVATE_KEY` in GitHub Actions secrets | Add the secret in GitHub settings |
| 3 | Agent schedule | Set `SLUICE_FACTORY` (and/or `SLUICE_VAULTS`), `SLUICE_FROM_BLOCK`, `SLUICE_APP_URL` as Actions variables; merge to `main` (schedules run only from the default branch); make the repository public | Merge, visibility |
| 4 | Claude and Telegram | `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` as Actions secrets; `ANTHROPIC_API_KEY` on the web host for the invoice reader | The keys, entered in settings (never in chat) |
| 5 | Point the website at Aevum | Build with `VITE_FACTORY_ADDRESS`, `VITE_AGENT_ADDRESS`, `VITE_VAULT_ADDRESS`, `VITE_FROM_BLOCK`; choose a host | Where to host |
| 6 | Demo company on testnet | **Script ready**: `cd contracts && npm run demo:setup -- --network aevumTestnet` creates it through the factory: payees, the five demo bills, the agent's session, 20 tUSD8 | Faucet tUSD8 in the deploy wallet |
| 7 | Live attack run | **Script ready**: `npm run attacks -- --network aevumTestnet`: 30 checks against the demo company, refusals plus real allowed transactions (30/30 locally) | Agent key with a little tQDAY |
| 8 | Proposal flood check | **Script ready**: `npm run flood -- --network aevumTestnet` (locally: 1 accepted, 200 refused, owner unaffected) | — |
| 9 | `docs/VERIFIED.md` | **Generator ready**: `node scripts/verified.mjs` writes it from the records of steps 1, 6, 7 and 8, with explorer links. Add by hand: an Actions run log, a Telegram alert, a dashboard sign-up | — |
| 10 | Narrated demo | **Script ready**: `cd agent && npm run demo` tells one round step by step on the demo company (`-- --dry-run` signs nothing) | Agent key |
| 11 | Key scripts | `new-agent-key` (generate) and `rotate-agent-key` (grant the new key on each vault; the old one stops at once) | — |
| 12 | Demo video | Record with `docs/DEMO.md`; link it without a login | Recording |
| 13 | Submission checklist | Fill the open rows in `docs/JUDGING.md`: vault and factory addresses, explorer links, hosted app link, video | — |

## Optional, if time allows

| Item | What it adds | Size |
|---|---|---|
| Named payees on chain | `addPayee(address, name, kind)` so a payee has a name before it has a bill | Small |
| Bill categories | Rent, payroll, software… for grouping and reports | Small |
| Dark mode | A theme toggle on the dashboard | Small |
| Calendar months and years | Monthly bills on the same date each month instead of every 30 days | Medium |
| Excel export | A workbook with summary, activity, bills and ledger sheets (CSV exists) | Medium |

## Roadmap to mainnet

See [JUDGING.md](JUDGING.md#roadmap-to-mainnet): per-payee caps, Confirmation of Payee through an ERC-8004 registry, a Safe multisig owner, gas in tUSD8 through an ERC-4337 paymaster, an audit.

## Not planned

NEAR-only features with no Aevum equivalent: Rhea lending for idle cash, NEAR Intents and Chain Signatures, NEAR AI's TEE-attested answers, Sputnik DAO ownership.
