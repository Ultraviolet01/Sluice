import { useState } from "react";
import { PageHead, Pill, Search } from "../components.tsx";
import { dayLabel, fmt, type Model } from "../model.ts";
import { useApp } from "../state.tsx";
import { BillForm } from "./BillForm.tsx";
import legendWith from "../assets/icons/legend-with.svg";
import legendBuffer from "../assets/icons/legend-buffer.svg";
import loadline from "../assets/icons/loadline.svg";
import "./overview.css";

/** The 14-day balance line against the cash buffer, drawn from the forecast. */
function ForecastChart({ m }: { m: Model }) {
  const W = 684, H = 180, PADL = 30;
  const pts = m.forecast.map((d) => Number(d.balance) / 1e6);
  const buffer = Number(m.cashBuffer) / 1e6;
  const max = Math.max(...pts, buffer, 1) * 1.1;
  const min = Math.max(0, Math.min(...pts, buffer) * 0.8);
  const y = (v: number) => H - 10 - ((v - min) / (max - min)) * (H - 20);
  const x = (i: number) => PADL + (i / Math.max(1, pts.length - 1)) * (W - PADL - 4);
  const path = pts.map((v, i) => `${i ? "H" + x(i) + " V" : "M" + x(i) + " "}${y(v)}`).join(" ");
  const short = m.forecast.findIndex((d) => d.balance < m.cashBuffer);
  return (
    <div className="ov-chart">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="plot" role="img" aria-label="Balance forecast for the next 14 days">
        <line x1={PADL} x2={W} y1={y(max / 1.1)} y2={y(max / 1.1)} stroke="var(--border-default)" />
        <line x1={PADL} x2={W} y1={y(buffer)} y2={y(buffer)} stroke="var(--accent-brass)" strokeDasharray="3 3" />
        <path d={`${path} V${H - 10} H${PADL} Z`} fill="var(--accent-sluice-tint)" opacity=".5" />
        <path d={path} fill="none" stroke="var(--accent-sluice)" strokeWidth="2" />
        {short >= 0 && <circle cx={x(short)} cy={y(pts[short])} r="5" fill="#fff" stroke="var(--status-critical)" strokeWidth="2" />}
      </svg>
      {short >= 0 && <span className="ov-chip critical" style={{ left: Math.min(x(short), W - 150) }}>Below buffer {dayLabel(m.forecast[short].day)}</span>}
      <span className="axis y top">{Math.round(max / 1.1).toLocaleString("en-US")}</span>
      <div className="axis x">
        {[0, 3, 6, 9, 13].map((i) => m.forecast[i] && <span key={i}>{dayLabel(m.forecast[i].day)}</span>)}
      </div>
    </div>
  );
}

