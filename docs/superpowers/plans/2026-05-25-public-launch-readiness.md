# WSB Pulse — Public Launch Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-user WSB Pulse dashboard into a public, ad-supported site (layout "A"): stranger-friendly front door, AI-rating/sentiment "top movers", responsive mobile layout, no UI write features, ad slots, and SEO plumbing — no auth, no accounts.

**Architecture:** Next.js 15 App Router + React 19 + Tailwind 3. Server components fetch from Postgres via `query<T>()` (`web/lib/db.ts`). Pure top-movers classification lives in `web/lib/movers.ts` (unit-tested with vitest); SQL only fetches raw counts/ratings. DB reads are wrapped in `unstable_cache` (30-min revalidate) so public traffic doesn't hammer Postgres, while pages stay `dynamic` to avoid build-time DB access.

**Tech Stack:** Next.js 15.1.0, React 19.0.0, Tailwind 3.4.17, `pg` 8.13, vitest (added in Task 4).

**Testing approach (hybrid):** vitest unit tests for the pure movers logic only. Everything else is verified by `npm run typecheck`, `npm run lint`, `npm run build`, and browser checks via the Playwright MCP. Note: `typecheck`/`lint`/`build`/`vitest` all run with **no database**. Browser checks require a running app with `DATABASE_URL` set to a reachable Postgres (run `npm run dev` in `web/` against the remote test DB, or deploy via the `danmwallace.private.wsb` playbook and check `wsb.ai.wallace.boston`).

**Branch:** `feat/public-launch-readiness` (already created; the design spec is committed here).

**Conventions:** Path alias `@/` → `web/`. Dark theme via `globals.css`; rating colors `rating.buy/hold/sell` in `tailwind.config.ts`. End every commit message with `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.

---

## File structure (created / modified)

**Created**
- `web/lib/movers.ts` — pure top-movers classification (tested).
- `web/lib/movers.test.ts` — vitest unit tests for the above.
- `web/vitest.config.ts` — vitest config.
- `web/components/Hero.tsx` — static hero/explainer.
- `web/components/AdSlot.tsx` — reserved ad placeholder (leaderboard / in-feed variants).
- `web/components/TopMovers.tsx` + `web/components/MoverCard.tsx` — movers strip.
- `web/app/how-it-works/page.tsx`, `web/app/privacy/page.tsx`, `web/app/about/page.tsx` — static pages.
- `web/app/icon.svg` — favicon.
- `web/app/opengraph-image.tsx` — static OG/social image.
- `web/app/sitemap.ts`, `web/app/robots.ts` — SEO.

**Modified**
- `web/app/layout.tsx` — nav (How it works / About), root metadata, footer.
- `web/app/page.tsx` — compose Hero + AdSlot + TopMovers + StockTable; drop `AddTickerForm`; cache + ISR.
- `web/app/stocks/[ticker]/page.tsx` — drop `DeleteStockButton`; `generateMetadata`; cache + ISR.
- `web/components/StockTable.tsx` — responsive table ↔ cards.
- `web/lib/queries.ts` — add `listTopMovers()`; wrap reads in `unstable_cache`.
- `web/package.json` — add vitest scripts/deps.

**Deleted**
- `web/components/AddTickerForm.tsx`, `web/components/DeleteStockButton.tsx`
- `web/app/actions.ts`, `web/app/stocks/[ticker]/actions.ts`

**Kept but unwired:** `web/lib/mutations.ts` (`addCustomTicker`, `deleteTicker`) stays as reference for manual `psql`/script use; no longer imported by any UI.

---

## Task 1: Remove UI write features and their server-action endpoints

**Why first:** A Next.js server action is a live POST endpoint. On a public site, an action that mutates the DB is an open write hole even with no button. Removing it is the one safety-critical change, and it's self-contained.

**Files:**
- Delete: `web/components/AddTickerForm.tsx`, `web/components/DeleteStockButton.tsx`, `web/app/actions.ts`, `web/app/stocks/[ticker]/actions.ts`
- Modify: `web/app/page.tsx`, `web/app/stocks/[ticker]/page.tsx`

- [ ] **Step 1: Delete the four files**

```bash
cd /home/dwallace/Code/n8n/wsb/web
git rm components/AddTickerForm.tsx components/DeleteStockButton.tsx app/actions.ts "app/stocks/[ticker]/actions.ts"
```

- [ ] **Step 2: Remove `AddTickerForm` from the dashboard**

In `web/app/page.tsx`, delete the import line `import { AddTickerForm } from "@/components/AddTickerForm";` and delete the `<AddTickerForm />` line (currently line 46). Leave the rest of the file unchanged for now (TopMovers is wired in Task 4).

- [ ] **Step 3: Remove `DeleteStockButton` from the detail page**

In `web/app/stocks/[ticker]/page.tsx`, delete the import `import { DeleteStockButton } from "@/components/DeleteStockButton";` (line 14) and replace the header block that contains it (lines 55–63) with the version without the button:

```tsx
        <div className="mt-2 flex items-end gap-3">
          <div className="flex items-baseline gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">{detail.ticker}</h1>
            <span className="text-base text-neutral-400">
              {detail.company ?? ""}
            </span>
          </div>
        </div>
