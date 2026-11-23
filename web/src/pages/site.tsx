// Shared frame for the public pages: the landing page, How it works, Security and Docs.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export const REPO = "https://github.com/ultraviolet01/sluice";
export const SRC = `${REPO}/blob/main`;

/**
 * Rises sections, cards and rows into view as they are scrolled to. Elements
 * already on screen show at once; without IntersectionObserver everything shows.
 */
export function useReveal(dep?: unknown) {
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>(".dp-sec, .dp-cards > *, .dp-steps > *, .dp-table tbody tr, .ld-sec, .ld-steps > *, .ld-perms > *, .ld-close, .ld-how > *, .ld-sec-row")];
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    els.forEach((el, i) => {
      el.classList.add("reveal");
      el.style.setProperty("--d", `${(i % 4) * 60}ms`);
      io.observe(el);
    });
    return () => io.disconnect();
  }, [dep]);
}

export function SiteNav({ current }: { current?: "how-it-works" | "security" | "docs" }) {
  const link = (to: string, label: string) => (
    <a href={`#/${to}`} className={current === to ? "on" : undefined} aria-current={current === to ? "page" : undefined}>{label}</a>
  );
  // A teal underline sits under the current page's link and slides between them.
  const nav = useRef<HTMLElement>(null);
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null);
  const [scrolled, setScrolled] = useState(false);
  useLayoutEffect(() => {
    const place = () => {
      const el = nav.current?.querySelector<HTMLElement>("a.on");
      setBar(el && el.offsetParent ? { left: el.offsetLeft, width: el.offsetWidth } : null);
    };
    place();
    const ro = new ResizeObserver(place);
    if (nav.current) ro.observe(nav.current);
    document.fonts?.ready.then(place).catch(() => {});
    return () => ro.disconnect();
  }, [current]);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <nav className={`ld-nav${scrolled ? " scrolled" : ""}`} ref={nav}>
      {bar && <span className="ld-nav-bar" aria-hidden="true" style={{ transform: `translateX(${bar.left}px)`, width: bar.width }} />}
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
  useReveal(current);
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
