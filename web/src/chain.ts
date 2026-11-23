// Aevum Testnet access for the dashboard: public reads for everyone, and the
// owner's actions signed in their own browser wallet (MetaMask or any EIP-1193 wallet).

import { createPublicClient, createWalletClient, custom, defineChain, http, parseAbi, parseEventLogs, type Address, type Hex } from "viem";

export const aevum = defineChain({
  id: 44005,
  name: "QDay Aevum Testnet",
  nativeCurrency: { name: "tQDAY", symbol: "tQDAY", decimals: 18 },
  rpcUrls: { default: { http: [import.meta.env.VITE_RPC_URL || "https://rpc-test.qday.info"] } },
  blockExplorers: { default: { name: "QDay explorer", url: "https://explorer-test.qday.info" } },
  testnet: true,
});

export const EXPLORER = aevum.blockExplorers.default.url;
export const TUSD8 = "0x456569838f1d43009A91ebA4263147Afd7233483" as Address;

export const VAULT_ABI = parseAbi([
  "function owner() view returns (address)",
  "function paused() view returns (bool)",
  "function cashBuffer() view returns (uint256)",
  "function approvalThreshold() view returns (uint256)",
  "function balance() view returns (uint256)",
  "function sessions(address) view returns (uint128 perPaymentCap, uint128 dailyCap, uint64 expiresAt, bool active)",
  "function spentInWindow(address) view returns (uint256)",
  "function billCount() view returns (uint256)",
  "function getBill(uint256) view returns ((address payee, uint128 amount, uint64 firstDue, uint32 intervalDays, bool active, bool critical, string label))",
  "function settlements(uint256, uint32) view returns (uint8 status, address agent, uint64 createdAt, uint8 reason, string note)",
  "function isAllowedPayee(address) view returns (bool)",
  "function agent() view returns (address)",
  "function pendingOwner() view returns (address)",
  "function guardian() view returns (address)",
  "function notifyChat() view returns (string)",
  "function setGuardian(address guardian, string reason)",
  "function setNotifyChat(string chat)",
  "event GuardianSet(address indexed guardian, string reason)",
  "event NotifyChatSet(string chat)",
  "function releaseBill(uint256 billId, uint32 period)",
  "function transferOwnership(address newOwner)",
  "function acceptOwnership()",
  "event BillReleased(uint256 indexed billId, uint32 indexed period)",
  "event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner)",
  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
  "function token() view returns (address)",
  "function isBlockedPayee(address) view returns (bool)",
  // owner actions
  "function approve(uint256 billId, uint32 period)",
  "function reject(uint256 billId, uint32 period)",
  "function pause()",
  "function unpause()",
  "function addBill(address payee, uint128 amount, uint64 firstDue, uint32 intervalDays, bool critical, string label) returns (uint256)",
  "function addBills((address payee, uint128 amount, uint64 firstDue, uint32 intervalDays, bool critical, string label)[] bills) returns (uint256)",
  "function cancelBill(uint256 billId, string reason)",
  "function setPayeeAllowed(address payee, bool allowed, string reason)",
  "function setPayeesAllowed(address[] payees, bool allowed, string reason)",
  "function setPayeesBlocked(address[] payees, bool blocked, string reason)",
  "function setPayeeBlocked(address payee, bool blocked, string reason)",
  "function setCashBuffer(uint256 amount, string reason)",
  "function setApprovalThreshold(uint256 amount, string reason)",
  "function grantSession(address agent, uint128 perPaymentCap, uint128 dailyCap, uint64 expiresAt, string reason)",
  "function revokeSession(address agent, string reason)",
  "function withdraw(address to, uint256 amount)",
  // events
  "event BillPaid(uint256 indexed billId, uint32 indexed period, address indexed payee, uint256 amount, address agent, bool ownerApproved)",
  "event PaymentProposed(uint256 indexed billId, uint32 indexed period, address indexed agent, uint256 amount, uint8 reason, string note)",
  "event PaymentRejected(uint256 indexed billId, uint32 indexed period)",
  "event BillAdded(uint256 indexed billId, address indexed payee, uint256 amount, uint64 firstDue, uint32 intervalDays, bool critical, string label)",
  "event BillCancelled(uint256 indexed billId, string reason)",
  "event PayeeAllowed(address indexed payee, bool allowed, string reason)",
  "event PayeeBlocked(address indexed payee, bool blocked, string reason)",
  "event PolicyChanged(bytes32 indexed field, uint256 oldValue, uint256 newValue, string reason)",
  "event SessionGranted(address indexed agent, uint256 perPaymentCap, uint256 dailyCap, uint64 expiresAt, string reason)",
  "event SessionRevoked(address indexed agent, string reason)",
  "event Withdrawn(address indexed to, uint256 amount)",
  "event Paused(address account)",
  "event Unpaused(address account)",
]);

