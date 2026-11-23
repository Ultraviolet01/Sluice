import { Code, DocPage, Sec } from "./site.tsx";
import "./landing.css";

const V = "contracts/contracts/SluiceVault.sol";

const WHO = [
  ["List or cancel bills", "Yes", "No", 262],
  ["Approve or reject a proposal", "Yes", "No", 309],
  ["Set caps, buffer, threshold, payee lists", "Yes", "No", 218],
  ["Grant or revoke the agent's session", "Yes", "No", 187],
  ["Pause and resume", "Yes", "No", 327],
  ["Withdraw (even while paused)", "Yes", "No", 356],
  ["Settle a listed bill inside the limits", "—", "Yes", 366],
  ["File a bill for the owner", "—", "Yes", 379],
] as const;

const GUARDS = [
  ["Bills only", "pay(bill, period) takes no payee and no amount. The vault pays the bill's own payee its own amount, and only the owner can list a bill.", 366],
  ["Once per period", "Each bill period settles at most once. A rejected one stays closed until the owner releases it.", 401],
  ["Not early", "A period can't be settled more than 3 days before it's due.", 399],
  ["Blocklist wins", "A blocked payee is refused for the agent and for the owner's approval alike.", 403],
  ["Rolling 24-hour cap", "Sums the agent's own payments over the last 24 hours, not a calendar day, so midnight can't be gamed.", 408],
  ["Cash buffer", "No agent payment may leave the vault below the owner's buffer.", 410],
  ["Payment ring", "At most 32 agent payments in 24 hours; the 33rd is refused instead of overwriting the record the cap relies on.", 457],
  ["Two-step ownership", "Ownership moves by offer and accept, so a typo can't hand the vault away.", 19],
] as const;

const ATTACKS = [
  ["Grant itself a bigger session, allowlist itself, list a bill to itself, change the buffer, unpause, take ownership", "Refused: owner only"],
  ["Approve its own proposal, or withdraw", "Refused: owner only"],
  ["Pay a bill nobody listed", "Refused: no such bill"],
  ["Send a bill to another address or amount", "Impossible: pay() has no payee or amount"],
  ["Pay a bill twice, or next month's early", "Refused: already settled / not due yet"],
  ["Drain the vault with many small payments", "Refused once the rolling 24-hour cap is reached"],
  ["Pay a blocklisted payee, alone or by proposal", "Refused: blocklisted"],
  ["Act after revocation, expiry or pause", "Refused: no session / expired / paused"],
  ["Approve or unblock many addresses at once", "Refused: owner only"],
  ["Keep using a key after the owner rotated to a new one", "Refused: granting a new agent revokes the old key"],
  ["Use a stolen guardian (Telegram bot) key to move money or loosen a rule", "Refused: the guardian can only pause, block or reject"],
  ["Pull tokens with transferFrom", "Impossible: the vault never grants an allowance"],
] as const;

export default function SecurityPage() {
  return (
    <DocPage current="security" title="Security" lead="The rules live in the vault, not in the agent's prompt. They hold if the model is fooled, if an invoice tries to talk it round, or if its key is stolen.">
      <Sec title="Who can do what">
        <table className="dp-table">
          <thead><tr><th>Action</th><th>Owner</th><th>Agent's key</th><th>Code</th></tr></thead>
          <tbody>{WHO.map(([a, o, g, l]) => <tr key={a}><td>{a}</td><td>{o}</td><td>{g}</td><td><Code path={V} line={l}>line {l}</Code></td></tr>)}</tbody>
        </table>
        <p className="dp-note">Anyone else can only read: balances, bills, proposals and receipts are public on the Aevum explorer.</p>
      </Sec>

      <Sec title="What protects the money">
        <div className="dp-cards two">
          {GUARDS.map(([t, d, l]) => (
            <div key={t}><p className="dp-k">{t}</p><p>{d}</p><Code path={V} line={l}>SluiceVault.sol line {l}</Code></div>
          ))}
        </div>
      </Sec>

      <Sec title="If the agent's key is stolen">
        <p>The attack suite signs as the agent and tries everything a thief would. Every attempt is refused.</p>
        <table className="dp-table">
          <thead><tr><th>The thief tries to</th><th>The vault answers</th></tr></thead>
          <tbody>{ATTACKS.map(([a, b]) => <tr key={a}><td>{a}</td><td>{b}</td></tr>)}</tbody>
        </table>
        <p className="dp-note">The worst a stolen key can do is pay the owner's own bills, to their own payees, at their listed amounts, inside the caps. The owner revokes the session and nothing else changes. Run it yourself: <Code path="contracts/test/attacks.test.js">attacks.test.js</Code>.</p>
      </Sec>

      <Sec title="The agent can only be stricter">
        <div className="dp-cards">
          <div><p className="dp-k">Rules first</p><p>Plain code decides from the vault's own checkPayment answer. It never pays what the vault says needs approval or is blocked, a property tested for every reason code.</p><Code path="agent/src/brain.ts" line={168}>decide()</Code></div>
          <div><p className="dp-k">Injection guard</p><p>Before any model reads a bill's text, plain code checks it for instructions aimed at the reviewer, after undoing lookalike letters, leetspeak, dotted letters and instructions split across fields.</p><Code path="agent/src/guard.ts">guard.ts</Code></div>
          <div><p className="dp-k">Claude review</p><p>Claude Haiku 5.5 takes a second look for lookalike payees, odd amounts and pressure. Outside text is fenced; the answer must match a fixed schema; the strictest answer wins; a failure changes nothing.</p><Code path="agent/src/review.ts">review.ts</Code></div>
        </div>
      </Sec>

      <Sec title="Keys">
        <ul className="dp-list">
          <li>The agent's key lives only in the hosting's encrypted settings (Railway, with GitHub Actions as a manual backup). The deploy key is in a local file git ignores. No key is in the repository or its history.</li>
          <li>The owner signs in their own wallet. Every action is simulated first, so a refusal shows the vault's reason before anything is signed.</li>
          <li>The invoice reader stores nothing, checks where requests come from, limits each visitor, and only fills in a complete 0x payment address.</li>
        </ul>
      </Sec>

      <Sec title="Known limits">
        <ul className="dp-list">
          <li>The Claude review fails open: if the model is unreachable, the agent follows its rules, and the vault's limits still apply.</li>
          <li>At most 32 agent payments per vault in 24 hours.</li>
          <li>Testnet tokens have no value. Nothing here has moved real money, and the vault has not been audited.</li>
        </ul>
        <p className="dp-note">Every claim with its line of code: <Code path="docs/SECURITY.md">docs/SECURITY.md</Code>.</p>
      </Sec>
    </DocPage>
  );
}
