# Analyst Consensus & Price Targets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Feed Finnhub analyst recommendation + price-target data into the daily rating prompt and surface it on the dashboard (Upside % column on home, new Analyst view section on ticker detail).

**Architecture:** New `analyst_snapshots` table (mirrors `research_snapshots`). The existing `Research and Rate v1` n8n workflow gains two new HTTP nodes after `Finnhub Metrics`, plus a new save step. The rating prompt gains an analyst block. The Next.js dashboard gains one column on the home table and a new section on the ticker detail page. Cleanup workflow extended to archive the new table.

**Tech Stack:** Postgres 16, n8n (HTTP + Postgres + LangChain agent nodes), Next.js 15 (TypeScript, server components, `pg` driver), Vitest, Tailwind.

**Spec:** [docs/superpowers/specs/2026-05-27-analyst-consensus-design.md](../specs/2026-05-27-analyst-consensus-design.md) — commit `2b7b764`.

**File map:**

| File | Status | Purpose |
|------|--------|---------|
| `db/migrations/002-create-analyst-tables.sql` | create | Idempotent migration for existing volumes |
| `db/init.sql` | modify | Same statements, applied on fresh container starts |
| `web/lib/analyst.ts` | create | `computeUpside` + `deriveConsensus` (pure functions) |
| `web/lib/analyst.test.ts` | create | Vitest unit tests for the helpers |
| `web/lib/queries.ts` | modify | `DashboardRow.target_mean`, `AnalystSnapshot`, `getAnalystSnapshot` |
| `web/components/StockTable.tsx` | modify | Add Upside column (desktop + mobile) |
| `web/components/AnalystView.tsx` | create | Consensus badge + distribution bar + target tiles |
| `web/app/stocks/[ticker]/page.tsx` | modify | Fetch + render the new section |
| `workflows/Research and Rate v1.json` | modify | Two new HTTP nodes, payload + prompt + system updates, new save node, wait bump, connections rewire |
| `workflows/Cleanup and Archive v1.json` | modify | Extend cleanup SQL to include `analyst_snapshots` |
| `README.md` | modify | Note the migration and the price-target tier caveat |

---

## Task 1: Schema migration + init.sql

**Files:**
- Create: `db/migrations/002-create-analyst-tables.sql`
- Modify: `db/init.sql` (insert new statements before the final `COMMIT;`)

- [ ] **Step 1: Create the migration file**

Create `db/migrations/002-create-analyst-tables.sql` with this exact content:

```sql
-- 002 — Analyst snapshots and archive.
-- Apply once against an existing wsb database:
--   docker exec -i wsb-postgres psql -U wsb -d wsb < db/migrations/002-create-analyst-tables.sql
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

- [ ] **Step 2: Mirror the same statements in `db/init.sql`**

Open `db/init.sql`. Find the final `COMMIT;` line (currently line 137). Insert the body of the migration (everything *between* the migration's `BEGIN;` and `COMMIT;` — the two `CREATE TABLE`s, one `CREATE INDEX` each, and the `CREATE OR REPLACE VIEW`) immediately before the existing `COMMIT;`, after the `ratings_archive` index.

So `db/init.sql` ends with:
```sql
...
CREATE INDEX IF NOT EXISTS ratings_archive_date_idx
  ON ratings_archive (as_of_date DESC);

CREATE TABLE IF NOT EXISTS analyst_snapshots (
  ... (same body as the migration) ...
);
CREATE INDEX IF NOT EXISTS analyst_snapshots_date_idx
  ON analyst_snapshots (as_of_date DESC);

CREATE OR REPLACE VIEW v_latest_analyst AS
...

CREATE TABLE IF NOT EXISTS analyst_snapshots_archive (
  ...
);
CREATE INDEX IF NOT EXISTS analyst_snapshots_archive_date_idx
  ON analyst_snapshots_archive (as_of_date DESC);

COMMIT;
```

- [ ] **Step 3: Apply the migration to the running Postgres**

```bash
docker exec -i wsb-postgres psql -U wsb -d wsb < db/migrations/002-create-analyst-tables.sql
```

Expected: each `CREATE` echoes; no errors.

- [ ] **Step 4: Verify the schema landed**

```bash
docker exec -it wsb-postgres psql -U wsb -d wsb -c '\d analyst_snapshots'
docker exec -it wsb-postgres psql -U wsb -d wsb -c '\d analyst_snapshots_archive'
docker exec -it wsb-postgres psql -U wsb -d wsb -c "SELECT * FROM v_latest_analyst LIMIT 1;"
```

Expected: both tables print with all the columns from the migration. The view query returns zero rows (table is empty), no error.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/002-create-analyst-tables.sql db/init.sql
git commit -m "feat(db): add analyst_snapshots tables + v_latest_analyst view"
```

---

## Task 2: Pure analyst helpers (`web/lib/analyst.ts`) — TDD

**Files:**
- Create: `web/lib/analyst.ts`
- Create: `web/lib/analyst.test.ts`

These are the only pure functions in the feature. Drive them with Vitest first.

- [ ] **Step 1: Write the failing tests**

