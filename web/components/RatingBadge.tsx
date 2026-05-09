import type { Rating } from "@/lib/queries";

const colorByRating: Record<Rating | "None", string> = {
  Buy: "bg-rating-buy/15 text-rating-buy ring-rating-buy/40",
  Hold: "bg-rating-hold/15 text-neutral-300 ring-rating-hold/40",
  Sell: "bg-rating-sell/15 text-rating-sell ring-rating-sell/40",
  None: "bg-neutral-800 text-neutral-500 ring-neutral-700",
};

export function RatingBadge({
  rating,
  confidence,
}: {
  rating: Rating | null;
  confidence: number | null;
}) {
  const key: Rating | "None" = rating ?? "None";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${colorByRating[key]}`}
    >
      {rating ?? "—"}
      {confidence !== null && rating !== null ? (
        <span className="text-[0.65rem] text-neutral-400">{confidence}</span>
      ) : null}
    </span>
  );
}
