import { useEffect, useState } from "react";
import { gasBalance } from "../chain.ts";
import { fmtGas, gasLow } from "../gas.ts";
import { useApp } from "../state.tsx";

/** Warns the signed-in founder when their own wallet can't pay the fee to sign approvals. */
export function WalletGasBanner() {
  const { model: m, account } = useApp();
  const [gas, setGas] = useState<bigint | null>(null);
  useEffect(() => {
    if (!account || !m?.live) return setGas(null);
    let on = true;
    const read = () => gasBalance(account).then((g) => on && setGas(g)).catch(() => {});
    read();
    const t = setInterval(read, 60_000);
    return () => {
      on = false;
      clearInterval(t);
    };
  }, [account, m?.live]);
  if (!gasLow(gas)) return null;
  return (
    <div className="demo-banner warn">
      Your wallet has {fmtGas(gas!)} tQDAY. Approving payments and changing rules each costs a small fee in tQDAY, so you may not be able to sign.{" "}
      <a href="https://faucet.qday.info/en" target="_blank" rel="noreferrer">Get tQDAY from the faucet</a>.
    </div>
  );
}