```

- [ ] **Step 4: Confirm nothing else imports the deleted modules**

Run: `cd /home/dwallace/Code/n8n/wsb/web && grep -rn "AddTickerForm\|DeleteStockButton\|@/app/actions\|stocks/\[ticker\]/actions" app components lib`
Expected: no matches.

- [ ] **Step 5: Verify**

Run: `cd /home/dwallace/Code/n8n/wsb/web && npm run typecheck && npm run lint && npm run build`
Expected: all pass; build output no longer lists `app/actions` or the detail `actions` route; no "module not found".

- [ ] **Step 6: Commit**

```bash
cd /home/dwallace/Code/n8n/wsb
git add -A
git commit -m "refactor: remove add/delete ticker UI and server actions

Public site has no write features; the server actions were live POST
mutation endpoints. Ticker management moves to manual psql. Low-level
mutations in lib/mutations.ts kept as reference, now unwired." \
  -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: Responsive ranked table (table on desktop, cards on mobile)

**Files:**
- Modify: `web/components/StockTable.tsx`

The existing table is wrapped in `overflow-hidden rounded-lg border`. Keep the real `<table>` for `sm` and up; render a stacked card list below `sm`. Reuse `RatingBadge`, `SentimentSparkline`, and the `fmt*` helpers already imported.

- [ ] **Step 1: Replace the component body with the responsive version**

Replace the entire return block of `StockTable` (keep the empty-state early return and imports) so it renders two siblings — `hidden sm:block` table and `sm:hidden` card list:

```tsx
  return (
    <>
      {/* Desktop: table */}
      <div className="hidden overflow-hidden rounded-lg border border-neutral-800 sm:block">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-left text-xs uppercase tracking-wider text-neutral-400">
            <tr>
              <th className="px-4 py-3 font-medium">Ticker</th>
              <th className="px-4 py-3 font-medium">Rating</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">1d</th>
              <th className="px-4 py-3 font-medium">Sentiment (7d)</th>
              <th className="px-4 py-3 font-medium">Mentions</th>
              <th className="px-4 py-3 font-medium">Last seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800 bg-neutral-950">
            {rows.map((r) => {
              const change = r.change_pct_1d === null ? null : Number(r.change_pct_1d);
              return (
                <tr key={r.ticker} className="hover:bg-neutral-900/60">
                  <td className="px-4 py-3">
                    <Link
                      href={`/stocks/${encodeURIComponent(r.ticker)}`}
                      className="font-semibold tracking-tight hover:underline"
                    >
                      {r.ticker}
                    </Link>
                    <div className="text-xs text-neutral-500">{r.company ?? ""}</div>
                  </td>
                  <td className="px-4 py-3">
                    <RatingBadge rating={r.rating} confidence={r.confidence} />
                  </td>
                  <td className="px-4 py-3 tabular-nums">{fmtUsd(r.price)}</td>
                  <td className={`px-4 py-3 tabular-nums ${changeClass(change)}`}>
                    {fmtPct(change)}
                  </td>
                  <td className="px-4 py-3">
                    <SentimentSparkline positive={r.pos_7d} neutral={r.neu_7d} negative={r.neg_7d} />
                  </td>
                  <td className="px-4 py-3 tabular-nums text-neutral-300">{r.mention_count}</td>
                  <td className="px-4 py-3 text-xs text-neutral-500">{fmtRelative(r.last_seen_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: cards */}
      <ul className="flex flex-col gap-3 sm:hidden">
        {rows.map((r) => {
          const change = r.change_pct_1d === null ? null : Number(r.change_pct_1d);
          return (
            <li key={r.ticker} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/stocks/${encodeURIComponent(r.ticker)}`} className="min-w-0">
                  <div className="font-semibold tracking-tight">{r.ticker}</div>
                  <div className="truncate text-xs text-neutral-500">{r.company ?? ""}</div>
                </Link>
                <RatingBadge rating={r.rating} confidence={r.confidence} />
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
                <Cell label="Price"><span className="tabular-nums">{fmtUsd(r.price)}</span></Cell>
                <Cell label="1d"><span className={`tabular-nums ${changeClass(change)}`}>{fmtPct(change)}</span></Cell>
                <Cell label="Mentions"><span className="tabular-nums text-neutral-300">{r.mention_count}</span></Cell>
                <Cell label="Sentiment 7d">
                  <span className="text-neutral-300">
                    {r.pos_7d + r.neu_7d + r.neg_7d === 0 ? "—" : `${r.pos_7d}/${r.neu_7d}/${r.neg_7d}`}
                  </span>
                </Cell>
                <Cell label="Last seen"><span className="text-neutral-400">{fmtRelative(r.last_seen_at)}</span></Cell>
              </dl>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function changeClass(change: number | null): string {
  if (change === null) return "text-neutral-500";
  return change >= 0 ? "text-rating-buy" : "text-rating-sell";
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[0.6rem] uppercase tracking-wider text-neutral-500">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
```

- [ ] **Step 2: Verify build + types**

Run: `cd /home/dwallace/Code/n8n/wsb/web && npm run typecheck && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 3: Browser verify (responsive)**

Start the app against a reachable DB (`DATABASE_URL=... npm run dev` in `web/`, or deploy). With the Playwright MCP: `browser_navigate` to the dashboard, `browser_resize` to 1280×800 → table renders; `browser_resize` to 390×800 → stacked cards render with the 3-up stat grid, no horizontal scroll.
Expected: both layouts show the same rows; no overflow on mobile.

- [ ] **Step 4: Commit**

```bash
cd /home/dwallace/Code/n8n/wsb
git add web/components/StockTable.tsx
git commit -m "feat: responsive ranked table (cards on mobile)" \
  -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Site chrome — nav, hero, footer, static pages

**Files:**
- Modify: `web/app/layout.tsx`
- Create: `web/components/Hero.tsx`, `web/app/how-it-works/page.tsx`, `web/app/privacy/page.tsx`, `web/app/about/page.tsx`
- Modify: `web/app/page.tsx`

- [ ] **Step 1: Update nav + footer in `layout.tsx`**

Replace the `<header>` and add a `<footer>`; keep the imports and `metadata` (metadata is expanded in Task 6). New `<body>`:

```tsx
      <body className="flex min-h-screen flex-col">
        <header className="border-b border-neutral-800">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              📈 WSB Pulse
            </Link>
            <nav className="flex gap-4 text-sm text-neutral-400">
              <Link href="/how-it-works" className="hover:text-neutral-100">How it works</Link>
              <Link href="/about" className="hover:text-neutral-100">About</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
        <footer className="border-t border-neutral-800 text-xs text-neutral-600">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-6 py-6 sm:flex-row sm:justify-between">
            <span>Data covers the last 90 days · AI-generated ratings, not financial advice.</span>
            <span className="flex gap-3">
              <Link href="/how-it-works" className="hover:text-neutral-400">How it works</Link>
              <Link href="/privacy" className="hover:text-neutral-400">Privacy</Link>
            </span>
          </div>
        </footer>
      </body>
```

- [ ] **Step 2: Create `web/components/Hero.tsx`**

```tsx
export function Hero() {
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        What r/WallStreetBets is buzzing about — rated by AI
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-neutral-400">
        Tickers pulled from r/WallStreetBets, scored on sentiment and rated by Claude.
        Updated daily · last 90 days.
      </p>
      <p className="mt-2 text-[0.65rem] uppercase tracking-wider text-neutral-600">
        Sources: Reddit · Finnhub · Claude
      </p>
    </section>
  );
}
```

- [ ] **Step 3: Create the three static pages**

`web/app/how-it-works/page.tsx`:

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How it works · WSB Pulse",
  description: "How WSB Pulse collects tickers, scores sentiment, and rates stocks with AI.",
};

export default function HowItWorks() {
  return (
    <article className="prose-invert max-w-2xl space-y-4 text-sm leading-relaxed text-neutral-300">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">How it works</h1>
      <p>WSB Pulse watches r/WallStreetBets for stock tickers, then enriches and rates each one daily.</p>
      <ol className="list-decimal space-y-2 pl-5">
        <li><strong>Collect</strong> — posts mentioning tickers are pulled from r/WallStreetBets and tagged with a sentiment (positive / neutral / negative).</li>
        <li><strong>Research</strong> — each ticker gets a daily market snapshot from Finnhub (price, moves, fundamentals, news).</li>
        <li><strong>Rate</strong> — Claude reviews the chatter and research and assigns a <strong>Buy / Hold / Sell</strong> with a <strong>confidence</strong> score (0–100).</li>
      </ol>
      <p>The dashboard ranks tickers by Claude&apos;s confidence in its latest rating. &ldquo;Top movers&rdquo; highlights recent rating changes and spikes in WSB chatter. Data covers a rolling 90-day window.</p>
      <p className="text-neutral-500">Ratings are generated by an AI model for informational purposes only and are <strong>not financial advice</strong>.</p>
    </article>
  );
}
```