Create `web/lib/analyst.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { computeUpside, deriveConsensus } from "./analyst";

describe("computeUpside", () => {
  it("returns null when price is null", () => {
    expect(computeUpside(null, 100)).toBeNull();
  });
  it("returns null when target_mean is null", () => {
    expect(computeUpside(100, null)).toBeNull();
  });
  it("returns null when price is zero", () => {
    expect(computeUpside(0, 100)).toBeNull();
  });
  it("returns null when either input is not finite", () => {
    expect(computeUpside("not-a-number", 100)).toBeNull();
    expect(computeUpside(100, "garbage")).toBeNull();
  });
  it("computes positive upside as a percent", () => {
    expect(computeUpside(100, 120)).toBeCloseTo(20);
  });
  it("computes negative upside as a percent", () => {
    expect(computeUpside(120, 100)).toBeCloseTo(-16.6667, 3);
  });
  it("accepts numeric strings (Postgres NUMERIC comes through as string)", () => {
    expect(computeUpside("100.0000", "112.5000")).toBeCloseTo(12.5);
  });
});

describe("deriveConsensus", () => {
  it("returns null when all counts are zero", () => {
    expect(deriveConsensus({ strong_buy: 0, buy: 0, hold: 0, sell: 0, strong_sell: 0 })).toBeNull();
  });
  it("returns null when all counts are null", () => {
    expect(deriveConsensus({ strong_buy: null, buy: null, hold: null, sell: null, strong_sell: null })).toBeNull();
  });
  it("returns Strong Buy when score is >= 1.0 (all strong_buy)", () => {
    expect(deriveConsensus({ strong_buy: 10, buy: 0, hold: 0, sell: 0, strong_sell: 0 })).toBe("Strong Buy");
  });
  it("returns Buy at score = 0.5 (5 buy, 5 hold)", () => {
    expect(deriveConsensus({ strong_buy: 0, buy: 5, hold: 5, sell: 0, strong_sell: 0 })).toBe("Buy");
  });
  it("returns Hold at score = 0 (all hold)", () => {
    expect(deriveConsensus({ strong_buy: 0, buy: 0, hold: 10, sell: 0, strong_sell: 0 })).toBe("Hold");
  });
  it("returns Sell at score = -0.5", () => {
    expect(deriveConsensus({ strong_buy: 0, buy: 0, hold: 5, sell: 5, strong_sell: 0 })).toBe("Sell");
  });
  it("returns Strong Sell when score is < -1.0 (all strong_sell)", () => {
    expect(deriveConsensus({ strong_buy: 0, buy: 0, hold: 0, sell: 0, strong_sell: 10 })).toBe("Strong Sell");
  });
  it("returns Buy at the exact upper bound 1.0 (4 strong_buy, 4 hold)", () => {
    // score = (4*2 + 4*0) / 8 = 1.0  →  Strong Buy boundary inclusive
    expect(deriveConsensus({ strong_buy: 4, buy: 0, hold: 4, sell: 0, strong_sell: 0 })).toBe("Strong Buy");
  });
  it("returns Hold at the exact upper bound 0.3 → Buy", () => {
    // score = 0.3 exactly → 'score >= 0.3' is Buy
    // 3 buy, 7 hold: (3 + 0) / 10 = 0.3
    expect(deriveConsensus({ strong_buy: 0, buy: 3, hold: 7, sell: 0, strong_sell: 0 })).toBe("Buy");
  });
  it("treats null counts as zero (some-null mix)", () => {
    expect(deriveConsensus({ strong_buy: 10, buy: null, hold: null, sell: null, strong_sell: null })).toBe("Strong Buy");
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd web && npm test -- analyst
```

Expected: FAIL with "Cannot find module './analyst'" or similar.

- [ ] **Step 3: Write the minimal implementation**

Create `web/lib/analyst.ts`:

```typescript
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
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
cd web && npm test -- analyst
```

Expected: 16 tests pass.

- [ ] **Step 5: Typecheck**

```bash
cd web && npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add web/lib/analyst.ts web/lib/analyst.test.ts
git commit -m "feat(web): add computeUpside + deriveConsensus helpers"
```

---

## Task 3: Queries + types (`web/lib/queries.ts`)

**Files:**
- Modify: `web/lib/queries.ts`

Add `target_mean` to `DashboardRow`, LEFT JOIN `v_latest_analyst` in `listDashboardRows`, and add an `AnalystSnapshot` type + `getAnalystSnapshot` fetcher.

- [ ] **Step 1: Add `target_mean` to `DashboardRow`**

In `web/lib/queries.ts`, modify the `DashboardRow` interface to add one field. The existing interface ends with `neg: number;`. Add `target_mean: string | null;` directly after it:

```typescript
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
  pos: number;
  neu: number;
  neg: number;
  target_mean: string | null;
}
```

- [ ] **Step 2: LEFT JOIN `v_latest_analyst` in `listDashboardRows`**

Replace the SQL inside `listDashboardRows` with:

```typescript
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
    COALESCE(SUM(CASE WHEN p.sentiment = 'Positive' THEN 1 ELSE 0 END), 0)::int AS pos,
    COALESCE(SUM(CASE WHEN p.sentiment = 'Neutral'  THEN 1 ELSE 0 END), 0)::int AS neu,
    COALESCE(SUM(CASE WHEN p.sentiment = 'Negative' THEN 1 ELSE 0 END), 0)::int AS neg,
    a.target_mean
  FROM tickers t
  LEFT JOIN v_latest_rating   r ON r.ticker = t.ticker
  LEFT JOIN v_latest_snapshot s ON s.ticker = t.ticker
  LEFT JOIN v_latest_analyst  a ON a.ticker = t.ticker
  LEFT JOIN posts p ON p.ticker = t.ticker
  GROUP BY t.ticker, t.company, t.mention_count, t.last_seen_at,
           r.rating, r.confidence, r.as_of_date, r.rationale,
           s.price, s.change_pct_1d, a.target_mean
  ORDER BY r.confidence DESC NULLS LAST, t.last_seen_at DESC
  `
);
```

(Two changes: added `a.target_mean` to SELECT and GROUP BY; added `LEFT JOIN v_latest_analyst a`.)

- [ ] **Step 3: Add the `AnalystSnapshot` type and `getAnalystSnapshot` function**

Append to the bottom of `web/lib/queries.ts`:

```typescript
export interface AnalystSnapshot {
  ticker: string;
  as_of_date: Date;
  rec_period: Date | null;
  rec_strong_buy: number | null;
  rec_buy: number | null;
  rec_hold: number | null;
  rec_sell: number | null;
  rec_strong_sell: number | null;
  target_high: string | null;
  target_low: string | null;
  target_mean: string | null;
  target_median: string | null;
  target_updated_at: Date | null;
  fetched_at: Date;
}

