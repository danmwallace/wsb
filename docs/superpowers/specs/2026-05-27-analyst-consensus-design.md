# Analyst Consensus & Price Targets — Design

**Status:** Draft (2026-05-27)
**Owner:** Dan Wallace
**Scope:** First spec of the "improve rating accuracy" workstream. See [Out of scope](#out-of-scope-follow-up-specs) for follow-ups.

## Context

WSB Pulse rates each active ticker with Claude Haiku, fed by WSB sentiment counts (14 days) and three Finnhub endpoints: `quote`, `company-news` (10 headlines), `metric` (5d/YTD return, market cap, P/E). The rater has no signal from professional analyst opinion or institutional price expectations — both of which are independent of retail sentiment and are reasonable accuracy inputs.

Finnhub already exposes the two relevant endpoints, and the API key is wired up. This spec adds them as inputs to the rater and surfaces them on the dashboard.

## Goals

1. The Buy/Sell/Hold rating considers analyst consensus and consensus price target.
2. Dashboard users see target upside on the home table and a full analyst breakdown on the ticker detail page.
3. The change is contained to one new table, two new HTTP nodes, two prompt updates, and one new dashboard section. No existing data is mutated or moved.

## Non-goals

- Backfilling analyst history. Data starts arriving on the next 16:30 ET run.
- A second data provider for cross-checking analyst data.
- The other source/signal expansions (more subreddits, options data, StockTwits). Each gets its own spec.

## Architecture & data flow

The existing `Research and Rate v1` n8n workflow gains two HTTP nodes between `Finnhub Metrics` and `Build research payload`. Their data flows into both a new `analyst_snapshots` table and the rating prompt.

```
Loop over tickers
 └─► Finnhub Quote
      └─► Finnhub Company News
           └─► Aggregate News
                └─► Finnhub Metrics
                     └─► (new) Finnhub Recommendation
                          └─► (new) Finnhub Price Target
                               └─► Build research payload
                                    └─► Save snapshot
                                         └─► (new) Save analyst snapshot
                                              └─► Build agent prompt
                                                   └─► Rate the stock
                                                        └─► Parse rating JSON
                                                             └─► Save rating
                                                                  └─► Wait 6s per ticker
```

## Schema

New file `db/migrations/002-create-analyst-tables.sql`. Idempotent; safe against existing volumes. `db/init.sql` is updated with the same statements so fresh container starts get them.

```sql
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
```

**Why a separate table, not columns on `research_snapshots`:** `research_snapshots` is for Finnhub price/news/fundamentals. Analyst data is a third concern — keeping it separate mirrors the existing `research_snapshots` / `ratings` split. Cost is one extra LEFT JOIN in the dashboard query, which is trivial.

## Workflow changes

### `Research and Rate v1`

**Two new HTTP nodes**, inserted after `Finnhub Metrics`, before `Build research payload`:

| Node                        | URL                                                                          | onError                 |
|-----------------------------|------------------------------------------------------------------------------|-------------------------|
| `Finnhub Recommendation`    | `https://finnhub.io/api/v1/stock/recommendation?symbol={{ticker}}`           | `continueRegularOutput` |
| `Finnhub Price Target`      | `https://finnhub.io/api/v1/stock/price-target?symbol={{ticker}}`             | `continueRegularOutput` |

Both nodes reuse the existing `Finnhub - X-Finnhub-Token` Header Auth credential.

**Why `continueRegularOutput`:** `price-target` may be premium on Dan's free Finnhub tier — if Finnhub returns 403, the workflow must keep going, write null targets, and surface "not available" on the dashboard. The Finnhub paid tier ($1k+/month) is not on the table, so graceful degrade is a hard requirement, not a nicety. `recommendation` is free at time of writing; the same posture protects against future tier shuffles.

**`Build research payload` update.** Read `$('Finnhub Recommendation').item.json[0]` (most recent monthly snapshot) and `$('Finnhub Price Target').item.json`, extract the fields below, attach to the payload. Treat any missing or empty response as null fields; never crash.

Fields added to the payload:

```js
rec_period:        rec[0]?.period ?? null,           // "YYYY-MM-DD" → DATE
rec_strong_buy:    rec[0]?.strongBuy ?? null,
rec_buy:           rec[0]?.buy ?? null,
rec_hold:          rec[0]?.hold ?? null,
rec_sell:          rec[0]?.sell ?? null,
rec_strong_sell:   rec[0]?.strongSell ?? null,
target_high:       tgt?.targetHigh ?? null,
target_low:        tgt?.targetLow ?? null,
target_mean:       tgt?.targetMean ?? null,
target_median:     tgt?.targetMedian ?? null,
target_updated_at: tgt?.lastUpdated ?? null,
```

**New `Save analyst snapshot` Postgres node**, downstream of `Save snapshot`, upstream of `Build agent prompt`. UPSERT on `(ticker, as_of_date)` so re-running on the same day overwrites cleanly. All nullable columns explicitly accept null when source data is missing.

**Rate limit.** With two new HTTP calls, per-ticker Finnhub burst goes from 3 to 5. Bump the existing `Wait 4s per ticker` to **`Wait 6s per ticker`**. Average rate becomes ~50 cpm (5 calls / 6s), comfortably under Finnhub free tier's 60 cpm limit with headroom for the existing Reddit / Anthropic traffic. Total runtime for 200 tickers: ~20 minutes — still well inside the 16:30 ET → next-morning window before users read the dashboard.

### `Cleanup and Archive v1`

Extend the Sunday 03:00 ET cleanup to also move `analyst_snapshots` rows older than 90 days into `analyst_snapshots_archive`. Same atomic-per-run pattern (`INSERT ... SELECT` then `DELETE` inside one transaction) as the existing two-table cleanup.

## Dashboard changes

### Home ranked table

`web/lib/queries.ts` — `DashboardRow` gains `target_mean: string | null`. The dashboard query LEFT JOINs `v_latest_analyst` so missing analyst rows yield null.

`web/components/StockTable.tsx`:

- **Desktop:** new column "Upside" between "1d" and "Sentiment", showing `fmtPct((target_mean / price - 1) * 100)`. Tinted green/red/neutral via the existing `changeClass` helper. Renders `—` when either input is null or `price === 0`.
- **Mobile cards:** one extra `Cell` labeled "Upside" in the same 3-col grid. The grid grows from 5 to 6 cells (two clean rows of 3); no layout breakage.

The upside calculation lives in a `computeUpside(price, targetMean): number | null` helper in `web/lib/format.ts` so it's unit-testable.

### Ticker detail page (`/stocks/[ticker]/page.tsx`)

New `<AnalystView />` component, rendered as a new `<section>` between the existing 6-tile stat grid and the sentiment/news row. Contents:

- **Consensus label badge** — Strong Buy / Buy / Hold / Sell / Strong Sell — derived by `deriveConsensus(counts)` in `web/lib/format.ts`. Score formula: `(strong_buy*2 + buy*1 + hold*0 + sell*-1 + strong_sell*-2) / total`. Buckets are inclusive on the upper end:
  - `score >= 1.0` → Strong Buy
  - `0.3 <= score < 1.0` → Buy
  - `-0.3 <= score < 0.3` → Hold
  - `-1.0 <= score < -0.3` → Sell
  - `score < -1.0` → Strong Sell
  - returns `null` when `total === 0`
- **Horizontal distribution bar** — five proportional segments (Strong Buy → Strong Sell), each labeled with its count when the segment is wide enough; full counts in a hover tooltip. Tailwind utility classes only; no new charting dependency.
- **Three target tiles** — `Target high`, `Target mean (X% above/below current)`, `Target low` — reuse the existing `<Stat>` component on the page.
- **Footer line** — `Analyst data updated <fmtRelative target_updated_at>`.

When `v_latest_analyst` returns no row, or every rec count is null and every target is null, the whole section renders a single neutral notice: "Analyst coverage not available for this ticker." No tiles, no bar.

New query in `web/lib/queries.ts`: `getAnalystSnapshot(ticker): Promise<AnalystSnapshot | null>`. Called from the page's existing `Promise.all`.

## Rating prompt updates

### `Build agent prompt` text

Append a new block to the prompt text after the existing "Recent headlines:" block:

```
Analyst consensus (period <rec_period or "n/a">):
- Strong Buy:  <rec_strong_buy or 0>
- Buy:         <rec_buy or 0>
- Hold:        <rec_hold or 0>
- Sell:        <rec_sell or 0>
- Strong Sell: <rec_strong_sell or 0>
Price targets:
- High:    $<target_high or "n/a">
- Mean:    $<target_mean or "n/a">  (<upside_pct or "n/a"> vs current)
- Low:     $<target_low or "n/a">
- Updated: <target_updated_at date or "n/a">
```

When every analyst field is null, replace the entire block with: `Analyst data: not available for this ticker.`

### Rating agent system message

Append one paragraph after the existing weighting guidance, before "This is not investment advice.":

> Treat analyst consensus and target upside as significant signals — generally on par with WSB sentiment, more reliable than individual headlines but slower to update. Disagreement between WSB and analysts is itself a signal worth naming in the rationale: high retail enthusiasm with a bearish analyst lean often indicates retail-driven momentum or a contrarian setup; the opposite often indicates a value thesis the crowd hasn't caught up to. When analyst data is unavailable, do not lower confidence solely on that basis — many small-caps and foreign tickers lack coverage.

## Edge cases

| Case                                              | Behavior                                                                                                                                                  |
|---------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------|
| Ticker has no analyst coverage                    | All analyst fields null. Prompt block replaced with "not available". Dashboard section renders the "not available" notice. Rating not penalized.          |
| `price-target` returns 403 (premium tier)         | HTTP node continues. Target fields null. Home Upside column shows `—`. Detail page omits target tiles but still shows consensus label + distribution bar when recs are present. |
| `recommendation` returns empty array              | Treated as no coverage.                                                                                                                                   |
| Both endpoints return 5xx                         | HTTP nodes continue. Analyst row written with all-null fields. Workflow finishes normally.                                                                |
| Existing ticker, first run with new workflow      | No backfill. Section renders "not available" until the first 16:30 ET tick after deploy.                                                                  |
| Re-run on same day                                | UPSERT overwrites the row. Idempotent.                                                                                                                    |
| `price === 0` on home table                       | Upside renders `—` (guard divide-by-zero in `computeUpside`).                                                                                              |

## Testing

Unit tests in `web/lib/` (Vitest, matching the existing `movers.test.ts` pattern):

- `computeUpside.test.ts` — null price, null target, positive upside, negative upside, `price === 0` guard.
- `deriveConsensus.test.ts` — each bucket, all-zero counts (returns null), boundary scores at exactly 1.0, 0.3, -0.3, -1.0.

Manual workflow verification, run once after deploy:

- Execute the workflow against a known-covered ticker (e.g. `AAPL`) and a known-uncovered ticker (e.g. a small-cap recently picked up by WSB). Confirm the `analyst_snapshots` row, the dashboard rendering on both home and detail, and that the prompt content (visible in the n8n execution log) is correctly populated.
- Confirm graceful degrade: temporarily point `Finnhub Price Target` at an invalid URL, re-run, confirm the workflow completes, the row has null targets, the home column shows `—`, and the detail page still renders the consensus badge.

## Operations

- Apply migration before re-importing the workflow:
  ```bash
  docker exec -i wsb-postgres psql -U wsb -d wsb < db/migrations/002-create-analyst-tables.sql
  ```
- Re-import `workflows/Research and Rate v1.json` and `workflows/Cleanup and Archive v1.json` into n8n. Credential ids stay as `REPLACE_WITH_POSTGRES_CREDENTIAL_ID` / `REPLACE_WITH_FINNHUB_CREDENTIAL_ID` in git; pin them locally on first save.
- No env var changes. No new credentials. No new npm packages.
- README updated to mention the new migration step and the two new Finnhub endpoints (so future re-imports don't get confused).

## Out of scope (follow-up specs)

These are the other three signal classes you flagged. Each gets its own brainstorm → spec → plan → build cycle:

- **More subreddits + `source` column on `posts`** — pull r/stocks, r/investing, r/options through the existing Reddit pipeline; keep WSB-only views possible.
- **Yahoo options chain → put/call ratio + IV signal** — scrape free, compute the one derived signal, feed the rater.
- **StockTwits bull/bear feed** — separate sentiment input with built-in tagging.
