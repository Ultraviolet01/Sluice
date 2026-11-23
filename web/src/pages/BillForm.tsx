import { useState } from "react";
import { isAddress, type Address } from "viem";
import { Modal } from "../components.tsx";
import { toUnits, type Model } from "../model.ts";
import { useApp } from "../state.tsx";
import { readInvoice } from "../invoice.ts";

/** Lists a bill on the vault (addBill), optionally drafted from an invoice by Claude. */
export function BillForm({ onClose }: { onClose: () => void }) {
  const { act, busy } = useApp();
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ label: "", payee: "", amount: "", due: today, repeat: "0", invoiceText: "", critical: false });
  const [err, setErr] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  async function readOne(file: File) {
    setReading(true);
    setErr(null);
    try {
      const d = await readInvoice(file);
      setF((x) => ({ ...x, label: d.vendor || x.label, payee: d.address || x.payee, amount: d.amount || x.amount, due: d.due || x.due, invoiceText: d.summary || "" }));
    } catch (e) {
      setErr(`${(e as Error).message}. You can still fill the bill in by hand.`);
    } finally {
      setReading(false);
    }
  }

  async function submit() {
    setErr(null);
    try {
      if (!f.label.trim()) throw new Error("Give the bill a name");
      if (!isAddress(f.payee)) throw new Error("Payee must be a 0x address");
      const amount = toUnits(f.amount);
      if (amount <= 0n) throw new Error("Amount must be above zero");
      const due = BigInt(Math.floor(new Date(`${f.due}T09:00:00Z`).getTime() / 1000));
      const interval = Number(f.repeat);
      const label = f.label.trim().slice(0, 64);
      const ok = await act(`Listed ${label}`, { fn: "addBill", args: [f.payee as Address, amount, due, interval, f.critical, label] }, (m: Model) => ({
        ...m,
        bills: [...m.bills, { id: m.bills.length, payee: f.payee as Address, amount, firstDue: Number(due), intervalDays: interval, active: true, critical: f.critical, label }],
        upcoming: [...m.upcoming, { billId: m.bills.length, period: 0, label, payee: f.payee as Address, due: Number(due), amount, kind: "approval", status: "New payee" }],
      }));
      if (ok) onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const field = (k: Exclude<keyof typeof f, "critical">, label: string, props: Record<string, unknown> = {}) => (
    <label className="form-row">
      <span>{label}</span>
      <input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...props} />
    </label>
  );

  return (
    <Modal title="List a bill" onClose={onClose}>
      <p className="muted small" style={{ marginBottom: 14 }}>
        Sluice can only pay bills you list: this payee, this amount, on this schedule. A payee not on your approved list always comes back to you first.
      </p>
      <label className="drop">
        <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" hidden onChange={(e) => e.target.files?.[0] && readOne(e.target.files[0])} />
        {reading ? "Reading the invoice…" : "Upload an invoice (PDF or photo) to fill this in"}
      </label>
      {field("label", "Name", { placeholder: "Northwind Hosting", maxLength: 64 })}
      {field("payee", "Payee address", { placeholder: "0x…", className: "mono" })}
      {field("amount", "Amount (tUSD8)", { placeholder: "80.00", inputMode: "decimal" })}
      {field("due", "First due date", { type: "date" })}
      <label className="form-row">
        <span>Repeats</span>
        <select value={f.repeat} onChange={(e) => setF({ ...f, repeat: e.target.value })}>
          <option value="0">Once</option>
          <option value="7">Every week</option>
          <option value="14">Every 2 weeks</option>
          <option value="30">Every 30 days</option>
          <option value="365">Every year</option>
        </select>
      </label>
      <label className="check-row">
        <input type="checkbox" checked={f.critical} onChange={(e) => setF({ ...f, critical: e.target.checked })} />
        <span><b>Critical</b>: paid first, and never held back to protect the cash buffer (payroll, rent)</span>
      </label>
      {f.invoiceText && <p className="faint xs" style={{ marginTop: 8 }}>From the invoice: {f.invoiceText}. Check every field before you sign.</p>}
      {err && <p className="xs" style={{ color: "var(--status-critical)", marginTop: 8 }}>{err}</p>}
      <div className="row-between" style={{ marginTop: 18, justifyContent: "flex-end" }}>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!!busy} onClick={submit}>{busy ? "Signing…" : "List bill and sign"}</button>
      </div>
    </Modal>
  );
}
