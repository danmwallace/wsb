# WSB Pulse — Public Launch Readiness (UI redesign)

- **Date:** 2026-05-25
- **Status:** Approved design, ready for implementation planning
- **Scope owner:** Dan Wallace
- **App:** `wsb` — Next.js 15 (App Router, React 19) dashboard over Postgres, fed by n8n. Runs on the remote test server (`wsb.ai.wallace.boston`); this repo is source only.

## 1. Background

WSB Pulse scrapes tickers mentioned on r/WallStreetBets, enriches them with Finnhub
research, and rates them with Claude. Today it is a single-user, no-auth personal
tool: a dense ranked table plus per-ticker detail pages, with UI controls to add and
delete tickers. It is currently reachable on the internal network only.

This design turns it into a **public, ad-supported site** without adding accounts.
The core dataset (Reddit chatter, market data, AI ratings) is inherently shared and
public, so no per-user data or auth is required to go public — monetization is
ad-driven, and the product is framed as a rolling "last 90 days" snapshot, which
matches the existing Cleanup & Archive boundary.

## 2. Goals / non-goals

**Goals**
- A stranger-friendly public dashboard (layout "A", below), desktop and mobile.
- Surface the app's distinctive signal — AI rating changes and WSB sentiment/mention
  spikes — as a "top movers" hook.
- Remove all write features from the UI and close the associated mutation endpoints.
- Reserve ad placements and add the SEO/social plumbing a public site needs.
- Make no decision that blocks a future multi-user/watchlist layer.

**Non-goals (explicitly out of scope this round)**
- Authentication, user accounts, per-user data, watchlists.
- Real ad-network integration/approval, billing, paid plans.
- Re-skin/redesign of the visual theme (we keep the existing dark theme; this is polish).
- Backfilling or changing how data is ingested (n8n workflows unchanged).

## 3. Resolved product decisions

| Decision | Choice |
|---|---|
| Multi-user / accounts | Not now. Public + ad-supported instead. Leave a seam (§10). |
| Product type | Public, ad-supported site (not a private/personal tool). |
| Overall layout | "A" — editorial single column (§4). |
| "Top movers" signal | Rating changes **and** sentiment/mention spikes (§6). |
| Time window | Static "last 90 days" framing — no interactive toggle. |
| Write features (add/delete) | Removed from UI entirely; manage tickers via `psql` (§7). |

## 4. Information architecture & layout

Single-column "editorial" layout, top to bottom:

1. **Nav** — `📈 WSB Pulse` (brand, links to `/`); right-side links to `/how-it-works`
   and `/about`. On mobile, collapses to a hamburger.
2. **Hero** — headline "What r/WallStreetBets is buzzing about — rated by AI", a
   one-line explainer, a "Sources: Reddit · Finnhub · Claude" trust line, and the
   static "last 90 days" framing.
3. **Leaderboard ad slot** — responsive; reserved space, no live ad code yet.
4. **Top movers** — ~4–6 cards blending rating changes and spikes; each card names
   *why* it is a mover (e.g. "Hold → Buy", "mentions ×4"). Horizontal swipe carousel
   on mobile.
5. **Ranked table** — existing columns (Ticker, Rating, Price, 1d, Sentiment 7d,
   Mentions, Last seen), ranked by confidence as today. One **in-feed ad slot**
   mid-list.
6. **Footer** — "Data covers the last 90 days · AI-generated, not financial advice."

**Responsive behavior:** the ranked table renders as a real `<table>` on desktop and
as stacked **row-cards** on mobile (ticker + company + rating badge on the top line, a
3-up stat grid below; Sentiment shows the pos/neu/neg split, "—" when no posts). This
is the single most important mobile change — wide tables are unusable on phones.

Approved mockups live in `.superpowers/brainstorm/` (gitignored): `dashboard-A-preview`
(desktop) and `mobile-preview`.

## 5. Components (new / changed)

New:
- `Hero` — static headline/explainer/trust line.
- `TopMovers` + `MoverCard` — renders the movers strip; horizontal scroll on mobile.
- `AdSlot` — renders reserved, labeled placeholder space now; swappable for an AdSense
  `<ins>` unit later. Variants: `leaderboard`, `in-feed`.

Changed:
- `StockTable` (`web/components/StockTable.tsx`) — gains responsive table-vs-cards
  behavior at a mobile breakpoint (one component, CSS-driven; no data change).
- `web/app/page.tsx` — composes Nav + Hero + AdSlot + TopMovers + StockTable; drops
  `AddTickerForm`.
- `web/app/stocks/[ticker]/page.tsx` — drops `DeleteStockButton`; otherwise unchanged
  aside from metadata (§9).

New pages:
- `/how-it-works` — static explainer (data sources, what Buy/Hold/Sell + confidence
  mean, update cadence, "not financial advice"). The trust surface.
- `/privacy` — privacy policy. Required for AdSense; also good practice for a public site.
- `/about` — short "what is this / who made it" (can be folded into `/how-it-works` if
  preferred during implementation).

## 6. Top movers logic

New `listTopMovers()` in `web/lib/queries.ts`, returning a merged, de-duplicated, capped
(~4–6) list from two sources. Both are computable from the existing schema — no new tables.

