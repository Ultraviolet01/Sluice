// Aevum Testnet access for the dashboard: public reads for everyone, and the
// owner's actions signed in their own browser wallet (MetaMask or any EIP-1193 wallet).

import { createPublicClient, createWalletClient, custom, defineChain, http, parseAbi, type Address, type Hex } from "viem";

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
  "function getBill(uint256) view returns ((address payee, uint128 amount, uint64 firstDue, uint32 intervalDays, bool active, string label))",
  "function settlements(uint256, uint32) view returns (uint8 status, address agent, uint64 createdAt, uint8 reason, string note)",
  "function isAllowedPayee(address) view returns (bool)",
  "function isBlockedPayee(address) view returns (bool)",
  // owner actions
  "function approve(uint256 billId, uint32 period)",
  "function reject(uint256 billId, uint32 period)",
  "function pause()",
  "function unpause()",
  "function addBill(address payee, uint128 amount, uint64 firstDue, uint32 intervalDays, string label) returns (uint256)",
  "function cancelBill(uint256 billId)",
  "function setPayeeAllowed(address payee, bool allowed)",
  "function setPayeeBlocked(address payee, bool blocked)",
  "function setCashBuffer(uint256 amount)",
  "function setApprovalThreshold(uint256 amount)",
  "function grantSession(address agent, uint128 perPaymentCap, uint128 dailyCap, uint64 expiresAt)",
  "function revokeSession(address agent)",
  "function withdraw(address to, uint256 amount)",
  // events
  "event BillPaid(uint256 indexed billId, uint32 indexed period, address indexed payee, uint256 amount, address agent, bool ownerApproved)",
  "event PaymentProposed(uint256 indexed billId, uint32 indexed period, address indexed agent, uint256 amount, uint8 reason, string note)",
  "event PaymentRejected(uint256 indexed billId, uint32 indexed period)",
  "event BillAdded(uint256 indexed billId, address indexed payee, uint256 amount, uint64 firstDue, uint32 intervalDays, string label)",
  "event BillCancelled(uint256 indexed billId)",
  "event PayeeAllowed(address indexed payee, bool allowed)",
  "event PayeeBlocked(address indexed payee, bool blocked)",
  "event PolicyChanged(bytes32 indexed field, uint256 oldValue, uint256 newValue)",
  "event SessionGranted(address indexed agent, uint256 perPaymentCap, uint256 dailyCap, uint64 expiresAt)",
  "event SessionRevoked(address indexed agent)",
  "event Withdrawn(address indexed to, uint256 amount)",
  "event Paused(address account)",
  "event Unpaused(address account)",
]);

export const ERC20_ABI = parseAbi(["function balanceOf(address) view returns (uint256)"]);

export const publicClient = createPublicClient({ chain: aevum, transport: http() });

type Eip1193 = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
const eth = () => (window as unknown as { ethereum?: Eip1193 }).ethereum;

export const hasWallet = () => Boolean(eth());

/** Asks the wallet for an account and switches it to Aevum, adding the network if needed. */
export async function connectWallet(): Promise<Address> {
  const provider = eth();
  if (!provider) throw new Error("No browser wallet found. Install MetaMask to sign as the owner.");
  const [account] = (await provider.request({ method: "eth_requestAccounts" })) as Address[];
  const hexId = `0x${aevum.id.toString(16)}`;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
  } catch {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: hexId,
        chainName: aevum.name,
        nativeCurrency: aevum.nativeCurrency,
        rpcUrls: ["https://rpc-test.qday.info"],
        blockExplorerUrls: [EXPLORER],
      }],
    });
  }
  return account;
}

export type OwnerCall =
  | { fn: "approve" | "reject"; args: [bigint, number] }
  | { fn: "pause" | "unpause"; args: [] }
  | { fn: "addBill"; args: [Address, bigint, bigint, number, string] }
  | { fn: "cancelBill"; args: [bigint] }
  | { fn: "setPayeeAllowed" | "setPayeeBlocked"; args: [Address, boolean] }
  | { fn: "setCashBuffer" | "setApprovalThreshold"; args: [bigint] }
  | { fn: "grantSession"; args: [Address, bigint, bigint, bigint] }
  | { fn: "revokeSession"; args: [Address] }
  | { fn: "withdraw"; args: [Address, bigint] };

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

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
