import { Code, DocPage, REPO, Sec } from "./site.tsx";
import "./landing.css";

const NET = [
  ["Network", "QDay Aevum Testnet"],
  ["Chain ID", "44005"],
  ["RPC", "https://rpc-test.qday.info"],
  ["Explorer", "https://explorer-test.qday.info"],
  ["tUSD8", "0x456569838f1d43009A91ebA4263147Afd7233483 (6 decimals)"],
  ["Gas", "tQDAY, from faucet.qday.info"],
] as const;

const METHODS = [
  ["addBill(payee, amount, firstDue, intervalDays, critical, label)", "Owner", "Lists a bill. intervalDays = 0 for a one-off; critical bills are paid first and never held"],
  ["addBills(bills[])", "Owner", "Lists up to 50 bills in one signature"],
  ["setPayeesAllowed / setPayeesBlocked(payees[], bool, reason)", "Owner", "Up to 50 payees in one signature"],
  ["cancelBill(billId) / releaseBill(billId, period)", "Owner", "Stops a bill / reopens a rejected period"],
  ["grantSession(agent, perPaymentCap, dailyCap, expiresAt)", "Owner", "Gives the agent its caps and an expiry"],
  ["revokeSession(agent)", "Owner", "Removes the agent's access at once"],
  ["setPayeeAllowed / setPayeeBlocked(payee, bool)", "Owner", "Approved and blocked payees"],
  ["setCashBuffer / setApprovalThreshold(amount)", "Owner", "The buffer and the approval line"],
  ["approve / reject(billId, period)", "Owner", "Decides a proposal"],
  ["pause / unpause, withdraw(to, amount)", "Owner", "Stop everything; take funds out"],
  ["pay(billId, period)", "Agent", "Settles a listed bill period inside the limits"],
  ["propose(billId, period, note)", "Agent", "Sends a bill period to the owner"],
  ["checkPayment(agent, billId, period)", "Anyone", "Runs alone, needs approval or blocked, and why"],
  ["SluiceFactory.createVault(name, cashBuffer, approvalThreshold)", "Anyone", "Creates a vault owned by the caller"],
] as const;

const Cmd = ({ children }: { children: string }) => <pre className="dp-pre"><code>{children}</code></pre>;

