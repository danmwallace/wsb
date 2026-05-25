import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getPostsForTicker,
  getRatingHistory,
  getSentimentByDay,
  getTickerDetail,
} from "@/lib/queries";
import { fmtMcap, fmtPct, fmtRelative, fmtUsd } from "@/lib/format";
import { SentimentChart } from "@/components/SentimentChart";
import { RatingTimeline } from "@/components/RatingTimeline";
import { PostList } from "@/components/PostList";
import { NewsList } from "@/components/NewsList";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: Promise<{ ticker: string }>;
}

export default async function TickerPage({ params }: PageProps) {
  const { ticker: rawTicker } = await params;
  const ticker = decodeURIComponent(rawTicker).toUpperCase();

  const detail = await getTickerDetail(ticker);
  if (!detail) notFound();

  const [ratings, sentiment, posts] = await Promise.all([
    getRatingHistory(ticker, 30),
    getSentimentByDay(ticker, 30),
    getPostsForTicker(ticker, 20),
  ]);

  const sentimentChartData = sentiment.map((d) => ({
    day: new Date(d.day).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    positive: d.positive,
    neutral: d.neutral,
    negative: d.negative,
  }));

  const change1d =
    detail.change_pct_1d === null ? null : Number(detail.change_pct_1d);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/" className="text-xs text-neutral-500 hover:text-neutral-300">
          ← Back to dashboard
        </Link>
        <div className="mt-2 flex items-baseline gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">{detail.ticker}</h1>
          <span className="text-base text-neutral-400">
            {detail.company ?? ""}
          </span>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        <Stat label="Price" value={fmtUsd(detail.price)} />
        <Stat
          label="1d"
          value={fmtPct(change1d)}
          tone={change1d === null ? "neutral" : change1d >= 0 ? "up" : "down"}
        />
        <Stat label="5d" value={fmtPct(detail.change_pct_5d)} />
        <Stat label="YTD" value={fmtPct(detail.change_pct_ytd)} />
        <Stat label="Mkt Cap" value={fmtMcap(detail.market_cap)} />
        <Stat label="P/E" value={detail.pe_ratio ? Number(detail.pe_ratio).toFixed(1) : "—"} />
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-400">
            Sentiment, last 30 days
          </h2>
          <SentimentChart data={sentimentChartData} />
        </div>
        <div>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-400">
            Recent news
          </h2>
          <NewsList items={detail.news} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-400">
          Rating history
        </h2>
        <RatingTimeline rows={ratings} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-400">
          Recent WSB posts
        </h2>
        <PostList posts={posts} />
      </section>

      <footer className="text-xs text-neutral-600">
        Latest snapshot: {fmtRelative(detail.snapshot_as_of)} · First seen:{" "}
        {fmtRelative(detail.first_seen_at)}
      </footer>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "up" | "down";
}) {
  const toneClass =
    tone === "up"
      ? "text-rating-buy"
      : tone === "down"
        ? "text-rating-sell"
        : "text-neutral-100";
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      <div className="text-[0.65rem] uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}
