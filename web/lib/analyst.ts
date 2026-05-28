export type ConsensusLabel = "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell";

export interface RecCounts {
  strong_buy: number | null;
  buy: number | null;
  hold: number | null;
  sell: number | null;
  strong_sell: number | null;
}

/**
 * Compute analyst target upside as a percent: (target / price - 1) * 100.
 * Returns null when either input is missing, non-finite, or price is zero.
 * Inputs accept numeric strings because Postgres NUMERIC comes through `pg`
 * as a string by default.
 */
export function computeUpside(
  price: string | number | null | undefined,
  targetMean: string | number | null | undefined
): number | null {
  if (price === null || price === undefined || price === "") return null;
  if (targetMean === null || targetMean === undefined || targetMean === "") return null;
  const p = typeof price === "number" ? price : Number(price);
  const t = typeof targetMean === "number" ? targetMean : Number(targetMean);
  if (!Number.isFinite(p) || !Number.isFinite(t) || p === 0) return null;
  return (t / p - 1) * 100;
}

/**
 * Map Finnhub recommendation counts to a single consensus label using a
 * weighted average: (sb*2 + b*1 + h*0 + s*-1 + ss*-2) / total.
 * Buckets are inclusive on the lower bound:
 *   score >= 1.0           → Strong Buy
 *   0.3 <= score < 1.0     → Buy
 *   -0.3 <= score < 0.3    → Hold
 *   -1.0 <= score < -0.3   → Sell
 *   score < -1.0           → Strong Sell
 * Returns null when total counts are zero (no analyst coverage).
 */
export function deriveConsensus(c: RecCounts): ConsensusLabel | null {
  const sb = c.strong_buy ?? 0;
  const b = c.buy ?? 0;
  const h = c.hold ?? 0;
  const s = c.sell ?? 0;
  const ss = c.strong_sell ?? 0;
  const total = sb + b + h + s + ss;
  if (total === 0) return null;
  const score = (sb * 2 + b * 1 + h * 0 + s * -1 + ss * -2) / total;
  if (score >= 1.0) return "Strong Buy";
  if (score >= 0.3) return "Buy";
  if (score >= -0.3) return "Hold";
  if (score >= -1.0) return "Sell";
  return "Strong Sell";
}
