import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./motion.css";
import { Sidebar } from "./components.tsx";
import { AppProvider, configuredVault, demoRequested, useApp } from "./state.tsx";
import { FACTORY } from "./chain.ts";
import Onboarding from "./pages/Onboarding.tsx";
import { AcceptBanner } from "./pages/Ownership.tsx";
import { WalletGasBanner } from "./pages/WalletGas.tsx";
import Landing from "./pages/Landing.tsx";
import HowItWorks from "./pages/HowItWorks.tsx";
import SecurityPage from "./pages/SecurityPage.tsx";
import Docs from "./pages/Docs.tsx";
import Overview from "./pages/Overview.tsx";
import Approvals from "./pages/Approvals.tsx";
import Activity from "./pages/Activity.tsx";
import Rules from "./pages/Rules.tsx";
import Wallets from "./pages/Wallets.tsx";
import Settings from "./pages/Settings.tsx";

function useHashRoute() {
  const read = () => window.location.hash.replace(/^#\/?/, "").split("?")[0];
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => {
      setRoute(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

function Dashboard({ page }: { page: string }) {
  const { model, error, msg, reload } = useApp();
  // First visit with company creation switched on: connect, then name the first company.
  if (FACTORY && !configuredVault() && !demoRequested()) {
    // The treasury, blurred, behind the first-visit card: what opens once you're in.
    return (
      <>
        <div className="ob-behind" aria-hidden="true" ref={(el) => el?.setAttribute("inert", "")}>
          <div className="app">
            <Sidebar route="overview" />
            <main className="main"><Overview /></main>
          </div>
        </div>
        <Onboarding />
        {msg && <div className="toast" role="status">{msg}</div>}
      </>
    );
  }
  if (!model) {
    return (
      <div className="loading">
        <p className="display" style={{ fontSize: 28 }}>SLUICE</p>
        {error ? (
          <>
            <p className="muted">Couldn't read the vault at {configuredVault()}: {error}</p>
            <button className="btn btn-secondary" onClick={reload}>Try again</button>
          </>
        ) : <p className="muted">Reading the vault on Aevum Testnet…</p>}
      </div>
    );
  }
  return (
    <div className="app">
      <Sidebar route={page} />
      <main className="main">
        {!model.live && <div className="demo-banner">Demo data. {FACTORY ? <><a href="#/app/overview" onClick={() => setTimeout(() => window.location.reload(), 0)}><b>Open your own treasury</b></a>, or use <b>Create a company</b> in the sidebar.</> : <>Open <code>#/app/overview?vault=0x…</code> to see a live vault on Aevum Testnet.</>}</div>}
        {error && <div className="demo-banner warn">Last refresh failed: {error}</div>}
        <AcceptBanner />
        <WalletGasBanner />
        {/* key: a new page mounts fresh, so it plays its entrance */}
        <div key={page} className="page-in">
          {page === "overview" && <Overview />}
          {page === "approvals" && <Approvals />}
          {page === "activity" && <Activity />}
          {page === "rules" && <Rules />}
          {page === "wallets" && <Wallets />}
          {page === "settings" && <Settings />}
        </div>
      </main>
      {msg && <div className="toast" role="status">{msg}</div>}
    </div>
  );
}

function App() {
  const route = useHashRoute();
  if (route === "how-it-works") return <HowItWorks />;
  if (route === "security") return <SecurityPage />;
  if (route === "docs") return <Docs />;
  if (!route.startsWith("app")) return <Landing />;
  return (
    <AppProvider>
      <Dashboard page={route.split("/")[1] || "overview"} />
    </AppProvider>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
