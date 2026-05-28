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
        {consensus && counts ? (
          <div className="flex items-center gap-3">
            <ConsensusBadge label={consensus} />
            <DistributionBar counts={counts} />
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

        {snapshot.target_updated_at ? (
          <div className="text-xs text-neutral-500">
            Analyst data updated {fmtRelative(snapshot.target_updated_at)}
          </div>
        ) : null}
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
    // role="img" + aria-label exposes the whole breakdown to screen readers;
    // the segment <div>s are presentational (their content lives in the label).
    <div
      role="img"
      aria-label={items.map((i) => `${i.label}: ${i.value}`).join(", ")}
      className="flex h-3 flex-1 overflow-hidden rounded-md ring-1 ring-inset ring-neutral-800"
      title={items.map((i) => `${i.label}: ${i.value}`).join("\n")}
    >
      {items.map((i) =>
        i.value === 0 ? null : (
          <div
            key={i.key}
            className={SEGMENT_TONES[i.key]}
            style={{ width: `${(i.value / total) * 100}%` }}
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