**Rating changes** — from `ratings` (one row per ticker per day):
```sql
WITH ranked AS (
  SELECT ticker, as_of_date, rating, confidence,
         LAG(rating) OVER (PARTITION BY ticker ORDER BY as_of_date) AS prev_rating,
         ROW_NUMBER() OVER (PARTITION BY ticker ORDER BY as_of_date DESC) AS rn
  FROM ratings
  WHERE as_of_date > current_date - 90
)
SELECT ticker, rating, prev_rating, as_of_date
FROM ranked
WHERE rn = 1 AND prev_rating IS NOT NULL AND rating <> prev_rating
ORDER BY as_of_date DESC;
```
"Previous rated value" = the last day we actually rated the ticker, which is the right
semantic given ratings are produced only on run days.

**Mention/sentiment spikes** — from `posts.observed_at`:
```sql
SELECT ticker,
  COUNT(*) FILTER (WHERE observed_at >  now() - interval '7 days')                              AS recent,
  COUNT(*) FILTER (WHERE observed_at <= now() - interval '7 days'
                     AND observed_at >  now() - interval '14 days')                             AS prior
FROM posts
WHERE observed_at > now() - interval '14 days'
GROUP BY ticker;
```
A spike = `recent >= 2 * prior` and `recent >= 3` (small floor to avoid noise). The
dominant recent `sentiment` supplies the "turning positive/negative" label.

**Sparse-data fallback:** at friends-scale, both signals can come back empty. `TopMovers`
hides itself when there is nothing to show; optionally it can fall back to "most mentioned
in the last 7 days" so the strip is rarely empty. Final fallback choice is an
implementation detail, not a blocker.

## 7. Removals (and the security reason)

Delete from the UI and the codebase:
- `web/components/AddTickerForm.tsx`
- `web/components/DeleteStockButton.tsx`
- `web/app/actions.ts` (`addTickerAction`)
- `web/app/stocks/[ticker]/actions.ts` (`deleteTickerAction`)

**Why remove the actions, not just the buttons:** a Next.js server action is a live POST
endpoint. A mutation action left registered but button-less on a *public* site is an open
write hole (anyone could delete a ticker for everyone, or spam rows). Removing the
components *and* their action files is what actually closes it.

Keep the low-level mutation SQL (`addCustomTicker` and the delete CTE in
`web/lib/mutations.ts`) only if useful as reference; the supported path for managing
tickers becomes documented `psql` one-liners in the README, e.g.:
```sh
# delete a ticker (posts + tickers; snapshots/ratings cascade, archives retained)
docker exec -i wsb-postgres psql -U wsb -d wsb -c "DELETE FROM posts WHERE ticker='XYZ'; DELETE FROM tickers WHERE ticker='XYZ';"
```

## 8. Ads

- Google AdSense, two slots at launch: responsive **leaderboard** (below hero) and one
  **in-feed** unit mid-table.
- `AdSlot` renders labeled reserved space until an AdSense account exists; real `<ins>`
  markup drops in later.
- **Dependency:** AdSense approval requires real content/traffic **and** a published
  privacy policy (hence `/privacy` in §5). Ads are not expected to be meaningful at
  friends-and-family traffic — revenue is a downstream marketing/SEO problem, not a code one.

## 9. SEO / social / performance

- Per-page metadata via `generateMetadata` (dashboard + each ticker page); root-layout
  defaults.
- `app/icon.png` favicon (also fixes the current `404 /favicon.ico`).
- `sitemap.ts` and `robots.ts` (Next.js conventions).
- OpenGraph/Twitter card: a static share image at launch; a dynamic per-ticker OG image
  is a clean fast-follow.
- **Rendering:** switch the dashboard and ticker pages off `force-dynamic` /
  `revalidate = 0` to **ISR** (`revalidate` ~30–60 min). Data changes ~daily, so ISR is
  far cheaper under public traffic and friendlier to crawlers, while staying fresh enough.

## 10. Multi-user seam (future, not built)

Keep `tickers` global. The removed "add ticker" is the natural place a future per-user
**watchlist** returns — layered as `users` + `watchlist` tables on top of the shared
dataset, leaving ingestion and the public views untouched. Nothing in this design blocks it.

## 11. Implementation sequencing (high level)

The detailed plan is produced by the writing-plans step; rough order:

1. Remove write features + server actions (security; smallest, unblocks public exposure).
2. Responsive `StockTable` (table ↔ cards).
3. `Hero`, Nav, footer, `/how-it-works` + `/privacy` + `/about` static pages.
4. `listTopMovers()` query + `TopMovers`/`MoverCard`.
5. `AdSlot` placeholders (leaderboard + in-feed) wired into the layout.
6. SEO/social plumbing (metadata, favicon, sitemap, robots, OG image) + ISR switch.

## 12. Risks / open items

- **Movers sparsity** at low data volume (§6 fallback handles UX).
- **AdSense approval** gated on traffic + privacy policy; ad revenue uncertain at small scale.
- **ISR + freshness**: confirm a revalidate window that feels current without hammering the DB.
- The two write features were verified working on 2026-05-25 just before this design chose
  to remove them; the underlying mutations remain available via `psql`.
