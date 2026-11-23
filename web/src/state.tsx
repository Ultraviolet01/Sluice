import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { isAddress, type Address } from "viem";
import { connectWallet, errorText, hasWallet, ownerSend, type OwnerCall } from "./chain.ts";
import { demoModel } from "./data.ts";
import { loadLive, type Model } from "./model.ts";

/** The vault to show: ?vault=0x... in the address, else VITE_VAULT_ADDRESS, else the demo. */
export function configuredVault(): Address | null {
  const q = new URLSearchParams(window.location.hash.split("?")[1] ?? window.location.search).get("vault");
  const v = q || import.meta.env.VITE_VAULT_ADDRESS;
  return v && isAddress(v) ? (v as Address) : null;
}

interface Ctx {
  model: Model | null;
  error: string | null;
  account: Address | null;
  isOwner: boolean;
  busy: string | null;
  connect(): Promise<void>;
  reload(): Promise<void>;
  /** Signs an owner action on the live vault, or applies `demo` to the demo data. */
  act(label: string, call: OwnerCall, demo: (m: Model) => Model): Promise<boolean>;
  toast(msg: string): void;
  msg: string | null;
}

const C = createContext<Ctx | null>(null);
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
      const from = import.meta.env.VITE_FROM_BLOCK ? BigInt(import.meta.env.VITE_FROM_BLOCK) : 0n;
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

  const connect = async () => {
    try {
      setAccount(await connectWallet());
    } catch (e) {
      toast(errorText(e));
    }
  };

  const isOwner = Boolean(model && (!model.live || (account && model.owner && account.toLowerCase() === model.owner.toLowerCase())));

  const act: Ctx["act"] = async (label, call, demo) => {
    if (!model) return false;
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

  return <C.Provider value={{ model, error, account, isOwner, busy, connect, reload, act, toast, msg }}>{children}</C.Provider>;
}
