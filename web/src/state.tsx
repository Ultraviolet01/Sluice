import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { isAddress, type Address } from "viem";
import { connectWallet, errorText, publicClient, hasWallet, ownerSend, silentAccount, type OwnerCall } from "./chain.ts";
import { demoModel } from "./data.ts";
import { loadLive, type Model } from "./model.ts";
import { DEPLOY_BLOCK } from "./logs.ts";

/** The vault to show: ?vault=0x... in the address, else VITE_VAULT_ADDRESS, else the demo. */
export function configuredVault(): Address | null {
  if (demoRequested()) return null;
  const q = new URLSearchParams(window.location.hash.split("?")[1] ?? window.location.search).get("vault");
  const v = q || import.meta.env.VITE_VAULT_ADDRESS;
  return v && isAddress(v) ? (v as Address) : null;
}

/** ?demo=1: show the demo company instead of the first-visit flow. */
export const demoRequested = () => new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("demo") === "1";

interface Ctx {
  model: Model | null;
  error: string | null;
  account: Address | null;
  isOwner: boolean;
  busy: string | null;
  connect(): Promise<void>;
  reload(): Promise<void>;
  /**
   * Signs an owner action on the live vault, or applies `demo` to the demo data.
   * A rule change passes `call` as a function of the reason: the owner is asked
   * for it first, and it is recorded on chain with the change.
   */
  act(label: string, call: OwnerCall | ((reason: string) => OwnerCall), demo: (m: Model) => Model, suggested?: string): Promise<boolean>;
  toast(msg: string): void;
  msg: string | null;
}

const C = createContext<Ctx | null>(null);

/** Asks for the reason a rule changes; it is stored on chain with the change. */
function ReasonPrompt({ label, suggested, onDone }: { label: string; suggested: string; onDone: (r: string | null) => void }) {
  const [text, setText] = useState(suggested);
  const bytes = new TextEncoder().encode(text).length;
  return createPortal(
    <div className="modal-bg" onClick={() => onDone(null)}>
      <div className="modal card" role="dialog" aria-label="Reason for the record" onClick={(e) => e.stopPropagation()}>
        <p className="card-title">Reason for the record</p>
        <p className="muted small" style={{ marginTop: 6 }}>{label}. Your reason is stored on chain with the change, so anyone reviewing the vault later sees why.</p>
        <textarea className="import-box" rows={3} autoFocus maxLength={280} placeholder="e.g. New supplier from the Q1 contract" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="row-between" style={{ marginTop: 12, justifyContent: "flex-end" }}>
          <span className="grow xs faint">{bytes}/280</span>
          <button className="btn btn-secondary" onClick={() => onDone(null)}>Cancel</button>
          <button className="btn btn-primary" disabled={!text.trim() || bytes > 280} onClick={() => onDone(text.trim())}>Continue to sign</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
export const useApp = () => useContext(C)!;

export function AppProvider({ children }: { children: ReactNode }) {
  const vault = configuredVault();
  const [model, setModel] = useState<Model | null>(vault ? null : demoModel());
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const toast = useCallback((m: string) => {
    setMsg(m);
    setTimeout(() => setMsg((cur) => (cur === m ? null : cur)), 4000);
  }, []);

  const reload = useCallback(async () => {
    if (!vault) return;
    try {
      const from = import.meta.env.VITE_FROM_BLOCK ? BigInt(import.meta.env.VITE_FROM_BLOCK) : publicClient.chain?.id === 44005 ? DEPLOY_BLOCK : 0n;
      setModel(await loadLive(vault, from));
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, [vault]);

  useEffect(() => {
    reload();
    if (!vault) return;
    const t = setInterval(reload, 30_000);
    return () => clearInterval(t);
  }, [reload, vault]);

  // A returning visitor whose wallet already approved this site is signed in without a prompt.
  useEffect(() => {
    silentAccount().then((a) => a && setAccount((cur) => cur ?? a));
  }, []);

  const connect = async () => {
    try {
      setAccount(await connectWallet());
    } catch (e) {
      toast(errorText(e));
    }
  };

  const isOwner = Boolean(model && (!model.live || (account && model.owner && account.toLowerCase() === model.owner.toLowerCase())));

  const [asking, setAsking] = useState<{ label: string; suggested: string; resolve: (r: string | null) => void } | null>(null);
  const askReason = (label: string, suggested: string) => new Promise<string | null>((resolve) => setAsking({ label, suggested, resolve }));

  const act: Ctx["act"] = async (label, callOrFn, demo, suggested = "") => {
    if (!model) return false;
    let call: OwnerCall;
    if (typeof callOrFn === "function") {
      const reason = await askReason(label, suggested);
      if (reason === null) return false;
      call = callOrFn(reason);
    } else call = callOrFn;
    if (!model.live) {
      setModel(demo(model));
      toast(`Demo: would sign ${call.fn}(). ${label}`);
      return true;
    }
    if (!account) {
      toast(hasWallet() ? "Connect the owner's wallet first." : "Install MetaMask to sign as the owner.");
      return false;
    }
    if (!isOwner) {
      toast("Only the vault owner can do that. Connect the owner's wallet.");
      return false;
    }
    setBusy(label);
    try {
      await ownerSend(model.vault, account, call);
      toast(`Signed: ${label}`);
      await reload();
      return true;
    } catch (e) {
      toast(errorText(e));
      return false;
    } finally {
      setBusy(null);
    }
  };

  return (
    <C.Provider value={{ model, error, account, isOwner, busy, connect, reload, act, toast, msg }}>
      {children}
      {asking && (
        <ReasonPrompt
          label={asking.label}
          suggested={asking.suggested}
          onDone={(r) => {
            asking.resolve(r);
            setAsking(null);
          }}
        />
      )}
    </C.Provider>
  );
}
