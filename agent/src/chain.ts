// Everything the agent reads from or writes to Aevum. The loop talks to the
// `Chain` interface only, so tests can run it against a fake.

import { createPublicClient, createWalletClient, defineChain, http, parseAbi, parseAbiItem, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Band, Reason, type Bill } from "./brain.ts";

export const aevumTestnet = defineChain({
  id: 44005,
  name: "QDay Aevum Testnet",
  nativeCurrency: { name: "tQDAY", symbol: "tQDAY", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc-test.qday.info"], webSocket: ["wss://rpc-test.qday.info"] } },
  blockExplorers: { default: { name: "QDay explorer", url: "https://explorer-test.qday.info" } },
  testnet: true,
});

export const VAULT_ABI = parseAbi([
  "function owner() view returns (address)",
  "function paused() view returns (bool)",
  "function token() view returns (address)",
  "function cashBuffer() view returns (uint256)",
  "function approvalThreshold() view returns (uint256)",
  "function balance() view returns (uint256)",
  "function sessions(address) view returns (uint128 perPaymentCap, uint128 dailyCap, uint64 expiresAt, bool active)",
  "function spentInWindow(address) view returns (uint256)",
  "function billCount() view returns (uint256)",
  "function getBill(uint256) view returns ((address payee, uint128 amount, uint64 firstDue, uint32 intervalDays, bool active, bool critical, string label))",
  "function settlements(uint256, uint32) view returns (uint8 status, address agent, uint64 createdAt, uint8 reason, string note)",
  "function checkPayment(address, uint256, uint32) view returns (uint8, uint8)",
  "function isAllowedPayee(address) view returns (bool)",
  "function agent() view returns (address)",
  "function notifyChat() view returns (string)",
  "function pay(uint256 billId, uint32 period)",
  "function propose(uint256 billId, uint32 period, string note)",
]);

const BILL_PAID = parseAbiItem(
  "event BillPaid(uint256 indexed billId, uint32 indexed period, address indexed payee, uint256 amount, address agent, bool ownerApproved)",
);

export interface Session {
  perPaymentCap: bigint;
  dailyCap: bigint;
  expiresAt: number;
  active: boolean;
}

export interface Paid {
  billId: number;
  period: number;
  payee: Address;
  amount: bigint;
  ownerApproved: boolean;
}

export interface VaultView {
  vault: Address;
  paused: boolean;
  balance: bigint;
  cashBuffer: bigint;
  approvalThreshold: bigint;
  session: Session;
  spent: bigint;
  bills: Bill[];
  paid: Paid[];
}

export const FACTORY_ABI = parseAbi([
  "function vaultCount() view returns (uint256)",
  "function vaultAt(uint256) view returns (address)",
]);

export interface Chain {
  agent: Address;
  /** The agent's own gas balance (tQDAY, 18 decimals): it pays every transaction it sends. */
  gas(): Promise<bigint>;
  /** Vaults from the factory whose current agent is this key, with a live session. */
  discover(factory: Address): Promise<{ vault: Address; index: number }[]>;
  /** The chat the vault's owner linked for alerts ("" if none). */
  notifyChat(vault: Address): Promise<string>;
  now(): Promise<number>;
  read(vault: Address): Promise<VaultView>;
  check(vault: Address, billId: number, period: number): Promise<{ band: Band; reason: Reason }>;
  /** Status of a bill period: 0 none, 1 pending, 2 paid, 3 rejected. */
  status(vault: Address, billId: number, period: number): Promise<number>;
  pay(vault: Address, billId: number, period: number): Promise<Hex>;
  propose(vault: Address, billId: number, period: number, note: string): Promise<Hex>;
}

export function viemChain(opts: { rpcUrl: string; privateKey: Hex; fromBlock?: bigint; chain?: typeof aevumTestnet }): Chain {
  const chain = opts.chain ?? aevumTestnet;
  const account = privateKeyToAccount(opts.privateKey);
  const pub = createPublicClient({ chain, transport: http(opts.rpcUrl) });
  const wallet = createWalletClient({ chain, account, transport: http(opts.rpcUrl) });
  const read = <T>(address: Address, functionName: string, args: unknown[] = []) =>
    pub.readContract({ address, abi: VAULT_ABI, functionName: functionName as never, args: args as never }) as Promise<T>;

  async function send(vault: Address, functionName: "pay" | "propose", args: unknown[]): Promise<Hex> {
    // Simulate first: a refusal surfaces as a readable revert and costs no gas.
    const { request } = await pub.simulateContract({ address: vault, abi: VAULT_ABI, functionName, args: args as never, account });
    const hash = await wallet.writeContract(request);
    const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 90_000 });
    if (receipt.status !== "success") throw new Error(`transaction ${hash} reverted`);
    return hash;
  }

  return {
    agent: account.address,
    gas: () => pub.getBalance({ address: account.address }),
    notifyChat: (vault) => read<string>(vault, "notifyChat").catch(() => ""),
    async discover(factory) {
      const n = Number(await pub.readContract({ address: factory, abi: FACTORY_ABI, functionName: "vaultCount" }));
      const now = Math.floor(Date.now() / 1000);
      const mine: { vault: Address; index: number }[] = [];
      for (let i = 0; i < n; i++) {
        const vault = (await pub.readContract({ address: factory, abi: FACTORY_ABI, functionName: "vaultAt", args: [BigInt(i)] })) as Address;
        const current = await read<Address>(vault, "agent");
        if (current.toLowerCase() !== account.address.toLowerCase()) continue;
        const s = await read<readonly [bigint, bigint, bigint, boolean]>(vault, "sessions", [account.address]);
        if (s[3] && Number(s[2]) > now) mine.push({ vault, index: i });
      }
      return mine;
    },
    async now() {
      const block = await pub.getBlock();
      return Number(block.timestamp);
    },
    async read(vault) {
      const [paused, balance, cashBuffer, approvalThreshold, s, spent, count] = await Promise.all([
        read<boolean>(vault, "paused"),
        read<bigint>(vault, "balance"),
        read<bigint>(vault, "cashBuffer"),
        read<bigint>(vault, "approvalThreshold"),
        read<readonly [bigint, bigint, bigint, boolean]>(vault, "sessions", [account.address]),
        read<bigint>(vault, "spentInWindow", [account.address]),
        read<bigint>(vault, "billCount"),
      ]);
      const bills: Bill[] = [];
      for (let i = 0; i < Number(count); i++) {
        const b = await read<{ payee: Address; amount: bigint; firstDue: bigint; intervalDays: number; active: boolean; critical: boolean; label: string }>(vault, "getBill", [BigInt(i)]);
        bills.push({ id: i, payee: b.payee, amount: b.amount, firstDue: Number(b.firstDue), intervalDays: Number(b.intervalDays), active: b.active, critical: b.critical, label: b.label });
      }
      const logs = await pub.getLogs({ address: vault, event: BILL_PAID, fromBlock: opts.fromBlock ?? 0n, toBlock: "latest" });
      const paid: Paid[] = logs.map((l) => ({
        billId: Number(l.args.billId),
        period: Number(l.args.period),
        payee: l.args.payee!,
        amount: l.args.amount!,
        ownerApproved: Boolean(l.args.ownerApproved),
      }));
      return {
        vault,
        paused,
        balance,
        cashBuffer,
        approvalThreshold,
        session: { perPaymentCap: s[0], dailyCap: s[1], expiresAt: Number(s[2]), active: s[3] },
        spent,
        bills,
        paid,
      };
    },
    async check(vault, billId, period) {
      const [band, reason] = await read<readonly [number, number]>(vault, "checkPayment", [account.address, BigInt(billId), period]);
      return { band: band as Band, reason: reason as Reason };
    },
    async status(vault, billId, period) {
      const s = await read<readonly [number, Address, bigint, number, string]>(vault, "settlements", [BigInt(billId), period]);
      return s[0];
    },
    pay: (vault, billId, period) => send(vault, "pay", [BigInt(billId), period]),
    propose: (vault, billId, period, note) => send(vault, "propose", [BigInt(billId), period, note]),
  };
}
