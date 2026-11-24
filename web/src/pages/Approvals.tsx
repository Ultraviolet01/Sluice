import { useState } from "react";
import { PageHead, Pill, Search, TxLink } from "../components.tsx";
import { short } from "../chain.ts";
import { ago, dayLabel, fmt, type ApprovalRow, type Model } from "../model.ts";
import { useApp } from "../state.tsx";
import { confirmPayee, copLine, useIdentities, type Identity } from "../payee.ts";
import anchor from "../assets/icons/anchor.svg";
import shield from "../assets/icons/shield.svg";
import check from "../assets/icons/check.svg";
import shieldSm from "../assets/icons/shield-sm.svg";
import flowArrow from "../assets/icons/flow-arrow.svg";
import "./approvals.css";

const tag = (a: ApprovalRow) =>
  a.status === "approved" ? { kind: "settled" as const, text: "Approved" }
  : a.status === "rejected" ? { kind: "blocked" as const, text: "Rejected" }
  : a.status === "released" ? { kind: "neutral" as const, text: "Released" }
  : { kind: "approval" as const, text: "Needs approval" };

/** The agent's note, minus a repeat of the vault's own reason. */
function noteText(a: ApprovalRow): string {
  const n = a.note.replace(/^needs you:\s*/i, "").trim();
  return n && n.toLowerCase() !== a.why.toLowerCase() ? n[0].toUpperCase() + n.slice(1) : "";
}

function checks(m: Model, a: ApprovalRow, ids: Identity[] | null) {
  const p = m.payees.find((x) => x.addr.toLowerCase() === a.payee.toLowerCase());
  const s = m.session;
  const after = m.balance - a.amount;
  const cop = ids ? copLine(confirmPayee(a.payee, a.label, ids), a.payee, Boolean(p?.allowed && !p?.blocked)) : null;
  return [
    ...(cop ? [{ label: cop.text, pass: cop.ok === true }] : []),
    { label: "Payee not on the blocklist", pass: !p?.blocked, fail: "Blocked: cannot be paid" },
    { label: "Payee on your approved list", pass: Boolean(p?.allowed) },
    { label: `Within the ${fmt(s?.perPaymentCap ?? 0n)} per-payment cap`, pass: s ? a.amount <= s.perPaymentCap : false },
    { label: `At or below the ${fmt(m.threshold)} approval threshold`, pass: a.amount <= m.threshold },
    { label: `Keeps the ${fmt(m.cashBuffer)} cash buffer (leaves ${fmt(after)})`, pass: after >= m.cashBuffer },
  ];
}

