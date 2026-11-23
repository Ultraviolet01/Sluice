import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Address } from "viem";
import { Modal } from "../components.tsx";
import { FACTORY, HOSTED_AGENT, createCompany, deposit, errorText, explorerTxUrl, myCompanies, ownerSend, short, tokenBalance } from "../chain.ts";
import { fmt, toUnits, type Model } from "../model.ts";
import { useApp } from "../state.tsx";
import { parseBills } from "./importBills.ts";
import { draftToLine, readInvoice } from "../invoice.ts";

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

  const [reading, setReading] = useState<string | null>(null);
  const [readErr, setReadErr] = useState<string[]>([]);
  const file = async (f: File) => setText(await f.text());
  /** Several invoices: each becomes one line to check before signing. */
  const invoices = async (files: FileList) => {
    const errs: string[] = [];
    const out: string[] = [];
    const list = [...files].slice(0, 20);
    for (let i = 0; i < list.length; i++) {
      setReading(`Reading invoice ${i + 1} of ${list.length}…`);
      try {
        out.push(draftToLine(await readInvoice(list[i]), list[i].name.replace(/\.[^.]+$/, "")));
      } catch (e) {
        errs.push(`${list[i].name}: ${(e as Error).message}`);
      }
    }
    setText((t) => [t.trim(), ...out].filter(Boolean).join("\n"));
    setReadErr(errs);
    setReading(null);
  };
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
      <div className="import-drops">
        <label className="drop">
          <input type="file" accept=".csv,text/csv,text/plain" hidden onChange={(e) => e.target.files?.[0] && file(e.target.files[0])} />
          Upload a CSV file
        </label>
        <label className="drop">
          <input type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp" hidden onChange={(e) => e.target.files?.length && invoices(e.target.files)} />
          {reading ?? "Read invoices (PDFs or photos, up to 20)"}
        </label>
      </div>
      <p className="faint xs" style={{ marginTop: 6 }}>Each invoice becomes a line below. Check every field: a payment address the reader couldn't find is left empty for you.</p>
      {readErr.length > 0 && <p className="xs" style={{ color: "var(--status-critical)" }}>{readErr.join("; ")}</p>}
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
export function CreatePanel({ onClose, inline = false, first = false }: { onClose: () => void; inline?: boolean; first?: boolean }) {
  // In the first-visit flow it is a page of its own; elsewhere a window.
  const title = first ? "Name your first company" : "Create your company";
  const frame = (children: ReactNode) =>
    inline ? <section className="ob-card" aria-label={title}><h1 className="display ob-title">{title}</h1>{children}</section> : <Modal title={title} onClose={onClose}>{children}</Modal>;
  const { account, connect, toast } = useApp();
  const [f, setF] = useState({ name: "", buffer: "100", threshold: "100", hire: Boolean(HOSTED_AGENT), per: "100", daily: "500" });
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
      if (f.hire && HOSTED_AGENT) {
        // Second signature: give Sluice's hosted agent a 30-day session with these caps.
        const per = toUnits(f.per), daily = toUnits(f.daily);
        const exp = BigInt(Math.floor(Date.now() / 1000) + 30 * 86400);
        try {
          await ownerSend(vault, account, { fn: "grantSession", args: [HOSTED_AGENT, per, daily, exp, "Hired Sluice's agent at sign-up"] });
        } catch (e) {
          toast(`Company created; the agent's session wasn't signed (${errorText(e)}). Grant it under Settings.`);
        }
      }
      window.location.hash = `#/app/overview?vault=${vault}`;
      window.location.reload();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (!FACTORY) {
    return (
      frame(<>
        <p className="muted small">Company creation isn't switched on for this site yet (it needs <code>VITE_FACTORY_ADDRESS</code>). You can still deploy a vault from <code>contracts/</code> and open it with <code>?vault=0x…</code>.</p>
      </>)
    );
  }
  return (
    frame(<>
      <p className="muted small">One signature creates your company's own SluiceVault on Aevum Testnet. Your wallet becomes its owner; nobody else, including Sluice, can change its rules or take its money.</p>
      {!account && <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={connect}>Connect wallet</button>}
      <label className="form-row"><span>Company name</span><input maxLength={48} placeholder="Kora Supply Group" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <label className="form-row"><span>Cash buffer (tUSD8): the agent never spends below this</span><input inputMode="decimal" value={f.buffer} onChange={(e) => setF({ ...f, buffer: e.target.value })} /></label>
      <label className="form-row"><span>Approval needed above (tUSD8)</span><input inputMode="decimal" value={f.threshold} onChange={(e) => setF({ ...f, threshold: e.target.value })} /></label>
      {HOSTED_AGENT && (
        <>
          <label className="check-row">
            <input type="checkbox" checked={f.hire} onChange={(e) => setF({ ...f, hire: e.target.checked })} />
            <span><b>Hire Sluice's agent now</b> ({short(HOSTED_AGENT)}): a second signature gives it a 30-day session with these caps. It can only pay bills you list.</span>
          </label>
          {f.hire && (
            <div className="st-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <label className="form-row"><span>Per payment</span><input inputMode="decimal" value={f.per} onChange={(e) => setF({ ...f, per: e.target.value })} /></label>
              <label className="form-row"><span>Per 24 hours</span><input inputMode="decimal" value={f.daily} onChange={(e) => setF({ ...f, daily: e.target.value })} /></label>
            </div>
          )}
        </>
      )}
      <p className="faint xs" style={{ marginTop: 10 }}>Next: approve payees, list bills and fund the vault with tUSD8. You can change every setting later.</p>
      {err && <p className="xs" style={{ color: "var(--status-critical)", marginTop: 8 }}>{err}</p>}
      <div className="row-between" style={{ marginTop: 16, justifyContent: "flex-end" }}>
        {!inline && <button className="btn btn-secondary" onClick={onClose}>Cancel</button>}
        <button className="btn btn-primary" disabled={busy || !account} onClick={go}>{busy ? "Creating…" : "Create and sign"}</button>
      </div>
    </>)
  );
}

