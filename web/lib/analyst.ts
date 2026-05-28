export type ConsensusLabel = "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell";

export interface RecCounts {
  strong_buy: number | null;
  buy: number | null;
  hold: number | null;
  sell: number | null;
  strong_sell: number | null;
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
