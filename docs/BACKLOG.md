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
| 6 | Demo company on testnet | A script like `contracts/scripts/local-demo.js` for Aevum: payees, the five demo bills (one paid, two proposed, one blocklisted scam, one later), funded with faucet tUSD8 | — |
| 7 | Live attack run | The 22 stolen-key attacks from `contracts/test/attacks.test.js`, run against the deployed vault with real transactions, each refusal recorded | — |
| 8 | Proposal flood check | A stolen key files as many proposals as it can; confirm they stay bounded by the owner's listed bills and the owner can still act | — |
| 9 | `docs/VERIFIED.md` | Every claim checked on Aevum, each with its transaction link: deploy, factory sign-up, a bill paid alone, one approved, one refused, a rotated key refused, a Telegram alert received | — |
| 10 | Narrated demo | `npm run demo` in `agent/`: one round explained step by step against the testnet demo company, for the video | — |
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
