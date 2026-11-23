import { useState } from "react";
import { isAddress, type Address } from "viem";
import { PageHead } from "../components.tsx";
import { EXPLORER, HOSTED_AGENT, short } from "../chain.ts";
import { NETWORK } from "../data.ts";
import { fmt, toUnits } from "../model.ts";
import { useApp } from "../state.tsx";
import "./settings.css";

export default function Settings() {
  const { model: m, act, busy } = useApp();
  const [f, setF] = useState({ agent: HOSTED_AGENT as string, per: "100", daily: "500", days: "30" });
  const [err, setErr] = useState<string | null>(null);
  if (!m) return null;
  const s = m.session;
  const live = s && s.active && s.expiresAt > Date.now() / 1000;

  const grant = async () => {
    setErr(null);
    try {
      const agent = (f.agent || s?.agent || "") as Address;
      if (!isAddress(agent)) throw new Error("Enter the agent's 0x address");
      const per = toUnits(f.per), daily = toUnits(f.daily);
      if (per <= 0n || daily < per) throw new Error("The 24-hour cap must be at least the per-payment cap");
      const days = Number(f.days);
      if (!(days >= 1 && days <= 365)) throw new Error("Expiry must be 1 to 365 days");
      const exp = BigInt(Math.floor(Date.now() / 1000) + days * 86400);
      await act(`Agent session granted to ${short(agent)}`, (reason) => ({ fn: "grantSession", args: [agent, per, daily, exp, reason] }), (mm) => ({
        ...mm,
        session: { agent, perPaymentCap: per, dailyCap: daily, expiresAt: Number(exp), active: true, spent: 0n },
      }));
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const revoke = () => s && act(`Agent session revoked`, (reason) => ({ fn: "revokeSession", args: [s.agent, reason] }), (mm) => ({ ...mm, session: mm.session && { ...mm.session, active: false } }), "Key may be exposed");

  return (
    <>
      <PageHead title="Settings" sub="Manage the vault and the agent's session key" />
      <div className="st-top">
        <section className="card st-key">
          <div className="row-between" style={{ alignItems: "flex-start" }}>
            <div className="grow"><p className="card-title">Agent session</p><p className="card-sub">The agent's key can only call pay() and propose(), inside these caps, until it expires</p></div>
            {live && <button className="btn btn-danger" disabled={!!busy} onClick={revoke}>Revoke now</button>}
          </div>
          <div className="st-keybox mono">{s ? `${s.agent} · ${live ? `expires ${new Date(s.expiresAt * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : s.active ? "expired" : "revoked"}` : "No session granted yet"}</div>
          {s && (
            <div>
              <p className="faint xs">Used in the last 24 hours</p>
              <div className="bar" style={{ margin: "6px 0" }}><div style={{ width: `${s.dailyCap > 0n ? Math.min(100, Number((s.spent * 100n) / s.dailyCap)) : 0}%`, background: "var(--status-success)" }} /></div>
              <p className="faint xs">{fmt(s.spent)} of {fmt(s.dailyCap)} tUSD8, {fmt(s.perPaymentCap)} per payment</p>
            </div>
          )}
          <div className="st-grant">
            <p className="t14">{s ? "Change or rotate the session" : "Grant a session"}</p>
            <label className="form-row"><span>Agent address{HOSTED_AGENT && f.agent.toLowerCase() === HOSTED_AGENT.toLowerCase() ? " (Sluice's hosted agent)" : ""}</span><input className="mono" placeholder={s?.agent ?? "0x…"} value={f.agent} onChange={(e) => setF({ ...f, agent: e.target.value })} /></label>
            {live && s && f.agent && f.agent.toLowerCase() !== s.agent.toLowerCase() && (
              <p className="xs" style={{ color: "var(--accent-brass)" }}>Signing this rotates the key: {short(s.agent)} stops working at once.</p>
            )}
            <div className="st-3">
              <label className="form-row"><span>Per payment</span><input inputMode="decimal" value={f.per} onChange={(e) => setF({ ...f, per: e.target.value })} /></label>
              <label className="form-row"><span>Per 24 hours</span><input inputMode="decimal" value={f.daily} onChange={(e) => setF({ ...f, daily: e.target.value })} /></label>
              <label className="form-row"><span>Expires in (days)</span><input inputMode="numeric" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} /></label>
            </div>
            {err && <p className="xs" style={{ color: "var(--status-critical)" }}>{err}</p>}
            <button className="btn btn-primary" disabled={!!busy} onClick={grant}>{busy ? "Signing…" : "Sign session"}</button>
          </div>
        </section>
        <section className="card st-notif">
          <p className="card-title" style={{ marginBottom: 8 }}>Agent schedule</p>
          <p className="muted small">The agent runs every 15 minutes on GitHub Actions. Each run's log lists what it paid, proposed or refused, with transaction links.</p>
          <p className="muted small" style={{ marginTop: 10 }}>It needs a little tQDAY for gas at its own address.</p>
        </section>
      </div>

      <section className="card">
        <p className="card-title" style={{ paddingBottom: 12 }}>Vault details</p>
        <div className="st-details">
          <div><p className="faint xs">Company</p><p className="small">{m.name}</p></div>
          <div><p className="faint xs">Network</p><p className="small">{NETWORK.name} ({NETWORK.chainId})</p></div>
          <div><p className="faint xs">Contract</p><a className="small mono" style={{ color: "var(--accent-sluice)" }} href={`${EXPLORER}/address/${m.vault}`} target="_blank" rel="noreferrer">{short(m.vault)}</a></div>
          <div><p className="faint xs">Owner</p><p className="small mono">{m.owner ? short(m.owner) : "—"}</p></div>
          <div><p className="faint xs">Stablecoin</p><p className="small">tUSD8 (6 decimals)</p></div>
          <div><p className="faint xs">Ownership transfer</p><p className="small">Two steps: offer, then accept</p></div>
        </div>
      </section>
    </>
  );
}
