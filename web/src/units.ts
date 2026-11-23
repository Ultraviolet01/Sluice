// tUSD8 amounts: 6 decimals. Pure helpers shared by the app and its tests.

export function fmt(units: bigint, decimals = 6): string {
  const neg = units < 0n;
  const u = neg ? -units : units;
  const whole = u / 10n ** BigInt(decimals);
  const frac = (u % 10n ** BigInt(decimals)).toString().padStart(decimals, "0").slice(0, 2);
  return `${neg ? "−" : ""}${whole.toLocaleString("en-US")}.${frac}`;
}

export const toUnits = (text: string, decimals = 6): bigint => {
  const [w, f = ""] = text.trim().replace(/,/g, "").split(".");
  if (!/^\d+$/.test(w || "0") || !/^\d*$/.test(f)) throw new Error("Enter a number");
  return BigInt(w || "0") * 10n ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals) || "0");
};
