import type { RatingHistoryRow } from "@/lib/queries";
import { fmtDate } from "@/lib/format";
import { RatingBadge } from "./RatingBadge";

export function RatingTimeline({ rows }: { rows: RatingHistoryRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-500">
        No ratings yet. The Research and Rate workflow runs after market close.
      </div>
    );
  }
  return (
    <ol className="space-y-3">
      {rows.map((r) => (
        <li
          key={r.as_of_date.toString()}
          className="rounded-lg border border-neutral-800 bg-neutral-900 p-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <RatingBadge rating={r.rating} confidence={r.confidence} />
              <span className="text-sm text-neutral-300">
                {fmtDate(r.as_of_date)}
              </span>
            </div>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-neutral-300">
            {r.rationale}
          </p>
        </li>
      ))}
    </ol>
  );
}
