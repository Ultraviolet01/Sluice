import { useEffect, useState } from "react";
import chartGrid from "../assets/landing/chart-grid.svg";
import compass from "../assets/landing/compass.svg";
import horizon from "../assets/landing/horizon.svg";
import superstructure from "../assets/landing/superstructure.svg";
import containers from "../assets/landing/containers.svg";
import hull from "../assets/landing/hull.svg";
import loadline from "../assets/landing/loadline-lg.svg";
import waves from "../assets/landing/waves.svg";
import "./landing.css";

const REPO = "https://github.com/ultraviolet01/sluice";

const KEY_PERMS = [
  ["pay", "Allowed", "ok"],
  ["approve", "Owner only", "owner"],
  ["grantSession", "Owner only", "owner"],
  ["setPayeeAllowed", "Owner only", "owner"],
  ["withdraw", "Never", "never"],
] as const;

export default function Landing() {
  const [over, setOver] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setOver((v) => !v), 4000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="ld">
      <nav className="ld-nav">
        <span className="display ld-logo">SLUICE</span>
        <span className="ld-spacer" />
        <a href="#how">How it works</a>
        <a href="#security">Security</a>
        <a href={`${REPO}#readme`} target="_blank" rel="noreferrer">Docs</a>
        <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
        <a className="ld-pill-outline" href="#/app/overview">Open app</a>
      </nav>

      <header className="ld-hero">
        <h1 className="display">Runs your treasury.<br />Never past the line</h1>
        <div className="ld-intro">
          <p>Sluice is an AI agent that pays invoices, moves funds between your vaults and forecasts shortfalls. Your limits live in a contract on QDay Aevum, so it can’t spend past them.</p>
          <span className="ld-spacer" />
          <div className="ld-ctas">
            <a className="ld-pill" href="#/app/overview">Open app</a>
            <a className="ld-pill-outline" href={REPO} target="_blank" rel="noreferrer">Watch the demo</a>
          </div>
        </div>
      </header>

      <section className="ld-scene" aria-label="A ship riding under its load line">
        <img className="abs" src={chartGrid} style={{ left: 0, top: 0, width: "100%", height: "60.6%" }} alt="" />
        <img className="abs" src={compass} style={{ left: "85.56%", top: "7.5%", width: "7.78%" }} alt="" />
        <span className="abs display ld-north">N</span>
        <div className="abs ld-far" />
        <img className="abs" src={horizon} style={{ left: 0, top: "60.47%", width: "100%", height: "3.1%" }} alt="" />
        <div className={`abs ld-ship${over ? " low" : ""}`}>
          <img className="abs fill" src={superstructure} alt="" />
          <img className="abs fill" src={containers} alt="" />
          <img className="abs fill" src={hull} alt="" />
          <span className="abs display ld-hullname">SLUICE</span>
          <img className="abs" src={loadline} style={{ left: "50.56%", top: "65%", width: "4.44%" }} alt="" />
          <span className="abs ld-mark"><b className="display">Your line</b> 100 tUSD8 per payment</span>
        </div>
        <div className="abs ld-near" />
        <div className="abs ld-waves"><img src={waves} alt="" /></div>
        <div className={`abs ld-callout${over ? " hide" : ""}`}>
          <p className="display">Paying Northwind Hosting, 80 tUSD8</p>
          <p className="under">Under the line, so Sluice pays it alone</p>
        </div>
        <div className={`abs ld-callout${over ? "" : " hide"}`}>
          <p className="display">Funding payroll, 8,000 tUSD8</p>
          <p className="overl">Over the line, so it waits for your signature</p>
        </div>
      </section>

      <section className="ld-how" id="how">
        <h2 className="display">How it works</h2>
        <div className="ld-steps">
          <div><p className="display ld-num">1</p><p className="ld-step-t">Paint the line</p><p className="ld-step-b">Set caps, payees and minimums in your own SluiceVault contract on Aevum. Only your key can change them.</p></div>
          <div><p className="display ld-num">2</p><p className="ld-step-t">Sluice keeps watch</p><p className="ld-step-b">It forecasts every vault and pays invoices or moves tUSD8 between your vaults when something runs short.</p></div>
          <div><p className="display ld-num">3</p><p className="ld-step-t">You sign the big ones</p><p className="ld-step-b">Anything over your line waits for your approval, with Sluice’s reasons attached.</p></div>
        </div>
      </section>

      <section className="ld-sec" id="security">
        <div className="ld-sec-row">
          <div className="ld-sec-copy">
            <h2 className="display">It can’t spend<br />past the line</h2>
            <p>Not “won’t”. Can’t. Sluice signs with a session key that can only call pay() on your vault, inside a per-payment cap, a daily budget and an expiry. The vault checks every payment against your line before any money moves.</p>
          </div>
          <div className="ld-perms">
            <p className="ld-perms-h">What Sluice’s key can call on your vault</p>
            {KEY_PERMS.map(([fn, label, cls]) => (
              <div key={fn} className="ld-perm"><span className="mono">{fn}</span><span className={cls}>{label}</span></div>
            ))}
          </div>
        </div>
      </section>

      <section className="ld-close">
        <h2 className="display">Give your treasury a sluice</h2>
        <div className="ld-ctas">
          <a className="ld-pill" href="#/app/overview">Open app</a>
          <a className="ld-pill-outline" href={`${REPO}#readme`} target="_blank" rel="noreferrer">Read the docs</a>
        </div>
      </section>

      <footer className="ld-foot"><a href={REPO} target="_blank" rel="noreferrer">Source on GitHub</a></footer>
    </div>
  );
}
