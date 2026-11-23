// Shared frame for the public pages: the landing page, How it works, Security and Docs.
import type { ReactNode } from "react";

export const REPO = "https://github.com/ultraviolet01/sluice";
export const SRC = `${REPO}/blob/main`;

export function SiteNav({ current }: { current?: "how-it-works" | "security" | "docs" }) {
  const link = (to: string, label: string) => (
    <a href={`#/${to}`} className={current === to ? "on" : undefined} aria-current={current === to ? "page" : undefined}>{label}</a>
  );
  return (
    <nav className="ld-nav">
      <a href="#/" className="display ld-logo">SLUICE</a>
      <span className="ld-spacer" />
      {link("how-it-works", "How it works")}
      {link("security", "Security")}
      {link("docs", "Docs")}
      <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
      <a className="ld-pill-outline" href="#/app/overview">Open app</a>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="ld-foot">
      <a href="#/how-it-works">How it works</a>
      <a href="#/security">Security</a>
      <a href="#/docs">Docs</a>
      <a href={REPO} target="_blank" rel="noreferrer">Source on GitHub</a>
    </footer>
  );
}

/** A long-form page: title, lead, then sections. */
export function DocPage({ current, title, lead, children }: { current: "how-it-works" | "security" | "docs"; title: string; lead: string; children: ReactNode }) {
  return (
    <div className="ld">
      <SiteNav current={current} />
      <header className="dp-head">
        <h1 className="display">{title}</h1>
        <p>{lead}</p>
      </header>
      <main className="dp-body">{children}</main>
      <section className="ld-close dp-close">
        <h2 className="display">Give your treasury a sluice</h2>
        <div className="ld-ctas">
          <a className="ld-pill" href="#/app/overview">Open app</a>
          <a className="ld-pill-outline" href={REPO} target="_blank" rel="noreferrer">Source on GitHub</a>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}

export function Sec({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section className="dp-sec" id={id}>
      <h2 className="display">{title}</h2>
      {children}
    </section>
  );
}

/** A link to a file in the repository, optionally at a line. */
export const Code = ({ path, line, children }: { path: string; line?: number; children: ReactNode }) => (
  <a className="dp-code" href={`${SRC}/${path}${line ? `#L${line}` : ""}`} target="_blank" rel="noreferrer">{children}</a>
);
