import { PageHead, Pill, Search } from "../components";
import { decisions, fmt, upcoming, wallets } from "../data";
import plot from "../assets/icons/plot.svg";
import legendWith from "../assets/icons/legend-with.svg";
import legendWithout from "../assets/icons/legend-without.svg";
import legendBuffer from "../assets/icons/legend-buffer.svg";
import loadline from "../assets/icons/loadline.svg";
import "./overview.css";

export default function Overview({ waiting }: { waiting: number }) {
  const total = wallets.reduce((s, w) => s + w.balance, 0);
  return (
    <>
      <PageHead title="Overview" sub={`Sunday, 1 November, 1 shortfall ahead, ${waiting} item${waiting === 1 ? "" : "s"} need you`}>
        <Search />
        <button className="btn btn-secondary">Export</button>
        <a className="btn btn-primary" href="#/app/approvals">New payment</a>
      </PageHead>

      <div className="ov-hero">
        <section className="card ov-forecast">
          <div className="ov-forecast-top">
            <div className="ov-total">
              <p className="lbl">Total treasury</p>
              <p><span className="display big">{fmt(total)}</span> <span className="unit-lg">tUSD8</span></p>
              <p className="faint small">3 vaults on Aevum Testnet</p>
            </div>
            <div className="ov-legend">
              <span><img src={legendWith} width={16} height={2} alt="" />With Sluice</span>
              <span><img src={legendWithout} width={16} height={2} alt="" />Without Sluice</span>
              <span><img src={legendBuffer} width={16} height={2} alt="" />Payroll buffer</span>
            </div>
          </div>
          <p className="faint xs">Payroll vault, next 14 days</p>
          <div className="ov-chart">
            <img className="plot" src={plot} width={684} height={180} alt="Payroll balance forecast" />
            <span className="ov-chip brass">+8,000 from Vendors</span>
            <span className="ov-chip critical">Payroll fails Nov 7</span>
            <span className="axis y top">12k</span>
            <span className="axis y zero">0</span>
            <div className="axis x">
              <span>Nov 1</span><span>Nov 4</span><span>Nov 7</span><span>Nov 10</span><span>Nov 14</span>
            </div>
          </div>
        </section>

        <section className="ov-needs">
          <div className="row-between"><p className="grow t16">Needs you</p><p className="brass xs">{waiting} open</p></div>
          <div className="ov-item">
            <div className="row-between t14"><p className="grow">Fund Payroll from Vendors</p><p>8,000.00 tUSD8</p></div>
            <p className="muted xs">Short 6,920 for Nov 7, vault-to-vault on Aevum</p>
          </div>
          <div className="ov-item">
            <div className="row-between"><p className="grow t14">Rule update: Atlas Freight</p><p className="t13">100 → 140</p></div>
            <p className="muted xs">3 approvals in a row, bills up 5 to 12%</p>
          </div>
          <a className="btn btn-primary btn-block" href="#/app/approvals">Review {waiting} items</a>
        </section>
      </div>

      <div className="ov-wallets">
        {wallets.map((w) => (
          <section key={w.id} className="card ov-wallet">
            <div className="row-between">
              <div className="grow">
                <p className="t15">{w.name}</p>
                <p className="mono faint" style={{ fontSize: 11 }}>{w.addr}</p>
              </div>
              <span className="chip">Aevum</span>
            </div>
            <p><span className="display amount">{fmt(w.balance)}</span> <span className="unit">tUSD8</span></p>
            <div>
              <div className="bar"><div style={{ width: `${w.fill * 100}%`, background: w.color }} /></div>
              <p className="muted xs" style={{ marginTop: 6 }}>{w.note}</p>
            </div>
            <Pill kind={w.status.kind}>{w.status.label}</Pill>
          </section>
        ))}
      </div>

      <div className="ov-bottom">
        <section className="card ov-decisions">
          <div className="row-between" style={{ paddingBottom: 12 }}>
            <div className="grow">
              <p className="card-title">Sluice's decisions</p>
              <p className="card-sub">Every move, with the rule it checked</p>
            </div>
            <a className="btn btn-ghost" href="#/app/activity">View all</a>
          </div>
          {decisions.map((d, i) => (
            <div key={i} className="ov-decision">
              <div className="row-between" style={{ gap: 10 }}>
                <Pill kind={d.kind}>{d.pill}</Pill>
                <p className="grow t14">{d.title}</p>
                <p className="t14">{d.amount} tUSD8</p>
                <p className="faint xs">{d.when}</p>
              </div>
              <p className="muted t13">{d.why}</p>
            </div>
          ))}
        </section>

        <div className="ov-right">
          <section className="card">
            <p className="card-title">Upcoming payments</p>
            <p className="card-sub" style={{ paddingBottom: 16 }}>Next 14 days, 12,212 tUSD8 out</p>
            <div className="thead">
              <span style={{ width: 132 }}>Payee</span><span style={{ width: 52 }}>Due</span>
              <span style={{ width: 80, textAlign: "right" }}>Amount</span><span style={{ flex: 1 }}>Status</span>
            </div>
            {upcoming.map((u) => (
              <div key={u.payee} className="trow">
                <span className="t13 w500" style={{ width: 132 }}>{u.payee}</span>
                <span className="muted" style={{ width: 52 }}>{u.due}</span>
                <span className="w500" style={{ width: 80, textAlign: "right" }}>{u.amount}</span>
                <span style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}><Pill kind={u.kind}>{u.label}</Pill></span>
              </div>
            ))}
          </section>

          <section className="card" style={{ paddingBottom: 12 }}>
            <div className="row-between" style={{ paddingBottom: 8 }}>
              <img src={loadline} width={30} height={20} alt="" />
              <p className="grow card-title">Active rules</p>
              <p className="faint xs">Enforced on chain</p>
            </div>
            <div className="kv"><span className="k">Per payment</span><span className="v">100 tUSD8</span></div>
            <div className="kv"><span className="k">Per day</span><span className="v xs">80 of 500 tUSD8 used</span></div>
            <div className="kv"><span className="k">Approval needed above</span><span className="v">100 tUSD8</span></div>
            <div className="kv"><span className="k">Allowed payees</span><span className="v xs">6 addresses</span></div>
            <div className="kv"><span className="k">Blocked addresses</span><span className="v xs">14 addresses</span></div>
            <div className="kv"><span className="k">Vault-to-vault moves</span><span className="v xs">Always need approval</span></div>
          </section>
        </div>
      </div>
    </>
  );
}
