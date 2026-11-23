import type { ReactNode } from "react";
import type { Kind } from "./data";
import { ORG } from "./data";
import grid from "./assets/icons/grid.svg";
import inbox from "./assets/icons/inbox.svg";
import list from "./assets/icons/list.svg";
import sliders from "./assets/icons/sliders.svg";
import wallet from "./assets/icons/wallet.svg";
import pause from "./assets/icons/pause.svg";
import searchIcon from "./assets/icons/search.svg";

export function Pill({ kind, children }: { kind: Kind; children: ReactNode }) {
  return <span className={`pill pill-${kind}`}>{children}</span>;
}

export function Search({ placeholder = "Search payees, tx hashes" }: { placeholder?: string }) {
  return (
    <label className="search">
      <img src={searchIcon} width={16} height={16} alt="" />
      <input placeholder={placeholder} aria-label="Search" />
    </label>
  );
}

export function PageHead({ title, sub, children }: { title: string; sub: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="titles">
        <h1 className="display">{title}</h1>
        <p className="sub">{sub}</p>
      </div>
      {children}
    </div>
  );
}

/** Not in the Figma screens' icon set; drawn to match the 20px outline icons. */
function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#4a6168" strokeWidth="1.5" aria-hidden="true">
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" strokeLinecap="round" />
    </svg>
  );
}

const NAV = [
  { to: "overview", label: "Overview", icon: grid },
  { to: "approvals", label: "Approvals", icon: inbox },
  { to: "activity", label: "Activity", icon: list },
  { to: "rules", label: "Rules", icon: sliders },
  { to: "wallets", label: "Wallets", icon: wallet },
  { to: "settings", label: "Settings", icon: null },
];

export function Sidebar({ route, waiting, paused, onTogglePause }: {
  route: string; waiting: number; paused: boolean; onTogglePause: () => void;
}) {
  return (
    <aside className="sidebar">
      <a href="#/" className="brand display">SLUICE</a>
      <div className="vault-switch">
        <div className="row-between">
          <span className="name">{ORG.name}</span>
          <span className="chip">Testnet</span>
        </div>
        <span className="addr mono">{ORG.vault}</span>
      </div>
      <nav className="nav">
        {NAV.map((n) => (
          <a key={n.to} href={`#/app/${n.to}`} className={route === n.to ? "active" : ""}>
            {n.icon ? <img src={n.icon} alt="" /> : <GearIcon />}
            <span className="label">{n.label}</span>
            {n.to === "approvals" && waiting > 0 && <span className="count">{waiting}</span>}
          </a>
        ))}
      </nav>
      <div className={`agent-status${paused ? " paused" : ""}`}>
        <div className="live"><i />{paused ? "Sluice is paused" : "Sluice is running"}</div>
        <p className="checked">{paused ? "Agent payments halted on chain" : "Checked 12s ago"}</p>
        <button onClick={onTogglePause}>
          <img src={pause} width={16} height={16} alt="" />
          {paused ? "Resume payments" : "Pause all payments"}
        </button>
      </div>
    </aside>
  );
}