`web/app/about/page.tsx`:

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About · WSB Pulse",
  description: "About WSB Pulse — a hobby project tracking r/WallStreetBets stock sentiment.",
};

export default function About() {
  return (
    <article className="max-w-2xl space-y-4 text-sm leading-relaxed text-neutral-300">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">About</h1>
      <p>WSB Pulse is a hobby project that tracks which stocks r/WallStreetBets is talking about and rates them with AI. It is not affiliated with Reddit, Finnhub, or Anthropic.</p>
      <p>See <a className="text-neutral-100 underline" href="/how-it-works">How it works</a> for the details, or the <a className="text-neutral-100 underline" href="/privacy">privacy policy</a>.</p>
    </article>
  );
}
```

`web/app/privacy/page.tsx`:

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy · WSB Pulse",
  description: "WSB Pulse privacy policy.",
};

export default function Privacy() {
  return (
    <article className="max-w-2xl space-y-4 text-sm leading-relaxed text-neutral-300">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">Privacy</h1>
      <p>WSB Pulse does not require an account and does not ask you for personal information.</p>
      <p>The site uses standard server logs and may serve third-party advertising. Ad partners (e.g. Google AdSense) may use cookies or similar technologies to serve and measure ads; see the respective partner&apos;s policy for details. This page will be updated before any advertising is enabled.</p>
      <p>Questions: <a className="text-neutral-100 underline" href="mailto:dan.m.wallace@gmail.com">dan.m.wallace@gmail.com</a>.</p>
    </article>
  );
}
```

- [ ] **Step 4: Use `Hero` on the dashboard**

In `web/app/page.tsx`, import `Hero` (`import { Hero } from "@/components/Hero";`) and replace the existing hero `<div className="flex items-end justify-between">…</div>` block (the `<h1>Today&apos;s WSB pulse</h1>` block with the SummaryPills) with `<Hero />` followed by the summary pills row. Keep `SummaryPill` and the counts logic; render the pills under the Hero:

```tsx
      <Hero />
      <div className="flex flex-wrap gap-3 text-xs">
        <SummaryPill label="Buy" count={counts.buy} className="text-rating-buy" />
        <SummaryPill label="Hold" count={counts.hold} className="text-neutral-300" />
        <SummaryPill label="Sell" count={counts.sell} className="text-rating-sell" />
        {counts.unrated > 0 ? (
          <SummaryPill label="Unrated" count={counts.unrated} className="text-neutral-500" />
        ) : null}
      </div>
```

- [ ] **Step 5: Verify**

Run: `cd /home/dwallace/Code/n8n/wsb/web && npm run typecheck && npm run lint && npm run build`
Expected: pass; build lists `/how-it-works`, `/about`, `/privacy` as static routes.

- [ ] **Step 6: Commit**

```bash
cd /home/dwallace/Code/n8n/wsb
git add -A
git commit -m "feat: public site chrome — nav, hero, footer, info pages" \
  -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Top movers (vitest + pure logic + query + component)

**Files:**
- Modify: `web/package.json`
- Create: `web/vitest.config.ts`, `web/lib/movers.ts`, `web/lib/movers.test.ts`, `web/components/TopMovers.tsx`, `web/components/MoverCard.tsx`
- Modify: `web/lib/queries.ts`, `web/app/page.tsx`

- [ ] **Step 1: Add vitest**

```bash
cd /home/dwallace/Code/n8n/wsb/web
npm install -D vitest@2
```
Then add to the `"scripts"` block in `web/package.json`:
```json
    "test": "vitest run",
    "test:watch": "vitest"
```
(New dev dependency: `vitest`.)

- [ ] **Step 2: Create `web/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["lib/**/*.test.ts"] },
  resolve: { alias: { "@": resolve(__dirname, ".") } },
});
```

- [ ] **Step 3: Write the failing tests `web/lib/movers.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { isSpike, classifyRatingChange, classifySpike, mergeMovers, type TopMover } from "./movers";

describe("isSpike", () => {
  it("is true when recent is >= 2x prior and >= 3", () => {
    expect(isSpike(6, 2)).toBe(true);
  });
  it("is true when prior is 0 but recent >= 3", () => {
    expect(isSpike(3, 0)).toBe(true);
  });
  it("is false below the floor of 3", () => {
    expect(isSpike(2, 0)).toBe(false);
  });
  it("is false when recent is not 2x prior", () => {
    expect(isSpike(5, 4)).toBe(false);
  });
});

