# How Sluice meets the judging criteria

[Back to the README](../README.md)

Criteria and weights from the Aevum Builder Challenge #1 starter guide.

| Criterion (weight) | What the guide asks | Where Sluice does it |
|---|---|---|
| **Innovation and originality (20)** | "Creative, non-trivial use of autonomous agents and agentic payment mechanisms" | An agent that can pay only owner-listed bills by number, so its key is useless for anything else. Plain rules decide; Claude can only make a decision stricter. The agent also holds a bill that would break the cash buffer until it is due (critical bills like payroll never wait), writes each proposal's reason in plain English with Claude Haiku 5.5, and learns: after three rising approvals for one payee it drafts a higher cap, which only the owner can apply. [agent/README.md](../agent/README.md) |
| **Safety, trust and controls (15)** | "Least-privilege sessions, budget caps, secure key storage, injection protection. Transparent audit trails, verifiable receipts, easy revocation/approval controls" | Session keys with a per-payment cap, a rolling 24h cap and an expiry; allowlist and blocklist; cash buffer; one-click pause and revoke; Telegram alerts when something needs the owner; an injection guard before the model; on-chain receipts for every payment, and every rule change logged with the owner's reason; 24 stolen-key attacks refused, plus randomised tests that run thousands of generated cases. [SECURITY.md](SECURITY.md) |
| **Technical quality and platform integration (15)** | "Smart accounts, scoped sessions, budgets, and expiry. Robust, clean, well-tested code that handles retries, idempotency, and async failures" | The vault and its settlements live on Aevum Testnet in tUSD8. Idempotency is in the contract (each bill period settles once), so a retried round never double-pays. The agent is stateless and simulates before sending. 54 contract tests (including randomised operation sequences), 42 agent tests (including 2,000-case randomised checks of the decision rules, the review and the injection guard) and 7 web tests run in CI on every push |
| **Real-world utility and market potential (15)** | "A validated problem for a clear audience. Fit with merchant/agent workflows, a viable path to mainnet" | For small and mid-size companies without a treasury team: bills paid on time, shortfalls forecast 14 days ahead, and fake "new bank details" invoices refused. See the roadmap below |
| **User experience and presentation (15)** | "Intuitive UI, rapid onboarding, clear status and error feedback" | Owner dashboard: Overview, Approvals with the policy checks spelled out, Activity with receipts and CSV, Rules, Wallets with a 14-day forecast, Settings. Every action is simulated first and shows the vault's reason if it would fail. Anyone can create their company's vault in one signature (factory). Invoice upload drafts a bill; bulk import lists up to 50 bills in one signature. [web/README.md](../web/README.md) |
| **Demo (10)** | "Reliable, reproducible testnet demo showing live on-chain activity and agent execution. Core flow and edge/failure handling" | The demo company's five bills cover every path: paid alone, over the cap, new payee, blocklisted "new bank details" scam, not yet due. [Demo script](DEMO.md) |
| **Documentation (10)** | "Complete README with setup steps, architecture diagrams, API references. Platform integrations, assumptions, limitations, roadmap" | [README](../README.md) with the architecture diagram, [SECURITY.md](SECURITY.md), [agent/README.md](../agent/README.md), [web/README.md](../web/README.md), and known limits |

## Submission checklist (from the starter guide)

| Item | Status |
|---|---|
| Public GitHub repository | Make the repository public before submitting |
| Evidence of Aevum integration | The vault deploys to Aevum Testnet (chain 44005) and pays in tUSD8 `0x4565…3483`. Add the vault address and explorer links after deploying |
| Live deployment | Dashboard (`web/`) plus the agent on GitHub Actions. Add the hosted link |
| Project documentation | This folder and the READMEs |
| No keys or `.env` in the repository or history | `.env` is in `.gitignore`; no key has ever been committed |
| README lets a stranger run it | `npm run verify` at the root, then the steps in the README |
| Deployed on the official testnet | Pending deployment |
| Demo video without login | To record |
| Every team member listed and registered | On DoraHacks |

## Roadmap to mainnet

1. **Per-payee caps** on chain, so a cap draft the agent suggests can be applied to one payee instead of the whole session.
2. **Confirmation of Payee** through an ERC-8004 identity registry, if one is live on Aevum, so a payee's address is checked against a verified identity before the first payment.
3. **Multisig owner**: a Safe as the vault's owner, so approvals take more than one signature.
4. **Account abstraction**: gas paid in tUSD8 through an ERC-4337 paymaster, if Aevum runs a bundler.
5. **Paying a payee on another chain** through the QDay Bridge, once its contracts and supported tokens are published (today it links QDay Origin testnet and Aevum testnet, with no public contract addresses). The bill would name the destination chain and the payee's address there; the vault's limits and the owner's approval still apply on Aevum before anything leaves, and the agent never chooses the chain or the address.
6. **Audit** of the vault before any mainnet money.
