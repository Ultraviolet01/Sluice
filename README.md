# Sluice

A metered gate for company money. Sluice is a stablecoin vault on **QDay Aevum Testnet** that lets an AI agent pay invoices in **tUSD8**, but only through on-chain limits the company sets and can revoke at any time.

Built for Aevum Builder Challenge #1 (Native AI Assistants / Invoice Payments).

> Design lineage: the treasury-agent concept follows the author's earlier project Keel (NEAR). Sluice is a new implementation for EVM/Aevum; all code here was written during the build window.

## Why
Letting an AI agent touch company funds is only acceptable if the agent *cannot* overspend, pay the wrong party, or keep acting after you pull the plug, even when its model is wrong or prompt-injected. Sluice puts those rules in the contract, not in the prompt.

## Guardrails (enforced on-chain)
| Control | How |
|---|---|
| Scoped session keys | Each agent address gets a session with a per-payment cap, a 24h budget and an expiry |
| Instant revocation | `revokeSession(agent)`; `pause()` halts all agent payments |
| Payee allowlist + blocklist | Agent can only pay allowlisted payees; blocklist always wins, even on owner approval |
| Human approval | Payments above `approvalThreshold` are queued (`PaymentQueued`) until the owner calls `approve` or `reject` |
| Cash buffer | No payment may drop the vault below `cashBuffer` |
| Idempotency | Every payment carries an `invoiceId`; an id can settle at most once, so retries never double-pay |
| Receipts | `InvoicePaid(invoiceId, payee, amount, agent, memoHash, ownerApproved)` for every settlement |
| Ownership | `Ownable2Step`; owner can always withdraw |

## Network
| | |
|---|---|
| Chain | QDay Aevum Testnet, chain ID `44005` |
| RPC | `https://rpc-test.qday.info` |
| Explorer | https://explorer-test.qday.info/ |
| tUSD8 | `0x456569838f1d43009A91ebA4263147Afd7233483` (6 decimals: `1 tUSD8 = 1_000_000`) |
| Faucet | https://faucet.qday.info/en |

## Run it
```bash
cd contracts
npm install --legacy-peer-deps
npm test
```

Deploy (needs tQDAY for gas):
```bash
cp .env.example .env   # fill DEPLOYER_PRIVATE_KEY; .env is gitignored
npm run deploy
```

## Repo layout
- `contracts/` – `SluiceVault.sol`, tests, deploy script (Hardhat)
- `agent/` – AI agent (coming)
- `web/` – dashboard (coming)

## Roadmap
- Agent service: invoice parsing → proposed payment → `pay()` within limits
- Dashboard: sessions, budgets, approval queue, receipts
- Confirmation of Payee via ERC-8004 (if a registry is available on Aevum)

## Dependencies
- OpenZeppelin Contracts 5.1 (MIT)
- Hardhat (MIT), ethers v6 (MIT), chai (MIT)

## License
MIT
