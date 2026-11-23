# Demo script (3 to 5 minutes)

[Back to the README](../README.md)

For the finalists' live call and the recorded video. Everything below runs on Aevum Testnet. Replace `<vault>` with the deployed vault.

## Before the call

- The vault is funded with tUSD8, and the agent's address has some tQDAY for gas.
- The five demo bills are listed (as in `contracts/scripts/local-demo.js`): Northwind Hosting 80 (approved payee), Atlas Freight Q4 800 (over the cap), Figma 45 (payee not approved), "Northwind Hosting, new bank details" 950 (blocklisted address), Atlas December 120 (due in 10 days).
- MetaMask is on Aevum with the owner's account.
- The dashboard is open at `#/app/overview?vault=<vault>`.

## Script

| Time | Show | Say |
|---|---|---|
| 0:00 | Landing page | Small companies pay bills by hand, and fake "we changed our bank details" invoices cost US businesses about $3 billion in 2025. Sluice lets an AI agent pay the bills, but it can't spend past the line the owner set. |
| 0:30 | Rules page: bills, payees, limits | The owner lists each bill. The agent's key can only pay a listed bill by its number: no payee or amount of its own. Caps, a rolling 24-hour budget, a cash buffer, an allowlist and a blocklist live in the contract. |
| 1:15 | GitHub Actions → `agent` → Run workflow | Every 15 minutes the agent runs one round. Here's one now. |
| 1:45 | The run's log | Northwind paid alone, inside every limit. Atlas proposed: over the cap. Figma proposed: new payee. The "new bank details" bill refused: blocklisted. December left for later. Each line links to its transaction on the Aevum explorer. |
| 2:30 | Approvals page | What waits for the owner, why the vault sent it, and the five policy checks. Approve Atlas in MetaMask. |
| 3:00 | Activity page | Every payment and rule change with its receipt on chain. |
| 3:20 | Edge case: Settings → Revoke now, then run the agent again | With the session revoked, the agent can do nothing. The vault, not the agent, enforces it. |
| 3:50 | `contracts/test/attacks.test.js` output | 22 attacks with a stolen agent key, all refused. |
| 4:15 | Close | Aevum, tUSD8, a contract-enforced line, and an agent that can only be more careful than its rules. |

## If something fails live

- The agent run is slow: show the last scheduled run's log instead.
- MetaMask won't connect: the dashboard still reads everything; show the approval in the explorer.