describe("classifyRatingChange", () => {
  it("labels an upgrade as up", () => {
    const m = classifyRatingChange({ ticker: "AMD", company: "Advanced Micro Devices", rating: "Buy", prevRating: "Hold", asOf: new Date("2026-05-23") });
    expect(m.kind).toBe("rating");
    expect(m.label).toBe("Hold → Buy");
    expect(m.direction).toBe("up");
  });
  it("labels a downgrade to Sell as down", () => {
    const m = classifyRatingChange({ ticker: "RDDT", company: "Reddit", rating: "Hold", prevRating: "Buy", asOf: new Date("2026-05-24") });
    expect(m.direction).toBe("down");
    expect(m.label).toBe("Buy → Hold");
  });
});

describe("classifySpike", () => {
  it("returns a ratio label when prior > 0", () => {
    const m = classifySpike({ ticker: "ASTS", company: "AST", recent: 8, prior: 2, pos: 6, neu: 1, neg: 1 });
    expect(m?.label).toBe("mentions ×4");
    expect(m?.direction).toBe("up");
  });
  it("returns a 'new chatter' label when prior is 0", () => {
    const m = classifySpike({ ticker: "XYZ", company: null, recent: 4, prior: 0, pos: 1, neu: 3, neg: 0 });
    expect(m?.label).toBe("new chatter");
  });
  it("returns null when not a spike", () => {
    expect(classifySpike({ ticker: "AAA", company: null, recent: 2, prior: 2, pos: 1, neu: 1, neg: 0 })).toBeNull();
  });
  it("leans down when negative dominates", () => {
    const m = classifySpike({ ticker: "BBB", company: null, recent: 6, prior: 1, pos: 0, neu: 1, neg: 5 });
    expect(m?.direction).toBe("down");
  });
});