export default function Approvals() {
  const { model: m, act, busy, isOwner } = useApp();
  const [tab, setTab] = useState<"waiting" | "decided">("waiting");
  const [q, setQ] = useState("");
  const ids = useIdentities();
  // From a Telegram alert's "Approve in Sluice": open that payment.
  const [selected, setSelected] = useState<string | null>(() => {
    const q = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
    const b = q.get("bill"), p = q.get("period");
    return b !== null && p !== null && /^\d+$/.test(b) && /^\d+$/.test(p) ? `${b}:${p}` : null;
  });
  if (!m) return null;

  const match = (a: ApprovalRow) => !q || `${a.label} ${a.payee}`.toLowerCase().includes(q.toLowerCase());
  const waiting = m.approvals.filter((a) => a.status === "waiting" && match(a));
  const decided = m.approvals.filter((a) => a.status !== "waiting" && match(a));
  const current = m.approvals.find((a) => a.key === selected) ?? waiting[0] ?? decided[0];
  const isOpen = current?.status === "waiting";

  const decide = (a: ApprovalRow, d: "approved" | "rejected") =>
    act(
      `${d === "approved" ? "Approved" : "Rejected"} ${a.label}`,
      { fn: d === "approved" ? "approve" : "reject", args: [BigInt(a.billId), a.period] },
      (mm) => ({
        ...mm,
        balance: d === "approved" ? mm.balance - a.amount : mm.balance,
        approvals: mm.approvals.map((x) => (x.key === a.key ? { ...x, status: d } : x)),
        activity: [{ at: Date.now() / 1000, what: `${d === "approved" ? "Paid" : "Rejected"} ${a.label}`, amount: d === "approved" ? a.amount : null, sign: d === "approved" ? "out" : "none", kind: d === "approved" ? "settled" : "blocked", outcome: d === "approved" ? "Approved" : "Rejected", rule: d === "approved" ? "Approved by you" : "Rejected by you", tx: "", type: d === "approved" ? "approved" : "blocked" }, ...mm.activity],
      }),
    );

  const release = (a: ApprovalRow) =>
    act(`Released ${a.label}`, { fn: "releaseBill", args: [BigInt(a.billId), a.period] }, (mm) => ({
      ...mm,
      approvals: mm.approvals.map((x) => (x.key === a.key ? { ...x, status: "released" } : x)),
    }));

  const Item = ({ a }: { a: ApprovalRow }) => {
    const t = tag(a);
    return (
      <button className={`ap-item${a.key === current?.key ? " on" : ""}`} onClick={() => setSelected(a.key)}>
        <div className="row-between"><span className="grow"><Pill kind={t.kind}>{t.text}</Pill></span><span className="faint xs">{ago(a.createdAt)}</span></div>
        <div className="row-between t14"><span className="grow">{a.label}</span><span>{fmt(a.amount)} tUSD8</span></div>
        <p className="muted xs">{a.why[0].toUpperCase() + a.why.slice(1)}</p>
      </button>
    );
  };

  return (
    <>
      <PageHead title="Approvals" sub={`${waiting.length} waiting for you`}><Search value={q} onChange={setQ} /></PageHead>
      <div className="ap-layout">
        <section className="card ap-list">
          <div className="tabs">
            <button className={tab === "waiting" ? "on" : ""} onClick={() => setTab("waiting")}>Waiting ({waiting.length})</button>
            <button className={tab === "decided" ? "on" : ""} onClick={() => setTab("decided")}>Decided</button>
          </div>
          {tab === "waiting" ? (
            <>
              {waiting.length === 0 && <p className="muted small" style={{ padding: 8 }}>Nothing waiting. Sluice is inside your line.</p>}
              {waiting.map((a) => <Item key={a.key} a={a} />)}
              {decided.length > 0 && <p className="faint xs" style={{ padding: "8px 8px 0" }}>Recently decided</p>}
              {decided.slice(0, 2).map((a) => <Item key={a.key} a={a} />)}
            </>
          ) : decided.map((a) => <Item key={a.key} a={a} />)}
        </section>

        {current ? (
          <section className="card ap-detail">
            <div>
              <div className="row-between" style={{ gap: 8 }}>
                <Pill kind={tag(current).kind}>{isOpen ? "Needs your approval" : tag(current).text}</Pill>
                <span className="faint xs">Bill #{current.billId}, payment {current.period + 1}, proposed by Sluice {ago(current.createdAt)} ago {current.tx && <>· <TxLink tx={current.tx} /></>}</span>
              </div>
              <p className="ap-title">{current.label}</p>
              <p><span className="display ap-amount">{fmt(current.amount)}</span> <span className="unit">tUSD8</span></p>
            </div>

            <div className="ap-flow">
              <div className="ap-node"><p className="faint xs">From</p><p className="t14">SluiceVault</p><p className="muted xs">{fmt(m.balance)} → {fmt(m.balance - current.amount)}</p></div>
              <div className="ap-mid">
                <img src={flowArrow} width={96} height={20} alt="" />
                <p className="xs" style={{ color: "var(--accent-sluice)", fontWeight: 500 }}>tUSD8 on Aevum</p>
                <p className="faint" style={{ fontSize: 11 }}>exact amount on the bill</p>
              </div>
              <div className="ap-node"><p className="faint xs">To</p><p className="t14">{current.label}</p><p className="muted xs mono">{short(current.payee)}</p></div>
            </div>

            <div>
              <p className="ap-h"><img src={anchor} width={20} height={20} alt="" />Why Sluice brought this to you</p>
              <ol className="ap-reasons">
                <li><span>1</span>The vault said: {current.why}.</li>
                {noteText(current) && <li><span>2</span>{noteText(current)}</li>}
              </ol>
            </div>

            <div>
              <div className="row-between"><p className="ap-h grow"><img src={shield} width={20} height={20} alt="" />Policy checks</p><span className="faint xs">enforced by the vault; payee checked against ERC-8004</span></div>
              {checks(m, current, ids).map((c) => (
                <div key={c.label} className="ap-check">
                  <span className={`ap-ic ${c.pass ? "ok" : "warn"}`}><img src={c.pass ? check : shieldSm} width={14} height={14} alt="" /></span>
                  <span className="grow small">{c.label}</span>
                  <span className={`xs w500 ${c.pass ? "ok-t" : "brass"}`}>{c.pass ? "Pass" : c.fail ?? "Needs you"}</span>
                </div>
              ))}
            </div>

            {current.status === "rejected" && (
              <div className="ap-release">
                <div className="grow">
                  <p className="t14">Rejected by mistake?</p>
                  <p className="muted xs">Releasing reopens this payment: Sluice can propose it again on its next round, and you decide again. Nothing is paid by releasing.</p>
                </div>
                <button className="btn btn-secondary" disabled={!!busy} onClick={() => release(current)}>Release</button>
              </div>
            )}
            {current.status === "released" && <p className="muted small">Released: Sluice will propose this payment again on its next round.</p>}
            <div className="ap-actions">
              <div className="grow">
                <p className="muted xs">Signs vault.approve({current.billId}, {current.period})</p>
                <p className="mono faint xs">{m.owner ? `${short(m.owner)}, owner wallet` : ""}{m.live && !isOwner ? " · connect it to sign" : ""}</p>
              </div>
              <button className="btn btn-danger" disabled={!isOpen || !!busy} onClick={() => decide(current, "rejected")}>Reject</button>
              <button className="btn btn-primary" disabled={!isOpen || !!busy} onClick={() => decide(current, "approved")}>{busy ? "Signing…" : "Approve and sign"}</button>
            </div>
            <p className="faint xs">Due {dayLabel(m.bills[current.billId] ? m.bills[current.billId].firstDue + current.period * m.bills[current.billId].intervalDays * 86400 : current.createdAt)}. Approving pays the bill's own payee its listed amount, once; the agent's budget is not charged.</p>
          </section>
        ) : (
          <section className="card ap-detail"><p className="muted">No proposals yet. When a bill falls outside the agent's limits, it appears here.</p></section>
        )}
      </div>
    </>
  );
}
