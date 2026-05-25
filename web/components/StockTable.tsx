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