describe("mergeMovers", () => {
  const rating: TopMover[] = [{ ticker: "AMD", company: null, kind: "rating", label: "Hold → Buy", direction: "up", sortKey: 100 }];
  const spike: TopMover[] = [
    { ticker: "AMD", company: null, kind: "spike", label: "mentions ×3", direction: "up", sortKey: 50 },
    { ticker: "ASTS", company: null, kind: "spike", label: "mentions ×4", direction: "up", sortKey: 80 },
  ];
  it("dedupes by ticker, preferring the rating change", () => {
    const out = mergeMovers(rating, spike, 6);
    expect(out.filter((m) => m.ticker === "AMD")).toHaveLength(1);
    expect(out.find((m) => m.ticker === "AMD")?.kind).toBe("rating");
  });
  it("caps the result and sorts by sortKey desc", () => {
    const out = mergeMovers(rating, spike, 2);
    expect(out).toHaveLength(2);
    expect(out[0].sortKey).toBeGreaterThanOrEqual(out[1].sortKey);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd /home/dwallace/Code/n8n/wsb/web && npm test`
Expected: FAIL — `Cannot find module './movers'` / functions not defined.

- [ ] **Step 5: Implement `web/lib/movers.ts`**

```ts
import type { Rating, Sentiment } from "./queries";

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

export function isSpike(recent: number, prior: number): boolean {
  return recent >= SPIKE_FLOOR && recent >= 2 * prior;
}

export function classifyRatingChange(i: RatingChangeInput): TopMover {
  const direction: MoverDirection =
    RATING_RANK[i.rating] > RATING_RANK[i.prevRating] ? "up" : "down";
  // Rating changes rank above spikes; newer changes rank higher.
  const sortKey = 1000 + i.asOf.getTime() / 1e9;
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
  const ratio = i.prior > 0 ? Math.round(i.recent / i.prior) : 0;
  const label = i.prior > 0 ? `mentions ×${ratio}` : "new chatter";
  let direction: MoverDirection = "neutral";
  if (i.neg > i.pos && i.neg >= i.neu) direction = "down";
  else if (i.pos > i.neg && i.pos >= i.neu) direction = "up";
  return {
    ticker: i.ticker,
    company: i.company,
    kind: "spike",
    label,
    direction,
    sortKey: i.recent, // higher recent volume ranks higher among spikes
  };
}

export function mergeMovers(
  rating: TopMover[],
  spike: TopMover[],
  cap = 6
): TopMover[] {
  const byTicker = new Map<string, TopMover>();
  for (const m of rating) byTicker.set(m.ticker, m); // rating changes win
  for (const m of spike) if (!byTicker.has(m.ticker)) byTicker.set(m.ticker, m);
  return [...byTicker.values()].sort((a, b) => b.sortKey - a.sortKey).slice(0, cap);
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd /home/dwallace/Code/n8n/wsb/web && npm test`
Expected: PASS (all in `movers.test.ts`).

- [ ] **Step 7: Add `listTopMovers()` to `web/lib/queries.ts`**

Append (also add `import` for the movers module at the top: `import { classifyRatingChange, classifySpike, mergeMovers, type TopMover } from "./movers";`):

```ts
export async function listTopMovers(cap = 6): Promise<TopMover[]> {
  const ratingRows = await query<{
    ticker: string; company: string | null; rating: Rating; prev_rating: Rating; as_of_date: Date;
  }>(
    `
    WITH ranked AS (
      SELECT r.ticker, r.as_of_date, r.rating,
             LAG(r.rating)   OVER (PARTITION BY r.ticker ORDER BY r.as_of_date) AS prev_rating,
             ROW_NUMBER()    OVER (PARTITION BY r.ticker ORDER BY r.as_of_date DESC) AS rn
      FROM ratings r
      WHERE r.as_of_date > current_date - 90
    )
    SELECT ranked.ticker, t.company, ranked.rating, ranked.prev_rating, ranked.as_of_date
    FROM ranked JOIN tickers t ON t.ticker = ranked.ticker
    WHERE ranked.rn = 1 AND ranked.prev_rating IS NOT NULL AND ranked.rating <> ranked.prev_rating
    ORDER BY ranked.as_of_date DESC
    LIMIT 20
    `
  );

  const spikeRows = await query<{
    ticker: string; company: string | null;
    recent: string; prior: string; pos: string; neu: string; neg: string;
  }>(
    `
    SELECT t.ticker, t.company,
      COUNT(*) FILTER (WHERE p.observed_at >  now() - interval '7 days')                               AS recent,
      COUNT(*) FILTER (WHERE p.observed_at <= now() - interval '7 days'
                         AND p.observed_at >  now() - interval '14 days')                              AS prior,
      COUNT(*) FILTER (WHERE p.observed_at >  now() - interval '7 days' AND p.sentiment = 'Positive')  AS pos,
      COUNT(*) FILTER (WHERE p.observed_at >  now() - interval '7 days' AND p.sentiment = 'Neutral')   AS neu,
      COUNT(*) FILTER (WHERE p.observed_at >  now() - interval '7 days' AND p.sentiment = 'Negative')  AS neg
    FROM posts p JOIN tickers t ON t.ticker = p.ticker
    WHERE p.observed_at > now() - interval '14 days'
    GROUP BY t.ticker, t.company
    `
  );

  const ratingMovers = ratingRows.map((r) =>
    classifyRatingChange({
      ticker: r.ticker, company: r.company, rating: r.rating,
      prevRating: r.prev_rating, asOf: new Date(r.as_of_date),
    })
  );
  const spikeMovers = spikeRows
    .map((s) =>
      classifySpike({
        ticker: s.ticker, company: s.company,
        recent: Number(s.recent), prior: Number(s.prior),
        pos: Number(s.pos), neu: Number(s.neu), neg: Number(s.neg),
      })
    )
    .filter((m): m is TopMover => m !== null);

  return mergeMovers(ratingMovers, spikeMovers, cap);
}
```

- [ ] **Step 8: Create `web/components/MoverCard.tsx`**

```tsx
import Link from "next/link";
import type { TopMover } from "@/lib/movers";

const badgeClass: Record<TopMover["direction"], string> = {
  up: "bg-rating-buy/15 text-rating-buy",
  down: "bg-rating-sell/15 text-rating-sell",
  neutral: "bg-neutral-800 text-neutral-300",
};

export function MoverCard({ mover }: { mover: TopMover }) {
  const arrow = mover.direction === "up" ? "▲" : mover.direction === "down" ? "▼" : "•";
  return (
    <Link
      href={`/stocks/${encodeURIComponent(mover.ticker)}`}
      className="block min-w-[150px] flex-1 rounded-lg border border-neutral-800 bg-neutral-900 p-3 hover:bg-neutral-900/60"
    >
      <div className="font-semibold tracking-tight">{mover.ticker}</div>
      <span className={`mt-1.5 inline-block rounded px-1.5 py-0.5 text-[0.65rem] font-semibold ${badgeClass[mover.direction]}`}>
        {arrow} {mover.label}
      </span>
      <div className="mt-1.5 truncate text-[0.7rem] text-neutral-500">{mover.company ?? ""}</div>
    </Link>
  );
}
```

- [ ] **Step 9: Create `web/components/TopMovers.tsx`**

```tsx
import type { TopMover } from "@/lib/movers";
import { MoverCard } from "./MoverCard";

export function TopMovers({ movers }: { movers: TopMover[] }) {
  if (movers.length === 0) return null; // graceful when data is thin
  return (
    <section>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-400">Top movers</h2>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {movers.map((m) => (
          <MoverCard key={`${m.kind}:${m.ticker}`} mover={m} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 10: Wire into `web/app/page.tsx`**

Add imports `import { TopMovers } from "@/components/TopMovers";` and `import { listDashboardRows, listTopMovers } from "@/lib/queries";` (extend the existing queries import). Fetch both in parallel and render `<TopMovers>` between the summary pills and `<StockTable>`:

```tsx
  const [rows, movers] = await Promise.all([listDashboardRows(), listTopMovers()]);
```
…and in the JSX, after the summary-pills `<div>` and before `<StockTable rows={rows} />`:
```tsx
      <TopMovers movers={movers} />
```

- [ ] **Step 11: Verify**

Run: `cd /home/dwallace/Code/n8n/wsb/web && npm test && npm run typecheck && npm run lint && npm run build`
Expected: tests pass; build passes.

- [ ] **Step 12: Browser verify (against a DB with data)**

With the app running against the remote DB, `browser_navigate` to the dashboard and confirm the "Top movers" strip renders cards with rating-change (`Hold → Buy`) and/or spike (`mentions ×N`) labels, and that each links to `/stocks/<ticker>`. If the strip is absent, confirm via SQL that no rating changes/spikes currently exist (expected on thin data) — the component hides itself by design.

- [ ] **Step 13: Commit**

```bash
cd /home/dwallace/Code/n8n/wsb
git add -A
git commit -m "feat: top movers strip (rating changes + sentiment spikes)

Pure classification in lib/movers.ts (vitest-tested); SQL fetches raw
counts/ratings only. Strip hides itself when there is nothing to show." \
  -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Ad slots (reserved placeholders)

**Files:**
- Create: `web/components/AdSlot.tsx`
- Modify: `web/app/page.tsx`

- [ ] **Step 1: Create `web/components/AdSlot.tsx`**

Renders labeled reserved space now. The real AdSense `<ins>` markup drops in here later behind an env flag.

```tsx
const SIZES = {
  leaderboard: "h-[90px]",
  "in-feed": "h-[120px]",
} as const;

export function AdSlot({ variant }: { variant: keyof typeof SIZES }) {
  // Placeholder until an AdSense account + /privacy are live. Real <ins> goes here.
  return (
    <div
      className={`flex w-full items-center justify-center rounded-md border border-dashed border-neutral-700 bg-neutral-900/40 text-[0.65rem] uppercase tracking-wider text-neutral-600 ${SIZES[variant]}`}
      aria-hidden="true"
    >
      Advertisement
    </div>
  );
}
```

- [ ] **Step 2: Place the leaderboard slot in `web/app/page.tsx`**

Import `import { AdSlot } from "@/components/AdSlot";`. Render `<AdSlot variant="leaderboard" />` between `<Hero />`+pills and `<TopMovers>`. For the in-feed slot, render `<AdSlot variant="in-feed" />` between `<TopMovers>` and `<StockTable>` (keeping it out of the table keeps the responsive table component clean). Final dashboard JSX order: Hero → pills → leaderboard ad → TopMovers → in-feed ad → StockTable.

- [ ] **Step 3: Verify**

Run: `cd /home/dwallace/Code/n8n/wsb/web && npm run typecheck && npm run lint && npm run build`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
cd /home/dwallace/Code/n8n/wsb
git add -A
git commit -m "feat: reserved ad slots (leaderboard + in-feed placeholders)" \
  -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: SEO / social plumbing + data caching (ISR-style)

**Files:**
- Modify: `web/app/layout.tsx`, `web/app/page.tsx`, `web/app/stocks/[ticker]/page.tsx`, `web/lib/queries.ts`
- Create: `web/app/icon.svg`, `web/app/opengraph-image.tsx`, `web/app/sitemap.ts`, `web/app/robots.ts`

- [ ] **Step 1: Root metadata + metadataBase in `layout.tsx`**

Replace the `metadata` export:

```tsx
export const metadata: Metadata = {
  metadataBase: new URL("https://wsb.ai.wallace.boston"),
  title: { default: "WSB Pulse", template: "%s · WSB Pulse" },
  description:
    "What r/WallStreetBets is buzzing about — tickers scored on sentiment and rated by AI. Rolling 90-day window.",
  openGraph: { title: "WSB Pulse", description: "r/WallStreetBets sentiment, rated by AI.", type: "website" },
  twitter: { card: "summary_large_image" },
};
```

- [ ] **Step 2: Favicon `web/app/icon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#0a0a0a"/>
  <path d="M6 21 L13 14 L18 18 L26 9" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

- [ ] **Step 3: Static OG image `web/app/opengraph-image.tsx`**

```tsx
import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#0a0a0a", color: "#fafafa", fontSize: 64, fontWeight: 600 }}>
        <div style={{ fontSize: 40, color: "#16a34a" }}>📈 WSB Pulse</div>
        <div style={{ marginTop: 24 }}>What r/WallStreetBets is buzzing about — rated by AI</div>
        <div style={{ marginTop: 24, fontSize: 28, color: "#a3a3a3" }}>Sentiment-scored · Claude-rated · last 90 days</div>
      </div>
    ),
    { ...size }
  );
}
```

- [ ] **Step 4: `web/app/sitemap.ts` and `web/app/robots.ts`**

`sitemap.ts`:
```ts
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://wsb.ai.wallace.boston";
  return ["", "/how-it-works", "/about", "/privacy"].map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
  }));
}
```
`robots.ts`:
```ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://wsb.ai.wallace.boston/sitemap.xml",
  };
}
```

- [ ] **Step 5: Per-ticker metadata in `web/app/stocks/[ticker]/page.tsx`**

Add a `generateMetadata` export (uses the already-imported `getTickerDetail`):

```tsx
import type { Metadata } from "next";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { ticker: raw } = await params;
  const ticker = decodeURIComponent(raw).toUpperCase();
  const detail = await getTickerDetail(ticker);
  if (!detail) return { title: "Not found" };
  const name = detail.company ? `${ticker} — ${detail.company}` : ticker;
  return {
    title: name,
    description: `${name}: WSB sentiment, AI rating, and research over the last 90 days.`,
  };
}
```

- [ ] **Step 6: Cache DB reads (ISR-style) in `web/lib/queries.ts`**

Wrap the three list/detail reads in `unstable_cache` so repeated public requests reuse results for 30 minutes without build-time prerender. At the top add `import { unstable_cache } from "next/cache";`. Wrap the bodies, e.g. for the dashboard:

```ts
export const listDashboardRows = unstable_cache(
  async (): Promise<DashboardRow[]> => {
    return query<DashboardRow>(/* unchanged SQL */);
  },
  ["dashboard-rows"],
  { revalidate: 1800 }
);
```
Apply the same `unstable_cache(..., ["top-movers"], { revalidate: 1800 })` wrapper to `listTopMovers`. Leave `getTickerDetail`/`getRatingHistory`/`getSentimentByDay`/`getPostsForTicker` as direct queries (per-ticker keys add little at this scale).

Leave the existing `export const dynamic = "force-dynamic"` and `export const revalidate = 0` on **both** `page.tsx` and the ticker page exactly as they are. The `unstable_cache` layer is what reduces DB load under traffic; keeping the pages `dynamic` is what stops `next build` from trying to prerender them, which would require a live database in CI. (This is the deliberate refinement of the spec's "switch to ISR" item: same load/freshness goal, but achieved at the data layer so the build stays DB-free.)

- [ ] **Step 7: Verify**

Run: `cd /home/dwallace/Code/n8n/wsb/web && npm test && npm run typecheck && npm run lint && npm run build`
Expected: pass; build emits `/sitemap.xml`, `/robots.txt`, `/icon.svg`, and `/opengraph-image`. The `404 /favicon.ico` is resolved by the icon route.

- [ ] **Step 8: Browser verify (meta + favicon)**

With the app running: `browser_navigate` to the dashboard, then check `view-source`/network for `<title>`, OG tags, and that `/icon.svg` and `/opengraph-image` return 200 (no favicon 404). Navigate to a ticker page and confirm the title is `TICKER — Company · WSB Pulse`.

- [ ] **Step 9: Commit**

```bash
cd /home/dwallace/Code/n8n/wsb
git add -A
git commit -m "feat: SEO/social plumbing + cached DB reads

Per-page metadata, OG image, favicon, sitemap, robots; wrap dashboard +
movers queries in unstable_cache (30m) to cut DB load under public traffic." \
  -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] `cd /home/dwallace/Code/n8n/wsb/web && npm test && npm run typecheck && npm run lint && npm run build` — all green.
- [ ] Browser pass against the running app (desktop + mobile): hero/explainer present, top-movers strip, responsive table, no add/delete controls anywhere, ad placeholders visible, info pages reachable from nav/footer, ticker pages have no delete button.
- [ ] `grep -rn "AddTickerForm\|DeleteStockButton\|addTickerAction\|deleteTickerAction" web/app web/components` returns nothing.
- [ ] Update the README with the manual `psql` add/delete one-liners (from the spec §7), since the UI no longer manages tickers.

## Out of scope (future, per spec)

- Real AdSense integration/approval, dynamic per-ticker OG images, multi-user/watchlist (the removed "add ticker" is the seam), and any paid plans.