export interface BillInput {
  payee: Address;
  amount: bigint;
  firstDue: bigint;
  intervalDays: number;
  critical: boolean;
  label: string;
}

export const FACTORY = (import.meta.env.VITE_FACTORY_ADDRESS || "") as Address | "";
/** The Telegram bot's username (no @) and its guardian address, if this site runs one. */
export const TELEGRAM_BOT = (import.meta.env.VITE_TELEGRAM_BOT || "") as string;
export const BOT_GUARDIAN = (import.meta.env.VITE_BOT_GUARDIAN || "") as Address | "";
/** The hosted Sluice agent's address, offered when the owner grants a session. */
export const HOSTED_AGENT = (import.meta.env.VITE_AGENT_ADDRESS || "") as Address | "";

export const FACTORY_ABI = parseAbi([
  "function createVault(string name, uint256 cashBuffer, uint256 approvalThreshold) returns (address)",
  "function vaultsCreatedBy(address) view returns (address[])",
  "function nameOf(address) view returns (string)",
  "function vaultCount() view returns (uint256)",
  "function vaultAt(uint256) view returns (address)",
  "event VaultCreated(address indexed creator, address indexed vault, string name)",
]);

/** Creates the caller's company vault through the factory; resolves to the new vault's address. */
export async function createCompany(account: Address, name: string, cashBuffer: bigint, threshold: bigint): Promise<Address> {
  const provider = eth();
  if (!provider || !FACTORY) throw new Error("Company creation is not set up on this site.");
  const wallet = createWalletClient({ chain: aevum, account, transport: custom(provider) });
  const { request } = await publicClient.simulateContract({ address: FACTORY, abi: FACTORY_ABI, functionName: "createVault", args: [name, cashBuffer, threshold], account });
  const hash = await wallet.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Transaction reverted");
  const logs = parseEventLogs({ abi: FACTORY_ABI, logs: receipt.logs, eventName: "VaultCreated" });
  if (!logs[0]) throw new Error("Vault created, but its address was not in the receipt");
  return logs[0].args.vault;
}

/** The companies an account created, with their names. */
/**
 * The companies this wallet owns now, whoever created them (a vault handed over
 * by offer and accept counts), plus any offered to it and waiting to be accepted.
 * A company it created and then handed to someone else is not listed.
 */
export async function myCompanies(account: Address): Promise<{ vault: Address; name: string; offered?: boolean }[]> {
  if (!FACTORY) return [];
  const me = account.toLowerCase();
  const read = <T,>(address: Address, abi: typeof FACTORY_ABI | typeof VAULT_ABI, functionName: string, args: unknown[] = []) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    publicClient.readContract({ address, abi, functionName, args } as any) as Promise<T>;
  const count = Number(await read<bigint>(FACTORY, FACTORY_ABI, "vaultCount"));
  const all = await Promise.all(Array.from({ length: count }, (_, i) => read<Address>(FACTORY, FACTORY_ABI, "vaultAt", [BigInt(i)])));
  const rows = await Promise.all(all.map(async (vault) => {
    const [owner, pending] = await Promise.all([read<Address>(vault, VAULT_ABI, "owner"), read<Address>(vault, VAULT_ABI, "pendingOwner").catch(() => "0x0" as Address)]);
    const mine = owner.toLowerCase() === me, offered = pending.toLowerCase() === me;
    if (!mine && !offered) return null;
    return { vault, name: await read<string>(FACTORY, FACTORY_ABI, "nameOf", [vault]), ...(mine ? {} : { offered: true }) };
  }));
  return rows.filter((r): r is NonNullable<typeof r> => r !== null);
}

