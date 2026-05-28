-- 002 — Analyst snapshots and archive.
-- Apply once against an existing wsb database. Postgres runs in a container on
-- the remote host (10.10.70.6), so the redirect below reads this file locally
-- and forwards it over SSH to psql's stdin:
--   ssh ansible@10.10.70.6 'docker exec -i wsb-postgres psql -U wsb -d wsb' < db/migrations/002-create-analyst-tables.sql
--
-- Rationale: Finnhub recommendation + price-target endpoints feed both the
-- daily Claude rating and the dashboard. Kept as a separate table from
-- research_snapshots because analyst data is a distinct domain (institutional
-- opinion vs. price/news/fundamentals); same pattern as ratings being its own
-- table. Archive mirrors the schema without the FK on tickers so a future
-- "delete stock" UI cannot cascade history away.

BEGIN;

CREATE TABLE IF NOT EXISTS analyst_snapshots (
  ticker             TEXT NOT NULL REFERENCES tickers(ticker) ON DELETE CASCADE,
  as_of_date         DATE NOT NULL,
  -- Recommendation counts (latest monthly snapshot from Finnhub).
  rec_period         DATE,
  rec_strong_buy     INT,
  rec_buy            INT,
  rec_hold           INT,
  rec_sell           INT,
  rec_strong_sell    INT,
  -- Price target consensus.
  target_high        NUMERIC(14, 4),
  target_low         NUMERIC(14, 4),
  target_mean        NUMERIC(14, 4),
  target_median      NUMERIC(14, 4),
  target_updated_at  TIMESTAMPTZ,
  fetched_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, as_of_date)
);
CREATE INDEX IF NOT EXISTS analyst_snapshots_date_idx
  ON analyst_snapshots (as_of_date DESC);

-- Latest analyst snapshot per ticker, joined into the dashboard and detail page.
CREATE OR REPLACE VIEW v_latest_analyst AS
SELECT DISTINCT ON (ticker)
  ticker, as_of_date, rec_period,
  rec_strong_buy, rec_buy, rec_hold, rec_sell, rec_strong_sell,
  target_high, target_low, target_mean, target_median, target_updated_at, fetched_at
FROM analyst_snapshots
ORDER BY ticker, as_of_date DESC;

CREATE TABLE IF NOT EXISTS analyst_snapshots_archive (
  ticker             TEXT NOT NULL,
  as_of_date         DATE NOT NULL,
  rec_period         DATE,
  rec_strong_buy     INT,
  rec_buy            INT,
  rec_hold           INT,
  rec_sell           INT,
  rec_strong_sell    INT,
  target_high        NUMERIC(14, 4),
  target_low         NUMERIC(14, 4),
  target_mean        NUMERIC(14, 4),
  target_median      NUMERIC(14, 4),
  target_updated_at  TIMESTAMPTZ,
  fetched_at         TIMESTAMPTZ NOT NULL,
  archived_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, as_of_date)
);
CREATE INDEX IF NOT EXISTS analyst_snapshots_archive_date_idx
  ON analyst_snapshots_archive (as_of_date DESC);

COMMIT;
