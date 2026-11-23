import { useState } from "react";
import { PageHead } from "../components";
import { NETWORK, ORG } from "../data";
import "./settings.css";

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} className={`st-toggle${on ? " on" : ""}`} onClick={() => onChange(!on)}><i /></button>
  );
}

const TEAM = [
  { name: "Ultraviolet (you)", role: "Owner", added: "Oct 3", access: "Full access", cls: "full" },
  { name: "Priya Sharma", role: "Approver", added: "Oct 11", access: "Can approve", cls: "approve" },
  { name: "Dele Johnson", role: "Viewer", added: "Oct 29", access: "Read only", cls: "read" },
];

export default function Settings({ toast }: { toast: (m: string) => void }) {
  const [n, setN] = useState({ email: true, slack: false, reminders: true });
  return (
    <>
      <PageHead title="Settings" sub="Manage the vault, the agent key, notifications and team access" />
      <div className="st-top">
        <section className="card st-key">
          <div className="row-between" style={{ alignItems: "flex-start" }}>
            <div className="grow"><p className="card-title">Agent key</p><p className="card-sub">Session key, can only call pay() within its caps</p></div>
            <button className="btn btn-primary" onClick={() => toast("revokeSession + grantSession queued for signature")}>Rotate key</button>
          </div>
          <div className="st-keybox mono">{ORG.agentKey} · expires Dec 11</div>
          <div>
            <p className="faint xs">Gas allowance</p>
            <div className="bar" style={{ margin: "6px 0" }}><div style={{ width: "48%", background: "var(--status-success)" }} /></div>
            <p className="faint xs">2.4 of 5 tQDAY left</p>
          </div>
        </section>
        <section className="card st-notif">
          <p className="card-title" style={{ marginBottom: 8 }}>Notifications</p>
          <div className="st-tg"><span>Email alerts</span><Toggle label="Email alerts" on={n.email} onChange={(v) => setN({ ...n, email: v })} /></div>
          <div className="st-tg"><span>Slack digest</span><Toggle label="Slack digest" on={n.slack} onChange={(v) => setN({ ...n, slack: v })} /></div>
          <div className="st-tg"><span>Approval reminders</span><Toggle label="Approval reminders" on={n.reminders} onChange={(v) => setN({ ...n, reminders: v })} /></div>
        </section>
      </div>

      <section className="card">
        <div className="row-between" style={{ paddingBottom: 12 }}><p className="grow card-title">Team access</p><button className="btn btn-primary">Invite</button></div>
        <div className="st-table">
          <div className="st-tr st-th"><span>Member</span><span>Role</span><span>Added</span><span>Access</span></div>
          {TEAM.map((t) => (
            <div key={t.name} className="st-tr"><span className="w500">{t.name}</span><span>{t.role}</span><span>{t.added}</span><span><span className={`st-acc ${t.cls}`}>{t.access}</span></span></div>
          ))}
        </div>
      </section>

      <section className="card">
        <p className="card-title" style={{ paddingBottom: 12 }}>Vault details</p>
        <div className="st-details">
          <div><p className="faint xs">Vault name</p><p className="small">{ORG.name}</p></div>
          <div><p className="faint xs">Network</p><p className="small">{NETWORK.name} ({NETWORK.chainId})</p></div>
          <div><p className="faint xs">Contract</p><a className="small mono" style={{ color: "var(--accent-sluice)" }} href={`${NETWORK.explorer}/address/${ORG.vaultFull}`} target="_blank" rel="noreferrer">{ORG.vault}</a></div>
          <div><p className="faint xs">Stablecoin</p><p className="small">tUSD8 (6 decimals)</p></div>
        </div>
      </section>
    </>
  );
}
