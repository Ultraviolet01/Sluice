import { useLayoutEffect, useRef, useState } from "react";
import { PageHead, Pill, Search, app } from "../components.tsx";
import { dayLabel, fmt, type Model } from "../model.ts";
import { useApp } from "../state.tsx";
import { BillForm } from "./BillForm.tsx";
import { GetStarted } from "./Panels.tsx";
import legendWith from "../assets/icons/legend-with.svg";
import legendBuffer from "../assets/icons/legend-buffer.svg";
import loadline from "../assets/icons/loadline.svg";
import "./overview.css";

/**
 * The vault's balance: the last 14 days as they happened (solid, from tUSD8
 * transfers on chain), today, and the next 14 days with the listed bills
 * (dashed), against the cash buffer. Hover or tap a day for its balance.
 */
function ForecastChart({ m }: { m: Model }) {
  // Drawn at the width it is given, so labels and lines stay aligned on phones.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(684);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setW(Math.max(260, Math.round(el.clientWidth)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 180, PADL = 34, PADR = 6, TOP = 12, BOT = 14;
  const hist = m.history.length ? m.history : [{ day: m.forecast[0]?.day ?? 0, balance: m.balance }];
  const fut = m.forecast;
  // One row per day: past days, then today, then the forecast days after today.
  const rows = [
    ...hist.map((d, i) => ({ day: d.day, v: Number(d.balance) / 1e6, past: i < hist.length - 1, today: i === hist.length - 1 })),
    ...fut.slice(1).map((d) => ({ day: d.day, v: Number(d.balance) / 1e6, past: false, today: false })),
  ];
  const ti = hist.length - 1; // today's index
  const todayAfter = fut[0] ? Number(fut[0].balance) / 1e6 : rows[ti].v; // after the bills due today
  const buffer = Number(m.cashBuffer) / 1e6;
  const vals = [...rows.map((r) => r.v), todayAfter, buffer, 0];
  const hi = Math.max(...vals), lo = Math.min(...vals);
  const span = hi - lo || 1;
  const max = hi + span * 0.12, min = lo < 0 ? lo - span * 0.12 : Math.max(0, lo - span * 0.12);
  const y = (v: number) => TOP + (1 - (v - min) / (max - min)) * (H - TOP - BOT);
  const x = (i: number) => PADL + (i / Math.max(1, rows.length - 1)) * (W - PADL - PADR);
  // Steps: a balance changes at the start of the day it moves.
  const step = (from: number, to: number, start: number) => {
    let d = `M${x(from)} ${y(start)}`;
    for (let i = from + 1; i <= to; i++) d += ` H${x(i)} V${y(i === ti ? rows[i].v : rows[i].v)}`;
    return d;
  };
  const pastPath = step(0, ti, rows[0].v);
  let futPath = `M${x(ti)} ${y(rows[ti].v)} V${y(todayAfter)}`;
  for (let i = ti + 1; i < rows.length; i++) futPath += ` H${x(i)} V${y(rows[i].v)}`;
  const short = m.upcoming.length ? fut.findIndex((d) => d.balance < m.cashBuffer) : -1;
  const shortIdx = short < 0 ? -1 : short === 0 ? ti : ti + short;
  const [hover, setHover] = useState<number | null>(null);
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - PADL) / (W - PADL - PADR)) * (rows.length - 1));
    setHover(Math.max(0, Math.min(rows.length - 1, i)));
  };
  const hv = hover === null ? null : hover === ti ? { ...rows[ti], v: rows[ti].v } : rows[hover];
  const fmtV = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const labels = [0, Math.floor(ti / 2), ti, ti + Math.floor((rows.length - 1 - ti) / 2), rows.length - 1].filter((i, k, a) => rows[i] && a.indexOf(i) === k);
  return (
    <div className="ov-chart" ref={box}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="plot" role="img" aria-label="Vault balance: the last 14 days and the next 14 days" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <rect x={x(ti)} y={0} width={W - x(ti)} height={H} fill="var(--bg-canvas)" opacity=".6" />
        {min < 0 && <line x1={PADL} x2={W - PADR} y1={y(0)} y2={y(0)} stroke="var(--border-strong)" />}
        <line x1={PADL} x2={W - PADR} y1={y(buffer)} y2={y(buffer)} stroke="var(--accent-brass)" strokeDasharray="3 3" />
        <path d={`${pastPath} V${y(Math.max(min, 0))} H${x(0)} Z`} fill="var(--accent-sluice-tint)" opacity=".55" className="ov-area" />
        <path key={`p${rows.length}${rows[ti].v}`} d={pastPath} fill="none" stroke="var(--accent-sluice)" strokeWidth="2.25" pathLength={1} className="ov-line" />
        <path key={`f${todayAfter}`} d={futPath} fill="none" stroke="var(--accent-sluice)" strokeWidth="2" strokeDasharray="5 4" opacity=".85" className="ov-future" />
        <line x1={x(ti)} x2={x(ti)} y1={TOP - 6} y2={H - BOT} stroke="var(--text-tertiary)" strokeDasharray="2 3" />
        <circle cx={x(ti)} cy={y(rows[ti].v)} r="5" fill="var(--accent-sluice)" className="ov-now" />
        {shortIdx >= 0 && <circle cx={x(shortIdx)} cy={y(shortIdx === ti ? todayAfter : rows[shortIdx].v)} r="5" fill="#fff" stroke="var(--status-critical)" strokeWidth="2" />}
        {hv && hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={TOP} y2={H - BOT} stroke="var(--accent-sluice)" strokeOpacity=".35" />
            <circle cx={x(hover)} cy={y(hv.v)} r="4" fill="var(--bg-surface)" stroke="var(--accent-sluice)" strokeWidth="2" />
          </g>
        )}
      </svg>
      {hv && hover !== null && (
        <span className="ov-tip" style={{ left: Math.min(Math.max(x(hover), 70), W - 70) }}>
          <b>{fmtV(hv.v)} tUSD8</b> {hv.today ? "now" : `${hv.past ? "on" : "by"} ${dayLabel(hv.day)}`}{hv.today && todayAfter !== hv.v ? ` · ${fmtV(todayAfter)} after today's bills` : ""}
        </span>
      )}
      {shortIdx >= 0 && <span className="ov-chip critical" style={{ left: Math.min(x(shortIdx), W - 150) }}>Below buffer {dayLabel(fut[short].day)}</span>}
      <span className="axis y top">{Math.round(max).toLocaleString("en-US")}</span>
      {min < 0 && <span className="axis y" style={{ top: y(0) - 8 }}>0</span>}
      <div className="axis x">
        {labels.map((i) => <span key={i} style={{ left: x(i) }}>{i === ti ? "Today" : dayLabel(rows[i].day)}</span>)}
      </div>
    </div>
  );
}

