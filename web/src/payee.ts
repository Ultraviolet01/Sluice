// Confirmation of Payee through the ERC-8004 Identity Registry on Aevum.
// A business registers an identity (an ERC-721 token whose registration file names
// it) and a payment wallet it signed for. Before Sluice pays a bill, it asks: does
// the address on the bill belong to the business the bill names? Only ever stricter.

import { useEffect, useState } from "react";
import { publicClient } from "./chain.ts";
import { parseAbi, type Address, type PublicClient } from "viem";

/** Sluice's ERC-8004 Identity Registry on QDay Aevum Testnet (chain 44005 has no canonical one). */
export const IDENTITY_REGISTRY: Address = "0x6835B4258025A5c1723Cd236cBa5a37FFa789b2D";

export const IDENTITY_ABI = parseAbi([
  "function agentCount() view returns (uint256)",
  "function tokenURI(uint256 agentId) view returns (string)",
  "function getAgentWallet(uint256 agentId) view returns (address)",
]);

export interface Identity {
  agentId: number;
  name: string;
  wallet: Address;
}

export type Confirmation =
  | { status: "confirmed"; identity: Identity }
  | { status: "mismatch"; identity: Identity } // the address is registered to someone else
  | { status: "impostor"; identity: Identity } // the name is registered, at another address
  | { status: "unregistered" };

const SUFFIX = new Set(["ltd", "limited", "inc", "llc", "plc", "co", "corp", "gmbh", "sa", "the"]);
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w && !SUFFIX.has(w));

/** Does the bill's name refer to this registered business? All of one side's words appear in the other. */
export function sameBusiness(billName: string, registered: string): boolean {
  const a = words(billName), b = words(registered);
  if (!a.length || !b.length) return false;
  const inA = new Set(a), inB = new Set(b);
  return b.every((w) => inA.has(w)) || a.every((w) => inB.has(w));
}

/** Pure, so it is tested: what the registry says about this payee and this bill name. */
export function confirmPayee(payee: string, billName: string, ids: Identity[]): Confirmation {
  const owner = ids.find((i) => i.wallet.toLowerCase() === payee.toLowerCase());
  if (owner) return { status: sameBusiness(billName, owner.name) ? "confirmed" : "mismatch", identity: owner };
  const claimed = ids.find((i) => sameBusiness(billName, i.name));
  return claimed ? { status: "impostor", identity: claimed } : { status: "unregistered" };
}

/** One plain sentence for the owner, or null when nothing needs saying. */
export function describe(c: Confirmation, payee: string): string | null {
  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  if (c.status === "mismatch") return `the address ${short(payee)} is registered to ${c.identity.name} (ERC-8004 #${c.identity.agentId}), not the business on the bill`;
  if (c.status === "impostor") return `${c.identity.name} is registered (ERC-8004 #${c.identity.agentId}) at ${short(c.identity.wallet)}, not at ${short(payee)}`;
  return null;
}

/** The name in a registration file: a data: URI read here, anything else is skipped. */
export function nameFromURI(uri: string): string {
  try {
    const m = /^data:application\/json(;base64)?,(.*)$/s.exec(uri);
    if (!m) return "";
    const json = m[1] ? new TextDecoder().decode(Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0))) : decodeURIComponent(m[2]);
    const name = (JSON.parse(json) as { name?: unknown }).name;
    return typeof name === "string" ? name.slice(0, 80) : "";
  } catch {
    return "";
  }
}

/** Every identity in the registry with a name and a wallet. A failure returns none: the check is skipped, never invented. */
export async function loadIdentities(pub: PublicClient, registry: Address = IDENTITY_REGISTRY): Promise<Identity[]> {
  try {
    const n = Number(await pub.readContract({ address: registry, abi: IDENTITY_ABI, functionName: "agentCount" }));
    const ids = await Promise.all(Array.from({ length: Math.min(n, 500) }, async (_, i) => {
      const agentId = BigInt(i + 1);
      const [uri, wallet] = await Promise.all([
        pub.readContract({ address: registry, abi: IDENTITY_ABI, functionName: "tokenURI", args: [agentId] }).catch(() => ""),
        pub.readContract({ address: registry, abi: IDENTITY_ABI, functionName: "getAgentWallet", args: [agentId] }),
      ]);
      return { agentId: i + 1, name: nameFromURI(uri as string), wallet: wallet as Address };
    }));
    return ids.filter((x) => x.name && !/^0x0{40}$/i.test(x.wallet));
  } catch {
    return [];
  }
}

// ---- browser: one read per page load, shared by every screen.
let cached: Promise<Identity[]> | null = null;
export function useIdentities(): Identity[] | null {
  const [ids, setIds] = useState<Identity[] | null>(null);
  useEffect(() => {
    cached ??= loadIdentities(publicClient as never);
    let live = true;
    cached.then((x) => live && setIds(x));
    return () => { live = false; };
  }, []);
  return ids;
}

/** A short line for the screens: tone and text. */
export function copLine(c: Confirmation, payee: string): { ok: boolean | null; text: string } {
  if (c.status === "confirmed") return { ok: true, text: `Payee confirmed: ${c.identity.name} (ERC-8004 #${c.identity.agentId})` };
  if (c.status === "unregistered") return { ok: null, text: "Payee not in the ERC-8004 registry: check the address with the vendor" };
  return { ok: false, text: `Not confirmed: ${describe(c, payee)}` };
}
