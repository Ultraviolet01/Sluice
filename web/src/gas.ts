// The agent's gas (tQDAY, 18 decimals), shown to the owner so it never runs dry unnoticed.
export const LOW_GAS = 200_000_000_000_000_000n; // 0.2 tQDAY, the same line the agent alerts on

export const fmtGas = (wei: bigint) => (Number(wei / 10n ** 14n) / 10_000).toFixed(wei < 10n ** 17n ? 4 : 2);
export const gasLow = (wei: bigint | null) => wei !== null && wei < LOW_GAS;