export async function companyName(vault: Address): Promise<string | null> {
  if (!FACTORY) return null;
  try {
    const n = (await publicClient.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: "nameOf", args: [vault] })) as string;
    return n || null;
  } catch {
    return null;
  }
}

export const ERC20_ABI = parseAbi(["function balanceOf(address) view returns (uint256)", "function transfer(address to, uint256 amount) returns (bool)"]);

export async function tokenBalance(token: Address, who: Address): Promise<bigint> {
  return (await publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: "balanceOf", args: [who] })) as bigint;
}

/** Sends tUSD8 from the connected wallet to the vault. Anyone may deposit; only the owner can take it out. */
export async function deposit(token: Address, vault: Address, account: Address, amount: bigint): Promise<Hex> {
  const provider = eth();
  if (!provider) throw new Error("No browser wallet found.");
  const wallet = createWalletClient({ chain: aevum, account, transport: custom(provider) });
  const { request } = await publicClient.simulateContract({ address: token, abi: ERC20_ABI, functionName: "transfer", args: [vault, amount], account });
  const hash = await wallet.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Transaction reverted");
  return hash;
}

// Calls made together are sent in one HTTP request (JSON-RPC batching): the dashboard's
// many small reads cost about one round trip instead of one each.
export const publicClient = createPublicClient({ chain: aevum, transport: http(undefined, { batch: { batchSize: 60, wait: 8 }, timeout: 20_000, retryCount: 2 }) });

type Eip1193 = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
// Browser wallets announce themselves (EIP-6963). With several extensions installed,
// window.ethereum may belong to any of them, so prefer MetaMask's own announcement.
const announced: { rdns: string; provider: Eip1193 }[] = [];
if (typeof window !== "undefined") {
  window.addEventListener("eip6963:announceProvider", (e: Event) => {
    const d = (e as CustomEvent<{ info: { rdns: string }; provider: Eip1193 }>).detail;
    if (d?.provider && !announced.some((a) => a.rdns === d.info?.rdns)) announced.push({ rdns: d.info?.rdns ?? "", provider: d.provider });
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}
const eth = (): Eip1193 | undefined =>
  announced.find((a) => a.rdns === "io.metamask")?.provider ?? announced[0]?.provider ?? (window as unknown as { ethereum?: Eip1193 }).ethereum;

/** Wallet events (account switched or disconnected in the wallet itself). */
export function onAccountsChanged(cb: (a: Address | null) => void): () => void {
  const p = eth() as (Eip1193 & { on?: (e: string, f: (x: unknown) => void) => void; removeListener?: (e: string, f: (x: unknown) => void) => void }) | undefined;
  if (!p?.on) return () => {};
  const f = (x: unknown) => cb(((x as Address[]) ?? [])[0] ?? null);
  p.on("accountsChanged", f);
  return () => p.removeListener?.("accountsChanged", f);
}

const DISCONNECTED = "sluice:disconnected";
const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } } };

/** Forget the wallet on this site. MetaMask also drops the site's permission where it supports that. */
export async function disconnectWallet(): Promise<void> {
  store.set(DISCONNECTED, "1");
  try { await eth()?.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] }); } catch { /* older wallets: the flag is enough */ }
}

export const hasWallet = () => Boolean(eth());

/** The wallet's already-approved account, without a prompt (for returning visitors). */
export async function silentAccount(): Promise<Address | null> {
  const provider = eth();
  if (!provider || store.get(DISCONNECTED)) return null;
  try {
    const [a] = (await provider.request({ method: "eth_accounts" })) as Address[];
    return a ?? null;
  } catch {
    return null;
  }
}