export async function getAnalystSnapshot(
  ticker: string
): Promise<AnalystSnapshot | null> {
  const rows = await query<AnalystSnapshot>(
    `
    SELECT
      ticker, as_of_date, rec_period,
      rec_strong_buy, rec_buy, rec_hold, rec_sell, rec_strong_sell,
      target_high, target_low, target_mean, target_median,
      target_updated_at, fetched_at
    FROM v_latest_analyst
    WHERE ticker = $1
    `,
    [ticker]
  );
  return rows[0] ?? null;
}
```

- [ ] **Step 4: Typecheck and run all tests**

```bash
cd web && npm run typecheck && npm test
```

Expected: typecheck passes; all existing tests + the new analyst tests pass.

- [ ] **Step 5: Smoke-check the new query against the (empty) view**

```bash
docker exec -it wsb-postgres psql -U wsb -d wsb -c "SELECT count(*) FROM v_latest_analyst;"
```

Expected: `0` (table is empty until the workflow runs — confirms the view exists and the column names match).

- [ ] **Step 6: Commit**

```bash
git add web/lib/queries.ts
git commit -m "feat(web): join v_latest_analyst into dashboard query + getAnalystSnapshot"
```

---

## Task 4: Update the `Research and Rate v1` workflow

**Files:**
- Modify: `workflows/Research and Rate v1.json`

This is one file but several coordinated edits. You can edit the JSON directly, **or** open the workflow in the n8n UI, make the changes, and export it back over the file — whichever you find more reliable. The final committed JSON must match the structure described below.

**Big-picture before/after of the node chain:**

```
Before:  Metrics → Build research payload → Save snapshot → Build agent prompt → Rate → Save rating → Wait 4s → Loop
After:   Metrics → Recommendation → Price Target → Build research payload → Save snapshot → Save analyst snapshot → Build agent prompt → Rate → Save rating → Wait 6s → Loop
```

- [ ] **Step 1: Add the `Finnhub Recommendation` HTTP node**

Add this node to the `nodes` array in `workflows/Research and Rate v1.json` (anywhere; n8n re-orders on save):

```json
{
  "parameters": {
    "url": "=https://finnhub.io/api/v1/stock/recommendation?symbol={{ encodeURIComponent($('Loop over tickers').item.json.ticker) }}",
    "authentication": "predefinedCredentialType",
    "nodeCredentialType": "httpHeaderAuth",
    "options": {
      "response": {
        "response": {
          "neverError": false
        }
      }
    }
  },
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "onError": "continueRegularOutput",
  "position": [-240, -80],
  "id": "aaaaaaaa-aaaa-4aaa-9aaa-aaaaaaaaaaaa",
  "name": "Finnhub Recommendation",
  "credentials": {
    "httpHeaderAuth": {
      "id": "REPLACE_WITH_FINNHUB_CREDENTIAL_ID",
      "name": "Finnhub - X-Finnhub-Token"
    }
  }
}
```

- [ ] **Step 2: Add the `Finnhub Price Target` HTTP node**

Add this node to the same array:

```json
{
  "parameters": {
    "url": "=https://finnhub.io/api/v1/stock/price-target?symbol={{ encodeURIComponent($('Loop over tickers').item.json.ticker) }}",
    "authentication": "predefinedCredentialType",
    "nodeCredentialType": "httpHeaderAuth",
    "options": {
      "response": {
        "response": {
          "neverError": false
        }
      }
    }
  },
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "onError": "continueRegularOutput",
  "position": [-80, -80],
  "id": "bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb",
  "name": "Finnhub Price Target",
  "credentials": {
    "httpHeaderAuth": {
      "id": "REPLACE_WITH_FINNHUB_CREDENTIAL_ID",
      "name": "Finnhub - X-Finnhub-Token"
    }
  }
}
```

**Why `onError: continueRegularOutput`:** `price-target` may sit behind Finnhub's premium tier; on 403 the workflow must keep running and write null targets, not crash. Same posture on `recommendation` as defense in depth.

- [ ] **Step 3: Update the `Build research payload` code**

Find the `Build research payload` node. Replace its `parameters.jsCode` with:

```javascript
// Combine the five Finnhub responses + the original ticker row into one item.
// Runs once per input item; `.item` references resolve via item linking to the
// matching row from each upstream node.
const src = $('Loop over tickers').item.json;
const quote = $('Finnhub Quote').item.json || {};
const news = $('Aggregate News').item.json.news || [];
const metricBody = $('Finnhub Metrics').item.json || {};
const metric = metricBody.metric || {};

// Recommendation endpoint returns an array of monthly snapshots, newest first.
// May be empty (no coverage) or absent (403 with continueRegularOutput).
const recList = $('Finnhub Recommendation').item.json;
const rec = (Array.isArray(recList) && recList.length > 0) ? recList[0] : {};

// Price target may be absent (premium tier 403, or just no coverage).
const tgt = $('Finnhub Price Target').item.json || {};

// Finnhub /quote shape: c=current, dp=percent change, h=high, l=low, o=open, pc=previous close
const price = quote.c ?? null;
const change_pct_1d = quote.dp ?? null;

// 5-day and YTD changes come from the metric endpoint when available.
const change_pct_5d = metric['5DayPriceReturnDaily'] ?? null;
const change_pct_ytd = metric['yearToDatePriceReturnDaily'] ?? null;
const market_cap = metric.marketCapitalization ?? null; // in millions for US tickers
const pe_ratio = metric.peNormalizedAnnual ?? metric.peExclExtraTTM ?? null;

// Cap headlines at 10 to keep the prompt small.
const headlines = (Array.isArray(news) ? news : [])
  .slice(0, 10)
  .map(n => ({
    headline: n.headline,
    url: n.url,
    source: n.source,
    datetime: n.datetime
  }));

