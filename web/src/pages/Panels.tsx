import { useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import { Modal } from "../components.tsx";
import { FACTORY, createCompany, errorText, myCompanies, short } from "../chain.ts";
import { fmt, toUnits, type Model } from "../model.ts";
import { useApp } from "../state.tsx";
import { parseBills } from "./importBills.ts";

const SAMPLE = `name, payee, amount, first due, repeat, critical
Northwind Hosting, 0x2d7a…, 80, 2026-12-01, monthly, no
Contractor payroll, 0x4f1c…, 9600, 2026-12-07, 2 weeks, yes`;

/** Paste or upload many bills; checked here, listed with one addBills signature. */
export function ImportPanel({ onClose }: { onClose: () => void }) {
  const { act, busy } = useApp();
  const [text, setText] = useState("");
  const rows = useMemo(() => parseBills(text), [text]);
  const good = rows.filter((r) => r.bill);
  const bad = rows.filter((r) => r.error);

  const file = async (f: File) => setText(await f.text());
  const go = async () => {
    const bills = good.map((r) => r.bill!);
    const ok = await act(`Listed ${bills.length} bills`, { fn: "addBills", args: [bills] }, (m: Model) => ({
      ...m,
      bills: [...m.bills, ...bills.map((b, i) => ({ id: m.bills.length + i, payee: b.payee, amount: b.amount, firstDue: Number(b.firstDue), intervalDays: b.intervalDays, active: true, critical: b.critical, label: b.label }))],
    }));
    if (ok) onClose();
  };

  return (
    <Modal title="Import bills" onClose={onClose}>
      <p className="muted small">One bill per line: name, payee address, amount in tUSD8, first due date (YYYY-MM-DD), repeat (once, weekly, 2 weeks, monthly, yearly or a number of days), critical (yes or no). Up to 50 at a time, listed with one signature.</p>
      <label className="drop" style={{ marginTop: 12 }}>
        <input type="file" accept=".csv,text/csv,text/plain" hidden onChange={(e) => e.target.files?.[0] && file(e.target.files[0])} />
        Upload a CSV file, or paste below
      </label>
      <textarea className="import-box mono" rows={8} placeholder={SAMPLE} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      {rows.length > 0 && (
        <div className="import-preview">
          {rows.map((r) => (
            <div key={r.line} className={`import-row${r.error ? " bad" : ""}`}>
              <span className="faint xs">Line {r.line}</span>
              {r.bill ? (
                <span className="grow small">
                  {r.bill.label} · {short(r.bill.payee)} · {fmt(r.bill.amount)} tUSD8 · {r.bill.intervalDays ? `every ${r.bill.intervalDays} days` : "once"}{r.bill.critical ? " · critical" : ""}
                </span>
              ) : (
                <span className="grow small">{r.error}</span>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="row-between" style={{ marginTop: 16, justifyContent: "flex-end" }}>
        <span className="grow xs faint">{good.length} ready{bad.length ? `, ${bad.length} to fix` : ""}</span>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!good.length || bad.length > 0 || good.length > 50 || !!busy} onClick={go}>
          {busy ? "Signing…" : `List ${good.length || ""} bill${good.length === 1 ? "" : "s"} and sign`}
        </button>
      </div>
    </Modal>
  );
}

/** Creates the connected wallet's company vault through the factory, then opens it. */
export function CreatePanel({ onClose }: { onClose: () => void }) {
  const { account, connect, toast } = useApp();
  const [f, setF] = useState({ name: "", buffer: "100", threshold: "100" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setErr(null);
    try {
      if (!account) throw new Error("Connect your wallet first");
      const name = f.name.trim();
      if (!name || name.length > 48) throw new Error("Give the company a name (up to 48 characters)");
      setBusy(true);
      const vault = await createCompany(account, name, toUnits(f.buffer), toUnits(f.threshold));
      toast(`Created ${name}: ${short(vault)}`);
      window.location.hash = `#/app/rules?vault=${vault}`;
      window.location.reload();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (!FACTORY) {
    return (
      <Modal title="Create your company" onClose={onClose}>
        <p className="muted small">Company creation isn't switched on for this site yet (it needs <code>VITE_FACTORY_ADDRESS</code>). You can still deploy a vault from <code>contracts/</code> and open it with <code>?vault=0x…</code>.</p>
      </Modal>
    );
  }
  return (
    <Modal title="Create your company" onClose={onClose}>
      <p className="muted small">One signature creates your company's own SluiceVault on Aevum Testnet. Your wallet becomes its owner; nobody else, including Sluice, can change its rules or take its money.</p>
      {!account && <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={connect}>Connect wallet</button>}
      <label className="form-row"><span>Company name</span><input maxLength={48} placeholder="Kora Supply Group" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <label className="form-row"><span>Cash buffer (tUSD8): the agent never spends below this</span><input inputMode="decimal" value={f.buffer} onChange={(e) => setF({ ...f, buffer: e.target.value })} /></label>
      <label className="form-row"><span>Approval needed above (tUSD8)</span><input inputMode="decimal" value={f.threshold} onChange={(e) => setF({ ...f, threshold: e.target.value })} /></label>
      <p className="faint xs" style={{ marginTop: 10 }}>Next: approve payees, list bills, fund the vault with tUSD8, and grant the agent a session. You can change every setting later.</p>
      {err && <p className="xs" style={{ color: "var(--status-critical)", marginTop: 8 }}>{err}</p>}
      <div className="row-between" style={{ marginTop: 16, justifyContent: "flex-end" }}>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy || !account} onClick={go}>{busy ? "Creating…" : "Create and sign"}</button>
      </div>
    </Modal>
  );
}

/** The companies the connected wallet created, to switch between them. */
export function CompanySwitch({ current }: { current: Address }) {
  const { account } = useApp();
  const [list, setList] = useState<{ vault: Address; name: string }[]>([]);
  useEffect(() => {
    if (account) myCompanies(account).then(setList).catch(() => setList([]));
  }, [account]);
  if (list.length < 2) return null;
  return (
    <select
      className="company-select"
      aria-label="Switch company"
      value={list.find((c) => c.vault.toLowerCase() === current.toLowerCase())?.vault ?? ""}
      onChange={(e) => {
        window.location.hash = `#/app/overview?vault=${e.target.value}`;
        window.location.reload();
      }}
    >
      {!list.some((c) => c.vault.toLowerCase() === current.toLowerCase()) && <option value="">Switch company…</option>}
      {list.map((c) => <option key={c.vault} value={c.vault}>{c.name}</option>)}
    </select>
  );
}
