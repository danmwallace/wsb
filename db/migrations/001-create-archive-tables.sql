-- 001 — Archive tables for research_snapshots and ratings.
-- Apply once against an existing wsb database:
--   docker exec -i wsb-postgres psql -U wsb -d wsb < db/migrations/001-create-archive-tables.sql
--
-- Rationale: the "Cleanup and Archive v1" workflow moves rows older than 90
-- days out of the hot tables into these archives, so the dashboard queries
-- stay fast while history is preserved for ad-hoc analysis.
--
-- Schema mirrors the source tables but intentionally drops the FK on tickers:
-- a future "delete stock" UI may remove a ticker, and we still want its
-- historical research to survive.

BEGIN;

CREATE TABLE IF NOT EXISTS research_snapshots_archive (
  ticker          TEXT NOT NULL,
  as_of_date      DATE NOT NULL,
  price           NUMERIC(14, 4),
  change_pct_1d   NUMERIC(8, 4),
  change_pct_5d   NUMERIC(8, 4),
  change_pct_ytd  NUMERIC(8, 4),
  market_cap      NUMERIC(20, 2),
  pe_ratio        NUMERIC(10, 2),
  news            JSONB,
  fundamentals    JSONB,
  fetched_at      TIMESTAMPTZ NOT NULL,
  archived_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, as_of_date)
);
CREATE INDEX IF NOT EXISTS research_snapshots_archive_date_idx
  ON research_snapshots_archive (as_of_date DESC);

CREATE TABLE IF NOT EXISTS ratings_archive (
  ticker      TEXT NOT NULL,
  as_of_date  DATE NOT NULL,
  rating      TEXT NOT NULL CHECK (rating IN ('Buy', 'Sell', 'Hold')),
  confidence  INT  NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  rationale   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, as_of_date)
);
CREATE INDEX IF NOT EXISTS ratings_archive_date_idx
  ON ratings_archive (as_of_date DESC);

COMMIT;
