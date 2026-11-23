// Aevum's RPC answers eth_getLogs for at most 1,000 blocks at a time, so a long
// history is read in chunks, a few at once, each retried if the RPC hiccups.
import type { PublicClient } from "viem";

// The block the Sluice contracts were deployed at on Aevum Testnet: nothing earlier can hold their events.
export const DEPLOY_BLOCK = 3911562n;
const SPAN = 1000n;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function logsFrom<T = any>(pub: PublicClient, args: Record<string, unknown>, fromBlock: bigint, parallel = 12): Promise<T[]> {
  const latest = await pub.getBlockNumber();
  const ranges: [bigint, bigint][] = [];
  for (let a = fromBlock; a <= latest; a += SPAN) ranges.push([a, a + SPAN - 1n < latest ? a + SPAN - 1n : latest]);
  const out: T[][] = new Array(ranges.length);
  let next = 0;
  const worker = async () => {
    while (next < ranges.length) {
      const i = next++;
      const [from, to] = ranges[i];
      for (let tries = 0; ; tries++) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          out[i] = (await pub.getLogs({ ...(args as any), fromBlock: from, toBlock: to })) as T[];
          break;
        } catch (e) {
          if (tries >= 3) throw e;
          await new Promise((r) => setTimeout(r, 500 * (tries + 1)));
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(parallel, ranges.length) }, worker));
  return out.flat();
}

/**
 * The block a contract was deployed in: nothing before it can hold its events, so
 * scans start there instead of at the factory's deployment. Found with eight probes
 * per round (about five rounds), then remembered in this browser.
 */
export async function bornAt(pub: PublicClient, address: `0x${string}`, floor: bigint): Promise<bigint> {
  const key = `sluice:born:${address.toLowerCase()}`;
  try { const c = localStorage.getItem(key); if (c) return BigInt(c); } catch { /* storage blocked */ }
  try {
    const has = async (b: bigint) => ((await pub.getCode({ address, blockNumber: b })) ?? "0x").length > 2;
    let lo = floor, hi = await pub.getBlockNumber();
    if (!(await has(hi))) return floor;
    while (hi - lo > 1n) {
      const step = (hi - lo) / 9n || 1n;
      const probes = Array.from({ length: 8 }, (_, i) => lo + step * BigInt(i + 1)).filter((b) => b < hi);
      const found = await Promise.all(probes.map(has));
      const first = found.indexOf(true);
      if (first === -1) lo = probes[probes.length - 1] ?? lo;
      else { hi = probes[first]; lo = first > 0 ? probes[first - 1] : lo; }
      if (probes.length === 0) break;
    }
    try { localStorage.setItem(key, hi.toString()); } catch { /* storage blocked */ }
    return hi;
  } catch {
    return floor;
  }
}
