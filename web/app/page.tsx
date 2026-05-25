import { listDashboardRows } from "@/lib/queries";
import { StockTable } from "@/components/StockTable";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Dashboard() {
  const rows = await listDashboardRows();

  const counts = rows.reduce(
    (acc, r) => {
      if (r.rating === "Buy") acc.buy++;
      else if (r.rating === "Sell") acc.sell++;
      else if (r.rating === "Hold") acc.hold++;
      else acc.unrated++;
      return acc;
    },
    { buy: 0, hold: 0, sell: 0, unrated: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Today&apos;s WSB pulse
          </h1>
          <p className="text-sm text-neutral-400">
            Tickers ranked by Claude&apos;s confidence in its latest rating.
          </p>
        </div>
        <div className="flex gap-3 text-xs">
          <SummaryPill label="Buy" count={counts.buy} className="text-rating-buy" />
          <SummaryPill label="Hold" count={counts.hold} className="text-neutral-300" />
          <SummaryPill label="Sell" count={counts.sell} className="text-rating-sell" />
          {counts.unrated > 0 ? (
            <SummaryPill
              label="Unrated"
              count={counts.unrated}
              className="text-neutral-500"
            />
          ) : null}
        </div>
      </div>
      <StockTable rows={rows} />
    </div>
  );
}

function SummaryPill({
  label,
  count,
  className,
}: {
  label: string;
  count: number;
  className?: string;
}) {
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5">
      <div className="text-[0.65rem] uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <div className={`text-base font-semibold tabular-nums ${className ?? ""}`}>
        {count}
      </div>
    </div>
  );
}
