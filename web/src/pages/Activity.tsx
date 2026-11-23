import { useState } from "react";
import { PageHead, Pill } from "../components";
import { activity, NETWORK } from "../data";
import linkArrow from "../assets/icons/link-arrow.svg";
import "./activity.css";

const FILTERS = [
  ["all", "All"], ["auto", "Auto"], ["approved", "Approved"], ["blocked", "Blocked"], ["moves", "Vault moves"], ["rules", "Rule changes"],
] as const;

export default function Activity() {
  const [filter, setFilter] = useState<string>("all");
  const rows = activity.filter((a) => filter === "all" || a.type === filter);
  return (
    <>
      <PageHead title="Activity" sub="Every move, the rule it checked, and its receipt">
        <button className="btn btn-secondary">Export CSV</button>
      </PageHead>
      <div className="ac-stats">
        <div className="card"><p className="muted small">Moved, last 30 days</p><p><span className="display ac-big">41,280.00</span> <span className="unit">tUSD8</span></p></div>
        <div className="card"><p className="muted small">Handled alone</p><p><span className="display ac-big">37 of 44</span> <span className="xs w500" style={{ color: "var(--accent-sluice)" }}>84%</span></p></div>
        <div className="card"><p className="muted small">Waited for you</p><p><span className="display ac-big">5</span> <span className="xs brass">2 still open</span></p></div>
        <div className="card"><p className="muted small">Refused</p><p><span className="display ac-big">2</span> <span className="xs" style={{ color: "var(--status-critical)" }}>both blocklisted</span></p></div>
      </div>
      <section className="card ac-table">
        <div className="ac-toolbar">
          <div className="tabs">
            {FILTERS.map(([k, l]) => <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>)}
          </div>
          <span className="grow" />
          <button className="btn btn-secondary ac-sm">All vaults</button>
          <button className="btn btn-secondary ac-sm">Last 30 days</button>
        </div>
        <div className="ac-scroll">
          <table>
            <thead><tr><th>When</th><th>What happened</th><th>Vault</th><th className="r">Amount</th><th>Outcome</th><th>Rule checked</th><th>Receipt</th></tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.when + a.what}>
                  <td className="faint">{a.when}</td>
                  <td className="w500">{a.what}</td>
                  <td className="muted">{a.wallet}</td>
                  <td className="r w500" style={a.amount.startsWith("+") ? { color: "var(--status-success)" } : undefined}>{a.amount}</td>
                  <td><Pill kind={a.kind}>{a.outcome}</Pill></td>
                  <td className="muted">{a.rule}</td>
                  <td>
                    {a.proof.startsWith("0x")
                      ? <a className="ac-proof mono" href={`${NETWORK.explorer}/tx/${a.proof}`} target="_blank" rel="noreferrer">{a.proof}<img src={linkArrow} width={14} height={14} alt="" /></a>
                      : <a className="ac-proof mono" href="#/app/approvals">{a.proof}<img src={linkArrow} width={14} height={14} alt="" /></a>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ac-foot"><span className="faint xs grow">Showing {rows.length} of 44</span><button className="btn btn-secondary">Load more</button></div>
      </section>
    </>
  );
}