return {
  ticker: src.ticker,
  company: src.company,
  pos_count: Number(src.pos_count) || 0,
  neu_count: Number(src.neu_count) || 0,
  neg_count: Number(src.neg_count) || 0,
  price,
  change_pct_1d,
  change_pct_5d,
  change_pct_ytd,
  market_cap_m: market_cap,
  pe_ratio,
  news: headlines,
  fundamentals: metric,
  // Analyst block. All fields null when the source data is missing.
  rec_period:        rec.period      ?? null,
  rec_strong_buy:    rec.strongBuy   ?? null,
  rec_buy:           rec.buy         ?? null,
  rec_hold:          rec.hold        ?? null,
  rec_sell:          rec.sell        ?? null,
  rec_strong_sell:   rec.strongSell  ?? null,
  target_high:       tgt.targetHigh  ?? null,
  target_low:        tgt.targetLow   ?? null,
  target_mean:       tgt.targetMean  ?? null,
  target_median:     tgt.targetMedian ?? null,
  target_updated_at: tgt.lastUpdated ?? null
};
```

- [ ] **Step 4: Add the `Save analyst snapshot` Postgres node**

Add this node to the `nodes` array:

```json
{
  "parameters": {
    "operation": "upsert",
    "schema": {"__rl": true, "mode": "list", "value": "public"},
    "table": {"__rl": true, "mode": "list", "value": "analyst_snapshots"},
    "columns": {
      "mappingMode": "defineBelow",
      "matchingColumns": ["ticker", "as_of_date"],
      "value": {
        "ticker": "={{ $json.ticker }}",
        "as_of_date": "={{ $now.toFormat('yyyy-LL-dd') }}",
        "rec_period": "={{ $json.rec_period }}",
        "rec_strong_buy": "={{ $json.rec_strong_buy }}",
        "rec_buy": "={{ $json.rec_buy }}",
        "rec_hold": "={{ $json.rec_hold }}",
        "rec_sell": "={{ $json.rec_sell }}",
        "rec_strong_sell": "={{ $json.rec_strong_sell }}",
        "target_high": "={{ $json.target_high }}",
        "target_low": "={{ $json.target_low }}",
        "target_mean": "={{ $json.target_mean }}",
        "target_median": "={{ $json.target_median }}",
        "target_updated_at": "={{ $json.target_updated_at }}"
      },
      "schema": [
        {"id": "ticker", "displayName": "ticker", "required": true, "type": "string", "canBeUsedToMatch": true},
        {"id": "as_of_date", "displayName": "as_of_date", "required": true, "type": "dateTime", "canBeUsedToMatch": true},
        {"id": "rec_period", "displayName": "rec_period", "required": false, "type": "dateTime"},
        {"id": "rec_strong_buy", "displayName": "rec_strong_buy", "required": false, "type": "number"},
        {"id": "rec_buy", "displayName": "rec_buy", "required": false, "type": "number"},
        {"id": "rec_hold", "displayName": "rec_hold", "required": false, "type": "number"},
        {"id": "rec_sell", "displayName": "rec_sell", "required": false, "type": "number"},
        {"id": "rec_strong_sell", "displayName": "rec_strong_sell", "required": false, "type": "number"},
        {"id": "target_high", "displayName": "target_high", "required": false, "type": "number"},
        {"id": "target_low", "displayName": "target_low", "required": false, "type": "number"},
        {"id": "target_mean", "displayName": "target_mean", "required": false, "type": "number"},
        {"id": "target_median", "displayName": "target_median", "required": false, "type": "number"},
        {"id": "target_updated_at", "displayName": "target_updated_at", "required": false, "type": "dateTime"}
      ]
    },
    "options": {}
  },
  "type": "n8n-nodes-base.postgres",
  "typeVersion": 2.6,
  "position": [560, 100],
  "id": "cccccccc-cccc-4ccc-9ccc-cccccccccccc",
  "name": "Save analyst snapshot",
  "credentials": {
    "postgres": {
      "id": "REPLACE_WITH_POSTGRES_CREDENTIAL_ID",
      "name": "Postgres - wsb"
    }
  }
}
```

- [ ] **Step 5: Update the `Build agent prompt` code**

Find the `Build agent prompt` node. Replace its `parameters.jsCode` with:

```javascript
// Build the per-ticker prompt text. Runs once per input item.
const src = $('Build research payload').item.json;

const fmtPct = v => v === null || v === undefined ? 'n/a' : `${Number(v).toFixed(2)}%`;
const fmtUsd = v => v === null || v === undefined ? 'n/a' : `$${Number(v).toLocaleString()}`;
const fmtMcap = v => v === null || v === undefined ? 'n/a' : `$${(Number(v) / 1e9).toFixed(2)}B`;

const headlines = (src.news || []).map((h, i) =>
  `${i + 1}. [${h.source || 'unknown'}] ${h.headline || ''}`
).join('\n') || '(none in last 7 days)';

// Analyst block. If every analyst field is null, render a single line so the
// rater doesn't have to wade through zeros that mean "no data".
const hasRecs = [src.rec_strong_buy, src.rec_buy, src.rec_hold, src.rec_sell, src.rec_strong_sell]
  .some(v => v !== null && v !== undefined);
const hasTargets = [src.target_high, src.target_low, src.target_mean, src.target_median]
  .some(v => v !== null && v !== undefined);

let analystBlock;
if (!hasRecs && !hasTargets) {
  analystBlock = 'Analyst data: not available for this ticker.';
} else {
  const upsidePct = (src.target_mean !== null && src.target_mean !== undefined &&
                     src.price !== null && src.price !== undefined && Number(src.price) !== 0)
    ? `${((Number(src.target_mean) / Number(src.price) - 1) * 100).toFixed(2)}%`
    : 'n/a';
  analystBlock = [
    `Analyst consensus (period ${src.rec_period ?? 'n/a'}):`,
    `- Strong Buy:  ${src.rec_strong_buy  ?? 0}`,
    `- Buy:         ${src.rec_buy         ?? 0}`,
    `- Hold:        ${src.rec_hold        ?? 0}`,
    `- Sell:        ${src.rec_sell        ?? 0}`,
    `- Strong Sell: ${src.rec_strong_sell ?? 0}`,
    'Price targets:',
    `- High:    ${fmtUsd(src.target_high)}`,
    `- Mean:    ${fmtUsd(src.target_mean)}  (${upsidePct} vs current)`,
    `- Low:     ${fmtUsd(src.target_low)}`,
    `- Updated: ${src.target_updated_at ?? 'n/a'}`
  ].join('\n');
}

const text = [
  `Ticker: ${src.ticker}`,
  `Company: ${src.company || ''}`,
  '',
  'WSB sentiment, last 14 days:',
  `- Positive: ${src.pos_count}`,
  `- Neutral:  ${src.neu_count}`,
  `- Negative: ${src.neg_count}`,
  '',
  'Market data (today):',
  `- Price:        ${fmtUsd(src.price)}`,
  `- 1d change:    ${fmtPct(src.change_pct_1d)}`,
  `- 5d change:    ${fmtPct(src.change_pct_5d)}`,
  `- YTD change:   ${fmtPct(src.change_pct_ytd)}`,
  `- Market cap:   ${fmtMcap(src.market_cap_m === null ? null : src.market_cap_m * 1e6)}`,
  `- P/E (norm.):  ${src.pe_ratio ?? 'n/a'}`,
  '',
  'Recent headlines:',
  headlines,
  '',
  analystBlock
].join('\n');

return { ...src, prompt_text: text };
```

- [ ] **Step 6: Update the rating agent's system message**

Find the `Rate the stock` node. Append one paragraph to `parameters.options.systemMessage`, before the existing final line `"This is not investment advice. Return JSON only, no prose, no markdown."`. The new system message reads (whole field, the only change is the inserted paragraph plus its surrounding blank line):

```
You issue a daily Buy / Sell / Hold rating for a single stock based on aggregated signals. You will receive: WSB sentiment counts (last 14 days), today's price + price changes, market cap, P/E, and recent news headlines.

Rating definitions:
- Buy: signals are net positive AND price action / fundamentals do not strongly contradict.
- Sell: signals are net negative AND there is a clear bearish driver (sentiment + price + news aligned).
- Hold: mixed signals, low data, or anything you cannot defend with a clear thesis.

