-- WSB analytics schema. Loaded once on first Postgres container start.
-- All timestamps are UTC; convert to America/New_York at the edge.

BEGIN;

-- One row per (post, ticker) pair. The same WSB post mentioning two tickers
-- yields two rows, which keeps queries by ticker simple.
CREATE TABLE IF NOT EXISTS posts (
  post_id      TEXT NOT NULL,
  ticker       TEXT NOT NULL,
  company      TEXT,
  summary      TEXT,
  sentiment    TEXT NOT NULL CHECK (sentiment IN ('Positive', 'Neutral', 'Negative')),
  link         TEXT,
  observed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, ticker)
);
CREATE INDEX IF NOT EXISTS posts_ticker_observed_idx
  ON posts (ticker, observed_at DESC);
CREATE INDEX IF NOT EXISTS posts_observed_idx
  ON posts (observed_at DESC);

-- Lookup of every ticker we have ever seen, kept fresh by an UPSERT in n8n.
CREATE TABLE IF NOT EXISTS tickers (
  ticker         TEXT PRIMARY KEY,
  company        TEXT,
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  mention_count  INT NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS tickers_last_seen_idx
  ON tickers (last_seen_at DESC);

-- Daily research snapshot from Finnhub, one row per ticker per trading day.
CREATE TABLE IF NOT EXISTS research_snapshots (
  ticker          TEXT NOT NULL REFERENCES tickers(ticker) ON DELETE CASCADE,
  as_of_date      DATE NOT NULL,
  price           NUMERIC(14, 4),
  change_pct_1d   NUMERIC(8, 4),
  change_pct_5d   NUMERIC(8, 4),
  change_pct_ytd  NUMERIC(8, 4),
  market_cap      NUMERIC(20, 2),
  pe_ratio        NUMERIC(10, 2),
  news            JSONB,
  fundamentals    JSONB,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, as_of_date)
);
CREATE INDEX IF NOT EXISTS research_snapshots_date_idx
  ON research_snapshots (as_of_date DESC);

-- Daily Claude rating, one row per ticker per day.
CREATE TABLE IF NOT EXISTS ratings (
  ticker      TEXT NOT NULL REFERENCES tickers(ticker) ON DELETE CASCADE,
  as_of_date  DATE NOT NULL,
  rating      TEXT NOT NULL CHECK (rating IN ('Buy', 'Sell', 'Hold')),
  confidence  INT  NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  rationale   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, as_of_date)
);
CREATE INDEX IF NOT EXISTS ratings_date_idx
  ON ratings (as_of_date DESC);

-- Latest rating per ticker, used by the dashboard list view.
CREATE OR REPLACE VIEW v_latest_rating AS
SELECT DISTINCT ON (ticker)
  ticker, as_of_date, rating, confidence, rationale, created_at
FROM ratings
ORDER BY ticker, as_of_date DESC;

-- Latest research snapshot per ticker, joined into the dashboard for price.
CREATE OR REPLACE VIEW v_latest_snapshot AS
SELECT DISTINCT ON (ticker)
  ticker, as_of_date, price, change_pct_1d, change_pct_5d,
  change_pct_ytd, market_cap, pe_ratio, news, fundamentals, fetched_at
FROM research_snapshots
ORDER BY ticker, as_of_date DESC;

-- Trigger: every successful INSERT into posts upserts the matching tickers row,
-- bumping mention_count and last_seen_at. Keeps the n8n workflow simple
-- (one Postgres node instead of two) and guarantees the counter stays consistent
-- regardless of which workflow inserted the post.
CREATE OR REPLACE FUNCTION upsert_ticker_on_post_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO tickers (ticker, company, first_seen_at, last_seen_at, mention_count)
  VALUES (NEW.ticker, NEW.company, NEW.observed_at, NEW.observed_at, 1)
  ON CONFLICT (ticker) DO UPDATE
    SET last_seen_at  = EXCLUDED.last_seen_at,
        mention_count = tickers.mention_count + 1,
        company       = COALESCE(EXCLUDED.company, tickers.company);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_posts_after_insert ON posts;
CREATE TRIGGER trg_posts_after_insert
AFTER INSERT ON posts
FOR EACH ROW
EXECUTE FUNCTION upsert_ticker_on_post_insert();

COMMIT;
