import { useState } from "react";
import { PageHead, Pill } from "../components";
import { fmt, wallets } from "../data";
import "./wallets.css";

export default function Wallets({ toast }: { toast: (m: string) => void }) {
  const [sel, setSel] = useState("payroll");
  const w = wallets.find((x) => x.id === sel)!;
  return (
    <>
      <PageHead title="Wallets" sub="Sluice keeps each vault above its minimum">
        <button className="btn btn-secondary">Add vault</button>
      </PageHead>

      <section className="card wl-stats">
        <div><p className="muted small">Total across vaults</p><p><span className="display wl-big">48,215.40</span> <span className="unit">tUSD8</span></p><p className="faint xs">All on Aevum Testnet</p></div>
        <div><p className="muted small">Above minimums</p><p><span className="display wl-big">32,715.40</span> <span className="unit">tUSD8</span></p><p className="faint xs">15,500 held back as minimums</p></div>
        <div><p className="muted small">Shortfalls ahead</p><p><span className="display wl-big">1</span></p><p className="brass xs">Payroll on Nov 7</p></div>
        <div><p className="muted small">Gas left for Sluice</p><p><span className="display wl-big">2.4</span> <span className="unit">of 5 tQDAY</span></p><p className="faint xs">About 3 weeks at this pace</p></div>
      </section>

      <div className="wl-layout">
        <div className="wl-list">
          {wallets.map((x) => (
            <button key={x.id} className={`wl-card${x.id === sel ? " on" : ""}`} onClick={() => setSel(x.id)}>
              <div className="row-between">
                <div className="grow"><p className="t15">{x.name}</p><p className="mono faint" style={{ fontSize: 11 }}>{x.addr}</p></div>
                <span className="chip" style={{ fontSize: 11 }}>Aevum</span>
              </div>
              <div className="row-between" style={{ alignItems: "flex-end", marginTop: 12 }}>
                <div className="grow">
                  <p><span className="display" style={{ fontSize: 22 }}>{fmt(x.balance)}</span> <span className="unit">tUSD8</span></p>
                  <p className="muted xs">{x.note}</p>
                </div>
                <Pill kind={x.status.kind}>{x.id === "payroll" ? "Short 6,920" : x.id === "vendors" ? "8,795 spare" : "Healthy"}</Pill>
              </div>
            </button>
          ))}
        </div>

        <section className="card wl-detail">
          <div className="row-between" style={{ alignItems: "flex-start" }}>
            <div className="grow">
              <p style={{ fontSize: 20, fontWeight: 500 }}>{w.name} <span className="chip" style={{ fontSize: 11, verticalAlign: "middle" }}>Aevum</span></p>
              <p className="mono faint xs" style={{ marginTop: 4 }}>{w.full}</p>
            </div>
            <button className="btn btn-secondary" onClick={() => { navigator.clipboard?.writeText(w.full).catch(() => {}); toast("Deposit address copied"); }}>Deposit address</button>
          </div>
          <p><span className="display" style={{ fontSize: 40, letterSpacing: -0.4 }}>{fmt(w.balance)}</span> <span className="unit">tUSD8</span></p>

          {w.id === "payroll" ? (
            <>
              <div>
                <div className="row-between wl-th"><span className="grow" style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>Next 14 days</span><span>Balance after</span></div>
                <div className="wl-tr"><span className="faint w80">Today</span><span className="grow">Current balance</span><span className="w500">4,180.00</span></div>
                <div className="wl-tr"><span className="faint w80">Pending</span><span className="grow">From Vendors, invoice inv-041 <Pill kind="approval">Waiting</Pill></span><span className="ok-t w90">+8,000.00</span><span className="w500">12,180.00</span></div>
                <div className="wl-tr"><span className="faint w80">Nov 7</span><span className="grow">Contractor payroll</span><span className="muted w90">−9,600.00</span><span className="w500">2,580.00</span></div>
              </div>
              <div className="wl-warn">
                <div className="grow"><p className="t14">Without inv-041, payroll fails on Nov 7</p><p className="muted xs">Approve it and this vault ends at 2,580.00, above its 1,500 minimum</p></div>
                <a className="btn btn-primary" href="#/app/approvals">Review inv-041</a>
              </div>
            </>
          ) : (
            <p className="muted small">{w.note}. No shortfalls in the next 14 days.</p>
          )}

          <div>
            <div className="row-between" style={{ paddingBottom: 8 }}><p className="grow t14">Rules for this vault</p><a className="btn btn-ghost" href="#/app/rules">Edit in Rules</a></div>
            <div className="kv"><span className="k">Minimum</span><span className="v">{fmt(w.min).replace(".00", "")} tUSD8</span></div>
            <div className="kv"><span className="k">Tops up from</span><span className="v">{w.id === "treasury" ? "Incoming payments" : "Vendors, then Treasury vault"}</span></div>
            <div className="kv"><span className="k">Pays out to</span><span className="v">{w.id === "payroll" ? "Contractor payroll, Design stipends" : w.id === "vendors" ? "Atlas Freight, Northwind Hosting" : "Payroll, Vendors"}</span></div>
          </div>
        </section>
      </div>
    </>
  );
}