export default function Docs() {
  return (
    <DocPage current="docs" title="Docs" lead="Set up a vault, run the agent, and check every claim yourself.">
      <nav className="dp-toc">
        {["Start", "Set up a company", "Run the agent", "The dashboard", "Contract reference", "Network", "Check it"].map((t) => (
          <a key={t} href={`#/docs`} onClick={(e) => { e.preventDefault(); document.getElementById(t)?.scrollIntoView({ behavior: "smooth" }); }}>{t}</a>
        ))}
      </nav>

      <Sec id="Start" title="Start">
        <p>You need Node.js 22 and MetaMask. Clone the repository and run every check:</p>
        <Cmd>{`git clone ${REPO} && cd sluice\nnpm run verify`}</Cmd>
        <p>You see one line per check, ending with <code>VERIFY PASSED</code>.</p>
      </Sec>

      <Sec id="Set up a company" title="Set up a company">
        <ol className="dp-steps">
          <li><b>Add Aevum Testnet to MetaMask</b> (chain 44005) and claim tQDAY for gas and tUSD8 at faucet.qday.info.</li>
          <li><b>Create your company</b>: open the dashboard, connect your wallet and choose <b>Create a company</b>. One signature creates your vault with you as owner. (Or deploy one from <code>contracts/</code> with <code>npm run deploy</code>.)</li>
          <li><b>Fund it</b> by sending tUSD8 to the vault's address.</li>
          <li><b>Under Rules,</b> approve your payees and list your bills, one by one or with <b>Import bills</b> from a CSV. Mark payroll and rent as critical. Set the cash buffer and approval threshold.</li>
          <li><b>Under Settings,</b> grant the agent's address a session: a cap per payment, a cap per 24 hours, and how many days it lasts.</li>
        </ol>
      </Sec>

      <Sec id="Run the agent" title="Run the agent">
        <p>Try a round that signs nothing:</p>
        <Cmd>{"cd agent && npm install\nSLUICE_VAULTS=0xYourVault AGENT_PRIVATE_KEY=0x... npm run dry-run"}</Cmd>
        <p>To run it every 15 minutes, in your GitHub repository open <b>Settings → Secrets and variables → Actions</b> and add:</p>
        <table className="dp-table">
          <thead><tr><th>Kind</th><th>Name</th><th>Value</th></tr></thead>
          <tbody>
            <tr><td>Secret</td><td><code>AGENT_PRIVATE_KEY</code></td><td>The agent's key; its address needs a little tQDAY</td></tr>
            <tr><td>Secret</td><td><code>ANTHROPIC_API_KEY</code></td><td>Optional, turns on the Claude review</td></tr>
            <tr><td>Variable</td><td><code>SLUICE_FACTORY</code></td><td>Serve every company created through the factory that hired this agent</td></tr>
            <tr><td>Variable</td><td><code>SLUICE_VAULTS</code></td><td>And/or a comma-separated list of vault addresses</td></tr>
            <tr><td>Variable</td><td><code>SLUICE_FROM_BLOCK</code></td><td>Optional, the vault's deployment block</td></tr>
            <tr><td>Secret</td><td><code>TELEGRAM_BOT_TOKEN</code>, <code>TELEGRAM_CHAT_ID</code></td><td>Optional, Telegram alerts when something needs you</td></tr>
          </tbody>
        </table>
        <p className="dp-note">Scheduled workflows run from the repository's default branch. Each run's log lists what the agent paid, proposed or refused, with transaction links. More in <Code path="agent/README.md">agent/README.md</Code>.</p>
      </Sec>

      <Sec id="The dashboard" title="The dashboard">
        <Cmd>{"cd web && npm install && npm run dev"}</Cmd>
        <p>With no vault set it shows demo data. Set <code>VITE_FACTORY_ADDRESS</code> to turn on <b>Create a company</b>, <code>VITE_AGENT_ADDRESS</code> to offer the hosted agent when a company is created, and <code>VITE_VAULT_ADDRESS</code> (and optionally <code>VITE_FROM_BLOCK</code>, <code>VITE_COMPANY_NAME</code>) when building, or add <code>?vault=0x…</code> to the address. Invoice reading needs <code>ANTHROPIC_API_KEY</code> on the host. More in <Code path="web/README.md">web/README.md</Code>.</p>
      </Sec>

      <Sec id="Contract reference" title="Contract reference">
        <table className="dp-table">
          <thead><tr><th>Method</th><th>Who</th><th>What</th></tr></thead>
          <tbody>{METHODS.map(([m, w, d]) => <tr key={m}><td><code>{m}</code></td><td>{w}</td><td>{d}</td></tr>)}</tbody>
        </table>
        <p className="dp-note">Every rule change takes a last <code>reason</code> argument (up to 280 bytes), logged on chain with the change. Amounts are in tUSD8's smallest unit: 1 tUSD8 = 1,000,000. Events: <code>BillPaid</code>, <code>PaymentProposed</code>, <code>PaymentRejected</code>, <code>BillAdded</code>, <code>PolicyChanged</code>, <code>SessionGranted</code>. Source: <Code path="contracts/contracts/SluiceVault.sol">SluiceVault.sol</Code>.</p>
      </Sec>

      <Sec id="Network" title="Network">
        <table className="dp-table"><tbody>{NET.map(([k, v]) => <tr key={k}><td>{k}</td><td><code>{v}</code></td></tr>)}</tbody></table>
      </Sec>

      <Sec id="Check it" title="Check it">
        <ul className="dp-list">
          <li><b>Contract and attacks:</b> <code>cd contracts && npx hardhat test</code>, 54 tests, including the factory, 24 stolen-key attacks and randomised operation sequences.</li>
          <li><b>Agent:</b> <code>cd agent && npm test</code>, 44 tests: decisions, holding bills, the injection guard, the review, alerts, whole rounds against a fake vault, and 2,000-case randomised checks.</li>
          <li><b>End to end on a local chain:</b> the steps in the <a href={`${REPO}#see-the-agent-work-locally`} target="_blank" rel="noreferrer">README</a>, which deploy a demo company and run a real round.</li>
        </ul>
      </Sec>
    </DocPage>
  );
}
