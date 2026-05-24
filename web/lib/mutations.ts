import { query } from "./db";

export interface DeleteTickerResult {
  posts_deleted: number;
  ticker_deleted: number;
}

export interface AddTickerResult {
  inserted: boolean;
}

// Seed a new ticker so the next "Research and Rate" cron picks it up. We set
// `last_seen_at = now()` so it falls inside that workflow's 14-day activity
// window even without any WSB post mentioning it; `mention_count` stays 0 so
// it's distinguishable from naturally-ingested tickers.
export async function addCustomTicker(
  ticker: string,
  company: string | null
): Promise<AddTickerResult> {
  const rows = await query<{ inserted: boolean }>(
    `
    INSERT INTO tickers (ticker, company, first_seen_at, last_seen_at, mention_count)
    VALUES ($1, $2, now(), now(), 0)
    ON CONFLICT (ticker) DO NOTHING
    RETURNING true AS inserted
    `,
    [ticker, company]
  );
  return { inserted: rows.length > 0 };
}

// Single-statement CTE so both DELETEs commit atomically. `tickers` has no FK
// from `posts`, so we have to delete posts explicitly — otherwise the next
// time the same symbol shows up in a WSB post the trigger on `posts` re-creates
// the ticker row and the "deletion" silently reverts. The cascade on
// `research_snapshots` / `ratings` handles the rest via FK ON DELETE CASCADE.
export async function deleteTicker(ticker: string): Promise<DeleteTickerResult> {
  const rows = await query<DeleteTickerResult>(
    `
    WITH
      del_posts AS (
        DELETE FROM posts WHERE ticker = $1 RETURNING 1
      ),
      del_ticker AS (
        DELETE FROM tickers WHERE ticker = $1 RETURNING 1
      )
    SELECT
      (SELECT count(*)::int FROM del_posts)  AS posts_deleted,
      (SELECT count(*)::int FROM del_ticker) AS ticker_deleted
    `,
    [ticker]
  );
  return rows[0];
}
