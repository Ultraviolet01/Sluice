// The vault's real balance over the last days, for the Overview chart: walked
// back from today's balance through every tUSD8 transfer in or out of the vault.

import { parseAbiItem, type Address, type PublicClient } from "viem";
import { logsFrom } from "./logs.ts";

const DAY = 86_400;
const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

/** A movement of the vault's balance: positive in, negative out. */
export interface Move {
  at: number; // unix seconds
  delta: bigint;
}

/**
 * The balance at the end of each of the last `days` days, oldest first; the
 * last entry is today, which is the current balance. Pure, so it is tested.
 */
export function balanceHistory(balance: bigint, moves: Move[], now: number, days = 14): { day: number; balance: bigint }[] {
  const today = Math.floor(now / DAY) * DAY;
  const out: { day: number; balance: bigint }[] = [];
  let b = balance;
  for (let i = 0; i < days; i++) {
    const from = today - i * DAY;
    out.push({ day: from, balance: b });
    // The day before ended before this day's movements.
    for (const m of moves) if (m.at >= from && m.at < from + DAY) b -= m.delta;
  }
  return out.reverse();
}

/** tUSD8 transfers into and out of the vault since `fromBlock`, with block times. */
export async function vaultMoves(pub: PublicClient, token: Address, vault: Address, fromBlock: bigint): Promise<Move[]> {
  type L = { args: { value: bigint }; blockNumber: bigint };
  const [ins, outs] = await Promise.all([
    logsFrom<L>(pub, { address: token, event: TRANSFER, args: { to: vault } }, fromBlock),
    logsFrom<L>(pub, { address: token, event: TRANSFER, args: { from: vault } }, fromBlock),
  ]);
  const times = new Map<bigint, number>();
  await Promise.all([...new Set([...ins, ...outs].map((l) => l.blockNumber))].map(async (n) => {
    times.set(n, Number((await pub.getBlock({ blockNumber: n })).timestamp));
  }));
  return [
    ...ins.map((l) => ({ at: times.get(l.blockNumber)!, delta: l.args.value })),
    ...outs.map((l) => ({ at: times.get(l.blockNumber)!, delta: -l.args.value })),
  ];
}
