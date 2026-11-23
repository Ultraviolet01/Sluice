# Sluice

A metered gate for company money. Sluice is a stablecoin vault on **QDay Aevum Testnet** that lets an AI agent pay invoices in **tUSD8**, but only through on-chain limits the company sets and can revoke at any time.

Built for Aevum Builder Challenge #1 (Native AI Assistants / Invoice Payments).

> Design lineage: the treasury-agent concept follows the author's earlier project Keel (NEAR). Sluice is a new implementation for EVM/Aevum; all code here was written during the build window.

## Why
Letting an AI agent touch company funds is only acceptable if the agent *cannot* overspend, pay the wrong party, or keep acting after you pull the plug, even when its model is wrong or prompt-injected. Sluice puts those rules in the contract, not in the prompt.

## Guardrails (enforced on-chain)
| Control | How |
|---|---|
| Bills only | The owner lists each bill (`addBill`: payee, amount, first due date, repeat every N days). The agent's `pay(billId, period)` takes no payee and no amount, so even a stolen agent key can only pay the owner's own bills |
| Once per period | Each bill period settles at most once; a period can't be paid more than 3 days before it is due |
| Scoped session keys | Each agent gets a per-payment cap, a rolling 24h cap and an expiry (`grantSession`) |
| Instant revocation | `revokeSession(agent)`; `pause()` halts every agent payment |
| Payee allowlist + blocklist | Bills to payees not on the allowlist need the owner; the blocklist always wins, even on owner approval |
| Human approval | Bills outside the agent's limits are proposed (`propose`, with a note) and wait for `approve` or `reject` |
| Cash buffer | No agent payment may drop the vault below `cashBuffer` |
| Ask first | `checkPayment(agent, billId, period)` says whether a payment runs alone, needs approval or is blocked, and why |
| Receipts and audit trail | `BillPaid` for every settlement, `PaymentProposed` / `PaymentRejected`, and `PolicyChanged` with old and new values |
| Ownership | `Ownable2Step`; the owner can always withdraw |

Attack suite: `contracts/test/attacks.test.js` signs with the agent's key and tries 20 ways to move money or change rules; all are refused.

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
- `agent/` – the agent: observe, forecast, decide, Claude review (stricter only), act, learn. Runs every 15 minutes on GitHub Actions. See `agent/README.md`
- `web/` – landing page and the owner's dashboard (Vite, React, viem). Reads the vault live from Aevum; the owner signs in MetaMask. `web/api/read-invoice.ts` drafts a bill from an invoice with Claude and stores nothing. See `web/README.md`

## Roadmap
- Confirmation of Payee via ERC-8004 (if a registry is available on Aevum)

## Dependencies
- viem (MIT), @anthropic-ai/sdk (MIT), tsx (MIT) for the agent
- OpenZeppelin Contracts 5.1 (MIT)
- Hardhat (MIT), ethers v6 (MIT), chai (MIT)

## License
MIT
