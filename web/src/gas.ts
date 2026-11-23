// The founder's own wallet gas (tQDAY, 18 decimals). Founders pay the fee for their own
// signatures (approve, reject, rules, deposits); the hosted agent's gas is the operator's job.
export const LOW_GAS = 50_000_000_000_000_000n; // 0.05 tQDAY: a handful of owner transactions

export const fmtGas = (wei: bigint) => (Number(wei / 10n ** 14n) / 10_000).toFixed(wei < 10n ** 17n ? 4 : 2);
export const gasLow = (wei: bigint | null) => wei !== null && wei < LOW_GAS;
