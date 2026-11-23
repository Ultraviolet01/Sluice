import { useEffect, useRef, useState } from "react";
import chartGrid from "../assets/landing/chart-grid.svg";
import compass from "../assets/landing/compass.svg";
import horizon from "../assets/landing/horizon.svg";
import superstructure from "../assets/landing/superstructure.svg";
import containers from "../assets/landing/containers.svg";
import hull from "../assets/landing/hull.svg";
import loadline from "../assets/landing/loadline-lg.svg";
import waves from "../assets/landing/waves.svg";
import "./landing.css";
import { REPO, SiteFooter, SiteNav } from "./site.tsx";





const KEY_PERMS = [
  ["pay(bill, period)", "Allowed", "ok"],
  ["propose(bill, period)", "Allowed", "ok"],
  ["addBill", "Owner only", "owner"],
  ["approve", "Owner only", "owner"],
  ["grantSession", "Owner only", "owner"],
    ["withdraw", "Never", "never"],
] as const;

export default function Landing() {
  const [over, setOver] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const harbor = useRef<{ setOver(o: boolean): void; dispose(): void } | null>(null);
  const [is3d, setIs3d] = useState(false);
  // The 3D harbor loads on its own, after the page; the flat drawing stays if WebGL is missing.
  useEffect(() => {
    let gone = false;
    import("./harbor3d.ts")
      .then(({ createHarbor, webglAvailable }) => {
        if (gone || !host.current || !webglAvailable()) return;
        harbor.current = createHarbor(host.current);
        setIs3d(true);
      })
      .catch(() => {});
    return () => {
      gone = true;
      harbor.current?.dispose();
      harbor.current = null;
    };
  }, []);
  useEffect(() => harbor.current?.setOver(over), [over, is3d]);
  useEffect(() => {
    const t = setInterval(() => setOver((v) => !v), 4000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="ld">
      <SiteNav />

      <header className="ld-hero">
        <h1 className="display">Runs your treasury.<br />Never past the line</h1>
        <div className="ld-intro">
          <p>Sluice is an AI agent that pays your company’s bills in tUSD8 and forecasts shortfalls. It can only pay bills you listed, inside limits that live in a contract on QDay Aevum, so it can’t spend past them.</p>
          <span className="ld-spacer" />
          <div className="ld-ctas">
            <a className="ld-pill" href="#/app/overview">Open app</a>
            <a className="ld-pill-outline" href={REPO} target="_blank" rel="noreferrer">Watch the demo</a>
          </div>
        </div>
      </header>

      <section className="ld-scene" aria-label="A ship riding under its load line">
        <div ref={host} className={`abs ld-3d${is3d ? " on" : ""}`} aria-hidden="true" />
        {!is3d && (
          <>
        <img className="abs" src={chartGrid} style={{ left: 0, top: 0, width: "100%", height: "60.6%" }} alt="" />
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
          </>
        )}
        <img className="abs" src={compass} style={{ left: "85.56%", top: "7.5%", width: "7.78%" }} alt="" />
        <span className="abs display ld-north">N</span>
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
          <div><p className="display ld-num">1</p><p className="ld-step-t">Paint the line</p><p className="ld-step-b">List your bills and set caps, payees and a cash buffer in your own SluiceVault contract on Aevum. Only your key can change them.</p></div>
          <div><p className="display ld-num">2</p><p className="ld-step-t">Sluice keeps watch</p><p className="ld-step-b">Every 15 minutes it forecasts the next 14 days, pays the bills that fit your limits, and holds back anything that looks wrong.</p></div>
          <div><p className="display ld-num">3</p><p className="ld-step-t">You sign the big ones</p><p className="ld-step-b">Anything over your line waits for your approval, with Sluice’s reasons attached.</p></div>
        </div>
      </section>

      <section className="ld-sec" id="security">
        <div className="ld-sec-row">
          <div className="ld-sec-copy">
            <h2 className="display">It can’t spend<br />past the line</h2>
            <p>Not “won’t”. Can’t. Sluice’s session key can only settle a bill you listed, by its number: no payee and no amount of its own, inside a per-payment cap, a rolling 24-hour budget and an expiry. The vault checks every payment against your line before any money moves.</p>
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

      <SiteFooter />
    </div>
  );
}
