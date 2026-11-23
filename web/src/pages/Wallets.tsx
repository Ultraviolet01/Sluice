import { useState } from "react";
import { isAddress, type Address } from "viem";
import { Modal, PageHead, Pill } from "../components.tsx";
import { EXPLORER, TUSD8 } from "../chain.ts";
import { dayLabel, fmt, toUnits } from "../model.ts";
import { useApp } from "../state.tsx";
import "./wallets.css";
import { DepositPanel } from "./Panels.tsx";
import { fmtGas, gasLow } from "../gas.ts";

function Withdraw({ onClose }: { onClose: () => void }) {
  const { model: m, act, account } = useApp();
  const [to, setTo] = useState(account ?? m?.owner ?? "");
  const [amt, setAmt] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    try {
      if (!isAddress(to)) throw new Error("Enter a 0x address");
      const v = toUnits(amt);
      if (v <= 0n) throw new Error("Amount must be above zero");
      if (await act(`Withdrew ${fmt(v)} tUSD8`, { fn: "withdraw", args: [to as Address, v] }, (mm) => ({ ...mm, balance: mm.balance - v }))) onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <Modal title="Withdraw" onClose={onClose}>
      <p className="muted small" style={{ marginBottom: 12 }}>Owner only. Works while paused and ignores the cash buffer.</p>
      <label className="form-row"><span>To</span><input className="mono" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      <label className="form-row"><span>Amount (tUSD8)</span><input value={amt} inputMode="decimal" onChange={(e) => setAmt(e.target.value)} /></label>
      {err && <p className="xs" style={{ color: "var(--status-critical)" }}>{err}</p>}
      <div className="row-between" style={{ marginTop: 16, justifyContent: "flex-end" }}>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={go}>Withdraw and sign</button>
      </div>
    </Modal>
  );
}

