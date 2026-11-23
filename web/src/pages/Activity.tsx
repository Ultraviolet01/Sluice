import { useState } from "react";
import { PageHead, Pill, TxLink } from "../components.tsx";
import { fmt, when, type ActivityRow } from "../model.ts";
import { useApp } from "../state.tsx";
import "./activity.css";

const FILTERS = [["all", "All"], ["auto", "Auto"], ["approved", "Approved"], ["proposed", "Proposed"], ["blocked", "Blocked"], ["rules", "Rule changes"]] as const;

function csv(rows: ActivityRow[]) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = [["When", "What happened", "Amount (tUSD8)", "Outcome", "Rule checked", "Transaction"].join(",")];
  for (const r of rows) lines.push([new Date(r.at * 1000).toISOString(), esc(r.what), r.amount === null ? "" : fmt(r.amount).replace(/,/g, ""), r.outcome, esc(r.rule), r.tx].join(","));
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "sluice-activity.csv" });
  a.click();
  URL.revokeObjectURL(url);
}

export default function Activity() {
  const { model: m } = useApp();
  const [filter, setFilter] = useState<string>("all");
  const [shown, setShown] = useState(20);
  if (!m) return null;
  const rows = m.activity.filter((a) => filter === "all" || a.type === filter);
  const since = Date.now() / 1000 - 30 * 86400;
  const recent = m.activity.filter((a) => m.live ? a.at >= since : true);
  const moved = recent.filter((a) => a.sign === "out" && a.amount).reduce((s, a) => s + (a.amount ?? 0n), 0n);
  const auto = recent.filter((a) => a.type === "auto" && a.sign === "out").length;
  const handled = recent.filter((a) => a.sign === "out" || a.type === "proposed").length;
  const waited = m.approvals.length;
  const open = m.approvals.filter((a) => a.status === "waiting").length;
  const refused = recent.filter((a) => a.type === "blocked").length;

  return (
    <>
      <PageHead title="Activity" sub="Every move, the rule it checked, and its receipt">
        <button className="btn btn-secondary" onClick={() => csv(rows)}>Export CSV</button>
      </PageHead>
      <div className="ac-stats">
        <div className="card"><p className="muted small">Paid out, last 30 days</p><p><span className="display ac-big">{fmt(moved)}</span> <span className="unit">tUSD8</span></p></div>
        <div className="card"><p className="muted small">Handled alone</p><p><span className="display ac-big">{auto} of {handled}</span> {handled > 0 && <span className="xs w500" style={{ color: "var(--accent-sluice)" }}>{Math.round((auto / handled) * 100)}%</span>}</p></div>
        <div className="card"><p className="muted small">Waited for you</p><p><span className="display ac-big">{waited}</span> <span className="xs brass">{open} still open</span></p></div>
        <div className="card"><p className="muted small">Refused or rejected</p><p><span className="display ac-big">{refused}</span></p></div>
      </div>
      <section className="card ac-table">
        <div className="ac-toolbar">
          <div className="tabs">
            {FILTERS.map(([k, l]) => <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>)}
          </div>
        </div>
        <div className="ac-scroll">
          <table>
            <thead><tr><th>When</th><th>What happened</th><th className="r">Amount</th><th>Outcome</th><th>Rule checked</th><th>Receipt</th></tr></thead>
            <tbody>
              {rows.slice(0, shown).map((a, i) => (
                <tr key={i}>
                  <td className="faint">{when(a.at)}</td>
                  <td className="w500">{a.what}</td>
                  <td className="r w500" style={a.sign === "in" ? { color: "var(--status-success)" } : undefined}>{a.amount === null ? "—" : `${a.sign === "out" ? "−" : a.sign === "in" ? "+" : ""}${fmt(a.amount)}`}</td>
                  <td><Pill kind={a.kind}>{a.outcome}</Pill></td>
                  <td className="muted">{a.rule}</td>
                  <td>{m.live ? <TxLink tx={a.tx} /> : <span className="mono faint">{a.tx ? `${a.tx.slice(0, 8)}…` : "—"}</span>}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="muted">Nothing here yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="ac-foot">
          <span className="faint xs grow">Showing {Math.min(shown, rows.length)} of {rows.length}</span>
          {shown < rows.length && <button className="btn btn-secondary" onClick={() => setShown(shown + 20)}>Load more</button>}
        </div>
      </section>
    </>
  );
}
