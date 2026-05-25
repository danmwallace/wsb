import type { Rating } from "./queries";

export type MoverKind = "rating" | "spike";
export type MoverDirection = "up" | "down" | "neutral";

export interface TopMover {
  ticker: string;
  company: string | null;
  kind: MoverKind;
  label: string;
  direction: MoverDirection;
  sortKey: number;
}

export interface RatingChangeInput {
  ticker: string;
  company: string | null;
  rating: Rating;
  prevRating: Rating;
  asOf: Date;
}

export interface SpikeInput {
  ticker: string;
  company: string | null;
  recent: number;
  prior: number;
  pos: number;
  neu: number;
  neg: number;
}

const RATING_RANK: Record<Rating, number> = { Sell: 0, Hold: 1, Buy: 2 };
const SPIKE_FLOOR = 3;
// Rating changes always rank above mention spikes in the movers strip. A spike's
// sortKey is its raw recent-post count (realistically < a few hundred); this offset
// keeps any rating change above any spike, with newer changes ranking higher.
const RATING_SORT_OFFSET = 1000;

export function isSpike(recent: number, prior: number): boolean {
  return recent >= SPIKE_FLOOR && recent >= 2 * prior;
}

export function classifyRatingChange(i: RatingChangeInput): TopMover {
  const direction: MoverDirection =
    RATING_RANK[i.rating] > RATING_RANK[i.prevRating] ? "up" : "down";
  const sortKey = RATING_SORT_OFFSET + i.asOf.getTime() / 1e9;
  return {
    ticker: i.ticker,
    company: i.company,
    kind: "rating",
    label: `${i.prevRating} → ${i.rating}`,
    direction,
    sortKey,
  };
}

export function classifySpike(i: SpikeInput): TopMover | null {
  if (!isSpike(i.recent, i.prior)) return null;
  const label = i.prior > 0 ? `mentions ×${Math.round(i.recent / i.prior)}` : "new chatter";
  let direction: MoverDirection = "neutral";
  if (i.neg > i.pos && i.neg >= i.neu) direction = "down";
  else if (i.pos > i.neg && i.pos >= i.neu) direction = "up";
  return {
    ticker: i.ticker,
    company: i.company,
    kind: "spike",
    label,
    direction,
    sortKey: i.recent,
  };
}

export function mergeMovers(
  rating: TopMover[],
  spike: TopMover[],
  cap = 6
): TopMover[] {
  const byTicker = new Map<string, TopMover>();
  for (const m of rating) byTicker.set(m.ticker, m);
  for (const m of spike) if (!byTicker.has(m.ticker)) byTicker.set(m.ticker, m);
  return [...byTicker.values()].sort((a, b) => b.sortKey - a.sortKey).slice(0, cap);
}