export default function Wallets() {
  const { model: m, toast } = useApp();
  const [withdraw, setWithdraw] = useState(false);
  const [depositing, setDepositing] = useState(false);
  if (!m) return null;
  const above = m.balance - m.cashBuffer;
  const short = m.forecast.find((d) => d.balance < m.cashBuffer);
  let running = m.balance;
  const rows = m.upcoming.map((u) => {
    running -= u.amount;
    return { ...u, after: running };
  });
  const lowest = rows.reduce((lo, r) => (r.after < lo ? r.after : lo), m.balance);

  return (
    <>
      <PageHead title="Wallets" sub="Sluice keeps the vault above its cash buffer">
        <button className="btn btn-secondary" onClick={() => setWithdraw(true)}>Withdraw</button>
        <button className="btn btn-primary" onClick={() => setDepositing(true)}>Deposit</button>
      </PageHead>
      {withdraw && <Withdraw onClose={() => setWithdraw(false)} />}
      {depositing && <DepositPanel onClose={() => setDepositing(false)} />}

      <section className="card wl-stats">
        <div><p className="muted small">In the vault</p><p><span className="display wl-big">{fmt(m.balance)}</span> <span className="unit">tUSD8</span></p><p className="faint xs">On Aevum Testnet</p></div>
        <div><p className="muted small">Above the buffer</p><p><span className="display wl-big">{fmt(above > 0n ? above : 0n)}</span> <span className="unit">tUSD8</span></p><p className="faint xs">{fmt(m.cashBuffer)} held back</p></div>
        <div><p className="muted small">Shortfalls ahead</p><p><span className="display wl-big">{short ? 1 : 0}</span></p><p className={short ? "brass xs" : "faint xs"}>{short ? `Below the buffer on ${dayLabel(short.day)}` : "None in 14 days"}</p></div>
        <div>
          <p className="muted small">Gas left for Sluice</p>
          <p><span className="display wl-big" style={gasLow(m.agentGas) ? { color: "var(--status-critical)" } : undefined}>{m.agentGas === null ? "—" : fmtGas(m.agentGas)}</span> <span className="unit">tQDAY</span></p>
          <p className={gasLow(m.agentGas) ? "xs" : "faint xs"} style={gasLow(m.agentGas) ? { color: "var(--status-critical)" } : undefined}>
            {m.agentGas === null ? "No agent yet" : gasLow(m.agentGas) ? "Low: top it up, or bills stop" : "Pays for the agent's transactions"}
          </p>
        </div>
      </section>

      <div className="wl-layout">
        <div className="wl-list">
          <div className="wl-card on">
            <div className="row-between">
              <div className="grow"><p className="t15">SluiceVault</p><p className="mono faint" style={{ fontSize: 11 }}>{m.vault.slice(0, 6)}…{m.vault.slice(-4)}</p></div>
              <span className="chip" style={{ fontSize: 11 }}>Aevum</span>
            </div>
            <div className="row-between" style={{ alignItems: "flex-end", marginTop: 12 }}>
              <div className="grow">
                <p><span className="display" style={{ fontSize: 22 }}>{fmt(m.balance)}</span> <span className="unit">tUSD8</span></p>
                <p className="muted xs">Buffer {fmt(m.cashBuffer)}, {m.bills.filter((b) => b.active).length} active bills</p>
              </div>
              <Pill kind={short ? "approval" : "settled"}>{short ? "Shortfall ahead" : "Healthy"}</Pill>
            </div>
          </div>
          <div className="card" style={{ padding: 18 }}>
            <div className="row-between" style={{ marginBottom: 6 }}><p className="t14 grow">Deposit</p><button className="btn btn-primary ac-sm" onClick={() => setDepositing(true)}>Deposit from wallet</button></div>
            <p className="muted xs">Or send tUSD8 (<a className="mono" href={`${EXPLORER}/token/${TUSD8}`} target="_blank" rel="noreferrer">{TUSD8.slice(0, 8)}…</a>) on Aevum Testnet to the vault's address. Get test tUSD8 at faucet.qday.info.</p>
          </div>
        </div>

        <section className="card wl-detail">
          <div className="row-between" style={{ alignItems: "flex-start" }}>
            <div className="grow">
              <p style={{ fontSize: 20, fontWeight: 500 }}>SluiceVault <span className="chip" style={{ fontSize: 11, verticalAlign: "middle" }}>Aevum</span></p>
              <p className="mono faint xs" style={{ marginTop: 4 }}>{m.vault}</p>
            </div>
            <button className="btn btn-secondary" onClick={() => { navigator.clipboard?.writeText(m.vault).catch(() => {}); toast("Deposit address copied"); }}>Copy address</button>
          </div>
          <p><span className="display" style={{ fontSize: 40, letterSpacing: -0.4 }}>{fmt(m.balance)}</span> <span className="unit">tUSD8</span></p>

          <div>
            <div className="row-between wl-th"><span className="grow" style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>Next 14 days</span><span>Balance after</span></div>
            <div className="wl-tr"><span className="faint w80">Today</span><span className="grow">Current balance</span><span className="w500">{fmt(m.balance)}</span></div>
            {rows.map((r) => (
              <div key={`${r.billId}:${r.period}`} className="wl-tr">
                <span className="faint w80">{dayLabel(r.due)}</span>
                <span className="grow">{r.label} <Pill kind={r.kind}>{r.status}</Pill></span>
                <span className="muted w90">−{fmt(r.amount)}</span>
                <span className="w500" style={r.after < m.cashBuffer ? { color: "var(--status-critical)" } : undefined}>{fmt(r.after)}</span>
              </div>
            ))}
          </div>

          {lowest < m.cashBuffer ? (
            <div className="wl-warn">
              <div className="grow"><p className="t14">The balance would fall to {fmt(lowest)}, under the {fmt(m.cashBuffer)} buffer</p><p className="muted xs">Sluice will not pay past the buffer on its own. Deposit, lower the buffer, or approve the bill knowingly.</p></div>
              <a className="btn btn-primary" href="#/app/approvals">Review</a>
            </div>
          ) : (
            <p className="muted small">Every listed bill in the next 14 days is covered, and the buffer holds.</p>
          )}

          <div>
            <div className="row-between" style={{ paddingBottom: 8 }}><p className="grow t14">Rules for this vault</p><a className="btn btn-ghost" href="#/app/rules">Edit in Rules</a></div>
            <div className="kv"><span className="k">Cash buffer</span><span className="v">{fmt(m.cashBuffer)} tUSD8</span></div>
            <div className="kv"><span className="k">Approval needed above</span><span className="v">{fmt(m.threshold)} tUSD8</span></div>
            <div className="kv"><span className="k">Owner</span><span className="v mono xs">{m.owner}</span></div>
          </div>
        </section>
      </div>
    </>
  );
}
