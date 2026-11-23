# Security

[Back to the README](../README.md)

Sluice lets an AI agent pay a company's bills without handing it the company's money. The rules live in the vault contract, not in the agent's prompt, so they hold even if the agent's model is wrong, its prompt is injected, or its key is stolen. Each claim below links to the line that enforces it.

## Who can do what

| Action | Owner | Agent (session key) | Anyone else |
|---|---|---|---|
| List or cancel bills ([`addBill`](../contracts/contracts/SluiceVault.sol#L262)) | Yes | No | No |
| Approve or reject a proposal ([`approve`](../contracts/contracts/SluiceVault.sol#L309), [`reject`](../contracts/contracts/SluiceVault.sol#L320)) | Yes | No | No |
| Set caps, buffer, threshold, payee lists | Yes | No | No |
| Grant, rotate or revoke the agent's session; granting a new agent revokes the old one at once ([`grantSession`](../contracts/contracts/SluiceVault.sol#L187), [`revokeSession`](../contracts/contracts/SluiceVault.sol#L205)) | Yes | No | No |
| Pause and resume ([`pause`](../contracts/contracts/SluiceVault.sol#L327)) | Yes | No | No |
| Withdraw ([`withdraw`](../contracts/contracts/SluiceVault.sol#L356)) | Yes, always, even paused | No | No |
| Settle a listed bill period inside the limits ([`pay`](../contracts/contracts/SluiceVault.sol#L366)) | — | Yes | No |
| File a bill period for the owner ([`propose`](../contracts/contracts/SluiceVault.sol#L379)) | — | Yes | No |
| Read anything ([`checkPayment`](../contracts/contracts/SluiceVault.sol#L390), views, events) | Yes | Yes | Yes |

Ownership moves in two steps (offer, then accept) through OpenZeppelin's `Ownable2Step` ([line 19](../contracts/contracts/SluiceVault.sol#L19)), so a typo can't hand the vault to the wrong address.

## What protects the money

| Protection | How it works | Enforced at |
|---|---|---|
| Bills only | `pay(billId, period)` takes no payee and no amount. The vault pays the bill's own payee the bill's own amount, and only the owner can list a bill | [`pay`](../contracts/contracts/SluiceVault.sol#L366), [`addBill`](../contracts/contracts/SluiceVault.sol#L262) |
| Once per period | Each bill period is settled at most once; a rejected one stays closed until the owner releases it | [L401](../contracts/contracts/SluiceVault.sol#L401), [`releaseBill`](../contracts/contracts/SluiceVault.sol#L300) |
| Not early | A period can't be settled more than 3 days before it is due | [L399](../contracts/contracts/SluiceVault.sol#L399) |
| Blocklist wins | A blocked payee is refused, for the agent and for owner approval alike | [L403](../contracts/contracts/SluiceVault.sol#L403), [L314](../contracts/contracts/SluiceVault.sol#L314) |
| Approved payees | A payee not on the allowlist always goes to the owner | `checkPayment` |
| Per-payment cap | Larger bills go to the owner | `checkPayment` |
| Rolling 24-hour cap | Sums the agent's own payments over the last 24 hours, not a calendar day, so it can't be gamed at midnight | [L408](../contracts/contracts/SluiceVault.sol#L408), [`spentInWindow`](../contracts/contracts/SluiceVault.sol#L420) |
| Payment ring | At most 32 agent payments in 24 hours; the 33rd is refused rather than overwriting the record the cap relies on | [`_recordSpend`](../contracts/contracts/SluiceVault.sol#L457) |
| Cash buffer | No agent payment may leave the vault below the owner's buffer | [L410](../contracts/contracts/SluiceVault.sol#L410) |
| Session expiry and revocation | The agent's key works only until its session expires, and stops the moment the owner revokes it | `checkPayment`, [`revokeSession`](../contracts/contracts/SluiceVault.sol#L205) |
| Pause | Halts every agent payment at once; the owner can still withdraw | [`pause`](../contracts/contracts/SluiceVault.sol#L327) |
| No allowances | The vault never approves token allowances, so nothing can pull tUSD8 out with `transferFrom` | whole contract |
| Re-entrancy | Every function that moves tokens is `nonReentrant` | OpenZeppelin `ReentrancyGuard` |
| Audit trail | `BillPaid` for every settlement, `PaymentProposed` / `PaymentRejected`; every rule change (`PolicyChanged` with old and new values, payee, session and bill-cancel events) carries the owner's reason, up to 280 bytes | events at the top of the contract |

## If the agent's key is stolen

`contracts/test/attacks.test.js` signs as the agent (and, for the guardian checks, as the Telegram bot) and tries 27 attacks. All are refused:

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
| Keep using a key after the owner rotated to a new one | `NoSession`: granting a new agent revokes the old key in the same transaction |
| Pull tokens with `transferFrom` | No allowance exists |

The worst a stolen key can do is pay the owner's own listed bills, to their own payees, at their listed amounts, inside the caps, at most 3 days early. The owner revokes the session, or grants a new key (which revokes the old one), and nothing else changes.

## The guardian (Telegram)

An owner may name one guardian: the Telegram bot's key. It can call `pause`, `reject` and `guardianBlock` (block only, never unblock), and the vault refuses it everything else. A stolen guardian key can pause, block or reject (each undone by the owner, who then removes the guardian with `setGuardian(0x0)`), but cannot move money: `contracts/test/attacks.test.js` checks this. Alerts go only to the chat the owner linked on chain (`setNotifyChat`), and the bot acts only for that chat.

## The agent: stricter than the vault, never looser

The agent decides in plain code before any model is involved ([`decide`](../agent/src/brain.ts#L168)), starting from the vault's own answer (`checkPayment`). It never pays what the vault says needs approval or is blocked; a unit test checks that for every reason code.

On top of the vault's rules it adds caution:

| Check | What it does | Where |
|---|---|---|
| Spike | A bill more than 25% above that payee's last three goes to the owner | [`isSpike`](../agent/src/brain.ts#L144) |
| Injection guard | Plain code reads bill names and invoice text before any model does, and sends the payment to the owner if they try to instruct the reviewer ("ignore previous instructions", "pre-approved", "answer ok", fake JSON verdicts). Obfuscation is undone first: lookalike letters from other scripts, fullwidth forms, leetspeak, dotted letters, and instructions split across two fields | [`guard.ts`](../agent/src/guard.ts#L29), [`anySteers`](../agent/src/guard.ts#L58) |
| Claude review | Claude Haiku 5.5 looks at a payment the agent would make alone: lookalike payees, odd amounts, pressure in the invoice text. Outside text is fenced in `<untrusted>` tags it can't close, and the answer must match a fixed JSON schema | [`review.ts`](../agent/src/review.ts#L115) |
| Stricter only | A review can turn a payment into a proposal or a refusal, never the reverse. When the model answers more than once, the strictest answer counts. A timeout, refusal or malformed answer leaves the rules' decision unchanged | [`stricter`](../agent/src/review.ts#L103), [`parseVerdict`](../agent/src/review.ts#L77) |
| Simulate first | Every payment is simulated before it's sent, so a refusal costs no gas and shows the vault's reason | [`chain.ts`](../agent/src/chain.ts#L87) |
| Cautious proposals | The agent may propose a bill it was allowed to pay, so a flagged payment waits for the owner instead of being paid | [`propose`](../contracts/contracts/SluiceVault.sol#L379) |

## Randomised tests

- `agent/src/fuzz.test.ts`: 10 properties, 2,000 generated cases each (seeded; `FUZZ_SEED` replays a failure). The decision rules never pay what the vault says needs approval or is blocked, and never hold a critical bill; a review never loosens a decision; the verdict parser never throws and the strictest answer wins; disguised instructions (lookalike letters, mixed case, zero-width characters) are caught while ordinary invoice wording is not; the forecast spends exactly the bills due.
- `contracts/test/fuzz.test.js`: random sequences of agent payments, proposals, owner approvals and time jumps against vaults with random bills and limits. After every step: nothing paid outside a listed bill, no period paid twice, the rolling 24-hour cap and the cash buffer hold, and every token that left went to a bill's payee.
- The generated cases found one real weakness on their first run: zero-width characters inside a word ("dis\u200bregard") slipped past the injection guard. Fixed in `guard.ts`, and the exact strings are now permanent tests.

## Keys and secrets

- The agent's key lives only in the encrypted variables of the hosting that runs it (Railway; GitHub Actions secret `AGENT_PRIVATE_KEY` for the manual backup); the deploy key lives in `contracts/.env`, which `.gitignore` excludes. No key is in the repository or its history.
- The owner signs in their own browser wallet. The dashboard simulates each action first, so a refusal shows the reason before anything is signed ([`web/src/chain.ts`](../web/src/chain.ts#L160)).
- The invoice reader stores nothing, checks the request's origin, rate-limits each visitor, and only fills in a payment address that is a complete `0x` address. The owner still checks and signs every bill.

## Known limits

- One agent session per vault is shown in the dashboard (the latest one granted). The contract allows several; only the latest is managed in the UI.
- The review fails open: if Claude is unreachable, the agent follows its rules and the vault's limits still apply.
- The approval threshold and the agent's per-payment cap are separate settings; a bill must pass both to run alone.
- On testnet, tUSD8 and tQDAY have no value. Nothing here has moved real money.
