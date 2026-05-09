import Link from "next/link";
import type { DashboardRow } from "@/lib/queries";
import { fmtPct, fmtRelative, fmtUsd } from "@/lib/format";
import { RatingBadge } from "./RatingBadge";
import { SentimentSparkline } from "./SentimentSparkline";

export function StockTable({ rows }: { rows: DashboardRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-8 text-center text-sm text-neutral-400">
        No tickers yet. Run the WSB workflow to start collecting data.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-800">
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
                <td
                  className={`px-4 py-3 tabular-nums ${
                    change === null
                      ? "text-neutral-500"
                      : change >= 0
                        ? "text-rating-buy"
                        : "text-rating-sell"
                  }`}
                >
                  {fmtPct(change)}
                </td>
                <td className="px-4 py-3">
                  <SentimentSparkline
                    positive={r.pos_7d}
                    neutral={r.neu_7d}
                    negative={r.neg_7d}
                  />
                </td>
                <td className="px-4 py-3 tabular-nums text-neutral-300">
                  {r.mention_count}
                </td>
                <td className="px-4 py-3 text-xs text-neutral-500">
                  {fmtRelative(r.last_seen_at)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
