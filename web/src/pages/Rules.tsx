import { useEffect, useState } from "react";
import { isAddress, type Address } from "viem";
import { Modal, PageHead, Pill, app } from "../components.tsx";
import { EXPLORER, short } from "../chain.ts";
import { fmt, toUnits, type Model } from "../model.ts";
import { useApp } from "../state.tsx";
import { BillForm } from "./BillForm.tsx";
import { ImportPanel } from "./Panels.tsx";
import "./rules.css";

const every = (d: number) => (d === 0 ? "once" : d === 7 ? "weekly" : d === 14 ? "every 2 weeks" : d === 30 ? "every 30 days" : d === 365 ? "yearly" : `every ${d} days`);

function PayeeForm({ onClose }: { onClose: () => void }) {
  const { act, busy } = useApp();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"allow" | "block">("allow");
  const [reason, setReason] = useState("");
  // One address per line; anything after the address on a line (a name, a comma) is ignored.
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const parsed = lines.map((l) => ({ line: l, addr: (l.match(/0x[0-9a-fA-F]{40}/) ?? [""])[0] }));
  const bad = parsed.filter((p) => !isAddress(p.addr));
  const addrs = [...new Map(parsed.filter((p) => isAddress(p.addr)).map((p) => [p.addr.toLowerCase(), p.addr as Address])).values()];
  const go = async () => {
    const one = addrs.length === 1;
    const ok = await act(
      `${mode === "allow" ? "Approved" : "Blocked"} ${one ? short(addrs[0]) : `${addrs.length} payees`}`,
      one
        ? { fn: mode === "allow" ? "setPayeeAllowed" : "setPayeeBlocked", args: [addrs[0], true, reason.trim()] }
        : { fn: mode === "allow" ? "setPayeesAllowed" : "setPayeesBlocked", args: [addrs, true, reason.trim()] },
      (m: Model) => ({
        ...m,
        payees: [
          ...m.payees.filter((p) => !addrs.some((a) => a.toLowerCase() === p.addr.toLowerCase())),
          ...addrs.map((a) => ({ addr: a, label: "", allowed: mode === "allow", blocked: mode === "block", paid: 0 })),
        ],
      }),
    );
    if (ok) onClose();
  };
  return (
    <Modal title="Add payees" onClose={onClose}>
      <label className="form-row"><span>Addresses, one per line (up to 50)</span>
        <textarea className="import-box mono" rows={5} placeholder={"0x2d7a…  Northwind Hosting\n0x51d0…  Atlas Freight"} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      </label>
      {bad.length > 0 && <p className="xs" style={{ color: "var(--status-critical)" }}>No 0x address on: {bad.map((b) => `"${b.line.slice(0, 24)}"`).join(", ")}</p>}
      <label className="form-row"><span>List</span>
        <select value={mode} onChange={(e) => setMode(e.target.value as "allow" | "block")}>
          <option value="allow">Approved: Sluice may pay their bills alone, inside the caps</option>
          <option value="block">Blocked: never paid, not even with your approval</option>
        </select>
      </label>
      <label className="form-row"><span>Reason for the record (stored on chain)</span>
        <input maxLength={280} placeholder={mode === "allow" ? "Suppliers from the Q1 contracts" : "Reported as scams"} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <div className="row-between" style={{ marginTop: 16, justifyContent: "flex-end" }}>
        <span className="grow xs faint">{addrs.length} address{addrs.length === 1 ? "" : "es"}</span>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!addrs.length || bad.length > 0 || addrs.length > 50 || !reason.trim() || !!busy} onClick={go}>
          {busy ? "Signing…" : "Sign"}
        </button>
      </div>
    </Modal>
  );
}

