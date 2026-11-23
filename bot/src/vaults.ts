// What the bot reads from Aevum, and the three guardian actions it may send.
// The bot's key is each linked vault's guardian: it can pause, block a payee and
// reject a proposal, and nothing else. The vault enforces that.

import { createPublicClient, createWalletClient, defineChain, http, parseAbi, parseAbiItem, type Address, type Hex } from "viem";
import { DEPLOY_BLOCK, logsFrom } from "./logs.ts";
import { privateKeyToAccount } from "viem/accounts";

export const aevum = defineChain({
  id: 44005,
  name: "QDay Aevum Testnet",
  nativeCurrency: { name: "tQDAY", symbol: "tQDAY", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc-test.qday.info"] } },
});

const VAULT = parseAbi([
  "function owner() view returns (address)",
  "function guardian() view returns (address)",
  "function notifyChat() view returns (string)",
  "function paused() view returns (bool)",
  "function balance() view returns (uint256)",
  "function cashBuffer() view returns (uint256)",
  "function billCount() view returns (uint256)",
  "function getBill(uint256) view returns ((address payee, uint128 amount, uint64 firstDue, uint32 intervalDays, bool active, bool critical, string label))",
  "function settlements(uint256, uint32) view returns (uint8 status, address agent, uint64 createdAt, uint8 reason, string note)",
  "function pause()",
  "function reject(uint256 billId, uint32 period)",
  "function guardianBlock(address payee, string reason)",
]);
const FACTORY = parseAbi([
  "function vaultCount() view returns (uint256)",
  "function vaultAt(uint256) view returns (address)",
  "function nameOf(address) view returns (string)",
]);
const PROPOSED = parseAbiItem("event PaymentProposed(uint256 indexed billId, uint32 indexed period, address indexed agent, uint256 amount, uint8 reason, string note)");

export interface Bill {
  id: number;
  payee: Address;
  amount: bigint;
  firstDue: number;
  intervalDays: number;
  active: boolean;
  critical: boolean;
  label: string;
}

export interface VaultInfo {
  index: number;
  vault: Address;
  name: string;
}

export interface Pending {
  billId: number;
  period: number;
  amount: bigint;
  note: string;
}

export interface Chain {
  /** The bot's own address: owners set it as guardian. */
  guardianAddress: Address;
  vaultAt(index: number): Promise<VaultInfo | null>;
  /** Vaults from the factory whose alert chat is this chat. */
  vaultsForChat(chat: string): Promise<VaultInfo[]>;
  notifyChat(vault: Address): Promise<string>;
  isGuardian(vault: Address): Promise<boolean>;
  summary(vault: Address): Promise<{ balance: bigint; buffer: bigint; paused: boolean; owner: Address }>;
  bills(vault: Address): Promise<Bill[]>;
  pending(vault: Address): Promise<Pending[]>;
  pause(vault: Address): Promise<Hex>;
  reject(vault: Address, billId: number, period: number): Promise<Hex>;
  block(vault: Address, payee: Address, reason: string): Promise<Hex>;
}

export function viemChain(opts: { rpcUrl: string; factory: Address; guardianKey: Hex; fromBlock?: bigint; chain?: typeof aevum }): Chain {
  const chain = opts.chain ?? aevum;
  const account = privateKeyToAccount(opts.guardianKey);
  const pub = createPublicClient({ chain, transport: http(opts.rpcUrl) });
  const wallet = createWalletClient({ chain, account, transport: http(opts.rpcUrl) });
  const rv = <T,>(address: Address, functionName: string, args: unknown[] = []) =>
    pub.readContract({ address, abi: VAULT, functionName: functionName as never, args: args as never }) as Promise<T>;
  const rf = <T,>(functionName: string, args: unknown[] = []) =>
    pub.readContract({ address: opts.factory, abi: FACTORY, functionName: functionName as never, args: args as never }) as Promise<T>;
  const send = async (vault: Address, functionName: "pause" | "reject" | "guardianBlock", args: unknown[]) => {
    const { request } = await pub.simulateContract({ address: vault, abi: VAULT, functionName, args: args as never, account });
    const hash = await wallet.writeContract(request);
    const r = await pub.waitForTransactionReceipt({ hash, timeout: 90_000 });
    if (r.status !== "success") throw new Error("the transaction reverted");
    return hash;
  };

  // chat -> vaults, refreshed at most once a minute: scanning every vault per message is fine at testnet scale.
  let cache: { at: number; rows: (VaultInfo & { chat: string })[] } = { at: 0, rows: [] };
  const all = async () => {
    if (Date.now() - cache.at < 60_000) return cache.rows;
    const n = Number(await rf<bigint>("vaultCount"));
    const rows: (VaultInfo & { chat: string })[] = [];
    for (let i = 0; i < n; i++) {
      const vault = await rf<Address>("vaultAt", [BigInt(i)]);
      const [name, chat] = await Promise.all([rf<string>("nameOf", [vault]), rv<string>(vault, "notifyChat").catch(() => "")]);
      rows.push({ index: i, vault, name, chat });
    }
    cache = { at: Date.now(), rows };
    return rows;
  };

  return {
    guardianAddress: account.address,
    async vaultAt(index) {
      const n = Number(await rf<bigint>("vaultCount"));
      if (index < 0 || index >= n) return null;
      const vault = await rf<Address>("vaultAt", [BigInt(index)]);
      return { index, vault, name: await rf<string>("nameOf", [vault]) };
    },
    async vaultsForChat(chat) {
      return (await all()).filter((r) => r.chat === chat).map(({ index, vault, name }) => ({ index, vault, name }));
    },
    notifyChat: (vault) => rv<string>(vault, "notifyChat"),
    isGuardian: async (vault) => (await rv<Address>(vault, "guardian")).toLowerCase() === account.address.toLowerCase(),
    async summary(vault) {
      const [balance, buffer, paused, owner] = await Promise.all([rv<bigint>(vault, "balance"), rv<bigint>(vault, "cashBuffer"), rv<boolean>(vault, "paused"), rv<Address>(vault, "owner")]);
      return { balance, buffer, paused, owner };
    },
    async bills(vault) {
      const n = Number(await rv<bigint>(vault, "billCount"));
      const out: Bill[] = [];
      for (let i = 0; i < n; i++) {
        const b = await rv<{ payee: Address; amount: bigint; firstDue: bigint; intervalDays: number; active: boolean; critical: boolean; label: string }>(vault, "getBill", [BigInt(i)]);
        out.push({ id: i, payee: b.payee, amount: b.amount, firstDue: Number(b.firstDue), intervalDays: Number(b.intervalDays), active: b.active, critical: b.critical, label: b.label });
      }
      return out;
    },
    async pending(vault) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logs = await logsFrom<any>(pub as any, { address: vault, event: PROPOSED }, opts.fromBlock ?? (opts.chain && opts.chain.id !== 44005 ? 0n : DEPLOY_BLOCK));
      const seen = new Map<string, Pending>();
      for (const l of logs) seen.set(`${l.args.billId}:${l.args.period}`, { billId: Number(l.args.billId), period: Number(l.args.period), amount: l.args.amount!, note: l.args.note ?? "" });
      const out: Pending[] = [];
      for (const p of seen.values()) {
        const st = await rv<readonly [number]>(vault, "settlements", [BigInt(p.billId), p.period]);
        if (st[0] === 1) out.push(p);
      }
      return out;
    },
    pause: (vault) => send(vault, "pause", []),
    reject: (vault, billId, period) => send(vault, "reject", [BigInt(billId), period]),
    block: (vault, payee, reason) => send(vault, "guardianBlock", [payee, reason]),
  };
}
