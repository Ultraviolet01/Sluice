# Security

[Back to the README](../README.md)

Sluice lets an AI agent pay a company's bills without handing it the company's money. The rules live in the vault contract, not in the agent's prompt, so they hold even if the agent's model is wrong, its prompt is injected, or its key is stolen. Each claim below links to the line that enforces it.

## Who can do what

| Action | Owner | Agent (session key) | Anyone else |
|---|---|---|---|
| List or cancel bills ([`addBill`](../contracts/contracts/SluiceVault.sol#L197)) | Yes | No | No |
| Approve or reject a proposal ([`approve`](../contracts/contracts/SluiceVault.sol#L226), [`reject`](../contracts/contracts/SluiceVault.sol#L237)) | Yes | No | No |
| Set caps, buffer, threshold, payee lists | Yes | No | No |
| Grant or revoke the agent's session ([`grantSession`](../contracts/contracts/SluiceVault.sol#L161), [`revokeSession`](../contracts/contracts/SluiceVault.sol#L169)) | Yes | No | No |
| Pause and resume ([`pause`](../contracts/contracts/SluiceVault.sol#L244)) | Yes | No | No |
| Withdraw ([`withdraw`](../contracts/contracts/SluiceVault.sol#L253)) | Yes, always, even paused | No | No |
| Settle a listed bill period inside the limits ([`pay`](../contracts/contracts/SluiceVault.sol#L263)) | — | Yes | No |
| File a bill period for the owner ([`propose`](../contracts/contracts/SluiceVault.sol#L276)) | — | Yes | No |
| Read anything ([`checkPayment`](../contracts/contracts/SluiceVault.sol#L287), views, events) | Yes | Yes | Yes |

Ownership moves in two steps (offer, then accept) through OpenZeppelin's `Ownable2Step` ([line 19](../contracts/contracts/SluiceVault.sol#L19)), so a typo can't hand the vault to the wrong address.

## What protects the money

| Protection | How it works | Enforced at |
|---|---|---|
| Bills only | `pay(billId, period)` takes no payee and no amount. The vault pays the bill's own payee the bill's own amount, and only the owner can list a bill | [`pay`](../contracts/contracts/SluiceVault.sol#L263), [`addBill`](../contracts/contracts/SluiceVault.sol#L197) |
| Once per period | Each bill period is settled at most once; a rejected one stays closed until the owner releases it | [L298](../contracts/contracts/SluiceVault.sol#L298), [`releaseBill`](../contracts/contracts/SluiceVault.sol#L217) |
| Not early | A period can't be settled more than 3 days before it is due | [L296](../contracts/contracts/SluiceVault.sol#L296) |
| Blocklist wins | A blocked payee is refused, for the agent and for owner approval alike | [L300](../contracts/contracts/SluiceVault.sol#L300), [L231](../contracts/contracts/SluiceVault.sol#L231) |
| Approved payees | A payee not on the allowlist always goes to the owner | `checkPayment` |
| Per-payment cap | Larger bills go to the owner | `checkPayment` |
| Rolling 24-hour cap | Sums the agent's own payments over the last 24 hours, not a calendar day, so it can't be gamed at midnight | [L305](../contracts/contracts/SluiceVault.sol#L305), [`spentInWindow`](../contracts/contracts/SluiceVault.sol#L317) |
| Payment ring | At most 32 agent payments in 24 hours; the 33rd is refused rather than overwriting the record the cap relies on | [`_recordSpend`](../contracts/contracts/SluiceVault.sol#L345) |
| Cash buffer | No agent payment may leave the vault below the owner's buffer | [L307](../contracts/contracts/SluiceVault.sol#L307) |
| Session expiry and revocation | The agent's key works only until its session expires, and stops the moment the owner revokes it | `checkPayment`, [`revokeSession`](../contracts/contracts/SluiceVault.sol#L169) |
| Pause | Halts every agent payment at once; the owner can still withdraw | [`pause`](../contracts/contracts/SluiceVault.sol#L244) |
| No allowances | The vault never approves token allowances, so nothing can pull tUSD8 out with `transferFrom` | whole contract |
| Re-entrancy | Every function that moves tokens is `nonReentrant` | OpenZeppelin `ReentrancyGuard` |
| Audit trail | `BillPaid` for every settlement, `PaymentProposed` / `PaymentRejected`, `PolicyChanged` with old and new values, session and payee events | events at the top of the contract |

## If the agent's key is stolen

`contracts/test/attacks.test.js` signs as the agent and tries 20 attacks. All are refused:

| The thief tries to | The vault answers |
|---|---|
| Grant itself a bigger session, allowlist itself, unblock a payee, list a bill to itself, change the buffer or threshold, unpause, take ownership, cancel or release bills | `OwnableUnauthorizedAccount` |
| Approve its own proposal or withdraw | `OwnableUnauthorizedAccount` |
| Pay a bill nobody listed | `NotAgentPayable(NoSuchBill)` |
| Send a bill to another address or for another amount | Impossible: `pay` has no payee or amount parameter |
| Pay a bill twice, or future periods early | `AlreadySettled` / `NotDueYet` |
| Drain the vault with many small payments | Refused once the rolling 24-hour cap is reached |
| Pay a blocklisted payee, alone or by proposal | `Blocklisted` |
| Act after revocation, expiry or pause | `NoSession` / `SessionExpired` / `Paused` |
| Pull tokens with `transferFrom` | No allowance exists |

The worst a stolen key can do is pay the owner's own listed bills, to their own payees, at their listed amounts, inside the caps, at most 3 days early. The owner revokes the session and nothing else changes.

## The agent: stricter than the vault, never looser

The agent decides in plain code before any model is involved ([`decide`](../agent/src/brain.ts#L160)), starting from the vault's own answer (`checkPayment`). It never pays what the vault says needs approval or is blocked; a unit test checks that for every reason code.

On top of the vault's rules it adds caution:

| Check | What it does | Where |
|---|---|---|
| Spike | A bill more than 25% above that payee's last three goes to the owner | [`isSpike`](../agent/src/brain.ts#L142) |
| Injection guard | Plain code reads bill names and invoice text before any model does, and sends the payment to the owner if they try to instruct the reviewer ("ignore previous instructions", "pre-approved", "answer ok", fake JSON verdicts). Obfuscation is undone first: lookalike letters from other scripts, fullwidth forms, leetspeak, dotted letters, and instructions split across two fields | [`guard.ts`](../agent/src/guard.ts#L29), [`anySteers`](../agent/src/guard.ts#L58) |
| Claude review | Claude Haiku 5.5 looks at a payment the agent would make alone: lookalike payees, odd amounts, pressure in the invoice text. Outside text is fenced in `<untrusted>` tags it can't close, and the answer must match a fixed JSON schema | [`review.ts`](../agent/src/review.ts#L115) |
| Stricter only | A review can turn a payment into a proposal or a refusal, never the reverse. When the model answers more than once, the strictest answer counts. A timeout, refusal or malformed answer leaves the rules' decision unchanged | [`stricter`](../agent/src/review.ts#L103), [`parseVerdict`](../agent/src/review.ts#L77) |
| Simulate first | Every payment is simulated before it's sent, so a refusal costs no gas and shows the vault's reason | [`chain.ts`](../agent/src/chain.ts#L87) |
| Cautious proposals | The agent may propose a bill it was allowed to pay, so a flagged payment waits for the owner instead of being paid | [`propose`](../contracts/contracts/SluiceVault.sol#L276) |

## Keys and secrets

- The agent's key lives only in the GitHub Actions secret `AGENT_PRIVATE_KEY`; the deploy key lives in `contracts/.env`, which `.gitignore` excludes. No key is in the repository or its history.
- The owner signs in their own browser wallet. The dashboard simulates each action first, so a refusal shows the reason before anything is signed ([`web/src/chain.ts`](../web/src/chain.ts#L109)).
- The invoice reader stores nothing, checks the request's origin, rate-limits each visitor, and only fills in a payment address that is a complete `0x` address. The owner still checks and signs every bill.

## Known limits

- One agent session per vault is shown in the dashboard (the latest one granted). The contract allows several; only the latest is managed in the UI.
- The review fails open: if Claude is unreachable, the agent follows its rules and the vault's limits still apply.
- The approval threshold and the agent's per-payment cap are separate settings; a bill must pass both to run alone.
- On testnet, tUSD8 and tQDAY have no value. Nothing here has moved real money.