Confidence calibration (0-100):
- 0-30: weak / data is sparse / contradictory.
- 31-60: directional but with notable counter-evidence.
- 61-85: clear thesis, multiple signals aligned.
- 86-100: very strong, rare; reserve for high-conviction multi-signal alignment.

Weighting guidance: WSB sentiment is one input, not the dominant one. Weight today's price action and news on par with sentiment; weight fundamentals less unless they reveal a structural concern (P/E extremes, missing data).

Treat analyst consensus and target upside as significant signals — generally on par with WSB sentiment, more reliable than individual headlines but slower to update. Disagreement between WSB and analysts is itself a signal worth naming in the rationale: high retail enthusiasm with a bearish analyst lean often indicates retail-driven momentum or a contrarian setup; the opposite often indicates a value thesis the crowd hasn't caught up to. When analyst data is unavailable, do not lower confidence solely on that basis — many small-caps and foreign tickers lack coverage.

This is not investment advice. Return JSON only, no prose, no markdown.
```

In JSON, this becomes one long string with `\n\n` between paragraphs. The cleanest way is to open the workflow in the n8n UI, paste the new system message into the agent options, save, and re-export — that way the JSON escaping is correct.

- [ ] **Step 7: Bump `Wait 4s per ticker` to 6 seconds and rename**

Find the `Wait 4s per ticker` node. Change two fields:

```json
"parameters": { "amount": 6, "unit": "seconds" },
"name": "Wait 6s per ticker"
```

Also update every reference to the old name in `connections`. The renamed node is the source of one connection (back into `Loop over tickers`) and the target of one connection (from `Save rating`).

- [ ] **Step 8: Update the `connections` object**

The chain changes:

```
Finnhub Metrics  → Finnhub Recommendation
Finnhub Recommendation → Finnhub Price Target
Finnhub Price Target → Build research payload
Save snapshot → Save analyst snapshot
Save analyst snapshot → Build agent prompt
Save rating → Wait 6s per ticker
Wait 6s per ticker → Loop over tickers
```

In `connections`, **remove** the existing edge `Finnhub Metrics → Build research payload`, **add** the three new analyst edges, **remove** the existing edge `Save snapshot → Build agent prompt`, **add** the two new save-step edges, and rename the wait references.

Final `connections` should look like:

```json
{
  "When clicking 'Execute workflow'": { "main": [[{ "node": "Pick active tickers", "type": "main", "index": 0 }]] },
  "Daily 16:30 ET (weekdays)":        { "main": [[{ "node": "Pick active tickers", "type": "main", "index": 0 }]] },
  "Pick active tickers":              { "main": [[{ "node": "Loop over tickers",   "type": "main", "index": 0 }]] },
  "Loop over tickers":                { "main": [[], [{ "node": "Finnhub Quote",   "type": "main", "index": 0 }]] },
  "Finnhub Quote":                    { "main": [[{ "node": "Finnhub Company News", "type": "main", "index": 0 }]] },
  "Finnhub Company News":             { "main": [[{ "node": "Aggregate News",       "type": "main", "index": 0 }]] },
  "Aggregate News":                   { "main": [[{ "node": "Finnhub Metrics",      "type": "main", "index": 0 }]] },
  "Finnhub Metrics":                  { "main": [[{ "node": "Finnhub Recommendation", "type": "main", "index": 0 }]] },
  "Finnhub Recommendation":           { "main": [[{ "node": "Finnhub Price Target",   "type": "main", "index": 0 }]] },
  "Finnhub Price Target":             { "main": [[{ "node": "Build research payload", "type": "main", "index": 0 }]] },
  "Build research payload":           { "main": [[{ "node": "Save snapshot",          "type": "main", "index": 0 }]] },
  "Save snapshot":                    { "main": [[{ "node": "Save analyst snapshot",  "type": "main", "index": 0 }]] },
  "Save analyst snapshot":            { "main": [[{ "node": "Build agent prompt",     "type": "main", "index": 0 }]] },
  "Build agent prompt":               { "main": [[{ "node": "Rate the stock",         "type": "main", "index": 0 }]] },
  "Claude Haiku (rater)":             { "ai_languageModel": [[{ "node": "Rate the stock", "type": "ai_languageModel", "index": 0 }]] },
  "Parse rating JSON":                { "ai_outputParser":  [[{ "node": "Rate the stock", "type": "ai_outputParser", "index": 0 }]] },
  "Rate the stock":                   { "main": [[{ "node": "Save rating",           "type": "main", "index": 0 }]] },
  "Save rating":                      { "main": [[{ "node": "Wait 6s per ticker",    "type": "main", "index": 0 }]] },
  "Wait 6s per ticker":               { "main": [[{ "node": "Loop over tickers",     "type": "main", "index": 0 }]] }
}
```

- [ ] **Step 9: Re-import and pin credentials**

In the n8n UI: **Workflows → Import from File → `workflows/Research and Rate v1.json`** (replace the existing one). Open each Postgres / HTTP Request node and re-select its credential — n8n will pin the actual id on save. Then **re-export** the workflow over the same file so the committed JSON reflects the saved state.

If you got here by editing the workflow in n8n directly (rather than the JSON), you've already done this.

- [ ] **Step 10: Manual verification — covered ticker**

Pick a known-covered ticker (e.g. `AAPL`). Either insert it temporarily into `tickers` (so `Pick active tickers` picks it) or in the n8n UI use the `Test Workflow → Execute Node` flow on `Loop over tickers` to feed `{"ticker":"AAPL","company":"Apple Inc.","pos_count":0,"neu_count":0,"neg_count":0}` as input.

Run the workflow. Then:

```bash
docker exec -it wsb-postgres psql -U wsb -d wsb -c "SELECT * FROM analyst_snapshots WHERE ticker = 'AAPL';"
```

Expected: one row with non-null `rec_*` counts and (if `price-target` is on the free tier) non-null `target_*` values. If `target_*` are null, that's the expected graceful-degrade for the premium tier.

Also expand the `Build agent prompt` output in the n8n execution log and verify the new "Analyst consensus" block is present and well-formed.

- [ ] **Step 11: Manual verification — uncovered ticker**

Pick a ticker you know has no analyst coverage (any micro-cap recently picked up by WSB; if none is available, point `Finnhub Recommendation`'s URL at `?symbol=NONEXISTENT_XYZ` temporarily).

Run the workflow. Confirm:
- The workflow completes (does not crash).
- `analyst_snapshots` has a row for that ticker with all `rec_*` and `target_*` columns null.
- The prompt text shows `Analyst data: not available for this ticker.`

Revert the temporary URL change.

- [ ] **Step 12: Commit**

```bash
git add "workflows/Research and Rate v1.json"
git commit -m "feat(workflows): feed analyst consensus + price targets into rater"
```

---

## Task 5: Extend the `Cleanup and Archive v1` workflow

**Files:**
- Modify: `workflows/Cleanup and Archive v1.json`

The cleanup query is a single statement that already archives `research_snapshots` and `ratings`. Add `analyst_snapshots` to the same atomic CTE.

- [ ] **Step 1: Update the cleanup SQL**

Find the `Archive + delete older than 90d` node. Replace its `parameters.query` with the SQL below. The change adds two new CTEs (`deleted_analyst` and `archived_analyst`) and two more counts to the final SELECT.

```sql
-- Archive then delete rows older than the retention window. Wrapped in a
-- single statement so DELETE + INSERT are atomic: any failure rolls both back
-- and the data stays in the hot tables. ON CONFLICT DO NOTHING makes the
-- workflow safe to re-run after a partial archive (e.g. a manual replay).
WITH
  cutoff AS (
    SELECT (CURRENT_DATE - INTERVAL '90 days')::date AS d
  ),
  deleted_snapshots AS (
    DELETE FROM research_snapshots
    WHERE as_of_date < (SELECT d FROM cutoff)
    RETURNING ticker, as_of_date, price, change_pct_1d, change_pct_5d,
              change_pct_ytd, market_cap, pe_ratio, news, fundamentals, fetched_at
  ),
  archived_snapshots AS (
    INSERT INTO research_snapshots_archive
      (ticker, as_of_date, price, change_pct_1d, change_pct_5d, change_pct_ytd,
       market_cap, pe_ratio, news, fundamentals, fetched_at)
    SELECT ticker, as_of_date, price, change_pct_1d, change_pct_5d, change_pct_ytd,
           market_cap, pe_ratio, news, fundamentals, fetched_at
    FROM deleted_snapshots
    ON CONFLICT (ticker, as_of_date) DO NOTHING
    RETURNING ticker
  ),
  deleted_ratings AS (
    DELETE FROM ratings
    WHERE as_of_date < (SELECT d FROM cutoff)
    RETURNING ticker, as_of_date, rating, confidence, rationale, created_at
  ),
  archived_ratings AS (
    INSERT INTO ratings_archive
      (ticker, as_of_date, rating, confidence, rationale, created_at)
    SELECT ticker, as_of_date, rating, confidence, rationale, created_at
    FROM deleted_ratings
    ON CONFLICT (ticker, as_of_date) DO NOTHING
    RETURNING ticker
  ),
  deleted_analyst AS (
    DELETE FROM analyst_snapshots
    WHERE as_of_date < (SELECT d FROM cutoff)
    RETURNING ticker, as_of_date, rec_period,
              rec_strong_buy, rec_buy, rec_hold, rec_sell, rec_strong_sell,
              target_high, target_low, target_mean, target_median,
              target_updated_at, fetched_at
  ),
  archived_analyst AS (
    INSERT INTO analyst_snapshots_archive
      (ticker, as_of_date, rec_period,
       rec_strong_buy, rec_buy, rec_hold, rec_sell, rec_strong_sell,
       target_high, target_low, target_mean, target_median,
       target_updated_at, fetched_at)
    SELECT ticker, as_of_date, rec_period,
           rec_strong_buy, rec_buy, rec_hold, rec_sell, rec_strong_sell,
           target_high, target_low, target_mean, target_median,
           target_updated_at, fetched_at
    FROM deleted_analyst
    ON CONFLICT (ticker, as_of_date) DO NOTHING
    RETURNING ticker
  )
