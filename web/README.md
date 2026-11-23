# Sluice web

The landing page and the owner's dashboard. Vite, React and viem; no backend except one stateless function for invoice reading.

## What it does

| Page | Reads | Owner can sign |
|---|---|---|
| Overview | Balance, 14-day forecast against the cash buffer, what waits for you, the agent's recent decisions, upcoming bills, active rules | List a bill |
| Approvals | Every proposal the agent filed, why the vault sent it to you, and the policy checks | `approve`, `reject` |
| Activity | Every receipt and rule change from the vault's events, with transaction links; CSV export | |
| Rules | Caps, threshold, buffer, payees, bills | `setApprovalThreshold`, `setCashBuffer`, `setPayeeAllowed`, `setPayeeBlocked`, `addBill`, `cancelBill`, `pause` / `unpause` |
| Wallets | The vault, deposit address, each bill over the next 14 days with the balance after it | `withdraw` |
| Settings | The agent's session | `grantSession`, `revokeSession` |

Every action is simulated first (a refusal shows the vault's reason and costs nothing), then signed in the owner's wallet. Anyone can view a vault; only its owner can sign.

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