/** Asks the wallet for an account and switches it to Aevum, adding the network if needed. */
export async function connectWallet(): Promise<Address> {
  const provider = eth();
  if (!provider) throw new Error("No browser wallet found. Install MetaMask to sign as the owner.");
  const [account] = (await provider.request({ method: "eth_requestAccounts" })) as Address[];
  if (!account) throw new Error("The wallet shared no account.");
  store.set(DISCONNECTED, null);
  const hexId = `0x${aevum.id.toString(16)}`;
  const current = String(await provider.request({ method: "eth_chainId" }).catch(() => "")).toLowerCase();
  if (current !== hexId) {
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
    } catch (e) {
      const code = (e as { code?: number; data?: { originalError?: { code?: number } } })?.code ?? (e as { data?: { originalError?: { code?: number } } })?.data?.originalError?.code;
      if (code === 4001) throw new Error("Switch to Aevum Testnet in your wallet to continue.");
      // 4902 (or any unknown-chain error): add Aevum, which also switches to it.
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [{ chainId: hexId, chainName: aevum.name, nativeCurrency: aevum.nativeCurrency, rpcUrls: ["https://rpc-test.qday.info"], blockExplorerUrls: [EXPLORER] }],
      });
    }
  }
  return account;
}

export type OwnerCall =
  | { fn: "approve" | "reject"; args: [bigint, number] }
  | { fn: "pause" | "unpause"; args: [] }
  | { fn: "addBill"; args: [Address, bigint, bigint, number, boolean, string] }
  | { fn: "addBills"; args: [BillInput[]] }
  | { fn: "cancelBill"; args: [bigint, string] }
  | { fn: "setPayeeAllowed" | "setPayeeBlocked"; args: [Address, boolean, string] }
  | { fn: "setPayeesAllowed" | "setPayeesBlocked"; args: [Address[], boolean, string] }
  | { fn: "setCashBuffer" | "setApprovalThreshold"; args: [bigint, string] }
  | { fn: "grantSession"; args: [Address, bigint, bigint, bigint, string] }
  | { fn: "revokeSession"; args: [Address, string] }
  | { fn: "withdraw"; args: [Address, bigint] }
  | { fn: "releaseBill"; args: [bigint, number] }
  | { fn: "transferOwnership"; args: [Address] }
  | { fn: "setGuardian"; args: [Address, string] }
  | { fn: "setNotifyChat"; args: [string] };

/** The offered new owner accepts the vault (Ownable2Step's second step). Signed by them, not the owner. */
export async function acceptOwnership(vault: Address, account: Address): Promise<Hex> {
  const provider = eth();
  if (!provider) throw new Error("No browser wallet found.");
  const wallet = createWalletClient({ chain: aevum, account, transport: custom(provider) });
  const { request } = await publicClient.simulateContract({ address: vault, abi: VAULT_ABI, functionName: "acceptOwnership", account });
  const hash = await wallet.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Transaction reverted");
  return hash;
}

export const gasBalance = (who: Address) => publicClient.getBalance({ address: who });

/** Simulates (so a refusal shows its reason and costs nothing), signs, and waits for the receipt. */
export async function ownerSend(vault: Address, account: Address, call: OwnerCall): Promise<Hex> {
  const provider = eth();
  if (!provider) throw new Error("No browser wallet found.");
  const wallet = createWalletClient({ chain: aevum, account, transport: custom(provider) });
  const { request } = await publicClient.simulateContract({ address: vault, abi: VAULT_ABI, functionName: call.fn, args: call.args as never, account });
  const hash = await wallet.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Transaction reverted");
  return hash;
}

/** A short, human message from a viem error (revert reason when there is one). */
export function errorText(e: unknown): string {
  const err = e as { shortMessage?: string; message?: string };
  return (err.shortMessage || err.message || String(e)).split("\n")[0].slice(0, 200);
}

export const explorerTxUrl = (tx: string) => `${EXPLORER}/tx/${tx}`;

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