SELECT
  (SELECT d FROM cutoff)                       AS cutoff_date,
  (SELECT count(*) FROM deleted_snapshots)     AS snapshots_deleted,
  (SELECT count(*) FROM archived_snapshots)    AS snapshots_archived,
  (SELECT count(*) FROM deleted_ratings)       AS ratings_deleted,
  (SELECT count(*) FROM archived_ratings)      AS ratings_archived,
  (SELECT count(*) FROM deleted_analyst)       AS analyst_deleted,
  (SELECT count(*) FROM archived_analyst)      AS analyst_archived;
```

- [ ] **Step 2: Update the `Log counts` node code**

Find the `Log counts` node. Replace its `parameters.jsCode` with:

```javascript
// Surface the cleanup result in the execution log. n8n shows the last node's
// output prominently, so this gives the operator a one-glance summary of what
// the cron run did without having to open the Postgres node's data tab.
const r = $input.first().json;
const summary = `cutoff=${r.cutoff_date} snapshots: deleted=${r.snapshots_deleted} archived=${r.snapshots_archived} | ratings: deleted=${r.ratings_deleted} archived=${r.ratings_archived} | analyst: deleted=${r.analyst_deleted} archived=${r.analyst_archived}`;
console.log('[Cleanup and Archive]', summary);
return [{ json: { ...r, summary } }];
```

- [ ] **Step 3: Re-import in n8n and re-export**

Same routine as Task 4 Step 9: Workflows → Import from File → `Cleanup and Archive v1.json`, re-select the Postgres credential, save, re-export over the same file.

- [ ] **Step 4: Manual verification**

```bash
docker exec -it wsb-postgres psql -U wsb -d wsb -c "INSERT INTO analyst_snapshots (ticker, as_of_date) VALUES ('AAPL', current_date - 100) ON CONFLICT DO NOTHING;"
```

(If `AAPL` is not in `tickers`, substitute any ticker that is.) Then run the cleanup workflow manually in n8n. Verify:

```bash
docker exec -it wsb-postgres psql -U wsb -d wsb -c "SELECT count(*) FROM analyst_snapshots WHERE as_of_date < current_date - 90;"
docker exec -it wsb-postgres psql -U wsb -d wsb -c "SELECT count(*) FROM analyst_snapshots_archive WHERE ticker = 'AAPL';"
```

Expected: first query returns `0` (rows moved). Second returns `>= 1`. The execution log shows `analyst: deleted=1 archived=1` (or higher).

- [ ] **Step 5: Commit**

```bash
git add "workflows/Cleanup and Archive v1.json"
git commit -m "feat(workflows): extend cleanup to archive analyst_snapshots"
```

---

## Task 6: Home table Upside column (`web/components/StockTable.tsx`)

**Files:**
- Modify: `web/components/StockTable.tsx`

- [ ] **Step 1: Import `computeUpside`**

At the top of `web/components/StockTable.tsx`, add to the existing imports:

```typescript
import { computeUpside } from "@/lib/analyst";
```

- [ ] **Step 2: Add the "Upside" `<th>` to the desktop table header**

Find the desktop `<thead>` block. Add a new column between "1d" and "Sentiment":

```tsx
<th className="px-4 py-3 font-medium">Ticker</th>
<th className="px-4 py-3 font-medium">Rating</th>
<th className="px-4 py-3 font-medium">Price</th>
<th className="px-4 py-3 font-medium">1d</th>
<th className="px-4 py-3 font-medium">Upside</th>
<th className="px-4 py-3 font-medium">Sentiment</th>
<th className="px-4 py-3 font-medium">Mentions</th>
<th className="px-4 py-3 font-medium">Last seen</th>
```

- [ ] **Step 3: Add the matching `<td>` to the desktop row**

Inside the desktop row map, find the existing `1d` cell:

```tsx
<td className={`px-4 py-3 tabular-nums ${changeClass(change)}`}>
  {fmtPct(change)}
