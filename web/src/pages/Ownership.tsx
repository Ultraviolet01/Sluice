// Handing the vault to another owner: a new wallet, or a Safe multisig. Two steps,
// so a typo can never lose the vault: the owner offers, and nothing changes until
// the new owner accepts from their own wallet. The owner can cancel the offer.
import { useState } from "react";
import { isAddress, type Address } from "viem";
import { acceptOwnership, errorText, short } from "../chain.ts";
import { useApp } from "../state.tsx";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

export function OwnerCard() {
  const { model: m, act, busy, isOwner } = useApp();
  const [to, setTo] = useState("");
  const [sure, setSure] = useState(false);
  if (!m) return null;
  const pending = m.pendingOwner;
  const valid = isAddress(to) && to.toLowerCase() !== (m.owner ?? "").toLowerCase();

  const offer = () =>
    act(`Offered the vault to ${short(to)}`, { fn: "transferOwnership", args: [to as Address] }, (mm) => ({ ...mm, pendingOwner: to as Address })).then((ok) => ok && (setTo(""), setSure(false)));
  const cancel = () => act("Cancelled the ownership offer", { fn: "transferOwnership", args: [ZERO] }, (mm) => ({ ...mm, pendingOwner: null }));

  return (
    <section className="card own">
      <p className="card-title">Ownership</p>
      <p className="card-sub" style={{ paddingBottom: 10 }}>The owner approves payments, sets the rules and can always withdraw. Hand the vault to another wallet or a Safe multisig in two steps.</p>
      <div className="kv"><span className="k">Owner</span><span className="v mono xs">{m.owner ?? "—"}{isOwner && m.live ? " (you)" : ""}</span></div>
      {pending ? (
        <div className="own-pending">
          <div className="grow">
            <p className="t14">Offered to <span className="mono">{pending}</span></p>
            <p className="muted xs">Nothing changes until they accept from that wallet. Until then you remain the owner.</p>
          </div>
          <button className="btn btn-secondary ac-sm" disabled={!!busy} onClick={cancel}>Cancel offer</button>
        </div>
      ) : (
        <div className="own-form">
          <label className="form-row"><span>New owner's address (a wallet or a Safe)</span>
            <input className="mono" placeholder="0x…" value={to} onChange={(e) => { setTo(e.target.value.trim()); setSure(false); }} />
          </label>
          {to && !valid && <p className="xs" style={{ color: "var(--status-critical)" }}>{isAddress(to) ? "That is already the owner." : "Enter a 0x address."}</p>}
          {valid && (
            <label className="check-row">
              <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />
              <span>I understand that once <span className="mono">{short(to)}</span> accepts, they control this vault and its money, and I no longer do.</span>
            </label>
          )}
          <button className="btn btn-secondary" style={{ alignSelf: "flex-start", marginTop: 10 }} disabled={!valid || !sure || !!busy} onClick={offer}>Offer ownership</button>
        </div>
      )}
    </section>
  );
}

/** Shown to the offered new owner when they open the vault: accept it from their wallet. */
export function AcceptBanner() {
  const { model: m, account, toast, reload } = useApp();
  const [busy, setBusy] = useState(false);
  if (!m?.live || !m.pendingOwner || !account || account.toLowerCase() !== m.pendingOwner.toLowerCase()) return null;
  const accept = async () => {
    setBusy(true);
    try {
      await acceptOwnership(m.vault, account);
      toast(`You now own ${m.name}`);
      await reload();
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="demo-banner own-banner">
      <span className="grow"><b>{m.name}</b> has been offered to you by {m.owner ? short(m.owner) : "its owner"}. Accept to become its owner.</span>
      <button className="btn btn-primary ac-sm" disabled={busy} onClick={accept}>{busy ? "Accepting…" : "Accept ownership"}</button>
    </div>
  );
}
