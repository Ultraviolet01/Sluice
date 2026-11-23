import { Code, DocPage, Sec } from "./site.tsx";
import "./landing.css";

const STEPS = [
  ["Observe", "Reads the vault: balance, cash buffer, the agent's session and what it has spent in the last 24 hours, every bill, and past receipts.", "agent/src/chain.ts"],
  ["Forecast", "Projects the balance over the next 14 days, paying each bill on its due date, and finds the first day it would fall below the buffer.", "agent/src/brain.ts"],
  ["Decide", "Critical bills first. For each bill that is due, asks the vault's checkPayment and follows its answer: pay, propose, refuse or wait. A bill that would break the buffer but isn't due yet is held; one more than 25% above that payee's usual goes to you.", "agent/src/brain.ts"],
  ["Review", "Before paying anything alone, an injection guard reads the bill's text, then Claude Haiku 5.5 looks for lookalike payees and odd amounts. Both can only make the decision stricter.", "agent/src/review.ts"],
  ["Act", "Simulates the transaction, then pays, or proposes with a plain-English note written by Claude Haiku 5.5. If something needs you, a Telegram message says so.", "agent/src/loop.ts"],
  ["Learn", "After you approve one payee three times in a row with steadily rising bills, drafts a higher cap. Only you can apply it.", "agent/src/brain.ts"],
] as const;

const DECISIONS = [
  ["Pay", "A listed bill, to an approved payee, inside the per-payment cap, the 24-hour budget and the cash buffer, and nothing odd in the review", "pay(), and the vault checks it all again"],
  ["Propose", "A new payee, over a cap or threshold, below the buffer, a spike, or something the review flagged", "You approve or reject"],
  ["Refuse", "A blocklisted payee", "The vault refuses it too, even on your approval"],
  ["Hold", "Would break the cash buffer but isn't due yet (never a critical bill)", "Proposed on its due date if money hasn't come in"],
  ["Wait", "Not due yet, paused, or no live session", "checkPayment"],
] as const;

export default function HowItWorks() {
  return (
    <DocPage current="how-it-works" title="How it works" lead="You list the bills and draw the line. Sluice pays what fits, every 15 minutes, and brings you the rest with its reasons.">
      <Sec title="Three parts">
        <div className="dp-cards">
          <div><p className="dp-k">The vault</p><p>A SluiceVault contract on QDay Aevum holds the company's tUSD8. It knows your bills, your payees and your limits, and checks every payment against them before any money moves.</p><Code path="contracts/contracts/SluiceVault.sol">SluiceVault.sol</Code></div>
          <div><p className="dp-k">The agent</p><p>A small program that runs every 15 minutes on Railway. It holds a session key that can settle your listed bills and propose the rest. Nothing else.</p><Code path="agent/README.md">agent/</Code></div>
          <div><p className="dp-k">The dashboard</p><p>Where you list bills, set the line, see the forecast and every receipt, and approve what waits for you, signing in your own wallet.</p><Code path="web/README.md">web/</Code></div>
        </div>
      </Sec>

      <Sec title="Setting the line">
        <ol className="dp-steps">
          <li><b>Create your company</b> in one signature. Your wallet owns the vault.</li>
          <li><b>List your bills.</b> Payee, amount, first due date, how often it repeats, and whether it's critical. Upload an invoice and Claude drafts the bill, or import many from a CSV. Sluice can only pay bills on this list.</li>
          <li><b>Approve payees.</b> Bills to approved payees can be paid alone. Anything to a new payee comes to you first. Blocked addresses are never paid.</li>
          <li><b>Set the limits.</b> A cap per payment, a budget per rolling 24 hours, an approval threshold, and a cash buffer the agent may never spend into.</li>
          <li><b>Grant the agent a session</b> with those caps and an expiry date. Revoke it, or pause every payment, with one signature.</li>
        </ol>
      </Sec>

      <Sec title="One round, every 15 minutes">
        <div className="dp-round">
          {STEPS.map(([t, d, path], i) => (
            <div key={t}><span className="display dp-num">{i + 1}</span><p className="dp-k">{t}</p><p>{d}</p><Code path={path}>{path.split("/").pop()}</Code></div>
          ))}
        </div>
        <p className="dp-note">The agent keeps no memory of its own. The vault remembers which bill periods were paid, proposed or rejected, so a round can run anywhere, any time, and never pays a bill twice.</p>
      </Sec>

      <Sec title="What the agent decides">
        <table className="dp-table">
          <thead><tr><th>Decision</th><th>When</th><th>Enforced by</th></tr></thead>
          <tbody>{DECISIONS.map(([a, b, c]) => <tr key={a}><td><b>{a}</b></td><td>{b}</td><td>{c}</td></tr>)}</tbody>
        </table>
      </Sec>

      <Sec title="A bill's life">
        <div className="dp-flow">
          <span>Listed by you</span><i>→</i><span>Due within 3 days</span><i>→</i>
          <span className="ok">Paid alone</span><em>or</em><span className="wait">Proposed</span><i>→</i><span>You approve or reject</span>
        </div>
        <p className="dp-note">A repeating bill comes back each period, and each period is settled at most once. A rejected period stays closed until you release it.</p>
      </Sec>

      <Sec title="Why Aevum">
        <p>Sluice settles in tUSD8 on QDay Aevum Testnet, an EVM chain, so the vault is plain Solidity checked by OpenZeppelin's audited building blocks, and the agent and dashboard use standard Ethereum tooling (viem, MetaMask). Every payment, proposal and rule change is a receipt anyone can check on the Aevum explorer.</p>
      </Sec>
    </DocPage>
  );
}