/**
 * The company card at the top of the sidebar. Clicking it opens "Your companies":
 * every company this wallet created, the current one marked, and "Add company".
 */
export function CompanySwitch() {
  const { model: m, account, isOwner, connect, disconnect } = useApp();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [list, setList] = useState<{ vault: Address; name: string; offered?: boolean }[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (account && m?.live) myCompanies(account).then(setList).catch(() => setList([]));
  }, [account, m?.live]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  if (!m) return null;

  const companies: { vault: Address; name: string; offered?: boolean }[] = m.live ? (list.some((c) => c.vault.toLowerCase() === m.vault.toLowerCase()) ? list : [{ vault: m.vault, name: m.name }, ...list]) : [{ vault: m.vault, name: m.name }];
  const go = (vault: Address) => {
    if (vault.toLowerCase() === m.vault.toLowerCase()) return setOpen(false);
    window.location.hash = `#/app/overview?vault=${vault}`;
    window.location.reload();
  };
  const owner = m.owner ? (account && isOwner ? "you" : short(m.owner)) : "—";

  return (
    <div className="cs" ref={ref}>
      <button className={`cs-card${open ? " open" : ""}`} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <span className="cs-text">
          <span className="row-between"><span className="cs-name">{m.name}</span><span className="chip">{m.live ? "Testnet" : "Demo"}</span></span>
          <span className="cs-sub mono">{short(m.vault)}</span>
          <span className="cs-sub">Owner: <span className="mono">{owner}</span></span>
        </span>
        <svg className="cs-chev" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M4 5.5 7 2.5l3 3M4 8.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {m.live && !account && <button className="btn btn-secondary cs-connect" onClick={connect}>Connect wallet</button>}
      {account && (
        <div className="cs-wallet">
          <span className="xs"><span className="cs-dot" aria-hidden="true" />Connected <span className="mono">{short(account)}</span></span>
          <button className="cs-disconnect xs" onClick={disconnect}>Disconnect</button>
        </div>
      )}
      {open && (
        <div className="cs-menu" role="menu">
          <p className="cs-head">Your companies</p>
          {companies.map((c) => {
            const on = c.vault.toLowerCase() === m.vault.toLowerCase();
            return (
              <button key={c.vault} role="menuitem" className={`cs-item${on ? " on" : ""}`} onClick={() => go(c.vault)} aria-current={on}>
                <span className="cs-badge display">{(c.name.trim()[0] ?? "?").toUpperCase()}</span>
                <span className="cs-text"><span className="cs-name">{c.name}</span><span className="cs-sub mono">{short(c.vault)}{c.offered ? " · offered to you" : ""}</span></span>
              </button>
            );
          })}
          {m.live && !account && <p className="cs-note xs">Connect your wallet to see all your companies.</p>}
          <div className="cs-sep" />
          <button role="menuitem" className="cs-item" onClick={() => { setOpen(false); setCreating(true); }}>
            <span className="cs-badge add">+</span>
            <span className="cs-name">Add company</span>
          </button>
        </div>
      )}
      {creating && <CreatePanel onClose={() => setCreating(false)} />}
    </div>
  );
}