export default function Rules() {
  const { model: m, act, busy } = useApp();
  const [buffer, setBuffer] = useState("");
  const [threshold, setThreshold] = useState("");
  const [modal, setModal] = useState<"bill" | "payee" | "import" | null>(null);
  useEffect(() => {
    if (!m) return;
    setBuffer(fmt(m.cashBuffer).replace(/,/g, ""));
    setThreshold(fmt(m.threshold).replace(/,/g, ""));
  }, [m?.cashBuffer, m?.threshold]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!m) return null;
  const s = m.session;

  const save = async (fn: "setCashBuffer" | "setApprovalThreshold", text: string) => {
    let v: bigint;
    try {
      v = toUnits(text);
    } catch {
      return;
    }
    await act(fn === "setCashBuffer" ? `Cash buffer set to ${fmt(v)}` : `Approval threshold set to ${fmt(v)}`, (reason) => ({ fn, args: [v, reason] }), (mm) => (fn === "setCashBuffer" ? { ...mm, cashBuffer: v } : { ...mm, threshold: v }));
  };

  const togglePayee = (addr: Address, field: "allowed" | "blocked", value: boolean) =>
    act(`${field === "allowed" ? (value ? "Approved" : "Removed") : value ? "Blocked" : "Unblocked"} ${short(addr)}`, (reason) => ({ fn: field === "allowed" ? "setPayeeAllowed" : "setPayeeBlocked", args: [addr, value, reason] }), (mm) => ({
      ...mm,
      payees: mm.payees.map((p) => (p.addr === addr ? { ...p, [field]: value } : p)),
    }));

  const cancelBill = (id: number) =>
    act(`Cancelled bill #${id}`, (reason) => ({ fn: "cancelBill", args: [BigInt(id), reason] }), (mm) => ({ ...mm, bills: mm.bills.map((b) => (b.id === id ? { ...b, active: false } : b)), upcoming: mm.upcoming.filter((u) => u.billId !== id) }));

  const row = (k: string, sub: string, input: JSX.Element) => (
    <div key={k} className="ru-row">
      <div className="grow"><p className="small w500">{k}</p><p className="faint xs">{sub}</p></div>
      {input}
    </div>
  );

  return (
    <>
      <PageHead title="Rules" sub="Enforced by the SluiceVault contract. Only your key can change them.">
        <a className="btn btn-secondary" href={m.live ? `${EXPLORER}/address/${m.vault}` : "#/app/rules"} target={m.live ? "_blank" : undefined} rel="noreferrer">View contract</a>
      </PageHead>

      <div className="ru-grid">
        <section className="card">
          <p className="card-title">Spending limits</p>
          <p className="card-sub" style={{ paddingBottom: 8 }}>Every agent payment</p>
          {row("Per payment", "Agent session cap; change it under Settings", <span className="ru-input ro"><span className="v">{fmt(s?.perPaymentCap ?? 0n)}</span><span>tUSD8</span></span>)}
          {row("Per 24 hours", "Rolling, not a calendar day", <span className="ru-input ro"><span className="v">{fmt(s?.dailyCap ?? 0n)}</span><span>tUSD8</span></span>)}
          {row("Approval needed above", "Larger bills go to Approvals",
            <span className="ru-edit"><label className="ru-input"><input value={threshold} inputMode="decimal" onChange={(e) => setThreshold(e.target.value)} /><span>tUSD8</span></label>
              {toUnitsSafe(threshold) !== m.threshold && <button className="btn btn-primary ru-save" disabled={!!busy} onClick={() => save("setApprovalThreshold", threshold)}>Sign</button>}</span>)}
          {row("Cash buffer", "No agent payment may go below it",
            <span className="ru-edit"><label className="ru-input"><input value={buffer} inputMode="decimal" onChange={(e) => setBuffer(e.target.value)} /><span>tUSD8</span></label>
              {toUnitsSafe(buffer) !== m.cashBuffer && <button className="btn btn-primary ru-save" disabled={!!busy} onClick={() => save("setCashBuffer", buffer)}>Sign</button>}</span>)}
          {row("Spike alert", "Above a payee's last 3 payments; the agent sends it to you", <span className="ru-input ro"><span className="v">25</span><span>%</span></span>)}
        </section>

        <section className="card">
          <div className="row-between" style={{ paddingBottom: 8 }}>
            <div className="grow"><p className="card-title">Payees</p><p className="card-sub">Approved ones are paid without asking, inside the caps</p></div>
            <button className="btn btn-secondary" onClick={() => setModal("payee")}>Add payees</button>
          </div>
          {m.payees.map((p) => (
            <div key={p.addr} className="ru-row">
              <div className="grow"><p className="small w500">{p.label || "Unnamed payee"}</p><p className="mono faint xs">{short(p.addr)} on Aevum · paid {p.paid}×</p></div>
              {p.blocked ? (
                <button className="pill pill-blocked pill-btn" title="Unblock" onClick={() => togglePayee(p.addr, "blocked", false)}>Blocked</button>
              ) : p.allowed ? (
                <button className="pill pill-auto pill-btn" title="Remove from approved list" onClick={() => togglePayee(p.addr, "allowed", false)}>Allowed</button>
              ) : (
                <span className="ru-edit">
                  <button className="btn btn-secondary ac-sm" onClick={() => togglePayee(p.addr, "allowed", true)}>Approve</button>
                  <button className="btn btn-danger ac-sm" onClick={() => togglePayee(p.addr, "blocked", true)}>Block</button>
                </span>
              )}
            </div>
          ))}
        </section>
      </div>

      <section className="card">
        <div className="row-between" style={{ paddingBottom: 8 }}>
          <div className="grow"><p className="card-title">Bills</p><p className="card-sub">The only payments Sluice can make: this payee, this amount, this schedule</p></div>
          <button className="btn btn-secondary" onClick={() => setModal("import")}>Import bills</button>
          <button className="btn btn-primary" onClick={() => setModal("bill")}>List a bill</button>
        </div>
        {m.bills.length === 0 && <p className="muted small">No bills yet.</p>}
        {m.bills.map((b) => (
          <div key={b.id} className="ru-row">
            <div className="grow"><p className="small w500">#{b.id} {b.label}{b.critical && <span className="pill pill-approval" style={{ marginLeft: 8 }}>Critical</span>}</p><p className="mono faint xs">{short(b.payee)} · {every(b.intervalDays)} from {new Date(b.firstDue * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p></div>
            <span className="small w500">{fmt(b.amount)} tUSD8</span>
            {b.active ? <button className="btn btn-ghost ac-sm" onClick={() => cancelBill(b.id)}>Cancel</button> : <Pill kind="neutral">Cancelled</Pill>}
          </div>
        ))}
      </section>

      <section className="ru-agent">
        <div className="grow">
          <p style={{ fontSize: 16, fontWeight: 500 }}>What the agent can and cannot do</p>
          <p className="ru-agent-sub">Its session key can only call pay(bill, period) for bills you listed, and propose() the rest. It cannot change rules, add payees or bills, approve, withdraw or overspend.</p>
          <code className="mono">{s ? `${short(s.agent)}, ${s.active ? `expires ${new Date(s.expiresAt * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "revoked"}` : "no agent session"}</code>
        </div>
        <div className="ru-agent-actions">
          <button className="btn ru-dark-danger" onClick={() => act(m.paused ? "Payments resumed" : "All agent payments paused", { fn: m.paused ? "unpause" : "pause", args: [] }, (mm) => ({ ...mm, paused: !mm.paused }))}>{m.paused ? "Resume payments" : "Pause all payments"}</button>
          <a className="btn ru-dark" href={app("settings")}>Manage agent key</a>
        </div>
      </section>

      {modal === "bill" && <BillForm onClose={() => setModal(null)} />}
      {modal === "payee" && <PayeeForm onClose={() => setModal(null)} />}
      {modal === "import" && <ImportPanel onClose={() => setModal(null)} />}
    </>
  );
}

function toUnitsSafe(t: string): bigint | null {
  try {
    return toUnits(t);
  } catch {
    return null;
  }
}
