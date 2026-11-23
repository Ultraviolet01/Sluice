import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { Sidebar } from "./components";
import { initialApprovals } from "./data";
import Landing from "./pages/Landing";
import Overview from "./pages/Overview";
import Approvals from "./pages/Approvals";
import Activity from "./pages/Activity";
import Rules from "./pages/Rules";
import Wallets from "./pages/Wallets";
import Settings from "./pages/Settings";

function useHashRoute() {
  const read = () => window.location.hash.replace(/^#\/?/, "");
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => { setRoute(read()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

function App() {
  const route = useHashRoute();
  const [approvals, setApprovals] = useState(initialApprovals);
  const [paused, setPaused] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const toast = useCallback((m: string) => { setMsg(m); setTimeout(() => setMsg(null), 2600); }, []);
  const waiting = approvals.filter((a) => a.status === "waiting").length;

  if (!route.startsWith("app")) return <Landing />;
  const page = route.split("/")[1] || "overview";

  const decide = (id: string, d: "approved" | "rejected") => {
    setApprovals((list) => list.map((a) => a.id === id
      ? { ...a, status: d, tag: d === "approved" ? "Approved" : "Rejected", tagKind: d === "approved" ? "settled" : "blocked", sub: d === "approved" ? "Approved by you, just now" : "Rejected by you, just now", age: "now" }
      : a));
    toast(d === "approved" ? `Signed vault.approve(${id})` : `Signed vault.reject(${id})`);
  };
  const togglePause = () => { setPaused((p) => !p); toast(paused ? "Signed unpause()" : "Signed pause(): agent payments halted"); };

  return (
    <div className="app">
      <Sidebar route={page} waiting={waiting} paused={paused} onTogglePause={togglePause} />
      <main className="main">
        {page === "overview" && <Overview waiting={waiting} />}
        {page === "approvals" && <Approvals items={approvals} onDecide={decide} />}
        {page === "activity" && <Activity />}
        {page === "rules" && <Rules paused={paused} onPause={togglePause} toast={toast} />}
        {page === "wallets" && <Wallets toast={toast} />}
        {page === "settings" && <Settings toast={toast} />}
      </main>
      {msg && <div className="toast" role="status">{msg}</div>}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
