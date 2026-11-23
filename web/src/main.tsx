import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { Sidebar } from "./components.tsx";
import { AppProvider, configuredVault, useApp } from "./state.tsx";
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
        {!model.live && <div className="demo-banner">Demo data. Open <code>#/app/overview?vault=0x…</code> or set <code>VITE_VAULT_ADDRESS</code> to see a live vault on Aevum Testnet.</div>}
        {error && <div className="demo-banner warn">Last refresh failed: {error}</div>}
        {page === "overview" && <Overview />}
        {page === "approvals" && <Approvals />}
        {page === "activity" && <Activity />}
        {page === "rules" && <Rules />}
        {page === "wallets" && <Wallets />}
        {page === "settings" && <Settings />}
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
