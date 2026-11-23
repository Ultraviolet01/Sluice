import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CompanySwitch } from "./pages/Panels.tsx";
import type { Kind } from "./data.ts";
import { EXPLORER, short } from "./chain.ts";
import { useApp } from "./state.tsx";
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

export function Search({ placeholder = "Search payees, tx hashes", value, onChange }: { placeholder?: string; value?: string; onChange?: (v: string) => void }) {
  return (
    <label className="search">
      <img src={searchIcon} width={16} height={16} alt="" />
      <input placeholder={placeholder} aria-label="Search" value={value} onChange={(e) => onChange?.(e.target.value)} />
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

export function TxLink({ tx, label }: { tx: string; label?: string }) {
  if (!tx) return <span className="faint">—</span>;
  return <a className="mono" style={{ color: "var(--accent-sluice)" }} href={`${EXPLORER}/tx/${tx}`} target="_blank" rel="noreferrer">{label ?? short(tx)}</a>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  // Rendered at the top of the page: inside the sticky sidebar it would sit under the main content.
  return createPortal(
    <div className="modal-bg" onClick={onClose}>
      <div className="modal card" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="row-between" style={{ marginBottom: 16 }}>
          <p className="grow card-title">{title}</p>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
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

export function Sidebar({ route }: { route: string }) {
  const { model, act } = useApp();
  if (!model) return null;
  const waiting = model.approvals.filter((a) => a.status === "waiting").length;
  const s = model.session;
  const live = s && s.active && s.expiresAt > Date.now() / 1000;
  // The highlight behind the current page slides from the old item to the new one.
  const navRef = useRef<HTMLElement>(null);
  const [ind, setInd] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const el = navRef.current?.querySelector<HTMLElement>("a.active");
    if (el && window.innerWidth <= 900) el.scrollIntoView({ block: "nearest", inline: "center" });
    const place = () => el && setInd({ left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight });
    place();
    // Fonts and wrapping can move the item after the first paint: measure again then.
    const ro = new ResizeObserver(place);
    if (navRef.current) ro.observe(navRef.current);
    if (el) ro.observe(el);
    document.fonts?.ready.then(place).catch(() => {});
    return () => ro.disconnect();
  }, [route]);
  const togglePause = () =>
    act(model.paused ? "Payments resumed" : "All agent payments paused", { fn: model.paused ? "unpause" : "pause", args: [] }, (m) => ({ ...m, paused: !m.paused }));
  return (
    <aside className="sidebar">
      <a href="#/" className="brand display">SLUICE</a>
      <CompanySwitch />
      <nav className="nav" ref={navRef}>
        {ind && <span className="nav-ind" aria-hidden="true" style={{ transform: `translate(${ind.left}px, ${ind.top}px)`, width: ind.width, height: ind.height }} />}
        {NAV.map((n) => (
          <a key={n.to} href={`#/app/${n.to}${window.location.hash.includes("?") ? "?" + window.location.hash.split("?")[1] : ""}`} className={route === n.to ? "active" : ""}>
            {n.icon ? <img src={n.icon} alt="" /> : <GearIcon />}
            <span className="label">{n.label}</span>
            {n.to === "approvals" && waiting > 0 && <span className="count">{waiting}</span>}
          </a>
        ))}
      </nav>
      <div className={`agent-status${model.paused || !live ? " paused" : ""}`}>
        <div className="live"><i />{model.paused ? "Sluice is paused" : live ? "Sluice is running" : "No agent session"}</div>
        <p className="checked">{model.paused ? "Agent payments halted on chain" : live ? `Session until ${new Date(s!.expiresAt * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "Grant one under Settings"}</p>
        <button onClick={togglePause}>
          <img src={pause} width={16} height={16} alt="" />
          {model.paused ? "Resume payments" : "Pause all payments"}
        </button>
      </div>
    </aside>
  );
}

/** A link to another app page that keeps the open company (?vault=…) in the address. */
export function app(path: string): string {
  const q = window.location.hash.split("?")[1];
  return `#/app/${path}${q ? "?" + q : ""}`;
}
