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
        <span aria-hidden="true">{arrow}</span> {mover.label}
      </span>
      <div className="mt-1.5 truncate text-[0.7rem] text-neutral-500">{mover.company ?? ""}</div>
    </Link>
  );
}
