import { useState } from "react";
import { PageHead, Pill } from "../components";
import { NETWORK, ORG, payees } from "../data";
import "./rules.css";

const BILLS = [
  { amt: 104, date: "Oct 3" }, { amt: 112, date: "Oct 17" }, { amt: 118, date: "Oct 31" }, { amt: 132, date: "Nov 5" },
];

export default function Rules({ onPause, paused, toast }: { onPause: () => void; paused: boolean; toast: (m: string) => void }) {
  const [limits, setLimits] = useState({ perPayment: "100", perDay: "500", approval: "100", spike: "25" });
  const [draftOpen, setDraftOpen] = useState(true);
  const field = (k: keyof typeof limits, unit: string) => (
    <label className="ru-input">
      <input value={limits[k]} inputMode="decimal" onChange={(e) => setLimits({ ...limits, [k]: e.target.value.replace(/[^0-9.]/g, "") })} />
      <span>{unit}</span>
    </label>
  );
  const rows: [string, string, JSX.Element][] = [
    ["Per payment", "Max single payment without you", field("perPayment", "tUSD8")],
    ["Per day", "Max per 24 h without you", field("perDay", "tUSD8")],
    ["Approval needed above", "Larger goes to Approvals", field("approval", "tUSD8")],
    ["Spike alert", "Above a payee’s last 3 bills", field("spike", "%")],
    ["Vault minimums", "Treasury 10,000, Payroll 1,500, Vendors 4,000", <label className="ru-input"><input value="3" readOnly /><span>set</span></label>],
  ];

  return (
    <>
      <PageHead title="Rules" sub="Enforced by the SluiceVault contract. Only your key can change them.">
        <a className="btn btn-secondary" href={`${NETWORK.explorer}/address/${ORG.vaultFull}`} target="_blank" rel="noreferrer">View contract</a>
      </PageHead>

      {draftOpen && (
        <section className="ru-draft">
          <div className="grow">
            <div className="row-between" style={{ gap: 8 }}>
              <span className="pill pill-approval" style={{ background: "var(--bg-surface)" }}>Sluice drafted a rule update</span>
              <span className="brass xs">Draft #7, 1 h ago</span>
            </div>
            <p className="ru-draft-title">Atlas Freight per-payment cap <span className="faint">100</span> <span className="faint">→</span> 140 tUSD8</p>
            <p className="muted small">Steady rise, not a spike. Spikes over 25% are flagged, never drafted.</p>
          </div>
          <div className="ru-bills">
            <p className="muted xs">Last 4 freight bills</p>
            <div className="ru-bars">
              {BILLS.map((b, i) => (
                <div key={b.date}>
                  <span className="mono xs w500">{b.amt}</span>
                  <i style={{ height: (b.amt - 80) * 0.95, background: i === 3 ? "var(--accent-brass)" : "#4a8a84" }} />
                  <span className="faint" style={{ fontSize: 10 }}>{b.date}</span>
                </div>
              ))}
            </div>
            <p className="xs">Every bill was above the 100 cap</p>
          </div>
          <div className="ru-draft-actions">
            <button className="btn btn-primary" onClick={() => { setDraftOpen(false); toast("Signed setPayee cap update for Atlas Freight"); }}>Apply and sign</button>
            <button className="btn btn-secondary" onClick={() => setDraftOpen(false)}>Dismiss draft</button>
          </div>
        </section>
      )}

      <div className="ru-grid">
        <section className="card">
          <p className="card-title">Spending limits</p>
          <p className="card-sub" style={{ paddingBottom: 8 }}>Every agent payment</p>
          {rows.map(([k, sub, input]) => (
            <div key={k} className="ru-row">
              <div className="grow"><p className="small w500">{k}</p><p className="faint xs">{sub}</p></div>
              {input}
            </div>
          ))}
        </section>

        <section className="card">
          <div className="row-between" style={{ paddingBottom: 8 }}>
            <div className="grow"><p className="card-title">Payees</p><p className="card-sub">Paid without asking</p></div>
            <button className="btn btn-secondary">Add payee</button>
          </div>
          {payees.map((p) => (
            <div key={p.name} className="ru-row">
              <div className="grow"><p className="small w500">{p.name}</p><p className="mono faint xs">{p.addr} on Aevum</p></div>
              <span className="muted xs">{p.note}</span>
              <Pill kind={p.kind}>{p.label}</Pill>
            </div>
          ))}
          <div className="ru-row">
            <div className="grow"><p className="small w500">14 blocked addresses</p><p className="faint xs">Scam reports and past refusals</p></div>
            <Pill kind="blocked">Blocked</Pill>
          </div>
        </section>
      </div>

      <section className="ru-agent">
        <div className="grow">
          <p style={{ fontSize: 16, fontWeight: 500 }}>What the agent can and cannot do</p>
          <p className="ru-agent-sub">Its session key can only call pay(). It cannot change rules, add payees, withdraw or overspend.</p>
          <code className="mono">{ORG.agentKey}, expires Dec 11, gas 2.4 of 5 tQDAY left</code>
        </div>
        <div className="ru-agent-actions">
          <button className="btn ru-dark-danger" onClick={onPause}>{paused ? "Resume payments" : "Pause all payments"}</button>
          <button className="btn ru-dark" onClick={() => toast("revokeSession + grantSession queued for signature")}>Rotate agent key</button>
        </div>
      </section>
    </>
  );
}
