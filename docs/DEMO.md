# Demo script (3 to 5 minutes)

[Back to the README](../README.md)

For the finalists' live call and the recorded video. Everything below runs on Aevum Testnet. Replace `<vault>` with the deployed vault.

## Before the call

- The vault is funded with tUSD8, and the agent's address has some tQDAY for gas.
- The demo company is set up with `cd contracts && npm run demo:setup -- --network aevumTestnet`: Northwind Hosting 1 tUSD8 (approved payee), Atlas Freight 4 (over the 3 cap), Figma 0.50 (payee not approved), "Northwind Hosting, new bank details" 2 (blocklisted address), Contractor payroll 2 (critical, due in 10 days).
- MetaMask is on Aevum with the owner's account.
- The dashboard is open at `#/app/overview?vault=<vault>`.

## Script

| Time | Show | Say |
|---|---|---|
| 0:00 | Landing page | Small companies pay bills by hand, and fake "we changed our bank details" invoices cost US businesses about $3 billion in 2025. Sluice lets an AI agent pay the bills, but it can't spend past the line the owner set. |
| 0:30 | Rules page: bills, payees, limits | The owner lists each bill. The agent's key can only pay a listed bill by its number: no payee or amount of its own. Caps, a rolling 24-hour budget, a cash buffer, an allowlist and a blocklist live in the contract. |
| 1:15 | Terminal: `cd agent && npm run demo` (or GitHub Actions → `agent` → Run workflow) | Every 15 minutes the agent runs one round. Here's one, told step by step. |
| 1:45 | The round's output | Northwind paid alone, inside every limit. Atlas proposed: over the cap, with a plain-English reason. Figma proposed: new payee. The "new bank details" bill refused: blocklisted. Payroll left for later. Each line links to its transaction on the Aevum explorer, and Telegram pings the owner. |
| 2:30 | Approvals page | What waits for the owner, why the vault sent it, and the five policy checks. Approve Atlas in MetaMask. |
| 3:00 | Activity page | Every payment and rule change with its receipt on chain. |
| 3:20 | Edge case: Settings → Revoke now, then run the agent again | With the session revoked, the agent can do nothing. The vault, not the agent, enforces it. |
| 3:50 | `npm run attacks -- --network aevumTestnet` output, or docs/VERIFIED.md | A stolen agent key against the live vault: every attempt refused, with the vault's own reason. |
| 4:15 | Close | Aevum, tUSD8, a contract-enforced line, and an agent that can only be more careful than its rules. |

## If something fails live

- The agent run is slow: show the last scheduled run's log instead.
- MetaMask won't connect: the dashboard still reads everything; show the approval in the explorer.