export default function Overview() {
  const { model: m } = useApp();
  const [adding, setAdding] = useState(false);
  if (!m) return null;
  const waiting = m.approvals.filter((a) => a.status === "waiting");
  const short = m.forecast.find((d) => d.balance < m.cashBuffer);
  const s = m.session;
  const dueOut = m.upcoming.reduce((t, x) => t + x.amount, 0n);
  const allowed = m.payees.filter((p) => p.allowed && !p.blocked).length;
  const blocked = m.payees.filter((p) => p.blocked).length;
  const today = new Date((m.live ? Date.now() : m.forecast[0]?.day * 1000) || Date.now()).toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" });
  const pct = (a: bigint, b: bigint) => (b > 0n ? Math.min(100, Number((a * 100n) / b)) : 0);

  return (
    <>
      <PageHead title="Overview" sub={`${today}, ${short ? "1 shortfall ahead" : "no shortfall ahead"}, ${waiting.length} item${waiting.length === 1 ? "" : "s"} need you`}>
        <Search />
        <a className="btn btn-secondary" href="#/app/activity">Export</a>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>New bill</button>
      </PageHead>
      {adding && <BillForm onClose={() => setAdding(false)} />}

      <div className="ov-hero">
        <section className="card ov-forecast">
          <div className="ov-forecast-top">
            <div className="ov-total">
              <p className="lbl">Total treasury</p>
              <p><span className="display big">{fmt(m.balance)}</span> <span className="unit-lg">tUSD8</span></p>
              <p className="faint small">SluiceVault on Aevum Testnet</p>
            </div>
            <div className="ov-legend">
              <span><img src={legendWith} width={16} height={2} alt="" />Balance with listed bills</span>
              <span><img src={legendBuffer} width={16} height={2} alt="" />Cash buffer</span>
            </div>
          </div>
          <p className="faint xs">Next 14 days</p>
          <ForecastChart m={m} />
        </section>

        <section className="ov-needs">
          <div className="row-between"><p className="grow t16">Needs you</p><p className="brass xs">{waiting.length} open</p></div>
          {waiting.length === 0 && <div className="ov-item"><p className="muted small">Nothing waiting. Every bill is inside your line.</p></div>}
          {waiting.slice(0, 2).map((a) => (
            <div key={a.key} className="ov-item">
              <div className="row-between t14"><p className="grow">{a.label}</p><p>{fmt(a.amount)} tUSD8</p></div>
              <p className="muted xs">{a.why[0].toUpperCase() + a.why.slice(1)}</p>
            </div>
          ))}
          <a className="btn btn-primary btn-block" href="#/app/approvals">{waiting.length ? `Review ${waiting.length} item${waiting.length === 1 ? "" : "s"}` : "Open approvals"}</a>
        </section>
      </div>

      <div className="ov-wallets">
        <section className="card ov-wallet">
          <div className="row-between"><div className="grow"><p className="t15">Treasury vault</p><p className="mono faint" style={{ fontSize: 11 }}>{m.vault.slice(0, 6)}…{m.vault.slice(-4)}</p></div><span className="chip">Aevum</span></div>
          <p><span className="display amount">{fmt(m.balance)}</span> <span className="unit">tUSD8</span></p>
          <div>
            <div className="bar"><div style={{ width: `${m.balance > m.cashBuffer ? pct(m.balance - m.cashBuffer, m.balance) : 0}%`, background: m.balance >= m.cashBuffer ? "var(--status-success)" : "var(--accent-brass)" }} /></div>
            <p className="muted xs" style={{ marginTop: 6 }}>{fmt(m.balance > m.cashBuffer ? m.balance - m.cashBuffer : 0n)} free above the {fmt(m.cashBuffer)} buffer</p>
          </div>
          <Pill kind={m.balance >= m.cashBuffer ? "settled" : "approval"}>{m.balance >= m.cashBuffer ? "Above buffer" : "Below buffer"}</Pill>
        </section>
        <section className="card ov-wallet">
          <div className="row-between"><div className="grow"><p className="t15">Agent budget</p><p className="mono faint" style={{ fontSize: 11 }}>{s ? `${s.agent.slice(0, 6)}…${s.agent.slice(-4)}` : "no session"}</p></div><span className="chip">24 h</span></div>
          <p><span className="display amount">{fmt(s?.spent ?? 0n)}</span> <span className="unit">of {fmt(s?.dailyCap ?? 0n)} tUSD8</span></p>
          <div>
            <div className="bar"><div style={{ width: `${pct(s?.spent ?? 0n, s?.dailyCap ?? 0n)}%`, background: "var(--accent-sluice)" }} /></div>
            <p className="muted xs" style={{ marginTop: 6 }}>Rolling 24 hours, {fmt(s?.perPaymentCap ?? 0n)} per payment</p>
          </div>
          <Pill kind={s?.active ? "auto" : "blocked"}>{s?.active ? "Session live" : "No session"}</Pill>
        </section>
        <section className="card ov-wallet">
          <div className="row-between"><div className="grow"><p className="t15">Next 14 days</p><p className="mono faint" style={{ fontSize: 11 }}>{m.upcoming.length} bill payments</p></div><span className="chip">Forecast</span></div>
          <p><span className="display amount">{fmt(dueOut)}</span> <span className="unit">tUSD8 out</span></p>
          <div>
            <div className="bar"><div style={{ width: `${pct(dueOut, m.balance)}%`, background: short ? "var(--accent-brass)" : "var(--status-success)" }} /></div>
            <p className="muted xs" style={{ marginTop: 6 }}>{short ? `Below the buffer on ${dayLabel(short.day)}` : "Covered, buffer kept"}</p>
          </div>
          <Pill kind={short ? "approval" : "settled"}>{short ? "Shortfall ahead" : "Covered"}</Pill>
        </section>
      </div>

      <div className="ov-bottom">
        <section className="card ov-decisions">
          <div className="row-between" style={{ paddingBottom: 12 }}>
            <div className="grow"><p className="card-title">Sluice's decisions</p><p className="card-sub">Every move, with the rule it checked</p></div>
            <a className="btn btn-ghost" href="#/app/activity">View all</a>
          </div>
          {m.activity.length === 0 && <p className="muted small">No activity yet.</p>}
          {m.activity.slice(0, 4).map((d, i) => (
            <div key={i} className="ov-decision">
              <div className="row-between" style={{ gap: 10 }}>
                <Pill kind={d.kind}>{d.outcome}</Pill>
                <p className="grow t14">{d.what}</p>
                {d.amount !== null && <p className="t14">{fmt(d.amount)} tUSD8</p>}
              </div>
              <p className="muted t13">{d.rule[0].toUpperCase() + d.rule.slice(1)}</p>
            </div>
          ))}
        </section>

        <div className="ov-right">
          <section className="card">
            <p className="card-title">Upcoming payments</p>
            <p className="card-sub" style={{ paddingBottom: 16 }}>Next 14 days, {fmt(dueOut)} tUSD8 out</p>
            <div className="thead">
              <span style={{ width: 132 }}>Payee</span><span style={{ width: 52 }}>Due</span>
              <span style={{ width: 80, textAlign: "right" }}>Amount</span><span style={{ flex: 1 }}>Status</span>
            </div>
            {m.upcoming.length === 0 && <p className="muted small" style={{ padding: 12 }}>No bills due. List one with New bill.</p>}
            {m.upcoming.slice(0, 6).map((u) => (
              <div key={`${u.billId}:${u.period}`} className="trow">
                <span className="t13 w500" style={{ width: 132 }}>{u.label}</span>
                <span className="muted" style={{ width: 52 }}>{dayLabel(u.due)}</span>
                <span className="w500" style={{ width: 80, textAlign: "right" }}>{fmt(u.amount)}</span>
                <span style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}><Pill kind={u.kind}>{u.status}</Pill></span>
              </div>
            ))}
          </section>

          <section className="card" style={{ paddingBottom: 12 }}>
            <div className="row-between" style={{ paddingBottom: 8 }}>
              <img src={loadline} width={30} height={20} alt="" />
              <p className="grow card-title">Active rules</p>
              <p className="faint xs">Enforced on chain</p>
            </div>
            <div className="kv"><span className="k">Per payment</span><span className="v">{fmt(s?.perPaymentCap ?? 0n)} tUSD8</span></div>
            <div className="kv"><span className="k">Per 24 hours</span><span className="v xs">{fmt(s?.spent ?? 0n)} of {fmt(s?.dailyCap ?? 0n)} tUSD8 used</span></div>
            <div className="kv"><span className="k">Approval needed above</span><span className="v">{fmt(m.threshold)} tUSD8</span></div>
            <div className="kv"><span className="k">Cash buffer</span><span className="v">{fmt(m.cashBuffer)} tUSD8</span></div>
            <div className="kv"><span className="k">Allowed payees</span><span className="v xs">{allowed} addresses</span></div>
            <div className="kv"><span className="k">Blocked addresses</span><span className="v xs">{blocked} addresses</span></div>
          </section>
        </div>
      </div>
    </>
  );
}