/** Deposit tUSD8 from the connected wallet into the vault. */
export function DepositPanel({ onClose }: { onClose: () => void }) {
  const { model: m, account, connect, toast, reload } = useApp();
  const [amount, setAmount] = useState("");
  const [have, setHave] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (account && m?.live) tokenBalance(m.token, account).then(setHave).catch(() => setHave(null));
  }, [account, m?.live, m?.token]);
  if (!m) return null;

  const go = async () => {
    setErr(null);
    try {
      const v = toUnits(amount);
      if (v <= 0n) throw new Error("Enter an amount above zero");
      if (!m.live) {
        toast(`Demo: would send ${fmt(v)} tUSD8 to the vault`);
        return onClose();
      }
      if (!account) throw new Error("Connect your wallet first");
      if (have !== null && v > have) throw new Error(`Your wallet holds ${fmt(have)} tUSD8`);
      setBusy(true);
      const tx = await deposit(m.token, m.vault, account, v);
      toast(`Deposited ${fmt(v)} tUSD8`);
      await reload();
      window.open(explorerTxUrl(tx), "_blank", "noopener");
      onClose();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Deposit tUSD8" onClose={onClose}>
      <p className="muted small">Sends tUSD8 from your wallet into the vault. Anyone can deposit; only the owner can take money out. Get test tUSD8 at faucet.qday.info.</p>
      {m.live && !account && <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={connect}>Connect wallet</button>}
      <label className="form-row">
        <span>Amount (tUSD8){have !== null ? ` · your wallet holds ${fmt(have)}` : ""}</span>
        <input inputMode="decimal" autoFocus placeholder="100.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      {have !== null && have > 0n && <button className="link-btn xs" onClick={() => setAmount(fmt(have).replace(/,/g, ""))}>Use all</button>}
      <p className="faint xs" style={{ marginTop: 8 }}>To vault <span className="mono">{m.vault}</span></p>
      {err && <p className="xs" style={{ color: "var(--status-critical)", marginTop: 8 }}>{err}</p>}
      <div className="row-between" style={{ marginTop: 16, justifyContent: "flex-end" }}>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy || !amount} onClick={go}>{busy ? "Sending…" : "Deposit and sign"}</button>
      </div>
    </Modal>
  );
}

/** For a new company: the steps left before Sluice can pay bills. Hidden once all are done. */
export function GetStarted() {
  const { model: m } = useApp();
  const [depositing, setDepositing] = useState(false);
  if (!m) return null;
  const s = m.session;
  const steps = [
    { done: m.balance > 0n, title: "Fund the vault", body: "Deposit tUSD8 for the bills Sluice will pay.", action: <button className="btn btn-primary ac-sm" onClick={() => setDepositing(true)}>Deposit</button> },
    { done: m.payees.some((p) => p.allowed && !p.blocked), title: "Approve your payees", body: "Bills to approved payees can be paid without asking you.", action: <a className="btn btn-secondary ac-sm" href="#/app/rules">Add payees</a> },
    { done: m.bills.some((b) => b.active), title: "List your bills", body: "Sluice can only pay bills on this list. Import a CSV or invoices.", action: <a className="btn btn-secondary ac-sm" href="#/app/rules">Add bills</a> },
    { done: Boolean(s?.active && s.expiresAt > Date.now() / 1000), title: "Hire the agent", body: "Give it a session with a cap per payment, a 24-hour budget and an expiry.", action: <a className="btn btn-secondary ac-sm" href="#/app/settings">Grant a session</a> },
  ];
  const left = steps.filter((x) => !x.done).length;
  if (!left) return null;
  return (
    <section className="card gs">
      <div className="row-between">
        <div className="grow"><p className="card-title">Get started</p><p className="card-sub">{steps.length - left} of {steps.length} done. Your limits are already in place.</p></div>
        <div className="gs-bar"><div style={{ width: `${((steps.length - left) / steps.length) * 100}%` }} /></div>
      </div>
      <ol className="gs-steps">
        {steps.map((x) => (
          <li key={x.title} className={x.done ? "done" : ""}>
            <span className="gs-dot">{x.done ? "✓" : ""}</span>
            <div className="grow"><p className="t14">{x.title}</p><p className="muted xs">{x.body}</p></div>
            {!x.done && x.action}
          </li>
        ))}
      </ol>
      {depositing && <DepositPanel onClose={() => setDepositing(false)} />}
    </section>
  );
}
