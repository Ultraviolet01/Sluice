import { useEffect, useRef, useState } from "react";
import { PageHead, Pill, TxLink } from "../components.tsx";
import { fmt, when, type Model } from "../model.ts";
import { useApp } from "../state.tsx";
import "./activity.css";

const FILTERS = [["all", "All"], ["auto", "Auto"], ["approved", "Approved"], ["proposed", "Proposed"], ["blocked", "Blocked"], ["rules", "Rule changes"]] as const;

type Preset = "month" | "last-month" | "30d" | "all" | "custom";
const iso = (d: Date) => d.toISOString().slice(0, 10);
function presetDates(p: Preset): { from: string; to: string } {
  const now = new Date();
  const y = now.getUTCFullYear(), mo = now.getUTCMonth();
  if (p === "month") return { from: iso(new Date(Date.UTC(y, mo, 1))), to: "" };
  if (p === "last-month") return { from: iso(new Date(Date.UTC(y, mo - 1, 1))), to: iso(new Date(Date.UTC(y, mo, 0))) };
  if (p === "30d") return { from: iso(new Date(Date.now() - 30 * 86_400_000)), to: "" };
  return { from: "", to: "" };
}
const PRESETS: [Preset, string][] = [["month", "This month"], ["last-month", "Last month"], ["30d", "Last 30 days"], ["all", "All time"], ["custom", "Custom"]];

/** Downloads the treasury report (.xlsx) for a period: Summary, Activity, Payments, Ledger, Rule changes, Wallets. */
function ExportButton({ m }: { m: Model }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset>("all");
  const [{ from, to }, setDates] = useState(() => presetDates("all"));
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  const pick = (p: Preset) => { setPreset(p); if (p !== "custom") setDates(presetDates(p)); };
  const bad = Boolean(from && to && from > to);
  const run = async () => {
    setBusy(true);
    setFailed(null);
    let mod: typeof import("../exportReport.ts");
    try {
      mod = await import("../exportReport.ts");
    } catch {
      // A newer version of the site was published while this page was open.
      window.location.reload();
      return;
    }
    try {
      await mod.downloadReport(m, { from: from ? Date.parse(`${from}T00:00:00Z`) / 1000 : null, to: to ? Date.parse(`${to}T23:59:59Z`) / 1000 : null });
      setOpen(false);
    } catch (e) {
      setFailed(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="xp" ref={box}>
      <button className="btn btn-secondary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>Export to Excel</button>
      {open && (
        <div className="xp-menu card" role="dialog" aria-label="Export to Excel">
          <p className="t14 w500">Treasury report (.xlsx)</p>
          <p className="xs faint">Summary, activity, payments, ledger, rule changes and wallets, with explorer links.</p>
          <div className="xp-presets">
            {PRESETS.map(([k, l]) => <button key={k} className={`chip${preset === k ? " on" : ""}`} onClick={() => pick(k)}>{l}</button>)}
          </div>
          {preset === "custom" && (
            <div className="xp-dates">
              <label className="xs">From <input type="date" value={from} onChange={(e) => setDates({ from: e.target.value, to })} /></label>
              <label className="xs">To <input type="date" value={to} onChange={(e) => setDates({ from, to: e.target.value })} /></label>
            </div>
          )}
          {bad && <p className="xs" style={{ color: "var(--status-danger)" }}>The start date is after the end date.</p>}
          {failed && <p className="xs" style={{ color: "var(--status-danger)" }}>Could not build the report: {failed}</p>}
          <button className="btn btn-primary btn-block" disabled={busy || bad} onClick={run}>{busy ? "Building…" : "Download"}</button>
        </div>
      )}
    </div>
  );
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
        <ExportButton m={m} />
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
