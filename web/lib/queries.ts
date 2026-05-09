import { query } from "./db";

export type Rating = "Buy" | "Hold" | "Sell";
export type Sentiment = "Positive" | "Neutral" | "Negative";

export interface DashboardRow {
  ticker: string;
  company: string | null;
  mention_count: number;
  last_seen_at: Date;
  rating: Rating | null;
  confidence: number | null;
  rating_as_of: Date | null;
  rationale: string | null;
  price: string | null;
  change_pct_1d: string | null;
  pos_7d: number;
  neu_7d: number;
  neg_7d: number;
}

export interface NewsHeadline {
  headline: string;
  url: string;
  source?: string;
  datetime?: number;
}

export interface TickerDetail {
  ticker: string;
  company: string | null;
  mention_count: number;
  first_seen_at: Date;
  last_seen_at: Date;
  price: string | null;
  change_pct_1d: string | null;
  change_pct_5d: string | null;
  change_pct_ytd: string | null;
  market_cap: string | null;
  pe_ratio: string | null;
  news: NewsHeadline[];
  fundamentals: Record<string, unknown> | null;
  snapshot_as_of: Date | null;
}

export interface RatingHistoryRow {
  as_of_date: Date;
  rating: Rating;
  confidence: number;
  rationale: string;
}

export interface SentimentDayRow {
  day: Date;
  positive: number;
  neutral: number;
  negative: number;
}

export interface PostRow {
  post_id: string;
  ticker: string;
  company: string | null;
  summary: string | null;
  sentiment: Sentiment;
  link: string | null;
  observed_at: Date;
}

export async function listDashboardRows(): Promise<DashboardRow[]> {
  return query<DashboardRow>(
    `
    SELECT
      t.ticker,
      t.company,
      t.mention_count,
      t.last_seen_at,
      r.rating,
      r.confidence,
      r.as_of_date AS rating_as_of,
      r.rationale,
      s.price,
      s.change_pct_1d,
      COALESCE(SUM(CASE WHEN p.sentiment = 'Positive' THEN 1 ELSE 0 END), 0)::int AS pos_7d,
      COALESCE(SUM(CASE WHEN p.sentiment = 'Neutral'  THEN 1 ELSE 0 END), 0)::int AS neu_7d,
      COALESCE(SUM(CASE WHEN p.sentiment = 'Negative' THEN 1 ELSE 0 END), 0)::int AS neg_7d
    FROM tickers t
    LEFT JOIN v_latest_rating   r ON r.ticker = t.ticker
    LEFT JOIN v_latest_snapshot s ON s.ticker = t.ticker
    LEFT JOIN posts p
           ON p.ticker = t.ticker
          AND p.observed_at > now() - interval '7 days'
    GROUP BY t.ticker, t.company, t.mention_count, t.last_seen_at,
             r.rating, r.confidence, r.as_of_date, r.rationale,
             s.price, s.change_pct_1d
    ORDER BY r.confidence DESC NULLS LAST, t.last_seen_at DESC
    `
  );
}

export async function getTickerDetail(ticker: string): Promise<TickerDetail | null> {
  const rows = await query<TickerDetail & { news: unknown; fundamentals: unknown }>(
    `
    SELECT
      t.ticker,
      t.company,
      t.mention_count,
      t.first_seen_at,
      t.last_seen_at,
      s.price,
      s.change_pct_1d,
      s.change_pct_5d,
      s.change_pct_ytd,
      s.market_cap,
      s.pe_ratio,
      COALESCE(s.news, '[]'::jsonb)         AS news,
      COALESCE(s.fundamentals, '{}'::jsonb) AS fundamentals,
      s.as_of_date                          AS snapshot_as_of
    FROM tickers t
    LEFT JOIN v_latest_snapshot s ON s.ticker = t.ticker
    WHERE t.ticker = $1
    `,
    [ticker]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    ...r,
    news: Array.isArray(r.news) ? (r.news as NewsHeadline[]) : [],
    fundamentals:
      r.fundamentals && typeof r.fundamentals === "object"
        ? (r.fundamentals as Record<string, unknown>)
        : null,
  };
}

export async function getRatingHistory(
  ticker: string,
  days = 30
): Promise<RatingHistoryRow[]> {
  return query<RatingHistoryRow>(
    `
    SELECT as_of_date, rating, confidence, rationale
    FROM ratings
    WHERE ticker = $1
      AND as_of_date > current_date - make_interval(days => $2::int)
    ORDER BY as_of_date DESC
    `,
    [ticker, days]
  );
}

export async function getSentimentByDay(
  ticker: string,
  days = 30
): Promise<SentimentDayRow[]> {
  return query<SentimentDayRow>(
    `
    SELECT
      date_trunc('day', observed_at)::date AS day,
      COALESCE(SUM(CASE WHEN sentiment = 'Positive' THEN 1 ELSE 0 END), 0)::int AS positive,
      COALESCE(SUM(CASE WHEN sentiment = 'Neutral'  THEN 1 ELSE 0 END), 0)::int AS neutral,
      COALESCE(SUM(CASE WHEN sentiment = 'Negative' THEN 1 ELSE 0 END), 0)::int AS negative
    FROM posts
    WHERE ticker = $1
      AND observed_at > now() - make_interval(days => $2::int)
    GROUP BY day
    ORDER BY day ASC
    `,
    [ticker, days]
  );
}

export async function getPostsForTicker(
  ticker: string,
  limit = 20
): Promise<PostRow[]> {
  return query<PostRow>(
    `
    SELECT post_id, ticker, company, summary, sentiment, link, observed_at
    FROM posts
    WHERE ticker = $1
    ORDER BY observed_at DESC
    LIMIT $2
    `,
    [ticker, limit]
  );
}
