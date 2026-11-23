// The first visit, as in a bank app: connect the wallet that will own the
// treasury, then name the first company, or open the companies you already have.
import { useEffect, useState } from "react";
import type { Address } from "viem";
import { myCompanies, short } from "../chain.ts";
import { useApp } from "../state.tsx";
import { CreatePanel } from "./Panels.tsx";
import loadline from "../assets/icons/loadline.svg";
import shield from "../assets/icons/shield.svg";

const open = (vault: Address) => {
  window.location.hash = `#/app/overview?vault=${vault}`;
  window.location.reload();
};

export default function Onboarding() {
  const { account, connect, disconnect } = useApp();
  const [companies, setCompanies] = useState<{ vault: Address; name: string }[] | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!account) return;
    setCompanies(null);
    myCompanies(account)
      .then((list) => {
        // One company: open it, as Keel does. Several: let the owner choose.
        if (list.length === 1) open(list[0].vault);
        else setCompanies(list);
      })
      .catch(() => setCompanies([]));
  }, [account]);

  return (
    <div className="ob">
      <a href="#/" className="display ob-wordmark">SLUICE</a>
      {!account ? (
        <section className="ob-card center" aria-labelledby="ob-connect">
          <h1 className="display ob-title" id="ob-connect">Connect your wallet to open your treasury</h1>
          <p className="ob-lead">Your wallet owns your company's vault. Sluice never holds your key.</p>
          <button className="btn btn-primary ob-cta" onClick={connect}>Connect wallet</button>
          <p className="ob-links">
            New to Aevum? <a href="https://wiki.qday.info/guide/start/add-network" target="_blank" rel="noreferrer">Add the network to MetaMask</a> and{" "}
            <a href="https://faucet.qday.info/en" target="_blank" rel="noreferrer">get test tokens</a>.
          </p>
          <div className="ob-promises">
            <div><img src={loadline} width={30} height={20} alt="" />Nothing moves alone until you set the line</div>
            <div><img src={shield} width={20} height={20} alt="" />The chain refuses anything past it</div>
          </div>
          <a className="ob-demo" href="#/app/overview?demo=1" onClick={() => setTimeout(() => window.location.reload(), 0)}>Or explore the demo company first</a>
        </section>
      ) : companies === null ? (
        <section className="ob-card center"><p className="ob-lead">Looking for your companies…</p></section>
      ) : companies.length === 0 || adding ? (
        <>
          <p className="ob-signed">Signed in as <span className="mono">{short(account)}</span> · <button className="cs-disconnect" onClick={disconnect}>Use another wallet</button></p>
          <CreatePanel inline first={companies.length === 0} onClose={() => setAdding(false)} />
        </>
      ) : (
        <section className="ob-card" aria-labelledby="ob-pick">
          <p className="ob-signed">Signed in as <span className="mono">{short(account)}</span> · <button className="cs-disconnect" onClick={disconnect}>Use another wallet</button></p>
          <h1 className="display ob-title" id="ob-pick">Your companies</h1>
          <div className="ob-list">
            {companies.map((c) => (
              <button key={c.vault} className="ob-company" onClick={() => open(c.vault)}>
                <span className="t15">{c.name}</span>
                <span className="mono faint xs">{short(c.vault)}</span>
              </button>
            ))}
          </div>
          <button className="btn btn-secondary" onClick={() => setAdding(true)}>+ Add a company</button>
        </section>
      )}
    </div>
  );
}