</td>
```

Compute upside above the returned JSX (just after the existing `const change = ...` line):

```tsx
const upside = computeUpside(r.price, r.target_mean);
```

Insert the new `<td>` immediately after the 1d cell:

```tsx
<td className={`px-4 py-3 tabular-nums ${changeClass(upside)}`}>
  {fmtPct(upside)}
</td>
```

- [ ] **Step 4: Add Upside to the mobile card grid**

Find the mobile cards' `<dl>`. The grid currently has 5 cells (Price, 1d, Mentions, Sentiment, Last seen). The mobile row map already has `const change = ...`. Add `const upside = ...` next to it (mirror the desktop change), then add one more `<Cell>` between the `1d` cell and the `Mentions` cell:

```tsx
<Cell label="Price"><span className="tabular-nums">{fmtUsd(r.price)}</span></Cell>
<Cell label="1d"><span className={`tabular-nums ${changeClass(change)}`}>{fmtPct(change)}</span></Cell>
<Cell label="Upside"><span className={`tabular-nums ${changeClass(upside)}`}>{fmtPct(upside)}</span></Cell>
<Cell label="Mentions"><span className="tabular-nums text-neutral-300">{r.mention_count}</span></Cell>
<Cell label="Sentiment">
  <span className="text-neutral-300">
    {r.pos + r.neu + r.neg === 0 ? "—" : `${r.pos}/${r.neu}/${r.neg}`}
  </span>
</Cell>
<Cell label="Last seen"><span className="text-neutral-400">{fmtRelative(r.last_seen_at)}</span></Cell>
```

(That's 6 cells = exactly two rows of 3 in the existing `grid-cols-3`.)

- [ ] **Step 5: Verify `changeClass` accepts `null | number` for the upside case**

The existing `changeClass(change: number | null): string` signature already handles null. `computeUpside` returns `number | null`, so no signature change is needed.

- [ ] **Step 6: Typecheck and run tests**

```bash
cd web && npm run typecheck && npm test
```

Expected: passes.

- [ ] **Step 7: Visual smoke check**

```bash
cd web && npm run dev
```

Open http://localhost:3000. The table should render with the new "Upside" column (showing `—` for every row, because no analyst data exists yet). Mobile (resize the viewport below `sm`) should show 6 cells per card.

Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add web/components/StockTable.tsx
git commit -m "feat(web): add Upside column to dashboard table"
```

---

## Task 7: `AnalystView` component

**Files:**
- Create: `web/components/AnalystView.tsx`

- [ ] **Step 1: Create the component file**

Create `web/components/AnalystView.tsx`:

```tsx
import type { AnalystSnapshot } from "@/lib/queries";
import { computeUpside, deriveConsensus, type ConsensusLabel } from "@/lib/analyst";
import { fmtPct, fmtRelative, fmtUsd } from "@/lib/format";

interface Props {
  snapshot: AnalystSnapshot | null;
  currentPrice: string | null;
}

export function AnalystView({ snapshot, currentPrice }: Props) {
  const counts = snapshot
    ? {
        strong_buy: snapshot.rec_strong_buy,
        buy: snapshot.rec_buy,
        hold: snapshot.rec_hold,
        sell: snapshot.rec_sell,
        strong_sell: snapshot.rec_strong_sell,
      }
    : null;
  const consensus = counts ? deriveConsensus(counts) : null;
  const hasTargets =
    !!snapshot &&
    (snapshot.target_high !== null ||
      snapshot.target_low !== null ||
      snapshot.target_mean !== null);

  if (!snapshot || (!consensus && !hasTargets)) {
    return (
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-400">
          Analyst view
        </h2>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400">
          Analyst coverage not available for this ticker.
        </div>
      </section>
    );
  }

  const upside = computeUpside(currentPrice, snapshot.target_mean);

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-400">
        Analyst view
      </h2>
      <div className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        {consensus ? (
          <div className="flex items-center gap-3">
            <ConsensusBadge label={consensus} />
            <DistributionBar counts={counts!} />
          </div>
        ) : null}

        {hasTargets ? (
          <div className="grid grid-cols-3 gap-3">
            <TargetTile label="Target high" value={snapshot.target_high} />
            <TargetTile
              label="Target mean"
              value={snapshot.target_mean}
              foot={upside === null ? undefined : `${fmtPct(upside)} vs current`}
            />
            <TargetTile label="Target low" value={snapshot.target_low} />
          </div>
        ) : null}

        <div className="text-xs text-neutral-500">
          Analyst data updated {fmtRelative(snapshot.target_updated_at)}
        </div>
      </div>
    </section>
  );
}

function ConsensusBadge({ label }: { label: ConsensusLabel }) {
  const tone =
    label === "Strong Buy" || label === "Buy"
      ? "bg-rating-buy/15 text-rating-buy ring-rating-buy/40"
      : label === "Strong Sell" || label === "Sell"
        ? "bg-rating-sell/15 text-rating-sell ring-rating-sell/40"
        : "bg-neutral-800 text-neutral-200 ring-neutral-700";
  return (
    <span
      className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ring-1 ring-inset ${tone}`}
    >
      {label}
    </span>
  );
}

