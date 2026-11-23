import { useEffect, useState } from "react";
import { PageHead, Pill, Search } from "../components";
import type { Approval } from "../data";
import { ORG } from "../data";
import anchor from "../assets/icons/anchor.svg";
import shield from "../assets/icons/shield.svg";
import check from "../assets/icons/check.svg";
import shieldSm from "../assets/icons/shield-sm.svg";
import flowArrow from "../assets/icons/flow-arrow.svg";
import "./approvals.css";

const REASONS = [
  "Payroll needs 11,100 by Nov 7 and has 4,180: short 6,920",
  "Vendors can spare 8,795 and keep its 4,000 minimum",
  "Sending 8,000 keeps both vaults above their minimums",
  "Rejected: pay from Treasury (eats its buffer) or wait (payroll fails)",
];

const CHECKS = [
  { label: "Destination allowlisted", pass: true },
  { label: "Counterparty: own vault", pass: true },
  { label: "Minimums and cash buffer kept", pass: true },
  { label: "Over 100 auto limit", pass: false },
  { label: "Vault-to-vault move", pass: false },
];

function useCountdown(start: number) {
  const [s, setS] = useState(start);
  useEffect(() => {
    const t = setInterval(() => setS((v) => (v > 0 ? v - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function Approvals({ items, onDecide }: {
  items: Approval[];
  onDecide: (id: string, decision: "approved" | "rejected") => void;
}) {
  const [tab, setTab] = useState<"waiting" | "decided">("waiting");
  const waiting = items.filter((i) => i.status === "waiting");
  const decided = items.filter((i) => i.status !== "waiting");
  const [selected, setSelected] = useState(waiting[0]?.id ?? items[0].id);
  const current = items.find((i) => i.id === selected) ?? items[0];
  const expires = useCountdown(9 * 60 + 12);
  const isOpen = current.status === "waiting";

  const Item = ({ a }: { a: Approval }) => (
    <button className={`ap-item${a.id === selected ? " on" : ""}`} onClick={() => setSelected(a.id)}>
      <div className="row-between"><span className="grow"><Pill kind={a.tagKind}>{a.tag}</Pill></span><span className="faint xs">{a.age}</span></div>
      <div className="row-between t14"><span className="grow">{a.title}</span><span>{a.amount}</span></div>
      <p className="muted xs">{a.sub}</p>
    </button>
  );

  return (
    <>
      <PageHead title="Approvals" sub={`${waiting.length} waiting for you`}><Search /></PageHead>
      <div className="ap-layout">
        <section className="card ap-list">
          <div className="tabs">
            <button className={tab === "waiting" ? "on" : ""} onClick={() => setTab("waiting")}>Waiting ({waiting.length})</button>
            <button className={tab === "decided" ? "on" : ""} onClick={() => setTab("decided")}>Decided</button>
          </div>
          {tab === "waiting" ? (
            <>
              {waiting.length === 0 && <p className="muted small" style={{ padding: 8 }}>Nothing waiting. Sluice is within its line.</p>}
              {waiting.map((a) => <Item key={a.id} a={a} />)}
              <p className="faint xs" style={{ padding: "8px 8px 0" }}>Recently decided</p>
              {decided.slice(0, 2).map((a) => <Item key={a.id} a={a} />)}
            </>
          ) : decided.map((a) => <Item key={a.id} a={a} />)}
        </section>

        <section className="card ap-detail">
          <div className="row-between" style={{ alignItems: "flex-start" }}>
            <div className="grow">
              <div className="row-between" style={{ gap: 8 }}>
                <Pill kind={isOpen ? "approval" : current.tagKind}>{isOpen ? "Needs your approval" : current.tag}</Pill>
                <span className="faint xs">Invoice {current.id}, created by Sluice {current.age} ago</span>
              </div>
              <p className="ap-title">{current.title}</p>
              <p><span className="display ap-amount">{current.amount.replace(" tUSD8", "")}</span> {current.amount.includes("tUSD8") && <span className="unit">tUSD8</span>}</p>
            </div>
            {isOpen && (
              <div className="ap-expiry">
                <p className="xs brass">Quote expires in</p>
                <p className="display">{expires}</p>
              </div>
            )}
          </div>

          <div className="ap-flow">
            <div className="ap-node"><p className="faint xs">Aevum</p><p className="t14">Vendors</p><p className="muted xs">12,795.40 → 4,795.40</p></div>
            <div className="ap-mid">
              <img src={flowArrow} width={96} height={20} alt="" />
              <p className="xs" style={{ color: "var(--accent-sluice)", fontWeight: 500 }}>Vault-to-vault, tUSD8</p>
              <p className="faint" style={{ fontSize: 11 }}>gas ~0.002 tQDAY, ~2 s</p>
            </div>
            <div className="ap-node"><p className="faint xs">Aevum</p><p className="t14">Payroll</p><p className="muted xs">4,180.00 → 12,180.00</p></div>
          </div>

          <div>
            <p className="ap-h"><img src={anchor} width={20} height={20} alt="" />Why Sluice proposed this</p>
            <ol className="ap-reasons">
              {REASONS.map((r, i) => <li key={i}><span>{i + 1}</span>{r}</li>)}
            </ol>
          </div>

          <div>
            <div className="row-between"><p className="ap-h grow"><img src={shield} width={20} height={20} alt="" />Policy checks</p><span className="faint xs">enforced by the vault</span></div>
            {CHECKS.map((c) => (
              <div key={c.label} className="ap-check">
                <span className={`ap-ic ${c.pass ? "ok" : "warn"}`}><img src={c.pass ? check : shieldSm} width={14} height={14} alt="" /></span>
                <span className="grow small">{c.label}</span>
                <span className={`xs w500 ${c.pass ? "ok-t" : "brass"}`}>{c.pass ? "Pass" : "Needs you"}</span>
              </div>
            ))}
          </div>

          <div className="ap-actions">
            <div className="grow">
              <p className="muted xs">Signs vault.approve({current.id})</p>
              <p className="mono faint xs">{ORG.owner}, owner wallet</p>
            </div>
            <button className="btn btn-danger" disabled={!isOpen} onClick={() => onDecide(current.id, "rejected")}>Reject</button>
            <button className="btn btn-secondary" disabled={!isOpen}>Edit amount</button>
            <button className="btn btn-primary" disabled={!isOpen} onClick={() => onDecide(current.id, "approved")}>Approve and sign</button>
          </div>
        </section>
      </div>
    </>
  );
}
