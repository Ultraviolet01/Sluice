# Sluice web

The landing page and the owner's dashboard. Vite, React and viem; no backend except one stateless function for invoice reading.

## What it does

| Page | Reads | Owner can sign |
|---|---|---|
| Overview | Balance, 14-day forecast against the cash buffer, what waits for you, the agent's recent decisions, upcoming bills, active rules | List a bill |
| Approvals | Every proposal the agent filed, why the vault sent it to you, and the policy checks | `approve`, `reject`, and `releaseBill` to reopen a bill rejected by mistake |
| Activity | Every receipt and rule change from the vault's events, with transaction links; CSV export | |
| Rules | Caps, threshold, buffer, payees, bills | `setApprovalThreshold`, `setCashBuffer`, `setPayeeAllowed`, `setPayeeBlocked`, `addBill`, `cancelBill`, `pause` / `unpause` |
| Wallets | The vault, deposit address, each bill over the next 14 days with the balance after it | `withdraw`, deposit |
| Settings | The agent's session; the vault's owner and any pending offer | `grantSession`, `revokeSession`, `transferOwnership` (offer or cancel); the offered owner gets an Accept banner (`acceptOwnership`) |

Every action is simulated first (a refusal shows the vault's reason and costs nothing), then signed in the owner's wallet. Anyone can view a vault; only its owner can sign.

## First visit

With `VITE_FACTORY_ADDRESS` set, `#/app` works like a bank app's first run: **Connect your wallet to open your treasury**, then **Name your first company** (one signature creates the vault, a second hires the agent), and from then on it opens your company directly, or lets you choose between several. A returning visitor whose wallet already approved the site is signed in without a prompt. The demo company stays one click away (`#/app/overview?demo=1`).

A founder whose own wallet is low on tQDAY (under 0.05, a few signatures' worth) sees a banner with a faucet link. The hosted agent's gas is the operator's job and is not shown to founders.

## Run

```bash
npm install
npm run dev
```

With no vault configured it shows demo data. To show a live vault on Aevum Testnet, open `#/app/overview?vault=0xYourVault`, or set these at build time:

| Variable | Meaning |
|---|---|
| `VITE_VAULT_ADDRESS` | The vault to show by default |
| `VITE_FROM_BLOCK` | The vault's deployment block, so the app reads events from there |
| `VITE_COMPANY_NAME` | The name in the sidebar (vaults made by the factory use their own name) |
| `VITE_FACTORY_ADDRESS` | Turns on **Create a company** and the company switcher |
| `VITE_AGENT_ADDRESS` | The hosted agent's address: filled in under Settings, and offered when a company is created |
| `VITE_RPC_URL` | Optional; default `https://rpc-test.qday.info` |

## Invoice reading

`api/read-invoice.ts` takes a PDF or photo, asks Claude to fill in a draft bill (vendor, payment address, amount, due date), and returns it for the owner to check before signing. It stores nothing and rate-limits each visitor. It is a standard `Request` / `Response` handler, so it runs as a Vercel Function (no Blob or other storage needed) or on any Fetch-API host. Set `ANTHROPIC_API_KEY` there. Without it the form still works by hand.

```bash
npm test
```