const SEGMENT_TONES = {
  strong_buy: "bg-rating-buy",
  buy: "bg-rating-buy/60",
  hold: "bg-neutral-600",
  sell: "bg-rating-sell/60",
  strong_sell: "bg-rating-sell",
} as const;

function DistributionBar({
  counts,
}: {
  counts: {
    strong_buy: number | null;
    buy: number | null;
    hold: number | null;
    sell: number | null;
    strong_sell: number | null;
  };
}) {
  const items = [
    { key: "strong_buy" as const, label: "Strong Buy", value: counts.strong_buy ?? 0 },
    { key: "buy" as const, label: "Buy", value: counts.buy ?? 0 },
    { key: "hold" as const, label: "Hold", value: counts.hold ?? 0 },
    { key: "sell" as const, label: "Sell", value: counts.sell ?? 0 },
    { key: "strong_sell" as const, label: "Strong Sell", value: counts.strong_sell ?? 0 },
  ];
  const total = items.reduce((acc, i) => acc + i.value, 0);
  if (total === 0) return null;
  return (
    <div
      className="flex h-3 flex-1 overflow-hidden rounded-md ring-1 ring-inset ring-neutral-800"
      title={items.map((i) => `${i.label}: ${i.value}`).join("\n")}
    >
      {items.map((i) =>
        i.value === 0 ? null : (
          <div
            key={i.key}
            className={SEGMENT_TONES[i.key]}
            style={{ width: `${(i.value / total) * 100}%` }}
            aria-label={`${i.label}: ${i.value}`}
          />
        )
      )}
    </div>
  );
}

function TargetTile({
  label,
  value,
  foot,
}: {
  label: string;
  value: string | null;
  foot?: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
      <div className="text-[0.65rem] uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-neutral-100">
        {fmtUsd(value)}
      </div>
      {foot ? <div className="mt-0.5 text-xs text-neutral-500">{foot}</div> : null}
    </div>
  );
}
```

**Note on Tailwind classes:** `rating-buy` and `rating-sell` colors are already defined in `web/tailwind.config.ts` (used by `RatingBadge` and `changeClass`). No config changes needed.

- [ ] **Step 2: Typecheck**

```bash
cd web && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/components/AnalystView.tsx
git commit -m "feat(web): add AnalystView component"
```

---

## Task 8: Wire `AnalystView` into the ticker detail page

**Files:**
- Modify: `web/app/stocks/[ticker]/page.tsx`

- [ ] **Step 1: Import the new pieces**

Add to the existing imports at the top of `web/app/stocks/[ticker]/page.tsx`:

```typescript
import { AnalystView } from "@/components/AnalystView";
```

And extend the existing `queries` import to include `getAnalystSnapshot`:

```typescript
import {
  getAnalystSnapshot,
  getPostsForTicker,
  getRatingHistory,
  getSentimentByDay,
  getTickerDetail,
} from "@/lib/queries";
```

- [ ] **Step 2: Fetch the analyst snapshot in the existing `Promise.all`**

Find the existing `Promise.all`:

```typescript
const [ratings, sentiment, posts] = await Promise.all([
  getRatingHistory(ticker, 30),
  getSentimentByDay(ticker, 30),
  getPostsForTicker(ticker, 20),
]);
```

Replace with:

```typescript
const [ratings, sentiment, posts, analyst] = await Promise.all([
  getRatingHistory(ticker, 30),
  getSentimentByDay(ticker, 30),
  getPostsForTicker(ticker, 20),
  getAnalystSnapshot(ticker),
]);
```

- [ ] **Step 3: Render `<AnalystView />` as a new section**

In the JSX, the current order of sections is: stat grid → sentiment + news (grid) → rating history → posts → footer.

Insert the new section between the stat grid and the sentiment+news row. Find:

```tsx
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-400">
            Sentiment, last 30 days
          </h2>
```

Insert the new section between the closing `</section>` of the stat grid and the opening of the sentiment+news grid:

```tsx
      </section>

      <AnalystView snapshot={analyst} currentPrice={detail.price} />

      <section className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-400">
            Sentiment, last 30 days
          </h2>
```

- [ ] **Step 4: Typecheck and run tests**

```bash
cd web && npm run typecheck && npm test
```

Expected: passes.

- [ ] **Step 5: Visual smoke check**

```bash
cd web && npm run dev
```

Visit `http://localhost:3000/stocks/AAPL` (or any ticker present in your DB). With no analyst data yet, the section should show "Analyst coverage not available for this ticker." If you've already run the updated workflow against AAPL in Task 4, the consensus badge, distribution bar, and target tiles should render.

Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add web/app/stocks/[ticker]/page.tsx
git commit -m "feat(web): show analyst view on ticker detail page"
```

---

## Task 9: README + final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the migrations section of `README.md`**

Find the migration block currently mentioning `001-create-archive-tables.sql` (look around "If you're importing into an existing deployment" or the docs/migrations note). Add a second migration line directly after it:

```bash
docker exec -i wsb-postgres psql -U wsb -d wsb < db/migrations/002-create-analyst-tables.sql
```

Add a short note above the credentials table or near the workflow description:

> **Note on `Research and Rate v1`:** The workflow calls Finnhub's `recommendation` and `price-target` endpoints. `recommendation` is on the free tier. `price-target` may require a paid plan; the workflow degrades gracefully (writes null targets, dashboard renders "Analyst coverage not available") if Finnhub returns 403 on that endpoint.

- [ ] **Step 2: Run the full verification suite**

```bash
cd web && npm run typecheck && npm run lint && npm test && npm run build
```

Expected: all four succeed. Build will warn about dynamic routes (existing) but should not error.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document analyst migration and price-target tier caveat"
```

- [ ] **Step 4: End-to-end check**

If both workflows have been run at least once (Task 4 Steps 10–11 and the dev-server checks in Tasks 6 + 8), the pipeline is verified end-to-end. If not, run `Research and Rate v1` once against a known-covered ticker, then visit the dashboard and the corresponding ticker detail page. Confirm:

- Home table shows a populated **Upside** column for that ticker (or `—` if `price-target` was 403).
- Ticker detail page shows the **Analyst view** section with badge + distribution bar (+ tiles if targets are present).

The feature is shipped.

---

## Out of scope (becomes its own plan later)

The other three signal classes flagged during brainstorming each get their own design → plan → build cycle:

- More subreddits + `source` column on `posts`
- Yahoo options chain → put/call ratio + IV signal
- StockTwits bull/bear feed