export default function Overview() {
  const { model: m } = useApp();
  const [adding, setAdding] = useState(false);
  if (!m) return null;
  const waiting = m.approvals.filter((a) => a.status === "waiting");
  // A shortfall is only real when listed bills cause it: an empty new vault is "unfunded", not "short".
  const short = m.upcoming.length ? m.forecast.find((d) => d.balance < m.cashBuffer) : undefined;
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
        <a className="btn btn-secondary" href={app("activity")}>Export</a>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>New bill</button>
      </PageHead>
      {adding && <BillForm onClose={() => setAdding(false)} />}
      <GetStarted />

      <div className="ov-hero">
        <section className="card ov-forecast">
          <div className="ov-forecast-top">
            <div className="ov-total">
              <p className="lbl">Total treasury</p>
              <p><span className="display big">{fmt(m.balance)}</span> <span className="unit-lg">tUSD8</span></p>
              <p className="faint small">SluiceVault on Aevum Testnet</p>
            </div>
            <div className="ov-legend">
              <span><img src={legendWith} width={16} height={2} alt="" />Balance, last 14 days</span>
              <span><i className="ov-dash" aria-hidden="true" />Next 14 days, with listed bills</span>
              <span><img src={legendBuffer} width={16} height={2} alt="" />Cash buffer</span>
            </div>
          </div>
          <p className="faint xs">Last 14 days and next 14 days · updates every 30 seconds</p>
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
          <a className="btn btn-primary btn-block" href={app("approvals")}>{waiting.length ? `Review ${waiting.length} item${waiting.length === 1 ? "" : "s"}` : "Open approvals"}</a>
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
            <a className="btn btn-ghost" href={app("activity")}>View all</a>
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
